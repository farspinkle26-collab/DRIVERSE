/**
 * Driverse — the brand lockup, as vector.
 *
 * WHY THIS IS NOT AN <Image>
 *   `assets/images/driverse-logo.png` is a 1024×1536 *splash* asset: the
 *   lockup sits on a blurred photograph, inside a glow, in portrait. It is
 *   right for the launch screen and wrong everywhere else — the share card
 *   drew it into a 16×16 box, where the mark is a few pixels of red on a
 *   grey smudge and the glow reads as dirt. Next to it the card typed the
 *   wordmark by hand, and typed it wrong ("DRIVEVERSE").
 *
 *   So the mark is drawn here instead: react-native-svg, no background, no
 *   glow, exact at any size. That matters most on the share card, which
 *   `react-native-view-shot` captures at 3× (360pt → 1080px) — a raster
 *   brand mark is the one element that would visibly soften at that scale.
 *
 * THE WORDMARK
 *   The brand wordmark is set in outlined letterforms. Hollow type does not
 *   survive being 13pt tall, so at the sizes this component is used the
 *   wordmark is drawn solid, in Rajdhani (the app's display face, the
 *   closest thing in the bundle to the logo's squared technical letters).
 *   Spelling is DRIVERSE — one "VE", matching the logo and the product name.
 *
 * The geometry is a redraw, not a traced export. If a vector of the logo
 * lands in the repo, swap {@link DriverseMark}'s paths for it; nothing else
 * needs to change, because everything imports this component rather than
 * the asset.
 *
 * LAUNCH SAFETY: pure SVG and StyleSheet, no native module call at module
 * scope. Safe to import from anything reachable from `app/_layout.tsx`
 * (see LAUNCH_SAFETY_REFERENCE.md).
 */

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, fontFamily } from "@/constants/theme";

/**
 * Design box of the mark, sized to the geometry below with no margin: the
 * tail starts at x=0 and the bowl ends at 80+36. A viewBox wider than the
 * shape would show up as a phantom gap between mark and wordmark.
 */
const MARK_VIEWBOX_WIDTH = 116;
const MARK_VIEWBOX_HEIGHT = 72;
export const MARK_ASPECT = MARK_VIEWBOX_WIDTH / MARK_VIEWBOX_HEIGHT;

/**
 * The D-and-speed-lines mark, as one path.
 *
 * Subpath 1 is the silhouette: a bowl (semicircle of r=36 about 80,36) with
 * a sheared tail running off to the left. Subpaths 2 and 3 are the two speed
 * cuts, and they are *holes* — `fillRule="evenodd"` punches them out of the
 * silhouette, which is what keeps the mark a single shape with no background
 * colour baked into it. Drawing the cuts as background-coloured rectangles
 * instead would look identical on the share card and wrong the first time
 * the logo sits on anything but voidBlack.
 */
const MARK_PATH =
  "M26 0 H80 A36 36 0 0 1 80 72 H0 Z " +
  "M-2 25 L56 19 L56 26 L-2 32 Z " +
  "M-2 47 L56 41 L56 48 L-2 54 Z";

export interface DriverseMarkProps {
  /** Rendered height in points. Width follows {@link MARK_ASPECT}. */
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** The mark on its own — for square slots too small for the wordmark. */
export function DriverseMark({
  size = 24,
  color = colors.racingRed,
  style,
}: DriverseMarkProps) {
  return (
    <Svg
      width={size * MARK_ASPECT}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX_WIDTH} ${MARK_VIEWBOX_HEIGHT}`}
      style={style}
      pointerEvents="none"
    >
      <Path d={MARK_PATH} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

export interface DriverseLogoProps {
  /** Height of the mark in points; the wordmark is scaled from it. */
  size?: number;
  /** Colour of the mark. The wordmark takes {@link wordmarkColor}. */
  markColor?: string;
  wordmarkColor?: string;
  /** Drop the wordmark and render the mark alone. */
  markOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mark + wordmark, laid out horizontally the way the logo is locked up.
 *
 * The wordmark's size and tracking are derived from `size` so the lockup
 * keeps its proportions wherever it is used, rather than needing a new
 * hand-tuned pair of numbers per call site.
 */
export function DriverseLogo({
  size = 18,
  markColor = colors.racingRed,
  wordmarkColor = colors.textSecondary,
  markOnly = false,
  style,
}: DriverseLogoProps) {
  const fontSize = Math.round(size * 0.82);
  return (
    <View style={[styles.lockup, { gap: Math.round(size * 0.42) }, style]}>
      <DriverseMark size={size} color={markColor} />
      {markOnly ? null : (
        <Text
          style={[
            styles.wordmark,
            {
              color: wordmarkColor,
              fontSize,
              // Rajdhani is condensed; the logo's lettering is not. Tracking
              // is what closes that gap, and it has to scale with the type
              // or the lockup looks loose when small and tight when large.
              letterSpacing: fontSize * 0.22,
            },
          ]}
        >
          DRIVERSE
        </Text>
      )}
    </View>
  );
}

export default DriverseLogo;

const styles = StyleSheet.create({
  lockup: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    fontFamily: fontFamily.displayBold,
    // Rajdhani sits high in its box; without this the wordmark reads as
    // floating above the mark's optical centre.
    includeFontPadding: false,
  },
});
