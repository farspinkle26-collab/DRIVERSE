/**
 * Driveverse — the Platinum page wash.
 *
 * `PlatinumAura` marks the avatar; this marks the page. A Platinum driver's
 * own profile (and, deliberately, any Platinum driver's profile a visitor
 * opens) reads as a different room the moment it loads — a slow chrome
 * sweep behind the content, not a colour change to the content itself.
 *
 * SAME RESTRAINT AS THE AURA
 *   Full-bleed and constant would fight every card on the screen; a single
 *   soft gradient, breathing between two very low opacities over several
 *   seconds, is a background detail rather than a decoration you have to
 *   look away from. Chrome, the exact ramp `constants/platinum.ts` defines
 *   for the badge and the aura — the whole page should read as one signal,
 *   not three unrelated Platinum treatments.
 *
 * REDUCED MOTION
 *   Static wash at the breath's midpoint, same rule `PlatinumAura` follows.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { platinum } from "@/constants/platinum";
import { alpha, colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** A full breath, slower than the avatar's — ambient for a whole screen. */
const PULSE_DURATION_MS = 5200;

const OPACITY_MIN = 0.35;
const OPACITY_MAX = 0.85;

export interface PlatinumPageGlowProps {
  /** Renders nothing when false. */
  show: boolean;
  /** Height of the wash, in points — pinned to the header, not the full page. */
  height: number;
  style?: StyleProp<ViewStyle>;
}

export function PlatinumPageGlow({ show, height, style }: PlatinumPageGlowProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!show || reducedMotion) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [show, reducedMotion, progress]);

  const gradientColors = useMemo(
    () =>
      [
        alpha(platinum.chrome, 0.16),
        alpha(platinum.chromeDim, 0.06),
        alpha(colors.voidBlack, 0),
      ] as const,
    []
  );

  if (!show) return null;

  const wrapStyle = [styles.wrap, { height }, style];

  if (reducedMotion) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[wrapStyle, { opacity: (OPACITY_MIN + OPACITY_MAX) / 2 }]}
      >
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
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [OPACITY_MIN, OPACITY_MAX],
          }),
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-height * 0.04, height * 0.04],
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

export default PlatinumPageGlow;
