# Launch safety

Why the app has crashed on open twice, what the shared cause was, the rule
that prevents a third time — and, after a third report came in anyway, how to
find out what is actually happening instead of guessing again.

**If you are here because a build is crashing on open, start at §7.** It is the
diagnosis procedure. §2–§3 are the rules and the history; they are what to
check once you know where the failure is, not a substitute for finding out.

## 1. The window

When Driveverse starts, three things happen in order:

1. The native side boots and hands the JS bundle to Hermes.
2. **Hermes evaluates the bundle.** Every module in the import graph of
   `app/_layout.tsx` runs its top level — imports, `const` initialisers, and any
   bare statement — before a single component renders.
3. React mounts the tree. `LoadingScreen`, then the provider stack, then the
   first route.

Step 2 is the dangerous one. There is no React tree yet, so there is no error
boundary and no `componentDidCatch`. An exception thrown there is not a red box
and not a blank screen with a retry — it is the process ending, 100–300 ms after
the icon was tapped, with nothing on screen that says why.

From the driver's side this is indistinguishable from a native crash: the app
opens, shows black, and disappears. From the store's side it is a "crashes on
launch" rejection.

## 2. The rule

> **No module-scope work that can throw, and no native module call at module
> scope. Do it in a mount effect or on first use.**

Loading a module is fine — `require("expo-notifications")` is JS-only and cheap.
*Touching* the native side is not. Two properties make it worse than it sounds:

- **A `try/catch` does not always save you.** An Objective-C exception raised on
  the TurboModule queue unwinds through native frames that JavaScript cannot
  catch. The process aborts with the `catch` block right there in the bundle,
  never entered.
- **Development never reproduces it.** Several Expo modules downgrade a
  production `throw` to a `console.warn` behind `__DEV__`, and Expo Go supplies
  a manifest that a standalone build may not have. A build that dies on a phone
  can run perfectly on a dev machine, which is why these reach the store.

## 3. What has actually gone wrong

### 3a. `setNotificationHandler` at import (fixed in 79fc286)

`hooks/useNotificationStore.ts` called `Notifications.setNotificationHandler()`
at module scope, wrapped in a `try/catch` that could not catch what it threw.
App Store review rejected the build under Guideline 2.1(a); all four crash
reports aborted in `ObjCTurboModule::performVoidMethodInvocation →
objc_exception_rethrow`, 110–270 ms after process start.

The module is still `require`d at import — only the native registration moved,
into the mount effect that also attaches the response listener.

The same commit removed a top-level `throw` from `lib/supabase.ts`: missing env
vars used to abort bundle evaluation in a release build. It now fails fast in
development and falls back to an inert placeholder client in release, because
every Supabase call in the app is already error-handled and a degraded app beats
a dead one.

### 3b. `Linking.createURL` at import

`lib/socialAuth.ts` computed its OAuth redirect at module scope:

```ts
WebBrowser.maybeCompleteAuthSession();          // native call at import
const redirectTo = Linking.createURL("auth-callback");   // throws in release
```

`Linking.createURL` is not a string builder. It reads the app's scheme out of
the `expo-constants` manifest, and `expo-linking`'s `resolveScheme` has two
`throw`s that only fire in a release build:

- `"expo-linking needs access to the expo-constants manifest ..."` — when
  `Constants.expoConfig` comes back empty, which is what a build with no
  embedded manifest hands the JS side.
- `"Cannot make a deep link into a standalone app with no custom scheme
  defined"` — manifest present, no `scheme` in it.

In development neither fires: the first branch is skipped in the store client
and the second is a `console.warn` behind `__DEV__`.

`socialAuth` is imported by `hooks/useAuthStore.ts`, which is imported by
`app/_layout.tsx` — so this was squarely in the bundle-evaluation window, and
it ran on **every** launch, for every driver, signed in or not, whether or not
they ever touched a social sign-in button.

The fix has three parts:

- `lib/deepLink.ts` — `createAppLink(path)`, which asks `expo-linking` first
  (it is still the only thing that knows about `exp://` development URLs) and,
  if that throws, builds the link from the scheme in `app.json`. It cannot
  throw. `lib/deepLinkFormat.ts` holds the pure join rule and its tests.
- `lib/socialAuth.ts` — both calls deferred. The redirect is resolved on the
  first sign-in attempt and cached, so the two round-trips of one flow agree on
  the same URL. `maybeCompleteAuthSession` is web-only and now says so.
- `app/route/[id].tsx` — the two share/copy-link call sites go through
  `createAppLink` too. Not launch-critical, but the same throw would have
  turned a Share tap into a rejected promise.

### 3c. A launch that never finishes (fixed alongside §7)

Not every "it doesn't open" is a crash, and this is the failure the first two
rounds of fixes were not looking for. `app/_layout.tsx` holds the loading
screen until fonts are ready, and `app/index.tsx` holds it until auth
finishes. Both gates were open-ended:

- `useAppFonts` returned `ready` only once `useFonts` reported loaded **or**
  errored. Eight TTF files have to land; anything that leaves the hook in
  neither state — a face that fails to decode natively, an asset missing from
  the bundle, a promise nothing settles — holds the gate forever.
- `useAuthStore` called `supabase.auth.getSession()` with a `.then()` and no
  `.catch()`. A rejection left `loading` true permanently, and `app/index.tsx`
  renders `LoadingScreen` for as long as it is.

Either way the driver taps the icon, sees the logo, and the app never
advances. From the outside — and from a store reviewer's side — that is
indistinguishable from a crash, and it is the *only* failure mode in this file
that would explain "the update crashes but a fresh install is fine":
`getSession()` reads a token a previous version wrote into AsyncStorage. A
fresh install has nothing to read and cannot fail there.

Both gates now have a floor. `FONT_TIMEOUT_MS` (3 s) starts the app in system
type rather than not at all, and `getSession()` degrades to a signed-out app.

## 4. The second line of defence

`components/AppErrorBoundary.tsx` wraps `RootLayout` in `app/_layout.tsx`, and
`ErrorScreen` is exported from the same file as Expo Router's `ErrorBoundary`
for the route segment. A throw while rendering now produces a screen with the
message and a Try again, instead of an empty window.

**It wraps the root component, not part of its output.** It used to sit inside
`RootLayout`, below the `if (isLoading || !fontsReady) return <LoadingScreen/>`
early return — so the loading screen, the font hook and the root component's
own render were all outside it. That is every line of code that runs during
the window the app has died in twice: the boundary only started guarding once
the app had already successfully started. `RootLayout` is now a three-line
wrapper around `RootLayoutContent`, and everything is below the boundary.

Be clear about what this does and does not buy. A React error boundary catches
errors thrown **while rendering the tree below it**. It does not catch module-
scope errors (§1 — no tree exists yet), errors in event handlers, timers or
promises, or native crashes. It is not a substitute for §2; it is what turns the
*other* failures into something a driver can report — and, since §7, into
something written down.

## 5. Checklist before shipping a build

- No native module call at the top level of anything reachable from
  `app/_layout.tsx`. Walk the import graph rather than grepping one file —
  `app/_layout.tsx` reaches 48 modules, and both bugs so far were three and
  four hops in. A bare call statement at column 0 is the obvious shape; a
  `const x = Native.thing()` initialiser is the one that hides.
- No `throw` at module scope on a release path.
- Every gate that holds the loading screen has a timeout or a `catch` (§3c).
  Grep for `.then(` with no `.catch(` on the launch path.
- Any API that reads the `expo-constants` manifest (`expo-linking` above all)
  is called lazily and guarded.
- `npx expo export --platform android` succeeds — it catches a missing module
  or a bad asset, though not a runtime throw.
- Environment variables actually baked into the build: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and the RevenueCat platform key. See
  `.env.example`.

## 6. Still unverified

Neither §3b nor the boundary has been confirmed on a physical Android device
against the published build — there is no crash log from the Play Store
release in hand, and the diagnosis was from reading the launch path rather
than from a stack trace. §3b did remove a real unguarded throwing call from
the bundle-evaluation window on every launch; that much is certain. What is
equally certain, now that a third report has come in, is that it was not the
whole story, and that **two consecutive fixes were shipped without ever seeing
the failure.** That is the thing §7 exists to stop.

## 7. How to diagnose a launch crash

The trap this file fell into twice: a launch crash produces no artefact, so
the temptation is to read the launch path, find something that *could* throw,
fix it, and ship. That is a hypothesis, not a diagnosis, and it has now been
wrong at least once. Work in this order and stop as soon as something answers.

### 7a. Ask the app first

The app carries its own black box (`lib/crashReporter.ts`, pure half in
`lib/crashReport.ts`). A JavaScript error from the first mount effect onward
is captured, written to AsyncStorage, and — if it happened before the app
finished starting — shown on the **next** launch as a copyable report:
`components/CrashReportScreen.tsx`, with kind, message, stack, component
stack, platform and app version.

So the first move is no longer "get the device". It is: reopen the app, and
read the screen. A driver who can paste that text has just done the work that
two release cycles of code-reading did not.

What it sees, and what it does not:

| Failure | Captured? |
| --- | --- |
| Render throw (`AppErrorBoundary`) | Yes, reliably |
| Unhandled promise rejection | Yes, reliably |
| Uncaught throw in an effect/timer | Usually — the write races process teardown |
| Throw during bundle evaluation (§1) | **No** |
| Native crash | **No** |

The bundle-evaluation gap is deliberate, and it is not an oversight to be
fixed later: recording it would mean an AsyncStorage write at module scope,
which is the exact rule (§2) that caused both crashes. Curing the disease with
the disease is not a trade worth making.

### 7b. Read the launch marker

`beginLaunch()` writes a marker on the first mount effect; `LaunchComplete`
clears it once the whole provider stack has mounted and survived
`LAUNCH_SETTLE_MS`. On the next start the marker distinguishes three cases,
and this is the single most useful bit in the system:

- **Marker set, report present** → a JavaScript error during startup. §7a has
  the stack. Go fix it.
- **Marker set, no report** → the app reached mount and then went away without
  a JavaScript error. That is a kill, not a crash: the driver swiped it away
  during the splash, or Android reclaimed memory. Logged, not shown.
- **No marker at all, yet the driver reports it dying on open** → it never
  reached the first mount effect. That is the bundle-evaluation window, and
  §2/§3 are exactly the right place to look. This is the one case where
  reading the import graph *is* the method.

### 7c. Then the device, then the console

Only once the above has been exhausted:

- `adb logcat -s ReactNativeJS:V AndroidRuntime:E ExpoModulesCore:V` with the
  phone attached. `ReactNativeJS` carries the JS error text; `AndroidRuntime`
  carries the native stack. A bundle-evaluation death shows as an abort in
  `ObjCTurboModule`/`JavaTurboModule` frames 100–300 ms after process start
  (§3a), with nothing from `ReactNativeJS` before it.
- Play Console → Quality → Crashes and ANRs. Aggregated *native* stacks, which
  for a JavaScript throw say only that Hermes aborted — the same line for
  every possible cause. Useful for the blast radius (device models, Android
  versions, how many drivers, whether it is only on update) and close to
  useless for the cause.
- **Reproduce the release build, not a dev build.** Every failure in §3 is
  invisible in development by construction — Expo Go supplies a manifest a
  standalone build may not have, and several Expo modules downgrade a
  production `throw` to a `console.warn` behind `__DEV__`. A launch bug that
  reproduces in `expo start` was never one of these.

### 7d. If it only happens on update

An update differs from a fresh install in exactly one way: the app's data
directory survives. Everything the previous version wrote into AsyncStorage is
still there and is read on the next launch — the Supabase session token
(`lib/supabase.ts` → `useAuthStore`), the Platinum entitlement cache, the
cosmetics cache, the active car, the theme.

So if a clean install works and an update does not, suspect **persisted state
whose shape changed**, not the launch path. The fastest confirmation is to
clear the app's storage on a device that is failing (Settings → Apps →
Driveverse → Storage → Clear data) and relaunch. If it starts, it is a
migration problem, and the fix belongs in whichever hook reads that key —
tolerate the old shape, don't throw on it. §3c covers the one instance of this
that has been found and fixed.
