/**
 * Driveverse — the Platinum aura.
 *
 * A glow around a Platinum driver's avatar, wherever the avatar is a focal
 * point: the profile header, convoy member cards, the leaderboard.
 *
 * RESTRAINT IS THE DESIGN
 *   The temptation with a paid cosmetic is to make it loud enough to be
 *   obviously worth paying for. That is the wrong instinct for an app whose
 *   whole visual thesis is precision over decoration — a neon halo would be
 *   the single gaudiest element in Driveverse and would cheapen the tier it
 *   is meant to signal. So: one ring, chrome, low opacity, a slow breath.
 *   It should read the way a machined bezel reads, not the way a sticker does.
 *
 *   Chrome, not racingRed, and the same chrome as the badge. Two Platinum
 *   signals in two different colours would read as two unrelated states.
 *
 * REDUCED MOTION
 *   With "reduce motion" on, the pulse is not sped up or shortened — it is
 *   replaced by the static ring at the animation's mid-point, so the driver
 *   still gets the signal without the movement. That is the rule
 *   `hooks/useReducedMotion.ts` asks every animation in the app to follow.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { platinum } from "@/constants/platinum";
import { alpha, borderWidth, radius } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** One slow breath. Long enough to be ambient rather than attention-seeking. */
const PULSE_DURATION_MS = 2400;

/** Opacity the ring breathes between. Ceiling stays well under half. */
const OPACITY_MIN = 0.1;
const OPACITY_MAX = 0.34;

/** How far past the avatar the ring travels. 12% — a bezel, not a halo. */
const SCALE_MIN = 1;
const SCALE_MAX = 1.12;

export interface PlatinumAuraProps {
  /** Renders nothing but the children when false. */
  show: boolean;
  /** Diameter of the avatar the aura wraps, in points. */
  size: number;
  /** The avatar. Laid out normally; the aura is drawn behind it. */
  children: React.ReactNode;
  /**
   * Thicker ring for the profile header, where the avatar is the largest
   * thing on screen and a hairline would vanish.
   */
  emphasis?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PlatinumAura({
  show,
  size,
  children,
  emphasis = false,
  style,
}: PlatinumAuraProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!show || reducedMotion) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      // Reset so a remount doesn't resume mid-breath at a random opacity.
      progress.setValue(0);
    };
  }, [show, reducedMotion, progress]);

  const ringStyle = useMemo(() => {
    const ringSize = size * SCALE_MAX;
    return {
      position: "absolute" as const,
      width: ringSize,
      height: ringSize,
      borderRadius: radius.circle,
      borderWidth: emphasis ? borderWidth.emphasis : borderWidth.hairline,
      borderColor: platinum.chrome,
    };
  }, [size, emphasis]);

  if (!show) return <View style={style}>{children}</View>;

  // Static ring at the pulse's mid-point: the same signal, no movement.
  if (reducedMotion) {
    return (
      <View style={[styles.wrap, style]}>
        <View
          pointerEvents="none"
          style={[
            ringStyle,
            { opacity: (OPACITY_MIN + OPACITY_MAX) / 2, transform: [{ scale: 1.06 }] },
          ]}
        />
        <View
          pointerEvents="none"
          style={[styles.innerRing, { width: size, height: size }]}
        />
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          ringStyle,
          {
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [OPACITY_MAX, OPACITY_MIN],
            }),
            transform: [
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [SCALE_MIN, SCALE_MAX],
                }),
              },
            ],
          },
        ]}
      />
      {/* A second, still ring sitting on the avatar edge. Without it the
          aura reads as a stray ripple; with it, the avatar looks bezelled
          and the pulse looks like light coming off that bezel. */}
      <View
        pointerEvents="none"
        style={[styles.innerRing, { width: size, height: size }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    position: "absolute",
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    borderColor: alpha(platinum.chrome, 0.45),
  },
});

export default PlatinumAura;
