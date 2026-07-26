/**
 * Driveverse — the Platinum badge.
 *
 * WHAT IT IS NOT
 *   Not a rank badge in a different colour. `RankBadge` renders gamification
 *   tiers — rounded shields, per-tier hue, an emblem you earn by driving. If
 *   Platinum reused that language it would read as "Rookie Driver, but
 *   silver", which is exactly the wrong message: this is a subscription
 *   status, orthogonal to progression, and a driver at any rank can hold it.
 *
 * SO IT IS BUILT FROM DIFFERENT PARTS
 *   • Angular plate with TWO opposed corner cuts, where every other brand
 *     surface in the app takes one. Same 45° language, deliberately doubled
 *     so the silhouette is recognisable at 12px in a chat row.
 *   • Chrome, never racingRed. Red is the primary-action accent; a status
 *     mark that borrows it competes with every button on the screen.
 *   • A speed chevron rather than an emblem, echoing the logo's diagonal.
 *   • A specular highlight along the lit edge — the one thing that makes a
 *     flat grey read as metal rather than as a disabled state.
 *
 * SIZES
 *   `inline` (default) rides next to a username anywhere one renders —
 *   profile, chat, convoy rosters, leaderboards. `hero` is the paywall's
 *   header art, with the highlight and facets at full strength.
 */

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Line, Polygon, Polyline } from "react-native-svg";
import { onPlatinum, platinum } from "@/constants/platinum";
import { alpha, colors, fontFamily, spacing } from "@/constants/theme";

export type PlatinumBadgeVariant = "inline" | "hero";

export interface PlatinumBadgeProps {
  /** Height of the plate in points. Width follows the 1:1 plate ratio. */
  size?: number;
  variant?: PlatinumBadgeVariant;
  /**
   * Renders the plate filled in chrome with a dark chevron, instead of a
   * dark plate with a chrome chevron. For placement on a dark card where the
   * outline version disappears.
   */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Screen-reader label. Defaults to "Platinum member"; pass a driver's name
   * where the badge is describing someone else ("Rio, Platinum member").
   */
  accessibilityLabel?: string;
}

/** Cut depth as a fraction of the plate. Keeps the silhouette at any size. */
const CUT_RATIO = 0.28;

/**
 * Plate outline: a square with the top-right and bottom-left corners sliced.
 * `inset` pulls it in by half the stroke so the outline isn't clipped.
 */
function platePoints(size: number, inset: number): string {
  const a = inset;
  const b = size - inset;
  const c = (size - inset * 2) * CUT_RATIO;
  return [
    [a, a],
    [b - c, a],
    [b, a + c],
    [b, b],
    [a + c, b],
    [a, b - c],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

/**
 * The speed chevron. Two strokes of the logo's diagonal, stacked — the same
 * mark at every size, so the badge is one shape rather than a shrinking
 * illustration.
 */
function chevronPoints(size: number, offsetX: number): string {
  const w = size;
  const x0 = w * 0.34 + offsetX;
  const x1 = w * 0.52 + offsetX;
  return `${x0},${(w * 0.3).toFixed(2)} ${x1},${(w * 0.5).toFixed(2)} ${x0},${(w * 0.7).toFixed(2)}`;
}

export function PlatinumBadge({
  size,
  variant = "inline",
  solid = false,
  style,
  accessibilityLabel = "Platinum member",
}: PlatinumBadgeProps) {
  const dimension = size ?? (variant === "hero" ? 96 : spacing.spacingLg);
  const isHero = variant === "hero";
  const strokeWidth = Math.max(1, dimension * (isHero ? 0.035 : 0.09));
  const inset = strokeWidth / 2;

  const plateFill = solid ? platinum.chrome : colors.voidBlack;
  const markColor = solid ? onPlatinum : platinum.chrome;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[{ width: dimension, height: dimension }, style]}
    >
      <Svg width={dimension} height={dimension}>
        <Polygon
          points={platePoints(dimension, inset)}
          fill={plateFill}
          stroke={platinum.chrome}
          strokeWidth={strokeWidth}
        />

        {/* Specular highlight along the lit (top-left) edge. This is the
            whole trick that makes flat grey read as brushed metal. */}
        <Line
          x1={inset + dimension * 0.06}
          y1={inset + dimension * 0.1}
          x2={inset + dimension * 0.06}
          y2={dimension - inset - dimension * 0.2}
          stroke={solid ? alpha(onPlatinum, 0.25) : platinum.chromeLight}
          strokeWidth={strokeWidth * (isHero ? 0.9 : 0.7)}
          opacity={solid ? 1 : 0.55}
        />

        {/* Twin chevron. The second stroke is dimmer, so the mark has a lit
            face and a shadowed one instead of reading as two equal arrows. */}
        <Polyline
          points={chevronPoints(dimension, 0)}
          fill="none"
          stroke={markColor}
          strokeWidth={strokeWidth * (isHero ? 1.4 : 1)}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <Polyline
          points={chevronPoints(dimension, dimension * 0.16)}
          fill="none"
          stroke={solid ? alpha(onPlatinum, 0.45) : platinum.chromeDeep}
          strokeWidth={strokeWidth * (isHero ? 1.4 : 1)}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * PlatinumWordmark
 * ------------------------------------------------------------------ */

/**
 * Badge + "PLATINUM", for surfaces with room for the full lockup: the
 * paywall header, the profile's subscription row, the settings entry.
 *
 * Rajdhani uppercase with tracking, matching how every other display label
 * in the app is set — the tier is new, the typography is not.
 */
export function PlatinumWordmark({
  size = spacing.spacingLg,
  label = "PLATINUM",
  style,
}: {
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wordmark, style]}>
      <PlatinumBadge size={size} />
      <Text style={[styles.wordmarkText, { fontSize: size * 0.85 }]}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * PlatinumNameBadge
 * ------------------------------------------------------------------ */

/**
 * The badge as it appears beside a username — the single component every
 * name-rendering surface should use, so the badge can never drift in size or
 * spacing between the profile, a chat row and a leaderboard entry.
 *
 * Renders nothing when the driver isn't Platinum, so call sites stay a
 * one-liner instead of a conditional:
 *
 *   <Text>{name}</Text>
 *   <PlatinumNameBadge show={driver.isPlatinum} />
 */
export function PlatinumNameBadge({
  show,
  size = spacing.spacingMd,
  name,
  style,
}: {
  show: boolean;
  size?: number;
  /** Driver's name, folded into the accessibility label when present. */
  name?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (!show) return null;
  return (
    <PlatinumBadge
      size={size}
      style={style}
      accessibilityLabel={name ? `${name}, Platinum member` : "Platinum member"}
    />
  );
}

const styles = StyleSheet.create({
  wordmark: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  wordmarkText: {
    fontFamily: fontFamily.displayBold,
    letterSpacing: 1.4,
    color: platinum.chrome,
  },
});

export default PlatinumBadge;
