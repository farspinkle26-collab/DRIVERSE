/**
 * Driveverse — the rank page wash.
 *
 * `ProfileAura` marks the avatar; this marks the header section behind it. It
 * is the high-tier half of the aura system: a soft radial-ish gradient in the
 * driver's tier colour, sitting behind the identity row so the top of the page
 * picks up their rank without any element on it changing colour.
 *
 * WHY IT STOPS AT THE HEADER
 *   Same reason `PlatinumPageGlow` does. A full-bleed tint would fight every
 *   card on the page and would turn a cosmetic into a theme. Pinned to the
 *   header, it reads as light spilling off the avatar — which is literally
 *   what it is meant to be, since its intensity comes from the same tier
 *   config that drives the avatar's rings.
 *
 * WHY IT ONLY EXISTS FROM TIER 8
 *   `wash` is 0 for tiers 1–7 in `rankAuras.ts`, so this component renders
 *   null for most drivers. The wash is the reward for reaching the phased
 *   band; if everyone had one, no one would.
 *
 * PLATINUM
 *   A Platinum driver gets `PlatinumPageGlow` instead — `resolveAura` reports
 *   `visible: false` for them, so the two washes can never stack. The Platinum
 *   wash is chrome and this one is a tier colour; overlaying them would muddy
 *   both into an indeterminate tint.
 *
 * REDUCED MOTION
 *   Static wash at the breath's midpoint, the same rule the rest of the app
 *   follows.
 */

import React, { useMemo } from "react";
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import useFrameClock from "@/components/frames/useFrameClock";
import useReducedMotion from "@/hooks/useReducedMotion";
import { resolveAura } from "@/constants/rankAuras";
import { alpha, colors } from "@/constants/theme";

/**
 * A full breath, deliberately slower than the avatar's.
 *
 * A whole-section gradient moving at the avatar's rate would be the most
 * noticeable thing on the page — area amplifies motion. Slowing it to ~8s
 * makes it ambient, and keeping it off the avatar's period also stops the two
 * effects from visibly locking in step, which reads as mechanical.
 */
const WASH_PERIOD_SECONDS = 8;

/** Opacity multipliers on the config's `wash`, floor and ceiling of a breath. */
const OPACITY_MIN = 0.55;
const OPACITY_MAX = 1;

/** Where a static (reduced-motion) wash is parked. */
const OPACITY_REST = (OPACITY_MIN + OPACITY_MAX) / 2;

export interface RankPageWashProps {
  /** Driver's XP level. Ignored when `rankId` is given. */
  level?: number | null;
  /** Pre-resolved rank id, when the caller already has one. */
  rankId?: string | null;
  /** Suppresses the rank wash; the Platinum wash takes the page instead. */
  isPlatinum?: boolean;
  /** Height of the wash in points — pinned to the header, not the full page. */
  height: number;
  style?: StyleProp<ViewStyle>;
}

export function RankPageWash({
  level,
  rankId,
  isPlatinum = false,
  height,
  style,
}: RankPageWashProps) {
  const reducedMotion = useReducedMotion();

  const aura = useMemo(
    () => resolveAura({ level, rankId, isPlatinum, detail: "full", reducedMotion }),
    [level, rankId, isPlatinum, reducedMotion]
  );

  const active = aura.effectiveWash > 0;
  const animated = active && !reducedMotion;

  // Unconditional, so a rank-up never reorders hooks. Disabled acquires nothing.
  const clock = useFrameClock(WASH_PERIOD_SECONDS, animated, true);

  const gradientColors = useMemo(() => {
    const w = aura.effectiveWash;
    // Three stops rather than two: the mid stop is what makes the falloff read
    // as a soft bloom instead of a linear band with a visible edge.
    return [
      alpha(aura.color, 0.13 * w),
      alpha(aura.color, 0.05 * w),
      alpha(colors.voidBlack, 0),
    ] as const;
  }, [aura.color, aura.effectiveWash]);

  if (!active) return null;

  const wrapStyle = [styles.wrap, { height }, style];

  if (!animated) {
    return (
      <Animated.View pointerEvents="none" style={[wrapStyle, { opacity: OPACITY_REST }]}>
        <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        wrapStyle,
        {
          opacity: clock.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [OPACITY_MIN, OPACITY_MAX, OPACITY_MIN],
          }),
          transform: [
            {
              translateY: clock.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [-height * 0.03, height * 0.03, -height * 0.03],
              }),
            },
          ],
        },
      ]}
    >
      <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});

export default RankPageWash;
