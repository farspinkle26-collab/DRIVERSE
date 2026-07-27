/**
 * Driveverse — the rank aura.
 *
 * The glow behind a driver's avatar. Reads an `AuraConfig` from
 * `constants/rankAuras.ts` and draws whatever it says — there is no per-tier
 * code in this file and adding a tier must never require any.
 *
 * RELATIONSHIP TO THE FRAME
 *   `AvatarFrame` draws the avatar's edge; this draws the light around it.
 *   Both take their colour from the same rank record, so they always agree.
 *   Composition on the Profile page is aura → frame → avatar, outermost first,
 *   exactly as `PlatinumAura` → `AvatarFrame` → avatar already nests.
 *
 * HOW THE GLOW IS MADE
 *   No Skia, no blur filter — the project has neither, and `AvatarFrame` is
 *   built on react-native-svg + RN's bundled `Animated` for the same reason.
 *   A soft glow here is an SVG `RadialGradient` whose stops are transparent at
 *   the centre, peak at the avatar's edge, and fall back to transparent at the
 *   outer radius. Layering two or three of those at stepped radii produces the
 *   falloff a blur would, at a fraction of the cost, because the GPU is
 *   drawing gradients rather than sampling a kernel.
 *
 * MOTION
 *   Only `opacity` and `transform` animate, which means the whole aura runs on
 *   the **native driver** — unlike the frame's `strokeDashoffset` trail, which
 *   cannot. A busy JS thread stutters the frame's trail but not this. Rings
 *   share one clock per period via `useFrameClock` (see its header note on why
 *   native and JS clocks are keyed separately).
 *
 * REDUCED MOTION
 *   The rings stay, at the midpoint of their breath; only the movement goes.
 *   Removing the aura entirely would strip a rank signal from exactly the
 *   users least able to afford losing signals, so the colour identity is never
 *   what gets dropped.
 */

import React, { memo, useId, useMemo } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import useFrameClock from "@/components/frames/useFrameClock";
import useReducedMotion from "@/hooks/useReducedMotion";
import {
  resolveAura,
  type AuraDetail,
  type ResolvedAura,
} from "@/constants/rankAuras";

/* ------------------------------------------------------------------ *
 * Tuning
 * ------------------------------------------------------------------ */

/**
 * How much dimmer each ring is than the one inside it. The innermost ring
 * carries the config's opacity; outer rings step down, so the stack reads as
 * one glow falling off rather than as three separate rings.
 */
const RING_FALLOFF = 0.3;

/** Floor of the breath, as a fraction of a ring's peak opacity. */
const BREATH_FLOOR = 0.45;

/** Where in the breath a static (reduced-motion) ring is parked. */
const BREATH_REST = 0.72;

/** How much a ring grows at the top of its breath. Barely — 4%. */
const BREATH_SCALE = 1.04;

/** Resolution of the piecewise-linear cosine used for the breath. */
const BREATH_STEPS = 8;

/**
 * Fraction of the sweep's cycle the streak is actually visible for. The rest
 * of the cycle is empty. 0.18 of King's 11s period is under two seconds of
 * motion in every eleven — "occasionally", as the design asks, not "always".
 */
const SWEEP_DUTY = 0.18;

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function mix(from: string, to: string, amount: number): string {
  const [r1, g1, b1] = parseHex(from);
  const [r2, g2, b2] = parseHex(to);
  const t = Math.max(0, Math.min(1, amount));
  const hex = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${hex(r1 + (r2 - r1) * t)}${hex(g1 + (g2 - g1) * t)}${hex(
    b1 + (b2 - b1) * t
  )}`;
}

/**
 * The second tone in a two-tone aura.
 *
 * `Rank.colorDark` is a *gradient partner* — it was picked to sit under the
 * tier colour in a filled badge, so it is genuinely dark (King's is `#8A6A00`).
 * That works for the frame, which strokes it as a crisp line, but a diffuse
 * glow in a near-black tone on the app's `voidBlack` background is invisible:
 * it would read as a missing ring, not a second colour. Mixing it 55% back
 * toward the tier colour keeps it clearly distinguishable from the primary
 * while actually surviving on a dark page.
 *
 * This is the one place the aura system transforms a colour, and it still
 * never *invents* one — both endpoints come from `ranks.ts`.
 */
const SECONDARY_MIX = 0.55;

function secondaryTone(color: string, accent: string): string {
  return mix(accent, color, SECONDARY_MIX);
}

/* ------------------------------------------------------------------ *
 * Motion helpers
 * ------------------------------------------------------------------ */

/**
 * A breath sampled off a linear 0→1 clock, phase-shifted by `phase` cycles.
 *
 * `Animated.Value` has no sine, so the cosine is sampled into a piecewise
 * linear interpolation. At 8 steps the corners are well under a pixel of
 * opacity, and — the reason it is done this way — the result is still a plain
 * interpolation, which means it can run on the native driver.
 */
function breathe(
  clock: Animated.Value,
  phase: number,
  from: number,
  to: number
): Animated.AnimatedInterpolation<number> {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= BREATH_STEPS; i++) {
    const t = i / BREATH_STEPS;
    const wave = (1 - Math.cos(2 * Math.PI * (t + phase))) / 2;
    inputRange.push(t);
    outputRange.push(from + (to - from) * wave);
  }
  return clock.interpolate({ inputRange, outputRange });
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

interface RingSpec {
  /** 0 = innermost. */
  index: number;
  tone: string;
  peakOpacity: number;
  /** Offset within the gradient (0–1) where this ring is brightest. */
  peakOffset: number;
  phase: number;
}

interface AuraGeometry {
  /** Side of the square SVG box the aura is drawn into. */
  box: number;
  rings: RingSpec[];
  /** Scale that carries the sweep from the avatar edge to the box edge. */
  sweepScale: number;
  /** Radius of the sweep ring at rest, in box coordinates. */
  sweepRadius: number;
}

function auraGeometry(aura: ResolvedAura, size: number): AuraGeometry {
  const count = aura.effectiveRings;
  const spreadPx = size * aura.spread;
  const box = size + spreadPx * 2;
  const half = box / 2;
  const avatarR = size / 2;

  const rings: RingSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Each ring peaks a little further out than the last. The innermost sits
    // exactly on the avatar's edge so the glow looks like it is coming off the
    // frame rather than floating around it.
    const peakR = avatarR + (spreadPx * i) / count;
    rings.push({
      index: i,
      tone:
        aura.twoTone && i % 2 === 1
          ? secondaryTone(aura.color, aura.accent)
          : aura.color,
      peakOpacity: aura.opacity * Math.max(0.25, 1 - i * RING_FALLOFF),
      peakOffset: Math.min(0.98, peakR / half),
      phase: aura.effectiveMotion === "pulse" ? 0 : i * aura.phaseOffset,
    });
  }

  return {
    box,
    rings,
    sweepScale: avatarR > 0 ? half / avatarR : 1,
    sweepRadius: avatarR,
  };
}

/* ------------------------------------------------------------------ *
 * Art
 * ------------------------------------------------------------------ */

/** One soft ring: a radial gradient that is empty at the centre, peaks at the
 *  ring's radius, and fades out again by the edge of the box. */
function GlowRing({
  ring,
  box,
  gradientId,
}: {
  ring: RingSpec;
  box: number;
  gradientId: string;
}) {
  return (
    <Svg width={box} height={box} pointerEvents="none">
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={ring.tone} stopOpacity={0} />
          {/* Nothing inside the peak — the avatar covers this area, and a
              glow bleeding under it would just look like a lighter avatar. */}
          <Stop
            offset={ring.peakOffset * 0.82}
            stopColor={ring.tone}
            stopOpacity={0}
          />
          <Stop offset={ring.peakOffset} stopColor={ring.tone} stopOpacity={1} />
          <Stop offset="1" stopColor={ring.tone} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={box / 2} cy={box / 2} r={box / 2} fill={`url(#${gradientId})`} />
    </Svg>
  );
}

/**
 * King's sweep: a hairline ring that expands from the avatar's edge outward
 * and fades. Drawn as a stroked circle rather than a gradient because it is a
 * *streak* — an edge of light travelling outward — not a bloom.
 */
function SweepRing({
  aura,
  geo,
  size,
}: {
  aura: ResolvedAura;
  geo: AuraGeometry;
  size: number;
}) {
  const stroke = Math.max(1, size * 0.012);
  return (
    <Svg width={geo.box} height={geo.box} pointerEvents="none">
      <Circle
        cx={geo.box / 2}
        cy={geo.box / 2}
        r={geo.sweepRadius}
        stroke={aura.color}
        strokeWidth={stroke}
        fill="none"
      />
    </Svg>
  );
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export interface ProfileAuraProps {
  /** Avatar diameter. The aura draws outside this and never inside it. */
  size: number;
  /** The avatar — usually an `AvatarFrame` wrapping the image. */
  children: React.ReactNode;

  /** Driver's XP level. Ignored when `rankId` is given. */
  level?: number | null;
  /** Pre-resolved rank id, when the caller already has one. */
  rankId?: string | null;
  /** Whether this driver currently holds Platinum. Suppresses the rank aura. */
  isPlatinum?: boolean;

  /** How much detail this surface may draw. Defaults to `full`. */
  detail?: AuraDetail;
  /** Force static regardless of tier, for a surface under render pressure. */
  forceStatic?: boolean;

  style?: StyleProp<ViewStyle>;
}

export const ProfileAura = memo(function ProfileAura({
  size,
  children,
  level,
  rankId,
  isPlatinum = false,
  detail = "full",
  forceStatic = false,
  style,
}: ProfileAuraProps) {
  const reducedMotion = useReducedMotion();

  const aura = useMemo(
    () =>
      resolveAura({
        level,
        rankId,
        isPlatinum,
        detail,
        reducedMotion: reducedMotion || forceStatic,
      }),
    [level, rankId, isPlatinum, detail, reducedMotion, forceStatic]
  );

  const geo = useMemo(() => auraGeometry(aura, size), [aura, size]);

  const animated = aura.effectiveMotion !== "none";
  const sweeping = aura.effectiveMotion === "sweep" && aura.sweepPeriod > 0;

  // Hooks run unconditionally — a driver ranking up must not change the hook
  // order. Both clocks no-op when disabled and schedule nothing.
  const pulseClock = useFrameClock(aura.pulsePeriod, animated, true);
  const sweepClock = useFrameClock(aura.sweepPeriod, sweeping, true);

  // `useId` keeps gradient ids unique per mounted aura. Two SVGs sharing a
  // gradient id is a long-standing react-native-svg footgun: the second one
  // silently adopts the first one's colours, which on a convoy roster would
  // paint every driver in the top row's tier.
  const idBase = useId().replace(/:/g, "");

  if (!aura.visible) return <View style={style}>{children}</View>;

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      {geo.rings.map((ring) => {
        const art = (
          <GlowRing ring={ring} box={geo.box} gradientId={`${idBase}-r${ring.index}`} />
        );

        if (!animated) {
          return (
            <View
              key={ring.index}
              pointerEvents="none"
              style={[styles.layer, { opacity: ring.peakOpacity * BREATH_REST }]}
            >
              {art}
            </View>
          );
        }

        return (
          <Animated.View
            key={ring.index}
            pointerEvents="none"
            style={[
              styles.layer,
              {
                opacity: breathe(
                  pulseClock,
                  ring.phase,
                  ring.peakOpacity * BREATH_FLOOR,
                  ring.peakOpacity
                ),
                transform: [
                  { scale: breathe(pulseClock, ring.phase, 1, BREATH_SCALE) },
                ],
              },
            ]}
          >
            {art}
          </Animated.View>
        );
      })}

      {sweeping ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.layer,
            {
              // Empty for most of the cycle. The scale snapping back to 1 at
              // the wrap happens while opacity is 0, so it is never seen.
              opacity: sweepClock.interpolate({
                inputRange: [0, SWEEP_DUTY * 0.15, SWEEP_DUTY * 0.6, SWEEP_DUTY, 1],
                outputRange: [0, aura.opacity, aura.opacity * 0.3, 0, 0],
              }),
              transform: [
                {
                  scale: sweepClock.interpolate({
                    inputRange: [0, SWEEP_DUTY, 1],
                    outputRange: [1, geo.sweepScale, geo.sweepScale],
                  }),
                },
              ],
            },
          ]}
        >
          <SweepRing aura={aura} geo={geo} size={size} />
        </Animated.View>
      ) : null}

      {children}
    </View>
  );
});

/**
 * The list variant: convoy rosters and chat rows.
 *
 * Static by construction and drawn only from `LIST_MIN_TIER` up — see the note
 * on that constant for why most rows having no aura is the point rather than a
 * limitation. `resolveAura` enforces both, so this is a thin preset rather
 * than a second implementation.
 */
export const ListAvatarAura = memo(function ListAvatarAura(
  props: Omit<ProfileAuraProps, "detail">
) {
  return <ProfileAura {...props} detail="list" />;
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  /** Centred on the avatar and outside layout, so the aura can be larger than
   *  the avatar box without moving anything pinned to that box. */
  layer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ProfileAura;
