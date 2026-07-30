# Launch safety

Why the app has crashed on open twice, what the shared cause was, and the rule
that prevents a third time.

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

## 4. The second line of defence

`components/AppErrorBoundary.tsx` wraps the provider tree in `app/_layout.tsx`,
and `ErrorScreen` is exported from the same file as Expo Router's
`ErrorBoundary` for the route segment. A throw while rendering now produces a
screen with the message and a Try again, instead of an empty window.

Be clear about what this does and does not buy. A React error boundary catches
errors thrown **while rendering the tree below it**. It does not catch module-
scope errors (§1 — no tree exists yet), errors in event handlers, timers or
promises, or native crashes. It is not a substitute for §2; it is what turns the
*other* failures into something a driver can report.

## 5. Checklist before shipping a build

- No native module call at the top level of anything reachable from
  `app/_layout.tsx`. `grep` for bare call statements at column 0.
- No `throw` at module scope on a release path.
- Any API that reads the `expo-constants` manifest (`expo-linking` above all)
  is called lazily and guarded.
- `npx expo export --platform android` succeeds — it catches a missing module
  or a bad asset, though not a runtime throw.
- Environment variables actually baked into the build: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and the RevenueCat platform key. See
  `.env.example`.

## 6. Still unverified

Neither §3b nor the boundary has been confirmed on a physical Android device
against the published build — there is no crash log from the Play Store release
in hand, and the diagnosis is from reading the launch path rather than from a
stack trace. What is certain is that the `createURL` call was an unguarded
throwing call in the bundle-evaluation window on every launch. If a build with
this fix still dies on open, the next step is a logcat capture
(`adb logcat -s ReactNativeJS AndroidRuntime`) from the device, and Play
Console → Quality → Crashes and ANRs for the aggregated native stack.
