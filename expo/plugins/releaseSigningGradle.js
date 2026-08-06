/**
 * The string surgery behind `withReleaseSigning`, kept separate so it can be
 * tested without running `expo prebuild`.
 *
 * This is the risky half of the plugin. It edits a generated Gradle file by
 * pattern-matching it, and the failure mode is not a crash — it is a build
 * that succeeds and produces a **debug-signed** bundle, which looks completely
 * normal until Play rejects it. `plugins/__tests__/releaseSigningGradle.test.js`
 * pins the two mistakes that would cause that:
 *
 *   - rewriting the `debug` build type instead of `release` (the anchor string
 *     appears in both, `release` second), and
 *   - silently doing nothing when the generated file does not match.
 */

/** Gradle property that decides whether an upload key is configured at all. */
const STORE_FILE_PROPERTY = "DRIVERSE_UPLOAD_STORE_FILE";

/** Marks a file this has already been applied to. */
const SIGNING_CONFIG_NAME = "driverseUpload";

/**
 * Adds an upload signing config and points the release build type at it.
 *
 * Returns the file unchanged when it has already been applied, so a prebuild
 * that runs the plugin twice is a no-op rather than a corrupted file.
 *
 * @param {string} contents `android/app/build.gradle`
 * @returns {string}
 */
function applyReleaseSigning(contents) {
  if (contents.includes(SIGNING_CONFIG_NAME)) return contents;

  // 1. Declare the signing config beside the generated `debug` one.
  //
  //    The whole block is guarded on the property existing. Gradle evaluates
  //    every `signingConfigs` entry at configuration time, so an unguarded
  //    `storeFile file(...)` pointing at a path that is not there fails the
  //    entire build — including `assembleDebug` — on any machine without the
  //    keystore. That would break every developer to serve one release task.
  const signingAnchor = "signingConfigs {";
  if (!contents.includes(signingAnchor)) {
    throw new Error(
      "[withReleaseSigning] No `signingConfigs {` block in app/build.gradle. " +
        "The Expo template changed; update this plugin rather than editing the generated file."
    );
  }

  let next = contents.replace(
    signingAnchor,
    `${signingAnchor}
        ${SIGNING_CONFIG_NAME} {
            if (project.hasProperty('${STORE_FILE_PROPERTY}')) {
                storeFile file(${STORE_FILE_PROPERTY})
                storePassword DRIVERSE_UPLOAD_STORE_PASSWORD
                keyAlias DRIVERSE_UPLOAD_KEY_ALIAS
                keyPassword DRIVERSE_UPLOAD_KEY_PASSWORD
            }
        }`
  );

  // 2. Point the RELEASE build type at it.
  //
  //    `signingConfig signingConfigs.debug` appears TWICE in the generated
  //    file — once under `debug {`, once under `release {`, in that order. A
  //    plain string replace takes the first and would leave release signing
  //    untouched, which is exactly the silent debug-signed-bundle failure this
  //    module exists to prevent. Anchoring on `release {` is load-bearing.
  const releaseSigning = /(release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!releaseSigning.test(next)) {
    throw new Error(
      "[withReleaseSigning] The release build type does not use `signingConfigs.debug`. " +
        "The Expo template changed; update this plugin rather than editing the generated file."
    );
  }

  return next.replace(
    releaseSigning,
    `$1signingConfig project.hasProperty('${STORE_FILE_PROPERTY}') ` +
      `? signingConfigs.${SIGNING_CONFIG_NAME} : signingConfigs.debug`
  );
}

module.exports = { applyReleaseSigning, STORE_FILE_PROPERTY, SIGNING_CONFIG_NAME };
