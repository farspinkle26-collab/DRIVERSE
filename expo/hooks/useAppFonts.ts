/**
 * Loads the three Driveverse type families.
 *
 * The faces are bundled under `assets/fonts` rather than pulled from
 * Google's CDN at runtime: the app must render correctly offline and
 * inside a store build, and a network round-trip on cold start would show
 * a frame of fallback system type before the real faces swap in.
 *
 * LICENSING — all three families are SIL Open Font License 1.1, which
 * permits bundling and redistribution inside a compiled application,
 * including paid App Store / Play Store distribution. There is no
 * attribution requirement in the running UI; the only obligation is that
 * the licence travels with the font files, so the OFL text for each family
 * is checked in alongside them (`assets/fonts/OFL-*.txt`). The one
 * restriction worth knowing: the fonts must not be sold on their own, and
 * a modified font may not keep its Reserved Font Name. We do neither.
 *
 *   Rajdhani       © Indian Type Foundry — OFL 1.1
 *   Inter          © The Inter Project Authors — OFL 1.1
 *   JetBrains Mono © The JetBrains Mono Project Authors — OFL 1.1
 */

import { useFonts } from "expo-font";
import { fontAssets } from "@/constants/theme";

export interface AppFontsState {
  /** True once every face is registered, or once loading has failed. */
  ready: boolean;
  /** Non-null if a face failed to load; the app falls back to system type. */
  error: Error | null;
}

export function useAppFonts(): AppFontsState {
  const [loaded, error] = useFonts(fontAssets);

  if (error) {
    console.error("Failed to load Driveverse fonts:", error);
  }

  // A font failure should degrade to system type, never block the app.
  return { ready: loaded || !!error, error: error ?? null };
}

export default useAppFonts;
