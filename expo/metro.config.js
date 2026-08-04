const { getDefaultConfig } = require("expo/metro-config");

/**
 * LAUNCH SAFETY — this file was reverted to `withRorkMetro` by an unreviewed
 * push (§18) and is fixed here for the second time. Read this before touching
 * it again.
 *
 * ── Why the TRANSFORMER half had to go (§8) ─────────────────────────────────
 *
 * `withRorkMetro`, from `@rork-ai/toolkit-sdk`, replaces `babelTransformerPath`
 * with a wrapper that pattern-matches `app/_layout.tsx` for
 * `export default function <Name>`, rewrites it with string concatenation, and
 * appends a NEW default export:
 *
 *     import { RorkAnalyticsProvider } from '@rork-ai/toolkit-sdk';
 *     export default function RorkRootLayoutWrapper() {
 *       return <RorkAnalyticsProvider><RootLayout /></RorkAnalyticsProvider>;
 *     }
 *
 * That mounts a third-party provider ABOVE `AppErrorBoundary`, so §4's "there
 * is nothing above it left to fail" is false in every build this runs on. It
 * also pulls in `posthog-react-native`, whose optional integrations
 * `require()` `expo-file-system`, `expo-application`, `expo-device`,
 * `expo-localization` and AsyncStorage at MODULE SCOPE — the exact window
 * §1/§2 exists to keep clear. None of it is in this repository's source, which
 * is why reading `app/_layout.tsx` finds nothing wrong: the file is rewritten
 * after this config runs, not before.
 *
 * ── Why the DEPENDENCY had to go too (§12) ──────────────────────────────────
 *
 * `@rork-ai/toolkit-sdk` peer-depends on `"expo-web-browser": "*"` (also
 * `expo-blur` and `expo-router`), which is how the wrong native module version
 * entered this app in the first place — see the removal comment in
 * `package.json`.
 *
 * ── §18: it came back, both halves, from ONE unreviewed commit ─────────────
 *
 * On 3 August 2026, a commit authored `Rork <agent@rork.com>` pushed directly
 * to `main` — no branch, no PR, no CI — while adding an unrelated feature, and
 * it overwrote this ENTIRE file back to the two-line `withRorkMetro` form, with
 * no babel-transformer override at all. `package.json` gained
 * `"@rork-ai/toolkit-sdk": "latest"` in the same commit. Both are removed
 * again here.
 *
 * The regression was invisible to every check that existed: `check:versions`
 * does not know this package (it is not an Expo SDK package, so it is not in
 * `bundledNativeModules.json`), and nothing parsed `metro.config.js` at all.
 * `postinstall` now fails on `@rork-ai/toolkit-sdk` and on `withRorkMetro`
 * appearing in this file specifically — see
 * `scripts/check-no-rork-toolkit.js`.
 *
 * ── WHAT THIS COSTS ─────────────────────────────────────────────────────────
 *
 * `withRorkMetro`'s resolver half supplied WEB polyfills — `expo-haptics`,
 * `expo-secure-store`, `react-native-maps`, `RefreshControl`, `Alert`,
 * `assert`. `bun run start-web` may not resolve them in a browser. Nothing that
 * ships to a store is affected: no file in `app/`, `lib/`, `hooks/` or
 * `components/` imports `@rork-ai/toolkit-sdk`, and the native bundles never
 * used one of those shims. The `rork` CLI in `package.json`'s `scripts`
 * (`bunx rork start …`) is a separate package fetched by `bunx` and is
 * unaffected.
 *
 * ── IF YOU EVER RESTORE IT ──────────────────────────────────────────────────
 *
 * Re-adding `@rork-ai/toolkit-sdk` re-adds the `"*"` peers: pin
 * `expo-web-browser`, `expo-blur` and `expo-router` in `overrides` AND
 * `resolutions` first, run `bun run check:versions` after a CLEAN install,
 * and confirm a BUILT APK actually contains the pinned version — a green
 * check on a laptop said nothing about what a cloud builder resolved, twice.
 * Keep the transformer off, or mount anything it injects BELOW
 * `AppErrorBoundary` inside `app/_layout.tsx` itself, in this repository's
 * source, reviewed through a PR like everything else that touches the launch
 * path.
 */
module.exports = getDefaultConfig(__dirname);
