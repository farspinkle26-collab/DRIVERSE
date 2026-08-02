# Google sign-in — how the round-trip works, and where it breaks

Google sign-in on a phone is not one request. It is a chain of four redirects
across two servers and a browser sheet the app does not control, and **every
link in it is configured somewhere different** — one in `app.json`, one in the
Google Cloud console, two in the Supabase dashboard, none of them in the same
place as the code. That is why a failure here reads as "the button does
nothing" rather than as a stack trace: the app hands control to a browser and
gets it back only if all four agree.

This file is the map of those four, the symptom each one produces when it is
wrong, and the two code-level bugs that were fixed alongside them.

---

## 1. The chain

```
app                 supabase.auth.signInWithOAuth({ provider: "google",
                                                    redirectTo: "myapp://auth-callback" })
                    → returns a URL, does not navigate

browser sheet       https://<project>.supabase.co/auth/v1/authorize
                      ?provider=google
                      &redirect_to=myapp%3A%2F%2Fauth-callback      ← (C) allow-list checked HERE
                    ↓
Google              accounts.google.com/o/oauth2/v2/auth?...
                      &redirect_uri=https://<project>.supabase.co/auth/v1/callback   ← (B)
                    ↓  user picks an account
Supabase            https://<project>.supabase.co/auth/v1/callback?code=...
                    ↓  mints a session, redirects to the validated redirect_to
app                 myapp://auth-callback?code=<uuid>              ← (A) scheme must match
                    ↓
app                 supabase.auth.exchangeCodeForSession(code)     ← (D) needs flowType: "pkce"
```

Note where the two "callback" URLs sit. They are **different URLs with the same
name**, configured in different consoles, and mixing them up is the single most
common way this gets stuck:

| | value | where it is set |
|---|---|---|
| **(B)** Google's redirect URI | `https://<project>.supabase.co/auth/v1/callback` | Google Cloud console → Credentials → OAuth client |
| **(C)** the app's redirect URL | `myapp://auth-callback` | Supabase → Authentication → URL Configuration → **Redirect URLs** |

(B) is Google returning to Supabase. (C) is Supabase returning to the phone.
Setting (B) correctly does nothing for (C), and (B) being correct is what makes
the failure look like it must be somewhere else — Google works fine, and the
flow dies on the way home.

---

## 2. Symptom → cause

### The browser shows `localhost` and "Safari cannot open the page"

**(C).** `myapp://auth-callback` is not on the Supabase project's Redirect URLs
allow-list.

The thing to understand is that **GoTrue does not reject an unlisted
`redirect_to` — it silently substitutes the project's Site URL.** There is no
error, no warning, and nothing in the app's logs. If the Site URL is still
`http://localhost:3000` from the web prototype (it is the Supabase default),
the sheet finishes the whole successful sign-in and then navigates to a host
that only ever existed on a developer's laptop. The session was created; the
phone just never got told.

Fix, in Supabase → Authentication → URL Configuration:

- **Redirect URLs** — add `myapp://auth-callback`. Add `myapp://**` too if you
  want other deep links (password reset, email confirmation) to work.
  For Expo Go / dev builds also add `exp://127.0.0.1:8081/--/auth-callback` and
  the LAN variant your machine prints (`exp://10.x.x.x:8081/--/auth-callback`),
  or the wildcard `exp://**`.
- **Site URL** — change it off `http://localhost:3000`. Use the app scheme
  (`myapp://`) or the marketing site. This is the fallback every unmatched
  redirect lands on, so leaving it as localhost is what turns a config typo
  into this exact screen.

The scheme comes from `app.json` → `expo.scheme`, currently **`myapp`**, and
is mirrored in `lib/deepLink.ts` as `APP_SCHEME`. If you ever rename it, all
three move together — `app.json`, `deepLink.ts`, and the Supabase allow-list —
and the app needs a new native build, because the scheme is compiled into
`Info.plist` / `AndroidManifest.xml` and no OTA update can change it.

### The account picker never appears

Two different things wear this symptom.

The benign one: the auth session shares Safari's cookie jar, so a phone already
signed in to Google gets bounced straight through the picker without being
asked. The flow then fails further down the chain and it looks like Google was
never consulted. `lib/socialAuth.ts` now sends `prompt: "select_account"` so
the chooser is always shown and you can see how far the flow actually gets.

The real one: `redirect_uri_mismatch` from Google, which is **(B)** — the
OAuth client's Authorized redirect URIs are missing
`https://<project>.supabase.co/auth/v1/callback`. This shows Google's own error
page, not a blank one.

### The button does nothing at all, no error, no browser

Nothing was thrown and nothing was returned. Before the fix below this was the
normal outcome of a *successful* Google sign-in. See §3.

### "Unsupported provider: provider is not enabled"

Google is off in Supabase → Authentication → Providers, or its Client ID /
Client Secret are blank. The Client ID and Secret pasted there are the **Web
application** client's, not the iOS or Android client's — Supabase is the one
talking to Google, and it is a web server as far as Google is concerned.

### It works in Expo Go and fails in TestFlight

Almost always the `exp://` dev redirect is allow-listed and `myapp://` is not,
because dev was set up first. Both belong on the list; they are different URLs.

---

## 3. The two code bugs fixed alongside this

Both were live in `lib/`, and both are the kind that produce **silence** rather
than an error, which is why the dashboard misconfiguration above went so long
without being isolated — there was no way to tell the two apart from the app.

### `flowType` was left at the supabase-js default

`lib/supabase.ts` created the client without a `flowType`, and supabase-js v2
defaults to **implicit**. The implicit flow returns the session as a URL
*fragment* (`myapp://auth-callback#access_token=…`), while
`exchangeCodeForSession` — what `lib/socialAuth.ts` calls to finish — requires
a `?code=` on the query string and refuses to run under implicit at all
("exchangeCodeForSession is not available in implicit flow").

So the sign-in could not have succeeded even with every URL correct: the
callback carried no `code`, the old code did `searchParams.get("code")`, got
`null`, and returned `null` — which the store turned into a plain `return
false` with no error set. A perfect sign-in and a broken one were the same
no-op.

It is now pinned to `pkce`, with the reasoning in the file. PKCE keeps its code
verifier in the client's `storage` (AsyncStorage), so the exchange also
survives the app being backgrounded while the browser sheet is open.

### Every non-`success` outcome was swallowed

`openAuthSessionAsync` returning anything but `success`, and a callback URL
carrying anything but a code, both fell into `return null`. A user cancel, a
provider error with a real `error_description`, and "the redirect went to
localhost and never came back" were indistinguishable.

Now:

- `cancel` / `dismiss` → `null`, silently. A user backing out is not an error.
- an `error` / `error_description` on the callback → thrown with the
  provider's own sentence, which is what surfaces in the UI.
- a callback with nothing usable, or a sheet that closed without one → thrown
  with a message that names the localhost symptom and points at the allow-list.
- a fragment-shaped callback (`#access_token`) → adopted via `setSession`
  rather than discarded, so a flow-type mismatch degrades to a working
  sign-in instead of a silent failure.

The URL reading is pure and tested in `lib/authCallback.ts` /
`lib/__tests__/authCallback.test.ts` — the same split as `lib/deepLinkFormat.ts`
and for the same reason. It parses by hand rather than with `URL`, because the
callback uses a custom scheme and the WHATWG parsers disagree about
non-special schemes across Hermes, `react-native-url-polyfill` and Node enough
that "passes the test, returns null on the phone" is a real outcome.

---

## 4. Launch safety

`lib/socialAuth.ts` is on the launch path (`useAuthStore` → `app/_layout.tsx`),
so it is bound by the rule in `LAUNCH_SAFETY_REFERENCE.md`: **no native call
and no `throw` at module scope.** The header of that file is the long version.
The short version, for anyone editing it:

- `expo-web-browser` is `require`d inside `webBrowser()`, never imported at the
  top. A static import of it killed the app on open for three release cycles
  (§10) because its entry is a bare `requireNativeModule`, which throws.
- the redirect URL is built lazily through `createAppLink`, which cannot throw,
  and cached so both legs of one sign-in agree on the same value.
- `lib/authCallback.ts` imports nothing at all, deliberately.

---

## 5. Verifying it end to end

1. `bunx jest lib/__tests__/authCallback.test.ts` — the parser.
2. On a device, tap Google. The account chooser must appear (that is
   `prompt: "select_account"` working).
3. Pick an account. The sheet must close **by itself**. If it lands on any page
   at all — localhost or otherwise — the redirect never matched, and it is §2.
4. If it closes and you are not signed in, the error is now shown rather than
   swallowed; read it.
5. Supabase → Authentication → Users: a row should exist with the Google email
   and provider `google`, even on a run that failed at step 3. A user row plus
   no session on the phone is the signature of the redirect problem, and the
   fastest way to confirm the sign-in itself is fine.
