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
- `bun run bundle:verify` succeeds. Bundling alone is not enough: the store
  build then compiles that bundle to Hermes bytecode, and that compile has its
  own way of failing (§9).
- Environment variables actually baked into the build: `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and the RevenueCat platform key. See
  `.env.example`.

## 5b. The build injects code this repository does not contain

Read §5 again and note what it cannot catch. Every check in it is a check on
the source tree. On 1 Aug 2026 an iOS crash log finally showed the launch path
containing code that is in no file here (§8), and the mechanism is worth
stating on its own because it defeats every other rule in this document.

`metro.config.js` wraps Expo's Metro config in `withRorkMetro`. That helper
does two unrelated things:

- **A resolver half**, which is wanted: web polyfills for `expo-haptics`,
  `expo-secure-store`, `react-native-maps`, `RefreshControl` and `Alert`, plus
  an `assert` shim.
- **A transformer half**, which replaced Metro's `babelTransformerPath` with a
  wrapper that string-rewrites `app/_layout.tsx` at build time. It regex-matched
  `export default function <Name>`, demoted that function, and appended a new
  default export wrapping it in `RorkAnalyticsProvider` — which loads
  `posthog-react-native`, whose optional integrations `require()`
  `expo-file-system`, `expo-application`, `expo-device`, `expo-localization`
  and AsyncStorage at module scope.

So the shipped bundle mounted a third-party analytics provider **above
`AppErrorBoundary`** and evaluated a native-module-touching SDK **inside the
bundle-evaluation window** — the two things §2 and §4 exist to prevent — on
every launch, for every driver. §4's claim that "there is nothing above it left
to fail" was false in every build ever shipped.

Worse, `@rork-ai/toolkit-sdk` was pinned to `latest`. The code running during
launch could differ between two builds of the same commit, with no diff to
review. **This is the direct answer to "we fixed it and it still crashes": the
launch path was read three times and the interesting code was never in it.**

The transformer half is now switched off in `metro.config.js` (the resolver
half is kept), and the SDK version is pinned. Confirmed against a release
bundle: `expo export:embed --platform ios --dev false` went from 3572 modules /
6.69 MB to 3199 modules / 5.19 MB, with `RorkAnalyticsProvider`,
`captureAppLifecycleEvents` and the PostHog relay host all absent.

**The rule this adds:** verifying the launch path means verifying the *bundle*,
not the source. `bun run bundle:ios` and grep the output — that is the only
artefact that reflects what actually runs.

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

## 8. The first real crash log (1 Aug 2026, iOS)

Three "launch crash" fixes had shipped before anyone saw a stack trace. A
TestFlight crash report finally arrived — build **1.0.2 (9)**, iPad (8th gen,
`iPad11,6`), iPadOS 26.2, arm64e. It is the first hard evidence this file has
ever had, and it contradicts part of what §2–§3 assumed. Read it before
re-reading the import graph again.

### 8a. What the log says

```
Launch Time:  08:03:50.3110
Date/Time:    08:03:50.6265          →  died 315 ms after process start
Exception:    EXC_BAD_ACCESS (SIGSEGV)
Subtype:      KERN_INVALID_ADDRESS at 0x0a31323a3538303e
Triggered by: Thread 14
```

**Thread 14 (the JS thread)** crashed inside Hermes' garbage collector:

```
hermes::vm::GCScope::_newChunkAndPHV(...)
hermes::vm::regExpPrototypeSymbolReplace(...)      RegExp.cpp:1759
hermes::vm::stringPrototypeReplace(...)            String.cpp:1980
… RuntimeScheduler_Modern::runEventLoop → RCTJSThreadManager runRunLoop
```

The faulting address is the giveaway. `0x0a31323a3538303e` is not a pointer,
it is **ASCII**: little-endian, those bytes read `>085:21\n`, and the register
it came from reads `6085:21\n` — the tail of a JavaScript stack-trace line
(`…:6085:21`). A pointer inside Hermes' handle machinery had been overwritten
with JS stack text. That is heap corruption, not a null dereference.

**Thread 10** says where the corruption came from:

```
ObjCTurboModule::performVoidMethodInvocation(...)  RCTTurboModule.mm:438
convertNSExceptionToJSError(...)                   RCTTurboModule.mm:222
convertNSArrayToJSIArray(...)                      RCTTurboModule.mm:76
-[_NSCallStackArray objectAtIndex:] → backtrace_symbols → dladdr
… _dispatch_lane_serial_drain → _dispatch_workloop_worker_thread
```

Read against React Native 0.81.5's source, that is unambiguous. A native
module method that returns `void` raised an Objective-C exception. RN caught
it and called `convertNSExceptionToJSError`, which **creates JSI strings,
arrays and an `Error` object in the Hermes runtime** — on the module's own
serial dispatch queue, while thread 14 was executing JavaScript. Two threads
mutating one Hermes heap; thread 14 died on the wreckage a moment later. The
`Error` it constructs captures a JS stack, which is precisely the text found
sitting in the corrupted pointer.

### 8b. What that rules in and out

- **Ruled out: a throw during bundle evaluation (§1).** The JS thread was
  running the RuntimeScheduler event loop, not `runBytecode`. The bundle had
  finished evaluating, React had mounted, and effects were calling native
  modules. Three rounds of re-reading module scope were looking in the wrong
  window. A module-scope scan of all 43 modules reachable from
  `app/_layout.tsx` now comes back clean.
- **Ruled in: a native module raising during the mount-effect burst.** At
  315 ms the loading screen is still up (`LoadingScreen` holds it for 2.5 s),
  so the provider stack has *not* mounted. The only things running are the
  root layout's own effects, `useFonts`, the splash hide, the Supabase client's
  first AsyncStorage read — and, as it turned out, an injected analytics
  provider that is in no file in this repository (§5b).
- **Not identified: which module raised.** The log shows RN *handling* the
  exception, never raising it. Both `@catch` frames are RN infrastructure, and
  the raising frames are gone by then. `RCTAssert` is compiled out in release
  and `RCTFatal` swallows its own `@throw`, so it was not RN core: it was a
  module's own code, or Foundation raising underneath it (a nil insert, a
  range, an invalid argument).

### 8c. Why this is a React Native bug too

`performVoidMethodInvocation` calling into `jsi::Runtime` from a module's
method queue is unsafe by construction — it is only reachable when a native
method raises, which is why it survives. Nothing in this app can fix that. All
we can do is stop native code from raising during launch, which is what §5b
does by removing the third-party SDK that had no business being there.

### 8d. If it happens again

The instrumentation from §7 was written *after* build 9 and is not in it —
which is why this crash left an Apple crash log and no report screen. The next
build carries both. So:

1. Reopen the app and read the screen (§7a). A JavaScript error now names
   itself, and the report identifies the binary properly: it carries the
   **native** build number (`1.0.2 (9)`), not `expoConfig.version`, which still
   says `1.0.0` in `app.json` for every store build.
2. If there is no report screen but there is another Apple crash log, compare
   it to 8a. A `hermes` + `GCScope` fault with `convertNSExceptionToJSError`
   on another thread is this same shape: a native module raised, and the
   module has to be found by elimination from the launch window, not from the
   log.
3. Bisect by bundle, not by source. `bun run bundle:ios` and grep the output
   for what is actually in it.

## 9. The build that produced no app at all (1 Aug 2026)

The archive after §8 shipped never reached a device. It failed in Xcode, in the
step *after* Metro:

```
hermesc -emit-binary -max-diagnostic-width=80 -O -out .../main.jsbundle ...
main.jsbundle:3747:5: error: private properties are not supported
    #x;
    ^~~
    (and #y, #width, #height, and every `this.#…` that reads them)
```

This is not a launch crash — it is the absence of a build. Worth recording
here anyway, because it is the same failure mode as §5b in a different costume:
**something outside the source tree decided what the launch path contains, and
nothing in CI looked at the artefact.**

### 9a. What the syntax was

`#x #y #width #height` with getters is React Native's own
`react-native/src/private/webapis/geometry/DOMRectReadOnly.js` — the `DOMRect`
polyfill RN installs at startup. No file in this repository uses private class
fields. Nothing anyone wrote caused this.

### 9b. Why it was in the bundle

`babel-preset-expo` decides which modern syntax is lowered to ES5 and which is
left for Hermes to parse, and it decides that from **its own version**, not
from the installed React Native:

| preset line | profile | `#private` fields |
| --- | --- | --- |
| `54.0.x` (SDK 54) | delegates to `@react-native/babel-preset@0.81.5` | transformed away |
| `57.0.x` (SDK 56+) | vendored "Hermes v1" config | **left in the bundle** |

`package.json` carried `"babel-preset-expo": "^57.0.5"` while `expo@54.0.35`
asks for `~54.0.11`. The 57 copy hoisted to the top of `node_modules`, so
`babel.config.js` resolved it, and it bundled the app for a Hermes that this
app does not ship. React Native 0.81's `hermesc` (LLVM 8.0.0svn) has no
private-property support, so it rejected what Babel handed it.

### 9c. Why the same commit built for some people and not others

The two lockfiles disagreed. `bun.lock` resolved the caret to
`babel-preset-expo@57.0.5`; `package-lock.json` was stale — its root
`devDependencies` still listed only three packages — and carried `54.0.12` as
one of `expo`'s transitives. Whether the archive compiled therefore depended on
which installer ran, with nothing in the diff to review. Same shape as the
`latest` pin in §5b: **a dependency range is code on the launch path.**

`bun.lock` is the authoritative one — CI installs with
`bun install --frozen-lockfile`. `package-lock.json` cannot currently be
regenerated (`npm install --package-lock-only` fails on an unrelated peer
conflict: `@ai-sdk/react@2.0.221` wants `react ~19.1.2`, the app pins
`19.1.0`), so treat it as historical, not as a second source of truth.

### 9d. Why CI passed

The `bundle:ios` step added in §8 proves Metro can *bundle* the app. It does
not prove the bundle can be *compiled*. Hermes parses the output a second time,
with an older parser than Metro's, and that second parse is where the archive
died. CI now runs the same compile, with the `hermesc` React Native ships for
the host platform — so the checker upgrades with React Native:

```
bun run bundle:verify     # = bundle:ios && bundle:hermes
```

`scripts/hermes-compile.js` is a thin wrapper: same flags as the Xcode build
phase, non-zero exit and hermesc's own diagnostics on failure.

**One trap when testing this locally:** Metro's transform cache survives a
dependency change, so a rebundle after swapping the Babel preset can reproduce
the *old* output exactly. Clear it before believing a result —
`rm -rf "${TMPDIR:-/tmp}"/metro-cache "${TMPDIR:-/tmp}"/metro-file-map-*`.

### 9e. The fix

- `babel-preset-expo` pinned to `~54.0.12` (the SDK 54 line, i.e. what
  `expo@54` asks for). `babel.config.js` carries the reason at the top.
- `jest-expo` moved from `^57.0.3` to `~54.0.17` — the same SDK-major drift.
  Its 57 line peer-depends on `@react-native/jest-preset@^0.86.2` → `react
  ^19.2.3` against this app's `19.1.0`, which is what had been blocking
  `package-lock.json` from regenerating. All 278 tests still pass.
- `bundle:hermes` / `bundle:verify` scripts, and a `hermesc` step in CI after
  the bundle step.

Result: 5.19 MB of JS compiles to 7.43 MB of bytecode, 0 errors. The bundle is
~250 KB larger than before, which is the private fields being lowered — that
growth *is* the fix.

**The rule this adds:** an Expo/React Native/Babel version bump is a Hermes
compatibility change. Anything that touches `babel.config.js`,
`metro.config.js`, `babel-preset-expo`, or the React Native version gets
`bun run bundle:verify` before it is merged.

## 10. The crash that was in `node_modules` (1 Aug 2026, iOS + Android)

The fourth fix shipped and the app still died on open — this time on **both**
stores at once. TestFlight took a crash report; Google Play rejected the build
outright under *Fungsi Rusak* ("Aplikasi Anda error setelah dibuka").

Two platforms failing identically is the diagnosis, not a coincidence. iOS and
Android share exactly one thing: the JavaScript bundle. §8's answer (an
Objective-C exception in a TurboModule) is platform-specific and could not
produce this; a config difference could not either, because §3's fixes had
already made every missing key non-fatal. What is left is shared JS that runs
before anything can catch it.

### 10a. What it was

`expo/package.json` declared:

```json
"expo-web-browser": "^56.0.5",
```

in an **Expo SDK 54** app. SDK 54 ships `~15.0.11`
(`node_modules/expo/bundledNativeModules.json` is the SDK's own statement of
this). The installed package was 41 majors ahead — its own `devDependencies`
pin `"expo": "56.0.3"`. It entered in `38ebc0a "Add the Platinum subscription
tier"` and never matched the SDK at any point.

The entire package's JS entry is two lines:

```js
// node_modules/expo-web-browser/build/ExpoWebBrowser.js
import { requireNativeModule } from 'expo-modules-core';
export default requireNativeModule('ExpoWebBrowser');
```

`requireNativeModule` **throws** when the native module is not registered. Its
sibling `requireOptionalNativeModule` returns `null` instead — that one word is
the whole difference, and it is why `expo-apple-authentication`, off-SDK on the
same import line in the same file, was survivable and this was not.

The JS half was 41 majors ahead of the native half autolinking actually built,
so the lookup found nothing and threw.

### 10b. Why three passes over the launch path missed it

`lib/socialAuth.ts` opens with *"LAUNCH SAFETY — nothing in this module may run
at import time"*, and a previous pass had correctly deferred both offenders it
named: `WebBrowser.maybeCompleteAuthSession()` and `Linking.createURL()`. The
file was, on its own terms, clean.

The hazard was the import statement itself:

```ts
import * as WebBrowser from "expo-web-browser";
```

Deferring every call in our own source achieves nothing when importing the
package runs the throw. **A static `import` of a package that reaches a native
module at module scope hands that decision to the package.** This is the same
lesson as §8 in a different disguise: the offending line was never in this
repository, so no amount of reading this repository could find it.

The chain, read off the built bundle rather than the source:

```
app/_layout.tsx → hooks/useAuthStore.ts → lib/socialAuth.ts
  → expo-web-browser/build/WebBrowser.js
  → expo-web-browser/build/ExpoWebBrowser.js   ← throws
```

### 10c. When it actually ran — a correction worth keeping

The obvious story is "it died during bundle evaluation". That is **wrong**, and
the bundle says so. Only ~550 of this bundle's 3,231 modules evaluate while
Hermes loads it, and none of the app's own code is among them: `expo-router`
reaches the routes through Metro's `require.context`, which compiles to lazy
getters —

```js
{"./_layout.tsx":{enumerable:!0,get:()=>r(d[6])}, ...}
```

— so `app/_layout.tsx` and its whole import closure are pulled in later, when
`ExpoRoot` reads that key during the **first render**.

It is fatal anyway, and for a reason worth writing down: `AppErrorBoundary` is
exported *by* the root layout, and so is the router's own `ErrorBoundary`. A
throw while that module is being required happens before either exists, in the
one file that was supposed to provide them. Nothing catches it, and
`installCrashReporter()` — a mount effect inside the same module — never runs,
so the black box stays empty. That is §7's "never reached mount" signature
produced *without* a bundle-evaluation death, which is why §7's flowchart
pointed at the import graph and the import graph looked fine.

### 10d. The fix

- `expo-web-browser` pinned to `~15.0.11`; `expo-apple-authentication` to
  `~8.0.8`, `@expo/vector-icons` to `^15.0.3`, `eslint-config-expo` to
  `~10.0.0` — the same SDK-major drift, found by the new check.
- The import in `lib/socialAuth.ts` is now **lazy**: `import type` above,
  `require("expo-web-browser")` inside `webBrowser()`, resolved on the first
  sign-in attempt. Note this is defence in depth, not belt-and-braces — v15
  looks the module up at module scope exactly as v56 does, so the correct
  version only makes the lookup *succeed today*. The rule is that nothing on
  the launch path reaches a native module at module scope at all.
- `package-lock.json` deleted. It resolved `expo-web-browser@56.0.6` while
  `bun.lock` resolved `56.0.5`; CI installs with `bun install --frozen-lockfile`
  and §9 already named two disagreeing lockfiles as the reason one commit built
  differently for different people. `bun.lock` is the lockfile.
- `lib/envCheck.ts` logs which `EXPO_PUBLIC_*` variables were inlined, from the
  mount effect right after the crash reporter. It reports; it never gates.

### 10e. The two checks that would have caught it

Neither existing check could: it is not a type error, not a lint error, and the
bundle builds and compiles cleanly, because the failure is a native lookup at
runtime.

```
bun run check:versions      # every SDK-versioned package agrees with expo@54
bun run check:launch-path   # no unreviewed native lookup in the launch window
```

Both run in CI on every push and inside `bun run bundle:verify`.

`check-sdk-versions.js` compares `package.json` against the SDK's own
`bundledNativeModules.json`. It is the cheap one, it catches this class outright
— and it would have caught §9's `babel-preset-expo@^57` too.

`check-launch-path.js` is the general guard: it parses the built bundle, walks
the module graph, and lists every `requireNativeModule` the launch window can
reach, failing on anything not on a reviewed allowlist. Two things make it
honest, and both were wrong in the first draft:

1. **Two roots, not one.** Seeding only from Metro's `__r(...)` entry points
   covers ~550 modules and no app code — it passes a bundle with this exact
   crash still in it. The walk is also seeded from the root layout found behind
   the route context's `"./_layout.tsx"` getter, which brings it to ~2,670.
2. **Eager edges, not static ones.** Metro's `__d(f, id, [deps])` dependency
   array lists every `require()` in a module, including ones inside functions
   that never run at startup; walking it marks essentially the whole bundle as
   reachable and proves nothing. Only a `r(d[N])` at the factory's own top level
   is evaluated on require, so the script parses each factory and asks the AST —
   which is precisely the difference between the broken and fixed forms of
   `lib/socialAuth.ts`.

Verified both ways before being trusted: with the static import restored the
check fails naming `ExpoWebBrowser`; with the lazy import it passes.

**The rule this adds:** a dependency whose major does not match the Expo SDK is
a launch-safety bug, not a housekeeping chore — and the launch path is defined
by the bundle, never by the imports you can see.

## 11. The crash logs that were already fixed, and what auditing them found (2 Aug 2026)

Four iOS `.ips` files came in for analysis. Read them before reading anything
else in this section, because the first finding is that **they are not new
evidence** — and identifying that correctly is most of the work.

### 11a. Dating a crash log before diagnosing it

```
app_version   1.0.1          build_version 3
timestamp     2026-07-28 07:12:09 – 07:12:30 -0700
device        iPhone18,2, iPhone OS 26.6      (one device, four launches)
incidents     167E02FC / D8C37B82 / 5F9FA4AA / 56F3FAEA
```

Process lifetimes, from `procStartAbsTime`/`procExitAbsTime` at the arm64 24 MHz
timebase: **274 ms, 113 ms, 109 ms, 113 ms**. Twenty-one seconds apart on one
phone — a driver tapping the icon, watching it die, and tapping again.

Three of the four are `EXC_CRASH (SIGABRT)` on
`com.meta.react.turbomodulemanager.queue`:

```
ObjCTurboModule::performVoidMethodInvocation → objc_exception_rethrow
  → __cxa_rethrow → _objc_terminate → abort
```

The fourth (`D8C37B82`) is the same event photographed one frame later: the
TurboModule queue is inside `convertNSExceptionToJSError` →
`convertNSArrayToJSIArray` → `-[_NSCallStackArray objectAtIndex:]` →
`backtrace_symbols` → `dladdr`, while the JS thread segfaults independently in
`directRegExpExec` → `JSArray::createNoAllocPropStorage` under
`String.prototype.match`. That is §8a's mechanism exactly — RN building a JSI
`Error` on the module's own dispatch queue, corrupting the Hermes heap that
thread 11 is executing on. The `hermes` and `arrayPrototypeMap`-shaped frames
are the *wreckage*, not the fault.

Now compare that against §3a, written on 28 July:

> App Store review rejected the build under Guideline 2.1(a); all four crash
> reports aborted in `ObjCTurboModule::performVoidMethodInvocation →
> objc_exception_rethrow`, **110–270 ms** after process start.

Same four reports. Commit `79fc286`, dated 2026-07-28 23:21 UTC — sixteen hours
after these logs were captured — is the fix that was written *from* them:
`Notifications.setNotificationHandler()` at module scope in
`hooks/useNotificationStore.ts`, a void TurboModule method raising an
Objective-C exception during bundle evaluation, inside a `try/catch` that
cannot catch it. Build 1.0.1 (3) predates that commit and every fix in §5b, §9
and §10.

**The rule this adds:** read `bundleInfo` and `captureTime` out of an `.ips`
before reading its stack. A crash log is evidence about *one build*, and this
project has shipped five since. Re-diagnosing a fixed crash costs a release
cycle exactly as surely as missing a live one — and had the audit stopped at
"it's already fixed", §11b would not have been found either.

### 11b. The guard could only see half the dependency tree

`check-launch-path.js` (§10e) walks the built bundle for native-module lookups
in the launch window. It policed one spelling:

```js
const THROWING = /(?<!Optional)requireNativeModule\)?\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g;
```

That is **expo-modules-core's** lookup. React Native's own is
`TurboModuleRegistry.getEnforcing("X")`, which throws identically — its
non-throwing sibling is `TurboModuleRegistry.get()` — and it is what every
package *outside* the Expo SDK uses. Running the walk with `getEnforcing` added
found 21 lookups where the shipped check found 16, and among the five new ones:

```
RNGestureHandlerModule  (bundle module 2964, via TurboModuleRegistry.getEnforcing)
```

`react-native-gesture-handler`, reached by `GestureHandlerRootView` — imported
by `app/_layout.tsx` itself, which is as high up the launch path as a lookup can
get. A version bump that put its JS half ahead of the native half autolinking
builds would have thrown at module scope, above `AppErrorBoundary`, before
`installCrashReporter()`, with no report screen and no artefact: §10 again, in
the one package the guard could not see. The other four (`SourceCode`,
`UIManager`, `PlatformConstants`, `DeviceInfo`) are React Native core and ship
inside React Native itself.

Nothing was broken. The *guard* was, and it was broken in exactly the half of
the tree it existed to cover.

Both spellings are policed now, the failure output names which one it found, and
the check was verified in both directions as §10e requires: with
`RNGestureHandlerModule` removed from `ALLOWED` it fails naming it and the
mechanism; restored, it passes.

### 11c. …and only one platform

The same guard had a second blind spot, found by building the Android bundle —
which nothing in CI had ever done. `bundle:ios` was the only bundle step, so
`check:launch-path` and `bundle:hermes` both only ever saw iOS.

**The two bundles are not the same code.** Metro resolves `Platform.OS`
branches at build time, so each platform gets its own module graph. Running the
check against Android turned up two lookups in the launch window that appear in
no iOS bundle at all:

```
ExpoNotificationChannelManager       (android module 3135, via requireNativeModule)
ExpoNotificationChannelGroupManager  (android module 3141, via requireNativeModule)
```

Notification channels are an Android concept, so expo-notifications reaches for
them behind a platform branch. Both are safe — expo-notifications is on the SDK
54 line and autolinking builds them — but *safe* was never established, because
nothing looked. Android is the platform that took the Play Console rejection in
§10, and it was the unbundled one.

`check:launch-path` now takes bundle paths as arguments and walks every one
against a single shared allowlist; `bundle:verify` and CI build and Hermes-
compile both platforms. One consequence worth knowing: the "allowlisted but not
found" note is only meaningful when every platform bundle was checked — an
Android-only entry looks pruneable if the check ran against iOS alone.

**The rule this adds:** a guard that reads the built artefact has to read
*every* artefact that ships. "Verify the bundle, not the source" (§5b) was
right and incomplete — it is the bundle**s**.

### 11d. What `check:versions` never claimed to cover

`bundledNativeModules.json` only lists packages the Expo SDK has an opinion
about. Everything else hits `if (!expected) continue` and is skipped in
silence, while the success line reads "every SDK-versioned package agrees with
expo@54" — true, and much narrower than it sounds. Three native packages sat
outside it:

| package | declared | installed |
| --- | --- | --- |
| `react-native-purchases` | `^10.4.4` | 10.4.4 |
| `react-native-purchases-ui` | `^10.4.4` | 10.4.4 |
| `react-native-share` | `^12.2.0` | **12.3.1** |

`react-native-share` had already drifted a minor past its declared range. A
caret on a native package means `bun install` can move the JS half with no diff
to review, held still only by `bun.lock` — which is §5b's `latest` pin and §9's
two-disagreeing-lockfiles in a quieter costume.

All three are pinned exactly now (`bun install` reports no package changes;
`--frozen-lockfile` still passes), and `check:versions` prints what it cannot
vouch for instead of implying it checked everything. That note is deliberately
**not** a failure: there is no manifest to compare these against, and inventing
an authority would be guesswork. It is a coverage statement, so the next §10
starts in the right place.

### 11e. What the audit did not find

Recorded because a clean result is only useful if its scope is written down.

- **Module scope is clean.** No native call and no `throw` at the top level of
  anything reachable from `app/_layout.tsx`; the only column-0 call
  initialisers are `Platform.select`, `Math.round` and
  `Animated.createAnimatedComponent`, all pure JS.
- **`.map`/`.filter`/`.reduce` on Supabase and API data are guarded.** Every
  call site either sits behind an `if (data)` or uses `(data ?? [])`. Note that
  this class could not have produced these crash logs anyway: a `TypeError` on
  `undefined.map` is a JavaScript throw, which lands in `AppErrorBoundary` and
  the crash reporter — not a `SIGABRT` on the TurboModule queue.
- **RevenueCat is off the launch path.** `Purchases.configure()` *is* a void
  TurboModule method — the §3a shape — but `configurePurchases()` runs from
  `usePlatinumStore`'s effect, and `PlatinumProvider` mounts only after the
  2.5 s `LoadingScreen` gate clears, well outside the window. `lib/purchases.ts`
  additionally resolves the SDK through a defensive `require` that returns
  `null` rather than throwing.
- **No background location.** `expo-task-manager` is not a dependency and
  nothing calls `startLocationUpdatesAsync`; the app has foreground GPS only.
- **One real leak, fixed.** `app/(tabs)/map.tsx` assigned
  `Location.watchPositionAsync`'s subscription straight into the variable its
  cleanup reads. Unmounting while that `await` was in flight left the cleanup
  with nothing to remove and a BestForNavigation watcher running for the life of
  the process. The `mounted` guard inside the callback hid it — no `setState`
  warning is ever produced. It is a battery and retention bug, not a crash.

**Still not covered by anything:** there is no ESLint configuration in the
repository. `eslint` and `eslint-config-expo` are declared in `package.json`,
there is no `eslint.config.js` and no `lint` script, and CI does not lint. That
is a gap, not a crash risk — every failure in this document was invisible to
lint by construction.
