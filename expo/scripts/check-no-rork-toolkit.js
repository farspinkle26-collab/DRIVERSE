#!/usr/bin/env node
/**
 * Fails the build if `@rork-ai/toolkit-sdk` — or its Metro wrapper — is back.
 *
 * WHY THIS EXISTS
 *
 * This package was removed twice for the same reason (§12, §18): it
 * peer-depends on `"expo-web-browser": "*"`, which is how the native module
 * version that kills the app on Android open got into this app in the first
 * place, and its Metro transformer injects a provider above
 * `AppErrorBoundary` (§8) — the launch-crash bug this whole file exists to
 * prevent, from code that is not even in this repository's source.
 *
 * The second removal (§18) was needed because a commit authored
 * `Rork <agent@rork.com>` pushed DIRECTLY to `main` — no branch, no PR, no
 * CI — while adding an unrelated feature, and brought back both the
 * dependency and the Metro wrapper in one shot. Nothing caught it:
 * `check:versions` does not know this package (it is not an Expo SDK
 * package, so it is absent from `bundledNativeModules.json`), and nothing
 * else parses `metro.config.js` at all.
 *
 * This is a narrow, explicit denylist rather than a general rule, because the
 * general rule ("no `"*"` peer dependency") would also flag packages that
 * never caused a problem. Two specific, previously-burned things are
 * checked:
 *
 *   1. `@rork-ai/toolkit-sdk` must not appear anywhere in `dependencies` or
 *      `devDependencies`.
 *   2. `metro.config.js` must not require it or call `withRorkMetro`.
 *
 * Run by `postinstall` (every install, everywhere) and by `bundle:verify`.
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const DENIED = "@rork-ai/toolkit-sdk";
const problems = [];

for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
  if (pkg[field] && DENIED in pkg[field]) {
    problems.push(
      `package.json "${field}" declares "${DENIED}": "${pkg[field][DENIED]}".\n` +
        "    This is the package whose \"*\" peer on expo-web-browser pulled in\n" +
        "    the native module version that crashes Android on open (§12), and\n" +
        "    whose Metro transformer mounts a provider above AppErrorBoundary\n" +
        "    (§8). It has been removed twice. Remove it again — do not just pin\n" +
        "    its version."
    );
  }
}

const metroConfigPath = path.join(root, "metro.config.js");
if (fs.existsSync(metroConfigPath)) {
  const metroConfig = fs.readFileSync(metroConfigPath, "utf8");

  /**
   * This file's own header documents the danger by name — "this file used to
   * require @rork-ai/toolkit-sdk, never do that again" — so a plain substring
   * search flags its own warning comment. Strip `/* ... *\/` block comments
   * and `//` line comments before searching, and look for the actual CALL
   * forms (`require(...)`, `withRorkMetro(`), not any mention of the name.
   */
  const code = metroConfig
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const requiresPackage = new RegExp(
    `require\\(\\s*['"]${DENIED.replace(/[/]/g, "\\/")}(?:/[^'"]*)?['"]\\s*\\)`
  ).test(code);
  const callsWrapper = /\bwithRorkMetro\s*\(/.test(code);

  if (requiresPackage || callsWrapper) {
    problems.push(
      "metro.config.js " +
        (requiresPackage ? `requires "${DENIED}"` : "calls withRorkMetro(...)") +
        ".\n" +
        "    Its Babel transformer rewrites app/_layout.tsx at build time to inject\n" +
        "    a provider ABOVE AppErrorBoundary — see LAUNCH_SAFETY_REFERENCE.md §8\n" +
        "    and §18. metro.config.js must be\n" +
        "    `module.exports = getDefaultConfig(__dirname);` and nothing else\n" +
        "    reachable from it."
    );
  }
}

if (problems.length === 0) {
  console.log(`[check-no-rork-toolkit] OK — "${DENIED}" is absent from dependencies and metro.config.js.`);
  process.exit(0);
}

console.error(`\n[check-no-rork-toolkit] ${problems.length} problem(s):\n`);
for (const p of problems) console.error(`  ${p}\n`);
console.error("See LAUNCH_SAFETY_REFERENCE.md §8, §12, §18.\n");
process.exit(1);
