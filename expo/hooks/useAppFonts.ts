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

import { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import { fontAssets } from "@/constants/theme";

/**
 * How long the app will wait for the type before starting without it.
 *
 * LAUNCH SAFETY — this is not a nicety. `app/_layout.tsx` holds the loading
 * screen until `ready`, so anything that leaves `useFonts` neither loaded nor
 * errored holds it forever: the driver taps the icon, gets the logo, and the
 * app never advances. That is reported as "it doesn't open" and is
 * indistinguishable from a crash from the outside — including from a store
 * reviewer's side.
 *
 * `expo-font` resolves either way in the normal case, but "normal" is doing a
 * lot of work in a release build: a face that fails to decode natively, an
 * asset missing from the bundle, or a rejected promise nothing observes all
 * end in the same silence. Eight files have to land before the app starts, so
 * there are eight chances at it. Three seconds is longer than a cold load of
 * ~2 MB of TTF off local storage and short enough that nobody reads it as
 * broken. Missing the brand faces costs one reflow into system type; never
 * starting costs the launch.
 */
export const FONT_TIMEOUT_MS = 3000;

export interface AppFontsState {
  /** True once every face is registered, or once loading has failed. */
  ready: boolean;
  /** Non-null if a face failed to load; the app falls back to system type. */
  error: Error | null;
  /** True when the app gave up waiting and started in system type. */
  timedOut: boolean;
}

export function useAppFonts(): AppFontsState {
  const [loaded, error] = useFonts(fontAssets);
  const [timedOut, setTimedOut] = useState(false);

  const settled = loaded || !!error;

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => {
      console.warn(
        `[fonts] Still loading after ${FONT_TIMEOUT_MS}ms — starting in system ` +
          "type rather than holding the launch."
      );
      setTimedOut(true);
    }, FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [settled]);

  if (error) {
    console.error("Failed to load Driveverse fonts:", error);
  }

  // A font failure should degrade to system type, never block the app.
  return { ready: settled || timedOut, error: error ?? null, timedOut };
}

export default useAppFonts;
