/**
 * Driveverse — the Founder badge.
 *
 * Earned once, by redeeming the launch code — not by paying (that's
 * Platinum) and not by driving (that's rank). Built to be told apart from
 * both at a glance:
 *
 *   • Single corner cut, matching the plate language most brand surfaces
 *     use, where `PlatinumBadge` deliberately doubles its cut.
 *   • Gold, never chrome and never racingRed — its own identity colour,
 *     defined once in `constants/founder.ts`.
 *   • A five-point star rather than Platinum's speed chevron — a mark of
 *     charter membership, not of velocity.
 *
 * SIZES
 *   `inline` (default) rides next to a username anywhere one renders.
 *   `hero` is for the redeem-code confirmation moment, larger and with the
 *   highlight at full strength.
 */

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Line, Polygon } from "react-native-svg";
import { founder, onFounder } from "@/constants/founder";
import { alpha, colors, fontFamily, spacing } from "@/constants/theme";

export type FounderBadgeVariant = "inline" | "hero";

export interface FounderBadgeProps {
  /** Height of the plate in points. Width follows the 1:1 plate ratio. */
  size?: number;
  variant?: FounderBadgeVariant;
  /**
   * Renders the plate filled in gold with a dark star, instead of a dark
   * plate with a gold star. For placement on a dark card where the outline
   * version disappears.
   */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Screen-reader label. Defaults to "Founder driver"; pass a driver's name
   * where the badge is describing someone else ("Rio, Founder driver").
   */
  accessibilityLabel?: string;
}

/** Cut depth as a fraction of the plate. Keeps the silhouette at any size. */
const CUT_RATIO = 0.24;

/**
 * Plate outline: a square with only the top-right corner sliced — the
 * single-cut language most brand surfaces use.
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
    [a, b],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

/** Five-point star, centred in a `size`×`size` box. */
function starPoints(size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.32;
  const inner = size * 0.13;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    // Start pointing up, one point per 36°.
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

export function FounderBadge({
  size,
  variant = "inline",
  solid = false,
  style,
  accessibilityLabel = "Founder driver",
}: FounderBadgeProps) {
  const dimension = size ?? (variant === "hero" ? 96 : spacing.spacingLg);
  const isHero = variant === "hero";
  const strokeWidth = Math.max(1, dimension * (isHero ? 0.035 : 0.09));
  const inset = strokeWidth / 2;

  const plateFill = solid ? founder.gold : colors.voidBlack;
  const markColor = solid ? onFounder : founder.gold;

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
          stroke={founder.gold}
          strokeWidth={strokeWidth}
        />

        {/* Specular highlight along the lit (top-left) edge, matching
            Platinum's trick for reading as metal rather than flat colour. */}
        <Line
          x1={inset + dimension * 0.06}
          y1={inset + dimension * 0.1}
          x2={inset + dimension * 0.06}
          y2={dimension - inset - dimension * 0.2}
          stroke={solid ? alpha(onFounder, 0.25) : founder.goldLight}
          strokeWidth={strokeWidth * (isHero ? 0.9 : 0.7)}
          opacity={solid ? 1 : 0.6}
        />

        <Polygon
          points={starPoints(dimension)}
          fill={markColor}
          stroke={solid ? alpha(onFounder, 0.35) : founder.goldDeep}
          strokeWidth={strokeWidth * 0.4}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * FounderWordmark
 * ------------------------------------------------------------------ */

/**
 * Badge + "FOUNDER", for surfaces with room for the full lockup: the
 * redeem-code sheet and the settings entry.
 */
export function FounderWordmark({
  size = spacing.spacingLg,
  label = "FOUNDER",
  style,
}: {
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wordmark, style]}>
      <FounderBadge size={size} />
      <Text style={[styles.wordmarkText, { fontSize: size * 0.85 }]}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * FounderNameBadge
 * ------------------------------------------------------------------ */

/**
 * The badge as it appears beside a username — mirrors `PlatinumNameBadge`
 * so the two compose predictably wherever a name renders:
 *
 *   <Text>{name}</Text>
 *   <FounderNameBadge show={driver.isFounder} />
 *   <PlatinumNameBadge show={driver.isPlatinum} />
 *
 * Renders nothing when the driver isn't a Founder, so call sites stay a
 * one-liner instead of a conditional.
 */
export function FounderNameBadge({
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
    <FounderBadge
      size={size}
      style={style}
      accessibilityLabel={name ? `${name}, Founder driver` : "Founder driver"}
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
    color: founder.gold,
  },
});

export default FounderBadge;
