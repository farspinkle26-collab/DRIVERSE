# Sign-in gate & Google/Apple OAuth

The app opens on a sign-in gate (`app/sign-in.tsx`). Nothing behind it —
garage, map, trips, community, chat — is reachable without a Supabase
session; `AuthGate` in `app/_layout.tsx` sends signed-out users back to it.

Three ways in, all Supabase Auth:

| Route | Where |
| --- | --- |
| Google | `signInWithOAuth({ provider: "google" })` |
| Apple | `signInWithOAuth({ provider: "apple" })` |
| Email + password | `signInWithPassword`, and `app/signup.tsx` to register |

No native sign-in SDKs are involved: the providers run through an in-app
browser tab (`expo-web-browser`), so this works in the managed build with no
prebuild step. The trade-off is on the Apple side — see
[Native Apple Sign In](#native-apple-sign-in-optional).

## How the flow works

1. `lib/socialAuth.ts` asks Supabase for the provider's authorise URL with
   `skipBrowserRedirect: true` (native) — Supabase returns the URL instead
   of navigating.
2. `WebBrowser.openAuthSessionAsync` opens it and resolves when the provider
   redirects to our callback URL.
3. The callback carries a one-time `?code=`, which
   `supabase.auth.exchangeCodeForSession` swaps for a session.

The callback URL is also a real route (`app/auth-callback.tsx`), which
covers the cases where the redirect re-enters the app instead of resolving
the browser session — a cold start from the deep link, or the web build
where the whole page navigated away and came back.

Two client settings in `lib/supabase.ts` make this work; changing either
breaks OAuth:

- `flowType: "pkce"` — what produces the `?code=` above. The supabase-js
  default (`implicit`) returns tokens in a URL fragment instead, which a
  native deep link cannot reliably carry.
- `detectSessionInUrl: Platform.OS === "web"` — on web supabase-js reads the
  session out of the URL itself; on native it must not try.

## Supabase dashboard

### 1. Redirect URLs

**Authentication → URL Configuration → Redirect URLs.** Every URL the app
can hand to the provider has to be listed here or the provider rejects the
request with `redirect_uri_mismatch`. The app builds them from the Expo
scheme (`scheme: "myapp"` in `app.json`):

```
myapp://auth-callback                    # native, standalone build
exp://127.0.0.1:8081/--/auth-callback    # native, local dev server
exp://*/--/auth-callback                 # native, tunnelled dev (rork/Expo Go)
http://localhost:8081/auth-callback      # web, local
https://<your-web-domain>/auth-callback  # web, production
```

If you change `scheme` in `app.json`, change the native entries to match.

### 2. Google

**Authentication → Providers → Google**, enable it, and paste the client ID
and secret from a Google Cloud OAuth 2.0 **Web application** client
(<https://console.cloud.google.com/apis/credentials>).

In that Google client, the authorised redirect URI is Supabase's callback,
not ours:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

### 3. Apple

**Authentication → Providers → Apple**, enable it, and fill in the values
from the Apple Developer portal:

- a **Services ID** (Certificates, Identifiers & Profiles → Identifiers →
  Services IDs) with Sign in with Apple enabled — this is the client ID;
- the **Team ID**, **Key ID** and the `.p8` **private key** of a Sign in with
  Apple key.

The Services ID's Return URL is Supabase's callback, same as Google:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

Apple only sends the user's name on the *first* authorisation, and may send
a private relay address instead of a real one. `hooks/useAuthStore.ts`
handles both: it falls back through `full_name` → `name` → the email local
part → `"Driver"` when it bootstraps the `profiles` row.

## Profiles

There is no separate onboarding step after OAuth. On first sign-in
`loadUserProfile` finds no `profiles` row and creates one from the provider
metadata (name, `avatar_url` / `picture`, email), with
`role: "customer"`. The DB triggers described in `SUPABASE_SETUP.md` handle
the starter car, XP row and wallet.

## Testing checklist

- [ ] Cold start signed out → sign-in gate, not the garage.
- [ ] Google → browser tab → back in the app, garage opens.
- [ ] Cancelling the browser tab → back on the gate, no error banner.
- [ ] Apple on a real iOS device (the simulator's Apple ID often is not
      signed in).
- [ ] Email + password still signs in, and Create an account still registers.
- [ ] Profile → Settings → **Sign Out** → back to the gate.
- [ ] Kill and reopen the app → still signed in (session is persisted in
      AsyncStorage).

## Native Apple Sign In (optional)

App Store review expects iOS apps that offer third-party sign-in to offer
Apple's *native* sheet, not a web view. That means adding
`expo-apple-authentication`, calling
`supabase.auth.signInWithIdToken({ provider: "apple", token })` with the
identity token, and setting `ios.usesAppleSignIn: true` in `app.json` — a
config plugin, so it needs a native rebuild. The browser flow here is what
works without one; swap `signInWithSocialProvider("apple")` for the native
call in `lib/socialAuth.ts` when a prebuild is on the table.
