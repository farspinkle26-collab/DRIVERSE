#!/usr/bin/env node
/**
 * Compile a release JS bundle to Hermes bytecode — the step Xcode runs after
 * Metro, and the one that CI was missing.
 *
 * `bun run bundle:ios` only proves that Metro can *bundle* the app. The store
 * build then hands that bundle to `hermesc`, which parses it a second time
 * with a much older parser than Metro's, and can reject syntax that Babel left
 * in because it believed Hermes could handle it. That is a build failure no
 * test and no typecheck can see: the app never gets built, so there is nothing
 * to run. See LAUNCH_SAFETY_REFERENCE.md §9.
 *
 * The compiler here is the one React Native ships for the host platform, so it
 * is the same version the `hermes-engine` pod uses for the pinned React Native
 * — upgrade React Native and this check upgrades with it. The flags are copied
 * from the Xcode build phase verbatim so a failure here is the failure there.
 *
 *   node scripts/hermes-compile.js [bundle] [--out <file>] [--warnings]
 *
 * Defaults to the path `bundle:ios` writes. Exits non-zero, with hermesc's own
 * diagnostics, if the bundle does not compile.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HERMESC_DIR_BY_PLATFORM = {
  darwin: "osx-bin",
  linux: "linux64-bin",
  win32: "win64-bin",
};

function parseArgs(argv) {
  const args = { bundle: null, out: null, warnings: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--warnings") args.warnings = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (!args.bundle) args.bundle = arg;
  }
  args.bundle ??= path.join(os.tmpdir(), "driverse-ios.bundle.js");
  args.out ??= path.join(os.tmpdir(), "driverse-ios.hbc");
  return args;
}

function findHermesc() {
  const dir = HERMESC_DIR_BY_PLATFORM[process.platform];
  if (!dir) {
    throw new Error(
      `No hermesc binary is shipped for platform "${process.platform}".`
    );
  }
  const reactNative = path.dirname(require.resolve("react-native/package.json"));
  const binary = path.join(
    reactNative,
    "sdks",
    "hermesc",
    dir,
    process.platform === "win32" ? "hermesc.exe" : "hermesc"
  );
  if (!fs.existsSync(binary)) {
    throw new Error(`hermesc not found at ${binary}. Run the install first.`);
  }
  return binary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.bundle)) {
    console.error(
      `Bundle not found: ${args.bundle}\nRun \`bun run bundle:ios\` first.`
    );
    process.exit(1);
  }

  const hermesc = findHermesc();
  // Verbatim from the Xcode "Bundle React Native code and images" phase.
  const result = spawnSync(
    hermesc,
    [
      "-emit-binary",
      "-max-diagnostic-width=80",
      "-O",
      "-out",
      args.out,
      args.bundle,
    ],
    { encoding: "utf8" }
  );

  if (result.error) {
    console.error(`Could not run hermesc: ${result.error.message}`);
    process.exit(1);
  }

  const diagnostics = result.stderr ?? "";
  const errors = diagnostics
    .split("\n")
    .filter((line) => line.includes("error:"));

  if (result.status !== 0) {
    process.stderr.write(diagnostics);
    console.error(
      `\nhermesc rejected the bundle (${errors.length} error${
        errors.length === 1 ? "" : "s"
      } shown above).\n` +
        "The app will not build for the App Store in this state. This is\n" +
        "almost always syntax Babel left for Hermes to handle that this\n" +
        "Hermes does not support — see LAUNCH_SAFETY_REFERENCE.md §9."
    );
    process.exit(result.status || 1);
  }

  const warnings = diagnostics
    .split("\n")
    .filter((line) => line.includes("warning:")).length;
  if (args.warnings && diagnostics) process.stderr.write(diagnostics);

  const bytes = fs.statSync(args.out).size;
  console.log(
    `hermesc OK — ${(bytes / 1024 / 1024).toFixed(2)} MB of bytecode from ` +
      `${(fs.statSync(args.bundle).size / 1024 / 1024).toFixed(2)} MB of JS ` +
      `(${warnings} warning${warnings === 1 ? "" : "s"}${
        warnings && !args.warnings ? ", re-run with --warnings to see them" : ""
      }).`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
