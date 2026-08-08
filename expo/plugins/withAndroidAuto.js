const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withStringsXml,
} = require("@expo/config-plugins");

const { applyCarAppDependencies } = require("./androidAutoGradle");
const { applyCarAppManifest } = require("./androidAutoManifest");
const { applyCarPackage } = require("./androidAutoMainApplication");

/**
 * Builds Driverse's Android Auto support into the generated Android project.
 *
 * WHY THE KOTLIN LIVES IN `native/androidauto/` AND IS COPIED IN
 *
 * `android/` is generated. It is gitignored (`.gitignore:40`) and
 * `expo prebuild --clean` deletes and rewrites it. Kotlin written directly into
 * `android/app/src/main/java/` therefore survives exactly until the next
 * prebuild and then vanishes — and, because the JS side treats a missing native
 * module as "this build has no native recorder, keep using the JS one"
 * (`lib/tripRecorder.ts`, deliberately, for iOS), the build after that is an app
 * that compiles, launches, records drives normally, and has simply lost its car
 * support with nothing anywhere saying so.
 *
 * That is the same trap `withReleaseSigning` was written to avoid, one file
 * over: a generated-directory edit whose disappearance is silent. The sources
 * are committed under `native/androidauto/`, which prebuild does not touch, and
 * copied in on every prebuild.
 *
 * WHAT THIS PLUGIN DOES, IN ORDER
 *
 *  1. Copies `native/androidauto/src/main/java` into the app's source tree.
 *  2. Copies `native/androidauto/src/main/res` (the car icons and
 *     `automotive_app_desc.xml`) into the app's resources.
 *  3. Adds the Car App Library and Maps SDK dependencies.
 *  4. Adds the manifest's services, permissions and metadata.
 *  5. Registers `DriverseCarPackage` so React Native sees the bridge.
 *  6. Writes the Mapbox token into a string resource the car app can read
 *     without the JS side having run.
 *
 * Every step that edits a generated file does so through a tested pure function
 * in a sibling module, for the reason `releaseSigningGradle.js` gives: string
 * surgery on a generated file fails by matching nothing, and a build that
 * succeeds while missing the thing it was built for is the worst outcome
 * available.
 */

/** Where the committed Kotlin lives, relative to the project root. */
const SOURCE_ROOT = path.join("native", "androidauto", "src", "main");

/** Recursively copies a directory, creating what it needs. */
function copyDir(from, to) {
  if (!fs.existsSync(from)) {
    throw new Error(
      `[withAndroidAuto] Missing source directory ${from}. The car app sources ` +
        `are committed under native/androidauto/ — see this plugin's header.`
    );
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

/** Step 1 and 2: the sources and resources. */
const withCarSources = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;

      copyDir(
        path.join(projectRoot, SOURCE_ROOT, "java"),
        path.join(platformRoot, "app", "src", "main", "java")
      );
      copyDir(
        path.join(projectRoot, SOURCE_ROOT, "res"),
        path.join(platformRoot, "app", "src", "main", "res")
      );

      return cfg;
    },
  ]);

/** Step 3: dependencies. */
const withCarGradle = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        "[withAndroidAuto] app/build.gradle is not Groovy; the car app " +
          "dependencies were not added."
      );
    }
    cfg.modResults.contents = applyCarAppDependencies(cfg.modResults.contents);
    return cfg;
  });

/** Step 4: the manifest. */
const withCarManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyCarAppManifest(cfg.modResults);
    return cfg;
  });

/**
 * Step 5: the React Native package.
 *
 * `withDangerousMod` rather than a first-class mod because config-plugins has
 * no `withMainApplication` for Kotlin that is stable across SDK versions, and
 * reaching for the file directly is more honest than pretending otherwise. The
 * path is resolved by search rather than assumed, because it contains the
 * Android package name and that is configuration, not a constant.
 */
const withCarPackageRegistration = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const javaRoot = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java"
      );

      const found = findMainApplication(javaRoot);
      if (!found) {
        throw new Error(
          "[withAndroidAuto] Could not find MainApplication.kt under " +
            `${javaRoot}. Without it the trip recorder bridge is never ` +
            "registered, and the app silently falls back to the JS recorder."
        );
      }

      fs.writeFileSync(found, applyCarPackage(fs.readFileSync(found, "utf8")));
      return cfg;
    },
  ]);

function findMainApplication(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainApplication(full);
      if (found) return found;
    } else if (entry.name === "MainApplication.kt") {
      return full;
    }
  }
  return null;
}

/**
 * Step 6: the Mapbox token, as a string resource.
 *
 * The car app can be launched with the phone app closed, so `setAccessToken()`
 * on the JS side may never have run. The Maps SDK reads a `mapbox_access_token`
 * string resource on its own, which is the one path that does not depend on
 * anything in React having happened.
 *
 * An absent token is NOT an error here. It means the car map draws nothing while
 * the rest of the car screen works — the same degradation `lib/mapboxNative.ts`
 * chose for the phone, and a far better outcome during a prebuild on a machine
 * that has no secrets than a failed build.
 */
const withMapboxToken = (config) =>
  withStringsXml(config, (cfg) => {
    const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
    if (!token) return cfg;

    const strings = cfg.modResults.resources.string ?? [];
    const existing = strings.findIndex((s) => s?.$?.name === "mapbox_access_token");
    const node = {
      $: { name: "mapbox_access_token", translatable: "false" },
      _: token,
    };
    if (existing >= 0) {
      strings[existing] = node;
    } else {
      strings.push(node);
    }
    cfg.modResults.resources.string = strings;
    return cfg;
  });

const withAndroidAuto = (config) => {
  // Order matters for exactly one pair: the sources have to be copied before
  // the package registration reads MainApplication.kt, because both are
  // dangerous mods and they run in the order they are applied.
  let next = withCarSources(config);
  next = withCarGradle(next);
  next = withCarManifest(next);
  next = withCarPackageRegistration(next);
  next = withMapboxToken(next);
  return next;
};

module.exports = withAndroidAuto;
