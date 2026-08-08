/**
 * The Gradle surgery behind `withAndroidAuto`, kept separate so it can be
 * tested without running `expo prebuild`.
 *
 * Three dependencies go in, and each is here for a different reason:
 *
 *   androidx.car.app:app            the Car App Library itself — templates,
 *                                   CarAppService, NavigationManager.
 *   androidx.car.app:app-projected  the Android Auto host binding. Without it
 *                                   the app compiles, the manifest looks
 *                                   right, and the car simply never offers it.
 *   com.mapbox.maps:android         the Maps SDK, for `MapboxCarMap`.
 *
 * WHY MAPBOX IS DECLARED HERE RATHER THAN INHERITED
 *
 * `@rnmapbox/maps` already puts the Maps SDK in the APK, so the classes are
 * there at runtime whether or not this line exists. Compilation is the problem:
 * that package declares its Mapbox dependency with `implementation`, which does
 * NOT propagate to the app module's compile classpath. `MapboxCarMap.kt` names
 * `MapSurface` directly, so without an explicit declaration here it does not
 * build — with an "unresolved reference" that reads like a typo rather than a
 * dependency-scope problem.
 *
 * WHY IT IS `compileOnly` AND NOT `implementation`
 *
 * With `implementation`, this declaration joins the runtime graph and Gradle
 * resolves it against rnmapbox's to whichever is higher — so a version here
 * that is newer than rnmapbox expects silently UPGRADES the phone's map, and
 * the first symptom is the map tab breaking in a change that was only ever
 * about the car. That is an unacceptable blast radius for a feature nobody has
 * on yet.
 *
 * `compileOnly` puts it on the compile classpath only. The APK still contains
 * exactly the Maps SDK `@rnmapbox/maps` chose, the phone's map is untouched by
 * this feature by construction, and the version below only has to be close
 * enough for `MapboxCarMap.kt` to compile.
 *
 * The cost is that a mismatch between the two moves from build time to run
 * time — a `NoClassDefFoundError` or `NoSuchMethodError` when the car map
 * loads. That is precisely the failure `CarMapSurface` was built to absorb: it
 * lands in `CarMapRenderer`'s `catch (t: Throwable)` and produces a dark map
 * under a working template, never a dead car app. Check the runtime version
 * with:
 *
 *     cd android && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath | grep mapbox
 *
 * and set `DRIVERSE_MAPBOX_MAPS_VERSION` in `~/.gradle/gradle.properties` to
 * match it if the car map fails to load.
 *
 * The failure mode this file guards against is the one `releaseSigningGradle.js`
 * guards against too: a string replace that silently matches nothing, leaving a
 * build that succeeds and produces an APK with no car support in it at all.
 */

/** Car App Library. 1.4.0 is the current stable line for both artifacts. */
const CAR_APP_VERSION = "1.4.0";

/**
 * Maps SDK version to COMPILE against — see this file's header. It never
 * reaches the APK, so it does not have to match what `@rnmapbox/maps` ships;
 * it only has to be close enough for `MapboxCarMap.kt` to resolve.
 */
const MAPBOX_MAPS_VERSION = "11.4.0";

/** Marks a file this has already been applied to. */
const MARKER = "// driverse:android-auto";

/**
 * Adds the car app dependencies to `android/app/build.gradle`.
 *
 * Returns the file unchanged when already applied, so a prebuild that runs the
 * plugin twice is a no-op rather than a file with the block in it twice (which
 * Gradle tolerates, but which makes the next diff unreadable).
 *
 * @param {string} contents `android/app/build.gradle`
 * @returns {string}
 */
function applyCarAppDependencies(contents) {
  if (contents.includes(MARKER)) return contents;

  // Anchored on the LAST `dependencies {` rather than the first. The generated
  // file has one inside `buildscript { }` at the top on some Expo templates,
  // and adding an app dependency there fails with an error that names the
  // dependency rather than the block, which sends you looking in the wrong
  // place entirely.
  const anchor = "dependencies {";
  const at = contents.lastIndexOf(anchor);
  if (at === -1) {
    throw new Error(
      "[withAndroidAuto] No `dependencies {` block in app/build.gradle. " +
        "The Expo template changed; update this plugin rather than editing the generated file."
    );
  }

  const block = `dependencies {
    ${MARKER} — see plugins/androidAutoGradle.js for why each of these is here.
    implementation "androidx.car.app:app:${CAR_APP_VERSION}"
    // The Android Auto host binding. Without this the app builds and the
    // manifest validates, and the car never offers Driverse at all.
    implementation "androidx.car.app:app-projected:${CAR_APP_VERSION}"
    // COMPILE-ONLY, and that is the whole point — see this file's header.
    // @rnmapbox/maps already ships the Maps SDK at runtime; this line exists
    // only so MapboxCarMap.kt can name MapSurface at compile time, and
    // compileOnly keeps it off the runtime classpath so it cannot change which
    // version the phone's map actually runs against.
    compileOnly "com.mapbox.maps:android:\${project.hasProperty('DRIVERSE_MAPBOX_MAPS_VERSION') ? DRIVERSE_MAPBOX_MAPS_VERSION : '${MAPBOX_MAPS_VERSION}'}"
`;

  return contents.slice(0, at) + block + contents.slice(at + anchor.length);
}

module.exports = {
  applyCarAppDependencies,
  CAR_APP_VERSION,
  MAPBOX_MAPS_VERSION,
  MARKER,
};
