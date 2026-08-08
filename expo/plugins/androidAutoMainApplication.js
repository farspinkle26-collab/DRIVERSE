/**
 * Registers `DriverseCarPackage` in the generated `MainApplication.kt`.
 *
 * This is the step that makes `NativeModules.DriverseTripRecorder` exist on the
 * JS side. Its failure mode is the quietest in the whole feature, which is why
 * it is a tested transform rather than a `replace` inside the plugin:
 * `lib/tripRecorder.ts` treats a missing module as "no native recorder on this
 * build, keep using the JS one" — deliberately, because that is the correct
 * behaviour on iOS. So a registration that silently fails to apply produces an
 * app that builds, launches, records drives, and never once mentions that the
 * car half is inert.
 *
 * Hence: this throws when it cannot find its anchor. A prebuild that fails
 * loudly is worth a great deal more than an APK that is quietly missing the
 * feature it was built for.
 */

/** Marks a file this has already been applied to. */
const MARKER = "DriverseCarPackage";

/** The package the Kotlin sources live in. */
const IMPORT = "import app.rork.driverse.carapp.DriverseCarPackage";

/**
 * Adds the package to `MainApplication.kt`'s package list.
 *
 * The generated file has this shape (Expo SDK 54, Kotlin):
 *
 *     override fun getPackages(): List<ReactPackage> {
 *       return PackageList(this).packages.apply {
 *         // Packages that cannot be autolinked yet can be added manually here…
 *       }
 *     }
 *
 * `PackageList(this).packages` is a MutableList, and `.apply { }` is where
 * Expo's own template invites manual additions — so `add(...)` inside that
 * block is the supported seam rather than a clever place we found.
 *
 * @param {string} contents the generated `MainApplication.kt`
 * @returns {string}
 */
function applyCarPackage(contents) {
  if (contents.includes(MARKER)) return contents;

  const applyAnchor = /(PackageList\(this\)\.packages\.apply\s*\{)/;
  if (!applyAnchor.test(contents)) {
    throw new Error(
      "[withAndroidAuto] Could not find `PackageList(this).packages.apply {` in " +
        "MainApplication.kt. The Expo template changed; update this plugin rather " +
        "than editing the generated file — a silent miss here produces a build " +
        "with no native recorder and no error."
    );
  }

  let next = contents.replace(
    applyAnchor,
    `$1
              // Android Auto: registers the trip recorder bridge. See
              // plugins/androidAutoMainApplication.js.
              add(DriverseCarPackage())`
  );

  // The import goes after the package declaration rather than at the top of
  // the file: a Kotlin file's `package` line must come first, and prepending
  // an import produces a file that does not parse — which CI would catch, but
  // only after a prebuild nobody wanted to run twice.
  const packageLine = /^(package\s+[\w.]+\s*\n)/m;
  if (!packageLine.test(next)) {
    throw new Error(
      "[withAndroidAuto] MainApplication.kt has no package declaration to import after."
    );
  }
  next = next.replace(packageLine, `$1\n${IMPORT}\n`);

  return next;
}

module.exports = { applyCarPackage, MARKER, IMPORT };
