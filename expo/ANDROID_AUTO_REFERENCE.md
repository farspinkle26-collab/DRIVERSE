# Android Auto

Driverse on the car display: what it shows, why it shows so little, how the
native side is put together, and — read this part first — **what has and has
not been verified.**

## 0. Verification status, up front

**None of the Kotlin in this feature has been compiled, and the car app has
never launched.** There is no Android SDK, no Desktop Head Unit and no device on
the machine this was written on. What exists is source, a config plugin, and
tests for every part that can be tested without a car.

That sentence is at the top rather than in a footnote because this repository
has a specific, expensive failure pattern, recorded across twenty sections of
`LAUNCH_SAFETY_REFERENCE.md`: **native changes that were obviously correct on
reading, shipped on a green local check, and did not work.** §14 counts five in
a row, each costing a release cycle. §14c is the rule that came out of it:

> A fix you cannot verify in the artefact is a hypothesis, not a fix.

Everything below is a hypothesis until §7 has been worked through on real
hardware. The design is arranged so that the hypotheses fail *safely* — see §4 —
but that is not the same as being right.

| Layer | Status |
| --- | --- |
| `lib/carTrip.ts` — display rules | Tested (18 tests) |
| `lib/tripRecorder.ts` — bridge, launch safety | Tested (8 tests) |
| `hooks/useNativeTrip.ts` — route projection | Tested (4 tests) |
| `plugins/androidAuto*.js` — prebuild surgery | Tested (17 tests) |
| `native/androidauto/**/*.kt` | **Never compiled** |
| `MapboxCarMap` on a real surface | **Never run** |
| DHU / Automotive OS emulator | **Not attempted — no SDK available** |
| Car app quality checklist (§6) | **Not run** |

## 1. Why this is native Kotlin and not React Native

There is no usable Expo or React Native wrapper for the Android Car App Library,
and the reason is structural rather than a gap someone will fill: a
Navigation-category car app is not a view tree. The host hands the app a raw
`Surface` and a template description, and drives both from another process. None
of React Native's rendering applies, and neither does `@rnmapbox/maps`, which is
a React component and can only draw into a React view tree.

So the car app is Kotlin, it needs a development/custom build, and it cannot run
in Expo Go.

### 1a. Where the Kotlin lives, and why not in `android/`

`android/` is generated. It is gitignored (`.gitignore:40`) and
`expo prebuild --clean` deletes and rewrites it. Kotlin written there survives
until the next prebuild and then vanishes.

That would be merely annoying if it failed loudly. It does not:
`lib/tripRecorder.ts` treats a missing native module as *"this build has no
native recorder, keep using the JS one"* — deliberately, because that is the
correct behaviour on iOS. So a prebuild that erased the car sources produces an
app that compiles, launches, records drives normally, and has silently lost its
car support.

The sources are therefore committed under **`native/androidauto/`**, which
prebuild does not touch, and copied in by **`plugins/withAndroidAuto.js`** on
every prebuild. This is the same shape, and the same reasoning, as
`plugins/withReleaseSigning.js` — whose header describes the identical trap one
file over.

## 2. Scope: what the car shows

Driverse is submitted under the **Navigation** category. An Android Auto app
gets exactly one category and one template set with it, and the category is
declared in one place: the `androidx.car.app.category.NAVIGATION` line in
`plugins/androidAutoManifest.js`.

One screen, `NavigationTemplate`:

| State | Card | Numbers |
| --- | --- | --- |
| With a destination | Next maneuver + distance to it | Remaining distance, ETA |
| Free drive (the common case) | "Recording drive" | Distance driven, elapsed time |
| Paused | "Drive paused" | Distance driven, elapsed time |
| No usable GPS | "Waiting for GPS" | **None** |
| Idle | "Ready to drive" | None |

Actions: Start / Pause / Resume / End. Map controls: zoom in, zoom out,
recenter, pan.

### 2a. What is excluded, and why it is excluded rather than deferred

No quests, no chat, no convoy, no places browsing, no share card, no
gamification. These are not missing for effort reasons — the Navigation template
set does not contain them, and driver-distraction guidelines are the reason it
does not.

Three exclusions go further than the template set requires, and are the ones
worth defending:

- **No speed of any kind.** The phone HUD shows AVG and MAX live while driving
  (`app/(tabs)/map.tsx`, the DIST/TIME/AVG/MAX strip). The car shows neither.
  The vehicle's own cluster owns current speed and is legally required to be
  accurate; a *personal best* top speed in the driver's eyeline is an app asking
  someone to beat it.
- **No XP.** The phone awards XP per kilometre live. Rewarding distance on the
  car screen is the same problem wearing a friendlier hat.
- **A stale fix is shown as stale.** When GPS drops, distance stops advancing.
  A car screen still displaying `47.2 km` from four minutes ago is lying, and is
  indistinguishable from a working one.

### 2b. How the exclusions are enforced

Not by review. `TripSnapshot` (Kotlin) and `NativeTripState` (TS) both carry
speed, because the phone's trip row and the share card's heatmap need it. The
car screen cannot reach either: it renders only from `CarScreenModel`
(`native/androidauto/.../CarScreenModel.kt`), which has no field for it.

Adding speed to the car is therefore a change to a *type*, in a file whose
header explains why not — not a line added to a render method. `lib/carTrip.ts`
holds the same rules in TypeScript, with a test that serialises the whole model
and asserts the strings `speed` and `xp` do not appear in it.

## 3. How a drive is recorded now

**The recorder moved out of React.** Before this, `app/(tabs)/map.tsx` both
produced and owned the drive: a `watchPositionAsync` subscription in a
`useEffect`, accumulating distance and speed in component state. Android Auto
breaks that — the host can start `DriverseCarAppService` with the map screen
unmounted, the app backgrounded, or never opened this boot. There is no React
tree to read from and no subscription running to produce anything.

```
  TripRecorderService  (foreground service, GPS, the only producer)
           │
           ▼
       TripStore  (process-wide singleton, outlives everything below)
        │       │
        │       └──────────────┐
        ▼                      ▼
  TripRecorderModule      DriveScreen
  (RN bridge; exists      (car display; exists only while
   only with an RN host)   the head unit is connected)
        │                      │
        ▼                      ▼
  useNativeTrip           NavigationTemplate
  → map.tsx
```

`TripStore` is a singleton rather than state inside the service because all
three of the service, the bridge and the car screen can come and go while a
drive continues. That is what makes "started the drive on the phone, pocketed
it, plugged into the car ten minutes later" work.

### 3a. Both recorders still exist

`useNativeTrip().active` is false on iOS, on web, and on any Android build
predating the plugin — and on all three, `map.tsx` records exactly as it did
before. CarPlay is out of scope, so iOS has no native half; deleting the JS path
would take iOS trip recording with it.

When `active` is true, the screen mirrors the service's distance and elapsed
time instead of accumulating its own. Both use the same haversine rule and the
same jitter floor, so the handover is a change of source, not of value.

### 3b. The car's buttons reach the phone

`CarCommandBus` exists for one bug: the driver ends a drive on the head unit
with the phone in their pocket, then picks it up at the destination and finds it
still showing a recording that will never be saved. Car button presses go to the
service *and* onto the bus; `map.tsx` subscribes and runs its own handler.

## 4. Failing safely

Three things in this feature are outside our control, and each is arranged so
that being wrong degrades rather than crashes.

**The Maps SDK version.** `MapboxCarMap` is the only file naming a Mapbox type,
behind the `CarMapSurface` interface, constructed inside `catch (t: Throwable)`.
`@rnmapbox/maps` chooses the SDK version, and a bump can move the classes —
which surfaces as `NoClassDefFoundError` at class-load time, not at compile
time. If those types appeared in `CarMapRenderer`'s fields, that load would
happen inside a `SurfaceCallback`, where an uncaught throwable takes down the
car app and the host stops offering Driverse. Behind the interface, the same
failure is a dark map under a working template.

This is `LAUNCH_SAFETY_REFERENCE.md` §10 in a different runtime. There it was a
static import putting a native lookup at module scope; here it is a typed field
putting a class load inside a callback. Same shape, same fix: *make the risky
load happen somewhere you can catch it.*

**`Throwable`, not `Exception`.** A missing class is an `Error`. Catching only
`Exception` would let it through.

**The native module's absence.** `lib/tripRecorder.ts` reads
`NativeModules.DriverseTripRecorder` and null-checks before touching any
property — never `requireNativeModule`, never `getEnforcing`. §19 of
`LAUNCH_SAFETY_REFERENCE.md` is why: a throw during a module's first evaluation
is consumed by Metro's own loader and reported as fatal without rethrowing, so
no `try`/`catch` at any call site rescues it. A test asserts that importing the
module reads *no* property of the native module.

## 5. Voice

**Implemented:** `CarContext.ACTION_NAVIGATE` (`geo:` intents), handled in
`DriverseSession`. This is what "Navigate to <place> with Driverse" becomes
after the Assistant resolves the place, and it is the intent Google's own
navigation-app documentation expects a Navigation-category app to handle.
Refusing it is a review finding rather than a missing nicety.

Geocoding a `geo:0,0?q=Name` is handed to the phone rather than done in Kotlin —
the app already has one geocoder (`lib/mapboxApi.ts`) and a second would drift
from it. With the phone not running, the car screen says so instead of silently
swallowing what the driver said out loud.

**Follow-up, not blocking:** free-form commands ("start a trip", "show my
route") need App Actions — a `shortcuts.xml` declaring built-in intents, plus
capability definitions Google crawls. Separate work with its own review cycle.

## 6. What must be tested, and what is known broken

### 6a. The required scenarios

Google calls these out specifically, and they are the conditions most likely to
expose bugs that phone testing never sees. **None have been run.**

| Scenario | What should happen | Confidence |
| --- | --- | --- |
| Ignition off mid-drive | Service keeps recording; car session torn down; `navigationEnded()` released | Untested |
| Phone unplugged mid-drive | Same — the service is tied to the phone, not the car | Untested |
| Network lost mid-drive | Recording continues (GPS needs no network); map tiles stop; no route refetch is attempted | Untested |
| GPS lost mid-drive | "Waiting for GPS" after 90 s, numbers removed | Rule tested, behaviour untested |
| Day/night transition | Map style follows the car's signal, not the phone's theme | Untested |
| Another nav app takes over | `onStopNavigation` ends the drive | Untested |

### 6b. Known gaps, stated rather than discovered

- **Process death loses the drive.** `TripStore` is in-memory; there is no
  on-disk journal. A foreground service makes this unlikely, not impossible.
  `START_NOT_STICKY` is deliberate — being restarted with a null intent and no
  data would mean a notification for a drive that no longer exists.
- **The ETA does not react to traffic.** Remaining seconds are scaled from the
  route's original duration by the fraction of distance left. Refetching
  directions every second in the place least likely to have a connection is
  worse.
- **`LocationManager`, not fused location.** Better battery and indoor
  behaviour would come from `FusedLocationProviderClient`, but that lives in
  `play-services-location`, which this project does not declare — it arrives
  transitively through `expo-location`, and building on another module's
  transitive dependency is how a build breaks on an unrelated bump.
- **The bridge is a legacy `ReactPackage`,** not a codegen'd TurboModule,
  despite `newArchEnabled: true`. The interop layer supports it. A TurboModule
  would mean a spec, a codegen step and a generated C++ shim to expose six
  promise-based methods.

## 7. First run on real hardware — do these in order

Written as a procedure because §14 of `LAUNCH_SAFETY_REFERENCE.md` is what
happens without one.

**1. Does it compile at all?**

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew :app:assembleDebug
```

Everything in `native/androidauto/` is unverified source. Expect the Mapbox
API names in `MapboxCarMap.kt` to be the first thing to fail.

**2. Which Maps SDK version actually resolved?**

```bash
cd android && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath | grep mapbox
```

`plugins/androidAutoGradle.js` declares a floor of `11.4.0`; Gradle takes the
higher of that and `@rnmapbox/maps`'. **If our floor is higher than rnmapbox
expects, we have just upgraded the phone's map** — check the map tab still
works before anything else.

**3. Did the plugin actually apply?** Verify the artefact, not the source
(§12c):

```bash
grep -r "DriverseCarAppService" android/app/src/main/AndroidManifest.xml
grep -r "DriverseCarPackage" android/app/src/main/java/**/MainApplication.kt
ls android/app/src/main/java/app/rork/driverse/carapp/
```

**4. Does the phone still work?** Before touching the car: record a drive, check
distance and elapsed advance, end it, confirm the trip saves. The recorder
changed; that is the regression to look for first.

**5. Then the DHU.**

```bash
adb forward tcp:5277 tcp:5277
cd $ANDROID_HOME/extras/google/auto && ./desktop-head-unit
```

Driverse must appear in the car launcher. If it does not, the manifest is the
suspect — that failure is silent by construction (§2 of
`plugins/androidAutoManifest.js`). Note that `HostValidator` allows all hosts
only in debuggable builds; a release build will refuse the DHU, correctly.

**6. Then the Automotive OS emulator**, which is a different host with a
different surface lifecycle. Both are supported ways users reach car apps and
both need validating.

**7. Only then the checklist in §6a.**

## 8. Not in this work

- **CarPlay.** Separate Apple entitlement request, separate piece of work.
- **Play Console submission.** Blocked on §6a and §7. When it happens: a
  **dedicated Android Auto track**, and a **closed testing track first** — a
  non-compliant build on closed testing comes back with a compliance notice,
  while the same build on production gets the *entire app* submission rejected,
  which blocks ordinary phone updates too.

## 9. File map

| File | Role |
| --- | --- |
| `lib/carTrip.ts` | Display rules, in TypeScript. Tested |
| `lib/tripRecorder.ts` | The bridge's JS side; launch-safe module access |
| `hooks/useNativeTrip.ts` | The map screen's subscription; route projection |
| `native/androidauto/.../CarScreenModel.kt` | The same rules, in Kotlin, where the pixels are |
| `native/androidauto/.../DriveScreen.kt` | `NavigationTemplate`, actions, `NavigationManager` |
| `native/androidauto/.../DriverseCarAppService.kt` | Host entry point, host validation |
| `native/androidauto/.../DriverseSession.kt` | Session lifecycle, `geo:` intents |
| `native/androidauto/.../CarMapRenderer.kt` | The car surface. No Mapbox types |
| `native/androidauto/.../MapboxCarMap.kt` | The only file with Mapbox types |
| `native/androidauto/.../TripRecorderService.kt` | The foreground recorder |
| `native/androidauto/.../TripStore.kt` | The process-wide source of truth |
| `native/androidauto/.../TripGeo.kt` | Distance, elapsed, step matching. Pure |
| `native/androidauto/.../CarCommandBus.kt` | Car buttons → phone |
| `plugins/withAndroidAuto.js` | Injects all of it at prebuild |
