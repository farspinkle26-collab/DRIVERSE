# Building Driveverse with EAS

This file exists because of a specific failure, and the failure is the reason
to read it before using anything here.

## 1. Why this exists

Driveverse is built by Rork's cloud builder (`bunx rork start -p …`). Between
1 and 3 August 2026, five separate changes were merged to stop the Android app
crashing on open, and **not one of them could be shown to have reached a built
APK**:

| PR | Change | Android result |
| --- | --- | --- |
| #167 | `dependencies: expo-web-browser ~15.0.11` | still shipped 56.x |
| #170 | exact `overrides` + `resolutions` pin | still shipped 56.x |
| #171 | removed `@rork-ai/toolkit-sdk` and its `"*"` peer | still shipped 56.x |
| #172 | `expo.autolinking.android.exclude` | module still registered |

Every build died the same way, before any JavaScript ran:

```
java.lang.NoClassDefFoundError: expo.modules.kotlin.types.AnyTypeCache
  at expo.modules.webbrowser.WebBrowserModule.definition(WebBrowserModule.kt:181)
  at expo.modules.kotlin.AppContext.<init>(AppContext.kt:120)
  at com.facebook.react.runtime.ReactInstance.<init>(ReactInstance.kt:168)
```

Four of those changes ask a dependency resolver for a different version. The
fifth (#172) does not even do that — it tells Expo's autolinker not to link the
module at all, and it was verified locally with Expo's own resolver:

```
expo-modules-autolinking resolve -p android  →  21 modules, expo-web-browser absent
```

A build that registers `WebBrowserModule` anyway is a build that did not use
this repository's `package.json`. At that point the bug stops being in the code
and starts being in the pipeline, and no further code change can prove
otherwise.

**So the point of EAS here is not to replace Rork. It is to get one build whose
inputs we can see.**

## 2. The experiment

```bash
cd expo
npx eas login          # free Expo account
npx eas init           # writes extra.eas.projectId into app.json — commit it
npx eas build --platform android --profile diagnostic
```

`diagnostic` produces an **APK** (not an AAB) with internal distribution, so it
installs straight onto a phone with no Play Store round-trip:

```bash
adb install -r ~/Downloads/build-*.apk
adb logcat -c && adb logcat -s AndroidRuntime:E
```

Then open the app.

### Reading the result

- **It launches** → the repository is correct and Rork's builder is the
  problem. You have a working APK, and the conversation with Rork now has a
  reproduction.
- **It crashes the same way** → the repository is still wrong, and the EAS
  build log shows exactly which `expo-web-browser` was installed, which is the
  fact five rounds of guessing never had.

Either answer is worth more than another blind rebuild.

### The one thing to check in the log

EAS prints its install step. Search the build log for:

```
expo-web-browser@
```

Whatever version appears there is what the APK contains. `package.json` says
`15.0.11`; if the log says anything else, that discrepancy is the whole bug and
it belongs in a Rork support ticket verbatim.

## 3. Environment variables

`EXPO_PUBLIC_*` values are inlined into the JS bundle **at build time**, so
they are a property of the build machine, not the phone. `lib/envCheck.ts`
logs which ones landed; a build missing them starts but cannot reach Supabase.

`eas.json` deliberately carries **no `env` block at all** for any profile — an
earlier version of this file listed the five variables with empty-string
placeholders, and EAS's own schema validation rejects that outright:

```
eas.json is not valid.
- "build.diagnostic.env.EXPO_PUBLIC_SUPABASE_URL" is not allowed to be empty
```

An empty string is not "unset" to EAS; it is an invalid value, and the build
refuses to start. There is no placeholder that satisfies the schema and also
avoids committing a real secret, so the field is omitted entirely.

With no `env` block, a profile gets whatever EAS secrets are registered for the
project — none, until you create some. That is fine for `diagnostic`: it exists
to test whether the app *opens*, and `lib/supabase.ts` already falls back to an
inert client rather than throwing when these are absent (§3). A missing key
degrades a feature; it does not crash the build or the app.

To set real values, once per project:

```bash
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR.supabase.co
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ...
npx eas secret:create --scope project --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk...
npx eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value appl_...
npx eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value goog_...
npx eas secret:list
```

See `.env.example` for what each one is for.

## 4. Signing — read before trying to ship an EAS build to Play

**A diagnostic APK needs no particular key.** Any signature installs by `adb`,
so section 2 works with whatever EAS generates.

**Uploading to Play Store is different.** Google identifies an app by its
signing key. If Rork has been signing your uploads, an EAS build with a fresh
keystore is a *different app* as far as Play is concerned and the upload is
rejected.

Two ways through, and which applies depends on your Play Console setup:

- **Play App Signing enabled** (most likely — it is the default for apps
  created after 2021): Google holds the app signing key and you only supply an
  *upload* key. Register EAS's upload key in Play Console → Setup → App
  integrity, or ask Rork to export the upload keystore and give it to EAS with
  `eas credentials`.
- **Play App Signing not enabled**: you must use the original keystore. Get it
  from Rork and load it via `eas credentials` → Android → Keystore → upload.

Do not create a new keystore and try to publish with it. That path ends with a
listing you cannot update.

## 5. Version numbers

`appVersionSource: "remote"` lets EAS own `versionCode`, and `production` sets
`autoIncrement`. This matters here: the crashing Rork builds reported
`versionCode=15` across several supposedly-new binaries, which is both a
symptom worth remembering and an upload blocker — Play Store rejects a
duplicate `versionCode` outright.

To check what a device actually has installed, never trust the build system:

```bash
adb shell dumpsys package app.rork.driverse | grep versionCode
```

## 6. What this file does not change

Rork remains the primary pipeline; `package.json`'s `start` scripts are
untouched, and `bunx rork start` still works for development. Nothing here is
wired into CI. `eas.json` is inert until somebody runs `eas build`.

If the diagnostic build proves the repository is fine, the decision about which
pipeline ships the store binary is a separate one, and a business call rather
than a technical one.

---

## 7. Building the Play Store binary locally (6 Aug 2026)

Everything above assumes EAS runs the build. This section is the other route,
written because it is the one this project can actually run today: `eas build
--local` **cannot build Android on Windows** (macOS or Linux only), and the
EAS free tier's monthly build allowance is finite. The local Gradle toolchain
set up for §2's diagnostic APK produces a Play-ready App Bundle too — the only
things that change are the Gradle task and the signing key.

### 7.1 The three things that make a local build uploadable

An APK from `:app:assembleRelease` is **not** a Play Store binary. Three
separate reasons, all of which have to be fixed:

1. **Play wants an App Bundle, not an APK.** New apps have had to ship `.aab`
   since August 2021. The task is `:app:bundleRelease`, and the output lands at
   `android/app/build/outputs/bundle/release/app-release.aab`.
2. **The debug keystore is not an upload key.** With no release signing
   configured, `expo prebuild` wires the release build to Android's shared
   debug key — fine for `adb install`, rejected by Play. §7.2.
3. **`versionCode` must be higher than anything already uploaded.** It was
   unset in `app.json`, which means Expo generates `1`, and Play rejects a
   `versionCode` it has seen before. First pinned at `16` on the assumption
   that the Rork builds' reported `15` (§5) was the highest — wrong: Play
   Console's App bundle explorer showed `19` already uploaded (evidently more
   Rork builds than were visible from the logs at hand), and the `16` upload
   was rejected outright. Now pinned at `20`. **This number goes stale the
   moment it is set — check Play Console → Release → App bundle explorer
   before every upload and raise it past the highest one there,** rather than
   trusting whatever is committed here. A duplicate is the single most common
   failed upload, and this file cannot see uploads that happened outside it.

`eas.json`'s `production` profile already sets `buildType: "app-bundle"` and
`autoIncrement`, so an EAS cloud build gets 1 and 3 for free. This section is
for when that is not the route.

### 7.2 Signing — the part with no undo

**Read §4 first.** The question it turns on is *what Play already knows about
this app*, and it is not answerable from this repository:

- **The app already exists in Play Console** (it does — a Play Console
  rejection is on record, LAUNCH_SAFETY_REFERENCE.md §10), so there is an
  upload key registered already. A locally generated keystore is a **different
  app** to Google, and the upload is rejected.
- With **Play App Signing** on (default since 2021), Google holds the real
  signing key and you only supply an upload key. A lost or unavailable upload
  key is recoverable: Play Console → Setup → App integrity → *Request upload
  key reset*. It takes a couple of days.
- Without Play App Signing, the original keystore is the only key that works
  and there is no reset. It has to come from whoever built the uploads.

Once the right keystore is in hand, put it **outside the repo** and point
Gradle at it through `~/.gradle/gradle.properties` (never a file in the
project — `android/` is regenerated by `prebuild --clean` and a keystore in
git is a keystore that has leaked):

```properties
DRIVERSE_UPLOAD_STORE_FILE=C:\\keys\\driverse-upload.jks
DRIVERSE_UPLOAD_STORE_PASSWORD=…
DRIVERSE_UPLOAD_KEY_ALIAS=…
DRIVERSE_UPLOAD_KEY_PASSWORD=…
```

Because CNG regenerates `android/`, the signing config cannot simply be edited
into `android/app/build.gradle` — it would be erased by the next prebuild. It
belongs in a config plugin, or `android/` stops being generated and starts
being committed. That decision is not made here.

### 7.3 The build

```bash
npx expo prebuild --platform android --clean
cd android
./gradlew bundleRelease          # .aab, not .apk
```

Verify what came out before uploading anything:

```bash
# Which key actually signed it — must be the upload key, not the debug key.
jarsigner -verify -verbose:summary app/build/outputs/bundle/release/app-release.aab

# What Play will read as the version.
javap -version 2>/dev/null; unzip -p app/build/outputs/bundle/release/app-release.aab \
  BUNDLE-METADATA/com.android.tools.build.gradle/app-metadata.properties
```

A debug-signed bundle is identifiable by `CN=Android Debug` in the jarsigner
output. That is the failure this section exists to catch **before** the upload,
not after.

### 7.4 Store listing requirements that are not the binary

A finished `.aab` is necessary and not sufficient. Play will also hold the
release for, at minimum: a privacy policy URL, the Data safety form, content
rating questionnaire, target-audience declaration, and — because this app
requests `ACCESS_BACKGROUND_LOCATION` — a **background location permission
declaration with a video demonstrating the in-app feature that needs it**.
That last one is the usual reason a first submission sits in review for weeks,
and it is worth starting before the binary is ready rather than after.
