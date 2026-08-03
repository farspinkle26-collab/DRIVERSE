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
npx eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_...
npx eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_...
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
