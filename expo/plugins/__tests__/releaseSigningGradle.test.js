const {
  applyReleaseSigning,
  SIGNING_CONFIG_NAME,
} = require("../releaseSigningGradle");

/**
 * The failure this guards does not throw and does not look like a failure: a
 * build that reports success and produces a **debug-signed** bundle. That is
 * only discovered at the Play upload, or — worse — after one, so the rules
 * below are pinned here rather than trusted to a careful read.
 */

/** A faithful slice of what `expo prebuild` generates for SDK 54. */
const GENERATED = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            shrinkResources false
            minifyEnabled enableProguardInReleaseBuilds
        }
    }
}
`;

/** The `debug { … }` build type only, so the two can be asserted separately. */
function debugBuildType(gradle) {
  const fromBuildTypes = gradle.indexOf("buildTypes");
  return gradle.slice(gradle.indexOf("debug {", fromBuildTypes), gradle.indexOf("release {"));
}

function releaseBuildType(gradle) {
  return gradle.slice(gradle.indexOf("release {"));
}

describe("applyReleaseSigning", () => {
  it("points the release build type at the upload config", () => {
    const out = releaseBuildType(applyReleaseSigning(GENERATED));
    expect(out).toContain(SIGNING_CONFIG_NAME);
  });

  it("leaves the debug build type on the debug key", () => {
    // THE BUG THIS EXISTS FOR: `signingConfig signingConfigs.debug` appears in
    // both build types, `release` second. A plain string replace rewrites the
    // debug one, leaves release signed with the debug key, and reports success.
    const out = debugBuildType(applyReleaseSigning(GENERATED));
    expect(out).toContain("signingConfig signingConfigs.debug");
    expect(out).not.toContain(SIGNING_CONFIG_NAME);
  });

  it("declares the upload signing config", () => {
    expect(applyReleaseSigning(GENERATED)).toContain(`${SIGNING_CONFIG_NAME} {`);
  });

  it("guards the whole config on the store-file property", () => {
    // Gradle evaluates every signingConfigs entry at configuration time, so an
    // unguarded storeFile pointing at a missing path breaks EVERY task —
    // including assembleDebug — on a machine with no keystore.
    const out = applyReleaseSigning(GENERATED);
    const config = out.slice(out.indexOf(`${SIGNING_CONFIG_NAME} {`));
    expect(config).toContain("project.hasProperty('DRIVERSE_UPLOAD_STORE_FILE')");
  });

  it("falls back to the debug key when no upload key is configured", () => {
    // Keeps `adb install` builds working with zero setup.
    expect(releaseBuildType(applyReleaseSigning(GENERATED))).toContain(
      "signingConfigs.debug"
    );
  });

  it("is idempotent, because prebuild may apply it more than once", () => {
    const once = applyReleaseSigning(GENERATED);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  it("throws when there is no signingConfigs block to extend", () => {
    // Silently doing nothing here is how a template change turns into a
    // debug-signed upload months later.
    expect(() => applyReleaseSigning("android { buildTypes { release { } } }")).toThrow(
      /signingConfigs/
    );
  });

  it("throws when the release build type is not the shape expected", () => {
    const noRelease = `
android {
    signingConfigs { debug { storeFile file('debug.keystore') } }
    buildTypes { debug { signingConfig signingConfigs.debug } }
}
`;
    expect(() => applyReleaseSigning(noRelease)).toThrow(/release build type/);
  });
});
