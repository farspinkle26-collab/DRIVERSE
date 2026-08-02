#!/usr/bin/env node
/**
 * Fails the build when a package's major version does not match the Expo SDK.
 *
 * WHY THIS EXISTS
 *
 * `expo-web-browser` sat at `^56.0.5` in this SDK 54 app for months and killed
 * the app on open, on both platforms, three release cycles running. The JS half
 * was 41 majors ahead of the native half autolinking actually built, so
 * `requireNativeModule('ExpoWebBrowser')` — a module-scope lookup that THROWS
 * rather than returning null — brought the process down during bundle
 * evaluation, before the first frame and above every error boundary. Nothing
 * caught it: it is not a type error, not a lint error, and the bundle builds
 * and compiles cleanly, because the failure is a native lookup at runtime.
 *
 * It is the same shape as the archive failure in LAUNCH_SAFETY_REFERENCE.md §9,
 * where a `^57.0.5` caret on `babel-preset-expo` hoisted over the `~54.0.11`
 * this SDK needs and shipped `#private` fields into a bundle whose Hermes
 * cannot parse them. Both were one wrong caret in `package.json`; both cost a
 * store rejection; neither was visible to any check that existed.
 *
 * This is that check. `node_modules/expo/bundledNativeModules.json` is the
 * SDK's own statement of which version of each Expo package belongs with it, so
 * the rule is simply: agree with it on the major.
 *
 * Run by `bun run check:versions`, by `bundle:verify`, and in CI on every push.
 * Run it before and after any Expo/RN/Babel version bump.
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const manifestPath = path.join(root, "node_modules/expo/bundledNativeModules.json");
if (!fs.existsSync(manifestPath)) {
  console.error(
    "[check-sdk-versions] node_modules/expo/bundledNativeModules.json not found.\n" +
      "Run `bun install` first — this check compares against the SDK's own manifest."
  );
  process.exit(1);
}
const bundled = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

/** Leading major number of a version or range (`~15.0.11` -> `15`). */
const major = (v) => String(v).replace(/^[\^~>=<\s]*/, "").split(".")[0];

const installedVersion = (name) => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")
    ).version;
  } catch {
    return null;
  }
};

const declared = { ...pkg.dependencies, ...pkg.devDependencies };
const problems = [];

for (const [name, range] of Object.entries(declared)) {
  const expected = bundled[name];
  if (!expected) continue; // Not an SDK-versioned package; nothing to compare against.

  const installed = installedVersion(name);
  if (!installed) {
    problems.push({ name, range, expected, installed: "(not installed)" });
    continue;
  }
  if (major(installed) !== major(expected) || major(range) !== major(expected)) {
    problems.push({ name, range, expected, installed });
  }
}

/**
 * `babel-preset-expo` is not in `bundledNativeModules.json` — it is a build-time
 * preset, not a native module — but it is the one package §9 proves must track
 * the SDK major, so it is checked explicitly against the installed `expo`.
 */
const expoVersion = installedVersion("expo");
const presetVersion = installedVersion("babel-preset-expo");
if (expoVersion && presetVersion && major(presetVersion) !== major(expoVersion)) {
  problems.push({
    name: "babel-preset-expo",
    range: declared["babel-preset-expo"] ?? "(undeclared)",
    expected: `~${major(expoVersion)}.x  (matching expo@${expoVersion})`,
    installed: presetVersion,
  });
}

/**
 * The pin has to be policed too, or it silently stops pinning.
 *
 * `package.json` carries `overrides` (npm/pnpm) and `resolutions` (yarn/bun)
 * because declaring `~15.0.11` in `dependencies` did NOT stop a build from
 * shipping `expo-web-browser` 56 — `@rork-ai/toolkit-sdk` peer-depends on
 * `expo-web-browser: "*"`, and an installer that satisfies that peer itself can
 * hoist any version it likes over ours.
 *
 * Three ways that guard rots, all checked here: an override that drifts off the
 * SDK, an override that no longer matches its own `dependencies` entry, and the
 * two spellings disagreeing with each other — which would pin one package
 * manager and quietly free the other.
 */
const overrides = pkg.overrides ?? {};
const resolutions = pkg.resolutions ?? {};

for (const [name, pinned] of Object.entries(overrides)) {
  // An override must be an exact version. A range here re-opens the hole it
  // was added to close.
  if (/^[\^~><=]/.test(String(pinned))) {
    problems.push({
      name: `${name} (overrides)`,
      range: pinned,
      expected: "an exact version, no ^ or ~ — a range lets the resolver move again",
      installed: installedVersion(name) ?? "(not installed)",
    });
    continue;
  }

  const expected = bundled[name];
  if (expected && major(pinned) !== major(expected)) {
    problems.push({
      name: `${name} (overrides)`,
      range: pinned,
      expected,
      installed: installedVersion(name) ?? "(not installed)",
    });
  }

  const dep = declared[name];
  if (dep && major(dep) !== major(pinned)) {
    problems.push({
      name: `${name} (overrides vs dependencies)`,
      range: `overrides: ${pinned}`,
      expected: `dependencies: ${dep} — these must name the same version`,
      installed: installedVersion(name) ?? "(not installed)",
    });
  }

  if (resolutions[name] !== pinned) {
    problems.push({
      name: `${name} (overrides vs resolutions)`,
      range: `overrides: ${pinned}`,
      expected: `resolutions: ${resolutions[name] ?? "(missing)"} — both spellings must agree, or only one package manager is pinned`,
      installed: installedVersion(name) ?? "(not installed)",
    });
  }
}

for (const name of Object.keys(resolutions)) {
  if (!(name in overrides)) {
    problems.push({
      name: `${name} (resolutions)`,
      range: resolutions[name],
      expected: "a matching `overrides` entry — npm and pnpm ignore `resolutions`",
      installed: installedVersion(name) ?? "(not installed)",
    });
  }
}

if (problems.length === 0) {
  console.log(
    `[check-sdk-versions] OK — every SDK-versioned package agrees with expo@${expoVersion}` +
      `, and ${Object.keys(overrides).length} pinned override(s) agree with both.`
  );
  process.exit(0);
}

console.error(
  `\n[check-sdk-versions] ${problems.length} package(s) do not match Expo SDK ${major(
    expoVersion
  )}:\n`
);
for (const p of problems) {
  console.error(`  ${p.name}`);
  console.error(`      package.json declares : ${p.range}`);
  console.error(`      this SDK ships        : ${p.expected}`);
  console.error(`      actually installed    : ${p.installed}\n`);
}
console.error(
  "A package whose major is ahead of the SDK ships JS written against a native\n" +
    "module this app does not build. If it looks that module up at import time\n" +
    "with `requireNativeModule`, the app dies during bundle evaluation — a black\n" +
    "screen on open, on both platforms, with no stack trace to read.\n\n" +
    "Fix by matching the version the SDK ships, then re-run `bun install`.\n" +
    "See LAUNCH_SAFETY_REFERENCE.md §10.\n"
);
process.exit(1);
