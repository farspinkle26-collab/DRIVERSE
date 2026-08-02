const { getDefaultConfig } = require("expo/metro-config");

/**
 * LAUNCH SAFETY — this config used to be wrapped in `withRorkMetro`, from
 * `@rork-ai/toolkit-sdk`. Both the wrapper and the dependency are gone now.
 * The history matters, because each removal fixed a different shipped crash.
 *
 * ── Why the TRANSFORMER half had to go (§8) ─────────────────────────────────
 *
 * `withRorkMetro` replaced `babelTransformerPath` with a wrapper that
 * pattern-matched `app/_layout.tsx` for `export default function <Name>`,
 * rewrote it with string concatenation, and appended a NEW default export:
 *
 *     import { RorkAnalyticsProvider } from '@rork-ai/toolkit-sdk';
 *     export default function RorkRootLayoutWrapper() {
 *       return <RorkAnalyticsProvider><RootLayout /></RorkAnalyticsProvider>;
 *     }
 *
 * That mounted a third-party provider ABOVE `AppErrorBoundary`, so §4's
 * "there is nothing above it left to fail" was false in every shipped build.
 * It also pulled in `posthog-react-native`, whose optional integrations
 * `require()` `expo-file-system`, `expo-application`, `expo-device`,
 * `expo-localization` and AsyncStorage at MODULE SCOPE — the exact window
 * §1/§2 exists to keep clear. And none of it was in this repository, which is
 * why three passes over the launch path found nothing.
 *
 * ── Why the DEPENDENCY had to go too (§12) ──────────────────────────────────
 *
 * Switching the transformer off left the package installed, and its
 * peerDependencies were the second half of the problem:
 *
 *     "expo-web-browser": "*",  "expo-blur": "*",  "expo-router": "*"
 *
 * `*` matches every version ever published. An installer that satisfies that
 * peer on its own terms — npm 7+ auto-installs peers — is free to fetch the
 * newest release and hoist it over the pinned one. That is how
 * `expo-web-browser@^56.0.5` came to sit in an SDK 54 app, and it survived
 * being corrected in `dependencies` (#167) AND pinned in
 * `overrides`/`resolutions` (#170): Android build 15, built after both landed,
 * still died on open with
 *
 *     NoClassDefFoundError: expo.modules.kotlin.types.AnyTypeCache
 *       at expo.modules.webbrowser.WebBrowserModule.definition
 *
 * — the 56.x native module, in a build whose `package.json` said 15.0.11.
 * When a resolver will not honour a pin, the only move left is to remove the
 * thing doing the pulling. With this package gone there is no path to
 * `expo-web-browser` except the app's own `dependencies` entry.
 *
 * ── WHAT THIS COSTS ─────────────────────────────────────────────────────────
 *
 * The resolver half of `withRorkMetro` supplied WEB polyfills — it mapped
 * `expo-haptics`, `expo-secure-store`, `react-native-maps`, `RefreshControl`
 * and `Alert` onto browser-safe shims and provided `assert`. Those aliases are
 * gone, so `bun run start-web` may fail to resolve them in a browser.
 *
 * Nothing that ships to a store is affected. The iOS and Android bundles never
 * used one of those shims, and no file in `app/`, `lib/`, `hooks/` or
 * `components/` imports `@rork-ai/toolkit-sdk` — verified before removal.
 * Driveverse is a native app; web is a development convenience.
 *
 * The `rork` CLI in `package.json`'s scripts (`bunx rork start …`) is a
 * SEPARATE package fetched by `bunx` at run time, and is unaffected.
 *
 * ── IF YOU EVER RESTORE IT ──────────────────────────────────────────────────
 *
 * Re-adding `@rork-ai/toolkit-sdk` re-adds the `*` peers. Pin
 * `expo-web-browser`, `expo-blur` and `expo-router` in `overrides` AND
 * `resolutions` first, run `bun run check:versions` after a CLEAN install,
 * and then check the built APK actually contains the pinned version — a green
 * check on a laptop said nothing about what the cloud builder resolved, which
 * is the whole lesson of §12. And keep the transformer off, or mount anything
 * it injects BELOW `AppErrorBoundary`.
 */
module.exports = getDefaultConfig(__dirname);
