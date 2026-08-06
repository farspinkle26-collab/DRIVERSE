const { withAppBuildGradle } = require("@expo/config-plugins");
const { applyReleaseSigning } = require("./releaseSigningGradle");

/**
 * Teaches the generated Android project to sign release builds with a real
 * upload key instead of Android's shared debug key.
 *
 * WHY THIS IS A PLUGIN AND NOT AN EDIT TO `android/app/build.gradle`
 *   `android/` is generated — it is gitignored, and `expo prebuild --clean`
 *   deletes and rewrites it. A signing config edited in by hand survives until
 *   the next prebuild and then silently disappears, and the build after that
 *   produces a **debug-signed** bundle that looks completely normal until Play
 *   rejects it — or worse, until it reaches a track under the wrong key.
 *   Expressing it as a plugin means it is reapplied every time the native
 *   project is generated, which is the only way it stays true.
 *
 * WHERE THE SECRETS LIVE
 *   Not here, and nowhere in this repository. The four values are read from
 *   Gradle properties, which belong in `~/.gradle/gradle.properties` — outside
 *   the project, outside git, and outside anything `prebuild --clean` erases:
 *
 *     DRIVERSE_UPLOAD_STORE_FILE=C:\\keys\\driverse-upload.jks
 *     DRIVERSE_UPLOAD_STORE_PASSWORD=…
 *     DRIVERSE_UPLOAD_KEY_ALIAS=…
 *     DRIVERSE_UPLOAD_KEY_PASSWORD=…
 *
 *   A keystore committed to a repository is a keystore that has leaked, and
 *   for an app already on Play that is not a rotate-and-move-on problem.
 *
 * WHAT HAPPENS WHEN THEY ARE ABSENT
 *   The release build keeps using the debug signing config, exactly as it does
 *   today. That is deliberate: every existing local `assembleRelease` for
 *   `adb install` keeps working with no setup, and CI needs no keystore to
 *   typecheck or bundle. The cost is that "did this get signed properly?" is
 *   NOT answerable from the build succeeding — so verify the artefact every
 *   time, per EAS_BUILD_REFERENCE.md §7.3:
 *
 *     jarsigner -verify -verbose:summary app-release.aab
 *
 *   `CN=Android Debug` in that output means the properties were not found.
 *
 * The file surgery itself lives in `./releaseSigningGradle.js`, pure and
 * tested — see that file's header for what the tests pin and why.
 */
const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        "[withReleaseSigning] app/build.gradle is not Groovy; signing was not applied."
      );
    }
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });

module.exports = withReleaseSigning;
