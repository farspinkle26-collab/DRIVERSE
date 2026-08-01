const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = withRorkMetro(getDefaultConfig(__dirname));

/**
 * LAUNCH SAFETY — put Expo's own Babel transformer back.
 *
 * `withRorkMetro` does two unrelated things. Its resolver half is wanted and
 * is kept: it maps `expo-haptics`, `expo-secure-store`, `react-native-maps`,
 * `RefreshControl` and `Alert` onto web polyfills, and supplies `assert`. Its
 * transformer half is not, and this line is what switches that half off.
 *
 * The transformer half replaces `babelTransformerPath` with a wrapper that
 * pattern-matches `app/_layout.tsx` for `export default function <Name>`,
 * rewrites it with string concatenation, and appends a NEW default export:
 *
 *     import { RorkAnalyticsProvider } from '@rork-ai/toolkit-sdk';
 *     export default function RorkRootLayoutWrapper() {
 *       return <RorkAnalyticsProvider><RootLayout /></RorkAnalyticsProvider>;
 *     }
 *
 * Three consequences, all of which land on the launch path:
 *
 * 1. It mounts a third-party provider ABOVE `AppErrorBoundary`.
 *    `LAUNCH_SAFETY_REFERENCE.md` §4 says the boundary wraps the root
 *    component so that "there is nothing above it left to fail". With this
 *    injection that sentence was false in every shipped build — there was
 *    something above it, and nothing could catch what it threw.
 *
 * 2. `RorkAnalyticsProvider` pulls in `posthog-react-native`, whose optional
 *    integrations `require()` `expo-file-system`, `expo-application`,
 *    `expo-device`, `expo-localization` and AsyncStorage at MODULE SCOPE.
 *    That is the bundle-evaluation window §1/§2 exists to keep clear, and it
 *    ran on every launch, for every driver.
 *
 * 3. None of it is in this repository. `@rork-ai/toolkit-sdk` was a `latest`
 *    dependency, so the code executing during launch could change between two
 *    builds of the same commit. That is why the launch path was read three
 *    times without finding anything: the code was never in the source tree.
 *    (The version is pinned in `package.json` now, for the same reason.)
 *
 * COST OF THIS LINE: Rork's PostHog analytics and its development preview
 * wrapper are no longer injected. Nothing in the app imports either, and no
 * feature depends on them. To restore them, delete this assignment — and if
 * you do, import `RorkAnalyticsProvider` inside `app/_layout.tsx` BELOW
 * `AppErrorBoundary` instead, so the boundary still guards it.
 */
config.transformer.babelTransformerPath = require.resolve(
  "@expo/metro-config/babel-transformer"
);

module.exports = config;
