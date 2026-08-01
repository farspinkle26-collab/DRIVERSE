/**
 * BUILD SAFETY — `babel-preset-expo` must stay on the app's SDK major.
 *
 * This preset decides which modern JavaScript syntax is *lowered* and which is
 * left for Hermes to parse, and it makes that decision from its own version,
 * not from the installed React Native. Its 57.x line (Expo SDK 56+) targets
 * "Hermes v1" and leaves `#private` class fields in the bundle; this app is on
 * SDK 54 / React Native 0.81, whose Hermes rejects them — `hermesc` fails the
 * archive with "private properties are not supported" and no app is produced.
 * (`expo@54` asks for `~54.0.11`; `package.json` pins the SDK 54 line.)
 *
 * A preset upgrade is therefore a Hermes-compatibility change, not a chore.
 * After changing it — or React Native, or anything Metro loads — run
 * `bun run bundle:verify`, which bundles *and* compiles the bundle with the
 * hermesc React Native ships. CI runs the same two steps. Details in
 * LAUNCH_SAFETY_REFERENCE.md §9.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
  };
};
