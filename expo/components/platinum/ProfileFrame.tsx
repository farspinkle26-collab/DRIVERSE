/**
 * Driveverse Platinum — profile frames.
 *
 * The ring drawn around an avatar. Regular drivers keep the plain ring the
 * profile already used; Platinum drivers can pick one of four.
 *
 * Each frame is built from the app's angular vocabulary rather than from a
 * different colour: corner cuts, opposed brackets, gauge ticks, a segmented
 * ring. The chrome tone is shared across the set — the shape is what
 * distinguishes them, so a driver's frame still reads as Platinum at a glance
 * while being their own choice up close.
 *
 * The frame draws OUTSIDE the avatar box (it is absolutely positioned and
 * oversized), so swapping frames never reflows the layout around an avatar.
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { platinum } from "@/constants/platinum";
import {
  resolveProfileFrame,
  type ProfileFrameId,
} from "@/constants/platinumCosmetics";
import { alpha, borderWidth, radius } from "@/constants/theme";

export interface ProfileFrameProps {
  /** Stored selection. Falls back to the default when not entitled. */
  frame?: string | null;
  isPlatinum?: boolean;
  /** Diameter of the avatar being framed. */
  size: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** How far the frame extends past the avatar edge, as a fraction of size. */
const FRAME_MARGIN = 0.12;

/** Stroke weight scales with the avatar so a 32px chip isn't hairline-thin. */
function strokeFor(size: number): number {
  return Math.max(borderWidth.hairline, size * 0.022);
}

export function ProfileFrame({
  frame,
  isPlatinum = false,
  size,
  children,
  style,
}: ProfileFrameProps) {
  const resolved = resolveProfileFrame(frame, isPlatinum);
  const box = size * (1 + FRAME_MARGIN * 2);

  return (
    <View style={[styles.wrap, { width: box, height: box }, style]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <FrameArt id={resolved} box={box} />
      </View>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The four frames
 * ------------------------------------------------------------------ */

function FrameArt({ id, box }: { id: ProfileFrameId; box: number }) {
  const stroke = strokeFor(box);
  const inset = stroke;
  const c = box / 2;
  const r = c - inset;

  if (id === "default") {
    // Draws nothing. "Standard" means the avatar as it looked before Platinum
    // existed — the surrounding screen already supplies its own ring, so
    // adding one here would silently restyle every Regular driver's avatar.
    // The picker renders its own placeholder for this slot.
    return null;
  }

  if (id === "apex") {
    // Four 45° cuts on an otherwise square bezel — the CutCorner language
    // taken all the way round, which is exactly the shape the badge uses.
    const cut = box * 0.24;
    const a = inset;
    const b = box - inset;
    const d = [
      `M${a + cut},${a}`,
      `L${b - cut},${a}`,
      `L${b},${a + cut}`,
      `L${b},${b - cut}`,
      `L${b - cut},${b}`,
      `L${a + cut},${b}`,
      `L${a},${b - cut}`,
      `L${a},${a + cut}`,
      "Z",
    ].join(" ");
    return (
      <Svg width={box} height={box}>
        <Path
          d={d}
          stroke={platinum.chrome}
          strokeWidth={stroke}
          strokeLinejoin="miter"
          fill="none"
        />
      </Svg>
    );
  }

  if (id === "caliper") {
    // Two opposed brackets clamping the avatar, top and bottom, with the ring
    // left open at the sides — a brake caliper, not a halo.
    const arc = (start: number, sweep: number) => {
      const toXY = (deg: number) => {
        const rad = (deg * Math.PI) / 180;
        return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
      };
      const [x0, y0] = toXY(start);
      const [x1, y1] = toXY(start + sweep);
      return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
    };
    return (
      <Svg width={box} height={box}>
        <Path d={arc(-125, 70)} stroke={platinum.chrome} strokeWidth={stroke * 1.6} strokeLinecap="butt" fill="none" />
        <Path d={arc(55, 70)} stroke={platinum.chrome} strokeWidth={stroke * 1.6} strokeLinecap="butt" fill="none" />
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={alpha(platinum.chrome, 0.28)}
          strokeWidth={stroke}
          fill="none"
        />
      </Svg>
    );
  }

  if (id === "telemetry") {
    // A gauge bezel: continuous ring plus twelve ticks, longer at the
    // quarters. Reads as an instrument, which is the app's whole register.
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const deg = i * 30 - 90;
      const rad = (deg * Math.PI) / 180;
      const long = i % 3 === 0;
      const outer = r;
      const inner = r - box * (long ? 0.1 : 0.055);
      return {
        x1: c + outer * Math.cos(rad),
        y1: c + outer * Math.sin(rad),
        x2: c + inner * Math.cos(rad),
        y2: c + inner * Math.sin(rad),
        long,
      };
    });
    return (
      <Svg width={box} height={box}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={alpha(platinum.chrome, 0.5)}
          strokeWidth={stroke}
          fill="none"
        />
        {ticks.map((t, i) => (
          <Line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.long ? platinum.chrome : platinum.chromeDim}
            strokeWidth={stroke * (t.long ? 1.2 : 0.8)}
            strokeLinecap="butt"
          />
        ))}
      </Svg>
    );
  }

  // grid — a segmented ring at start-line spacing: eight equal arcs with
  // equal gaps, alternating lit and shadowed.
  const segments = Array.from({ length: 8 }, (_, i) => i);
  const segmentSweep = 33; // of 45° per slot, leaving a 12° gap
  return (
    <Svg width={box} height={box}>
      {segments.map((i) => {
        const start = i * 45 - 90;
        const toXY = (deg: number) => {
          const rad = (deg * Math.PI) / 180;
          return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
        };
        const [x0, y0] = toXY(start);
        const [x1, y1] = toXY(start + segmentSweep);
        return (
          <Path
            key={i}
            d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`}
            stroke={i % 2 === 0 ? platinum.chrome : platinum.chromeDeep}
            strokeWidth={stroke * 1.4}
            strokeLinecap="butt"
            fill="none"
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.circle,
  },
});

export default ProfileFrame;
