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
 * What this check CANNOT vouch for, said out loud.
 *
 * `bundledNativeModules.json` only lists packages the Expo SDK has an opinion
 * about. Everything else is skipped by the `if (!expected) continue` above —
 * silently, while the success line still reads "every SDK-versioned package
 * agrees", which is true and much narrower than it sounds. A native package
 * outside the manifest gets its version from a range in `package.json` and
 * nothing else, and §5b (`@rork-ai/toolkit-sdk` pinned to `latest`) and §9 (two
 * lockfiles resolving one caret differently) are both cases of a range on the
 * launch path deciding what shipped, with no diff to review.
 *
 * So this is not a failure — there is no authority to compare against, and
 * inventing one would be guesswork. It is a coverage statement: these are the
 * packages whose native halves nothing in CI is checking, so a crash that
 * smells like §10 should start here.
 *
 * "Native" is read off the package itself: a podspec, an Android Gradle
 * project, or an expo-module config means autolinking builds something for it,
 * which is what makes a version mismatch fatal rather than cosmetic.
 */
const isNativePackage = (name) => {
  const dir = path.join(root, "node_modules", name);
  try {
    if (fs.existsSync(path.join(dir, "expo-module.config.json"))) return true;
    if (fs.existsSync(path.join(dir, "android", "build.gradle"))) return true;
    return fs.readdirSync(dir).some((f) => f.endsWith(".podspec"));
  } catch {
    return false;
  }
};

const uncovered = Object.entries(declared)
  // `expo` is the reference every other package is compared against, not a
  // package awaiting comparison.
  .filter(([name]) => name !== "expo" && !bundled[name] && isNativePackage(name))
  .map(([name, range]) => ({ name, range, installed: installedVersion(name) }))
  .sort((a, b) => a.name.localeCompare(b.name));

function reportUncovered() {
  if (uncovered.length === 0) return;
  console.log(
    `[check-sdk-versions] note — ${uncovered.length} native package(s) are not in the SDK ` +
      "manifest, so this check cannot vouch for them:"
  );
  for (const u of uncovered) {
    // A caret on a native package lets `bun install` move the JS half without
    // a diff; the lockfile is what actually holds it still.
    const drift = u.range.startsWith("^") ? "  (caret — pinned only by bun.lock)" : "";
    console.log(`    ${u.name}  declares ${u.range}, installed ${u.installed}${drift}`);
  }
}

if (problems.length === 0) {
  console.log(
    `[check-sdk-versions] OK — every SDK-versioned package agrees with expo@${expoVersion}.`
  );
  reportUncovered();
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
    "module this app does not build. If it looks that module up at import time —\n" +
    "with `requireNativeModule` or `TurboModuleRegistry.getEnforcing`, both of\n" +
    "which throw — the app dies during bundle evaluation: a black screen on open,\n" +
    "on both platforms, with no stack trace to read.\n\n" +
    "Fix by matching the version the SDK ships, then re-run `bun install`.\n" +
    "See LAUNCH_SAFETY_REFERENCE.md §10.\n"
);
reportUncovered();
process.exit(1);
