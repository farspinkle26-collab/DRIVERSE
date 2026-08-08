/**
 * The manifest entries that make Driverse a car app, as a pure transform over
 * the parsed `AndroidManifest.xml` that `@expo/config-plugins` hands us.
 *
 * Every one of these has the same failure mode when it is missing or wrong, and
 * it is the reason this is tested rather than trusted: the app builds, installs,
 * launches, and simply does not appear on the car display. There is no error, no
 * log line, and nothing to grep for — the host reads the manifest, decides the
 * app is not a car app, and never binds to the service. Debugging that from the
 * outside is hours; asserting it here is minutes.
 *
 * WHAT EACH ENTRY DOES
 *
 *  - `androidx.car.app.NAVIGATION_TEMPLATES` — permission to use the Navigation
 *    template set. Without it the app is offered on the car, launches, and
 *    throws when it builds its first `NavigationTemplate`.
 *  - `androidx.car.app.ACCESS_SURFACE` — permission to draw on the car's map
 *    surface. Without it `setSurfaceCallback` throws and the map is missing
 *    while everything else works, which is a genuinely confusing half-failure.
 *  - `minCarApiLevel` — the oldest host API this app supports. A host older
 *    than this refuses to launch it, which is the correct outcome; the wrong
 *    value here is how an app crashes on an older head unit instead.
 *  - `com.google.android.gms.car.application` → `automotive_app_desc.xml` —
 *    the declaration that this is a Car App Library app at all.
 *  - The `CarAppService` with the `androidx.car.app.category.NAVIGATION`
 *    category — this is where the Navigation category is chosen. An app gets
 *    exactly one category, and this line is it.
 *  - `TripRecorderService` with `foregroundServiceType="location"` — required
 *    from Android 10, and from Android 14 the value must match what
 *    `startForeground` passes or the service throws on start.
 */

const SERVICE_PACKAGE = "app.rork.driverse.carapp";

/** Oldest Car App API level this app supports. 1 is the widest reach. */
const MIN_CAR_API_LEVEL = "1";

/** The permissions the car app needs, beyond what the phone app declares. */
const CAR_PERMISSIONS = [
  "androidx.car.app.NAVIGATION_TEMPLATES",
  "androidx.car.app.ACCESS_SURFACE",
];

/** Reads the `<application>` node, which every generated manifest has. */
function applicationOf(androidManifest) {
  const app = androidManifest?.manifest?.application?.[0];
  if (!app) {
    throw new Error(
      "[withAndroidAuto] AndroidManifest.xml has no <application> node. " +
        "The Expo template changed; update this plugin."
    );
  }
  return app;
}

/** Adds a `<uses-permission>` unless it is already declared. */
function addPermission(manifest, name) {
  const root = manifest.manifest;
  root["uses-permission"] = root["uses-permission"] ?? [];
  const already = root["uses-permission"].some(
    (p) => p?.$?.["android:name"] === name
  );
  if (already) return;
  root["uses-permission"].push({ $: { "android:name": name } });
}

/** Adds (or replaces) an `<application>`-level `<meta-data>`. */
function setMetaData(application, name, attrs) {
  application["meta-data"] = application["meta-data"] ?? [];
  const existing = application["meta-data"].findIndex(
    (m) => m?.$?.["android:name"] === name
  );
  const node = { $: { "android:name": name, ...attrs } };
  if (existing >= 0) {
    application["meta-data"][existing] = node;
  } else {
    application["meta-data"].push(node);
  }
}

/** Adds (or replaces) a `<service>` by its fully qualified name. */
function setService(application, node) {
  application.service = application.service ?? [];
  const name = node.$["android:name"];
  const existing = application.service.findIndex(
    (s) => s?.$?.["android:name"] === name
  );
  if (existing >= 0) {
    application.service[existing] = node;
  } else {
    application.service.push(node);
  }
}

/**
 * Applies every car-app manifest entry.
 *
 * Idempotent: each helper replaces rather than appends, so a prebuild that runs
 * the plugin twice produces the same manifest rather than two services with the
 * same name (which is a build error, but only at merge time, with a message
 * that names neither this plugin nor the reason).
 *
 * @param {object} androidManifest the parsed manifest from config-plugins
 * @returns {object} the same object, mutated
 */
function applyCarAppManifest(androidManifest) {
  const application = applicationOf(androidManifest);

  CAR_PERMISSIONS.forEach((p) => addPermission(androidManifest, p));

  // Declares that the app runs on Automotive OS head units too. `required
  // false` is load-bearing: `true` would restrict the Play listing to
  // automotive hardware and hide Driverse from every phone.
  const root = androidManifest.manifest;
  root["uses-feature"] = root["uses-feature"] ?? [];
  const hasAutomotiveFeature = root["uses-feature"].some(
    (f) => f?.$?.["android:name"] === "android.hardware.type.automotive"
  );
  if (!hasAutomotiveFeature) {
    root["uses-feature"].push({
      $: {
        "android:name": "android.hardware.type.automotive",
        "android:required": "false",
      },
    });
  }

  setMetaData(application, "androidx.car.app.minCarApiLevel", {
    "android:value": MIN_CAR_API_LEVEL,
  });

  setMetaData(application, "com.google.android.gms.car.application", {
    "android:resource": "@xml/automotive_app_desc",
  });

  // The car app entry point. `exported=true` is required — the host is a
  // different process and binds to this service by intent.
  setService(application, {
    $: {
      "android:name": `${SERVICE_PACKAGE}.DriverseCarAppService`,
      "android:exported": "true",
    },
    "intent-filter": [
      {
        action: [{ $: { "android:name": "androidx.car.app.CarAppService" } }],
        // THE CATEGORY IS THE SCOPE DECISION. An Android Auto app gets exactly
        // one category and one template set with it; this line is what makes
        // Driverse a Navigation app rather than anything else.
        category: [
          { $: { "android:name": "androidx.car.app.category.NAVIGATION" } },
        ],
      },
    ],
  });

  // The recorder. `exported=false` — nothing outside the app has any business
  // starting it, and an exported service that turns on GPS is a finding.
  setService(application, {
    $: {
      "android:name": `${SERVICE_PACKAGE}.TripRecorderService`,
      "android:exported": "false",
      "android:foregroundServiceType": "location",
    },
  });

  return androidManifest;
}

module.exports = {
  applyCarAppManifest,
  CAR_PERMISSIONS,
  MIN_CAR_API_LEVEL,
  SERVICE_PACKAGE,
};
