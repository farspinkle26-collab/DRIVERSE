const { applyCarAppDependencies, MARKER } = require("../androidAutoGradle");
const {
  applyCarAppManifest,
  CAR_PERMISSIONS,
  SERVICE_PACKAGE,
} = require("../androidAutoManifest");
const { applyCarPackage } = require("../androidAutoMainApplication");

/**
 * Every failure these guard looks like success.
 *
 * A car-app manifest entry that did not apply produces an APK that builds,
 * installs, launches and records drives — and never appears on the car display,
 * with no error in any log. A `MainApplication.kt` registration that did not
 * apply produces an app whose JS side finds no native module and correctly
 * falls back to the JS recorder, exactly as it is designed to on iOS, saying
 * nothing. Neither is discoverable from the build output, which is why the
 * transforms are pure functions with tests rather than replaces inside the
 * plugin.
 *
 * The same reasoning as `releaseSigningGradle.test.js`, one feature over.
 */

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

/** A faithful slice of what `expo prebuild` generates for SDK 54. */
const GENERATED_GRADLE = `
buildscript {
    dependencies {
        classpath('com.android.tools.build:gradle')
    }
}

android {
    namespace 'app.rork.driverse'
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.facebook.react:hermes-android")
}
`;

describe("applyCarAppDependencies", () => {
  it("adds the car app library and the host binding", () => {
    const out = applyCarAppDependencies(GENERATED_GRADLE);
    expect(out).toContain('implementation "androidx.car.app:app:');
    // Without app-projected the app builds, the manifest validates, and the
    // car never offers it — the single most confusing way to fail here.
    expect(out).toContain('implementation "androidx.car.app:app-projected:');
    // compileOnly, NOT implementation: an `implementation` here joins the
    // runtime graph and can silently upgrade the Maps SDK the PHONE's map runs
    // against, turning a car-only change into a map-tab regression.
    expect(out).toContain('compileOnly "com.mapbox.maps:android');
    expect(out).not.toContain('implementation "com.mapbox.maps');
  });

  it("adds to the app dependencies, not the buildscript's", () => {
    // The generated file has two `dependencies {` blocks. Adding an app
    // dependency to the buildscript one fails with an error naming the
    // dependency rather than the block, which sends you looking in the wrong
    // file entirely.
    const out = applyCarAppDependencies(GENERATED_GRADLE);
    const buildscript = out.slice(
      out.indexOf("buildscript {"),
      out.indexOf("android {")
    );
    expect(buildscript).not.toContain("androidx.car.app");
  });

  it("is a no-op when already applied", () => {
    const once = applyCarAppDependencies(GENERATED_GRADLE);
    expect(applyCarAppDependencies(once)).toBe(once);
    expect(once.split(MARKER)).toHaveLength(2);
  });

  it("throws rather than silently doing nothing when the template changes", () => {
    expect(() => applyCarAppDependencies("android { }")).toThrow(
      /dependencies/
    );
  });
});

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

function generatedManifest() {
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      "uses-permission": [
        { $: { "android:name": "android.permission.ACCESS_FINE_LOCATION" } },
      ],
      application: [
        {
          $: { "android:name": ".MainApplication" },
          activity: [{ $: { "android:name": ".MainActivity" } }],
        },
      ],
    },
  };
}

/** The `<application>` node, after a transform. */
function app(manifest) {
  return manifest.manifest.application[0];
}

function metaData(manifest, name) {
  return app(manifest)["meta-data"].find((m) => m.$["android:name"] === name);
}

function service(manifest, name) {
  return app(manifest).service.find((s) => s.$["android:name"] === name);
}

describe("applyCarAppManifest", () => {
  it("declares the Navigation category on the CarAppService", () => {
    // THE SCOPE DECISION. An Android Auto app gets exactly one category, and
    // this is the line that picks it. Every template the app may use follows.
    const out = applyCarAppManifest(generatedManifest());
    const svc = service(out, `${SERVICE_PACKAGE}.DriverseCarAppService`);
    expect(svc["intent-filter"][0].action[0].$["android:name"]).toBe(
      "androidx.car.app.CarAppService"
    );
    expect(svc["intent-filter"][0].category[0].$["android:name"]).toBe(
      "androidx.car.app.category.NAVIGATION"
    );
  });

  it("exports the car app service and does not export the recorder", () => {
    const out = applyCarAppManifest(generatedManifest());
    // The host is another process and must be able to bind.
    expect(
      service(out, `${SERVICE_PACKAGE}.DriverseCarAppService`).$["android:exported"]
    ).toBe("true");
    // An exported service that switches on GPS is a security finding.
    expect(
      service(out, `${SERVICE_PACKAGE}.TripRecorderService`).$["android:exported"]
    ).toBe("false");
  });

  it("gives the recorder a location foreground service type", () => {
    // Required from Android 10, and from Android 14 the manifest value must
    // match what startForeground passes or the service throws on start.
    const out = applyCarAppManifest(generatedManifest());
    expect(
      service(out, `${SERVICE_PACKAGE}.TripRecorderService`).$[
        "android:foregroundServiceType"
      ]
    ).toBe("location");
  });

  it("declares both car permissions", () => {
    const out = applyCarAppManifest(generatedManifest());
    const names = out.manifest["uses-permission"].map(
      (p) => p.$["android:name"]
    );
    CAR_PERMISSIONS.forEach((p) => expect(names).toContain(p));
  });

  it("keeps the app's existing permissions", () => {
    const out = applyCarAppManifest(generatedManifest());
    const names = out.manifest["uses-permission"].map(
      (p) => p.$["android:name"]
    );
    expect(names).toContain("android.permission.ACCESS_FINE_LOCATION");
  });

  it("points at the automotive app descriptor", () => {
    // Without this the host never treats Driverse as a car app at all, and the
    // service is a valid service nothing binds to.
    const out = applyCarAppManifest(generatedManifest());
    expect(
      metaData(out, "com.google.android.gms.car.application").$["android:resource"]
    ).toBe("@xml/automotive_app_desc");
    expect(
      metaData(out, "androidx.car.app.minCarApiLevel").$["android:value"]
    ).toBe("1");
  });

  it("does not require automotive hardware", () => {
    // `required=true` would restrict the Play listing to car head units and
    // hide Driverse from every phone — a catastrophic one-word mistake.
    const out = applyCarAppManifest(generatedManifest());
    const feature = out.manifest["uses-feature"].find(
      (f) => f.$["android:name"] === "android.hardware.type.automotive"
    );
    expect(feature.$["android:required"]).toBe("false");
  });

  it("is idempotent across repeated prebuilds", () => {
    // Two services with the same name is a manifest-merger error whose message
    // names neither this plugin nor the reason.
    const once = applyCarAppManifest(generatedManifest());
    const twice = applyCarAppManifest(once);
    expect(twice.manifest.application[0].service).toHaveLength(2);
    expect(twice.manifest["uses-permission"]).toHaveLength(
      1 + CAR_PERMISSIONS.length
    );
    expect(twice.manifest.application[0]["meta-data"]).toHaveLength(2);
  });

  it("throws when there is no application node to add to", () => {
    expect(() => applyCarAppManifest({ manifest: {} })).toThrow(/application/);
  });
});

/* ------------------------------------------------------------------ *
 * MainApplication.kt
 * ------------------------------------------------------------------ */

/** A faithful slice of what `expo prebuild` generates for SDK 54. */
const GENERATED_MAIN_APPLICATION = `package app.rork.driverse

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> {
          return PackageList(this).packages.apply {
            // Packages that cannot be autolinked yet can be added manually here
          }
        }
      }
}
`;

describe("applyCarPackage", () => {
  it("registers the package inside the packages list", () => {
    const out = applyCarPackage(GENERATED_MAIN_APPLICATION);
    expect(out).toContain("add(DriverseCarPackage())");
    const applyBlock = out.slice(out.indexOf("packages.apply {"));
    expect(applyBlock).toContain("add(DriverseCarPackage())");
  });

  it("puts the import after the package declaration", () => {
    // A Kotlin file's `package` line must come first. Prepending an import
    // produces a file that does not parse — the exact failure
    // LAUNCH_SAFETY_REFERENCE.md §8 records reaching `main` unnoticed.
    const out = applyCarPackage(GENERATED_MAIN_APPLICATION);
    expect(out.indexOf("package app.rork.driverse")).toBeLessThan(
      out.indexOf("import app.rork.driverse.carapp.DriverseCarPackage")
    );
    expect(out.trimStart().startsWith("package ")).toBe(true);
  });

  it("is a no-op when already applied", () => {
    const once = applyCarPackage(GENERATED_MAIN_APPLICATION);
    expect(applyCarPackage(once)).toBe(once);
    expect(once.split("add(DriverseCarPackage())")).toHaveLength(2);
  });

  it("throws rather than silently skipping when the template changes", () => {
    // The quietest failure in the feature: a missed registration produces an
    // app that falls back to the JS recorder exactly as designed on iOS, and
    // says nothing about the car half being inert.
    expect(() =>
      applyCarPackage("package app.rork.driverse\n\nclass MainApplication\n")
    ).toThrow(/PackageList/);
  });
});
