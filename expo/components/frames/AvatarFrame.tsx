/**
 * Driveverse — the avatar frame.
 *
 * One component for every place an avatar is drawn: the Profile page, the
 * map, convoy rosters, chat, the leaderboard. It reads a `FrameConfig` from
 * `constants/rankFrames.ts` and draws whatever that config says — there is
 * no per-tier code in this file and adding a tier must never require any.
 *
 * NAMING
 *   `components/platinum/ProfileFrame.tsx` already owns that name and draws
 *   the four Platinum chrome frames. This component sits *above* it: it
 *   resolves rank-vs-Platinum and then either draws a rank frame itself or
 *   delegates to `ProfileFrame` for a Platinum one. Call sites should use
 *   this; `ProfileFrame` stays the Platinum art.
 *
 * LAYOUT
 *   Like `ProfileFrame`, the art is drawn absolutely and oversized around
 *   the avatar box, so changing rank never reflows the layout around an
 *   avatar and a level badge pinned to the corner stays put.
 *
 * MOTION
 *   React Native's bundled `Animated` (the project has no reanimated). The
 *   travelling trail is a `strokeDashoffset` interpolation along the
 *   silhouette's own outline, so it follows an octagon's corners rather than
 *   sliding around an invisible circle. Every frame sharing a lap duration
 *   shares one clock — see `useFrameClock`.
 */

import React, { memo, useMemo } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Line, Path, Polygon } from "react-native-svg";
import ProfileFrame from "@/components/platinum/ProfileFrame";
import {
  frameGeometry,
  segmentDash,
  trailDash,
  type FrameGeometry,
} from "@/components/frames/frameGeometry";
import useFrameClock from "@/components/frames/useFrameClock";
import useReducedMotion from "@/hooks/useReducedMotion";
import {
  resolveAvatarFrame,
  type FrameDetail,
  type ResolvedFrame,
} from "@/constants/rankFrames";
import { alpha, borderWidth } from "@/constants/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** How far the frame extends past the avatar edge, as a fraction of size.
 *  Matches `ProfileFrame` so the two sets sit on the same ring radius. */
const FRAME_MARGIN = 0.12;

export interface AvatarFrameProps {
  /** Avatar diameter. The frame draws outside this. */
  size: number;
  /** The avatar itself — Image, initial letter, spinner, whatever. */
  children: React.ReactNode;

  /** Driver's XP level. Ignored when `rankId` is given. */
  level?: number | null;
  /** Pre-resolved rank id, when the caller already has one. */
  rankId?: string | null;
  /** Raw `profiles.profile_frame` selection. */
  platinumFrame?: string | null;
  isPlatinum?: boolean;

  /** How much detail this surface may draw. Defaults to `full`. */
  detail?: FrameDetail;
  /**
   * Force static regardless of tier. The map sets this when many markers are
   * on screen at once; see `MapAvatarFrame` below.
   */
  forceStatic?: boolean;

  style?: StyleProp<ViewStyle>;
}

/* ------------------------------------------------------------------ *
 * Art
 * ------------------------------------------------------------------ */

function CornerDetail({
  frame,
  geo,
  stroke,
  box,
}: {
  frame: ResolvedFrame;
  geo: FrameGeometry;
  stroke: number;
  box: number;
}) {
  const treatment = frame.effectiveCorner;
  if (treatment === "none" || geo.corners.length === 0) return null;

  // Ticks sit just inside the outline, perpendicular to the cut they mark.
  if (treatment === "ticks" || treatment === "double") {
    const len = box * (treatment === "double" ? 0.09 : 0.06);
    return (
      <>
        {geo.corners.map((corner, i) => {
          const rad = ((corner.angle + 90) * Math.PI) / 180;
          const dx = Math.cos(rad);
          const dy = Math.sin(rad);
          const lines = treatment === "double" ? [0.35, -0.35] : [0];
          return lines.map((offset, j) => {
            // Slide the tick along the cut edge for the double treatment.
            const along = ((corner.angle * Math.PI) / 180);
            const ox = Math.cos(along) * box * 0.06 * offset;
            const oy = Math.sin(along) * box * 0.06 * offset;
            return (
              <Line
                key={`${i}-${j}`}
                x1={corner.x + ox}
                y1={corner.y + oy}
                x2={corner.x + ox - dx * len}
                y2={corner.y + oy - dy * len}
                stroke={frame.color}
                strokeWidth={stroke * 0.8}
                strokeLinecap="butt"
              />
            );
          });
        })}
      </>
    );
  }

  // A notch: a small open bracket sitting on one cut, in the accent tone.
  if (treatment === "notch") {
    const corner = geo.corners[0];
    const size = box * 0.1;
    const rad = ((corner.angle + 90) * Math.PI) / 180;
    return (
      <Path
        d={`M${corner.x - size / 2},${corner.y} L${corner.x - Math.cos(rad) * size},${
          corner.y - Math.sin(rad) * size
        } L${corner.x + size / 2},${corner.y}`}
        stroke={frame.accent}
        strokeWidth={stroke}
        strokeLinejoin="miter"
        fill="none"
      />
    );
  }

  // `emblem` — King only. A filled chevron seated in the top cut, the one
  // solid mark in the whole set, plus a matching one opposite.
  const marks = [geo.corners[0], geo.corners[Math.floor(geo.corners.length / 2)]];
  const size = box * 0.085;
  return (
    <>
      {marks.map((corner, i) => {
        if (!corner) return null;
        const rad = ((corner.angle + 90) * Math.PI) / 180;
        const tipX = corner.x - Math.cos(rad) * size;
        const tipY = corner.y - Math.sin(rad) * size;
        const along = (corner.angle * Math.PI) / 180;
        const ax = Math.cos(along) * size * 0.7;
        const ay = Math.sin(along) * size * 0.7;
        return (
          <Polygon
            key={i}
            points={`${corner.x + ax},${corner.y + ay} ${tipX},${tipY} ${
              corner.x - ax
            },${corner.y - ay}`}
            fill={i === 0 ? frame.color : frame.accent}
          />
        );
      })}
    </>
  );
}

/** The spark micro-detail at one corner. Top tier, Profile page only. */
function Sparks({
  frame,
  geo,
  box,
  clock,
}: {
  frame: ResolvedFrame;
  geo: FrameGeometry;
  box: number;
  clock: Animated.Value;
}) {
  const corner = geo.corners[0];
  if (!corner) return null;

  // Three motes drifting off the top cut on staggered phases. Small, slow
  // and low-contrast: at full size it should read as the frame breathing,
  // not as a particle system.
  const motes = [0, 0.33, 0.66];
  return (
    <>
      {motes.map((phase, i) => {
        const drift = clock.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        });
        const opacity = drift.interpolate({
          inputRange: [0, phase, Math.min(phase + 0.34, 1), 1],
          outputRange: [0, 0.9, 0, 0],
          extrapolate: "clamp",
        });
        const rise = drift.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -box * 0.16],
        });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.mote,
              {
                left: corner.x + (i - 1) * box * 0.055,
                top: corner.y,
                width: box * 0.028,
                height: box * 0.028,
                borderRadius: box * 0.014,
                backgroundColor: i === 1 ? frame.accent : frame.color,
                opacity,
                transform: [{ translateY: rise }],
              },
            ]}
          />
        );
      })}
    </>
  );
}

function RankFrameArt({
  frame,
  box,
  clock,
}: {
  frame: ResolvedFrame;
  box: number;
  clock: Animated.Value;
}) {
  const stroke = Math.max(borderWidth.hairline, box * frame.thickness);

  // The silhouette and its dash maths are the expensive part and depend only
  // on shape/size, so they are memoised — a scrolling list at one size
  // computes each path once, not once per row per render.
  const geo = useMemo(
    () => frameGeometry(frame.shape, box, stroke),
    [frame.shape, box, stroke]
  );
  const dash = useMemo(
    () => segmentDash(geo.length, frame.segments),
    [geo.length, frame.segments]
  );
  const trail = useMemo(() => trailDash(geo.length), [geo.length]);

  const animating =
    frame.effectiveAnimation === "trail" || frame.effectiveAnimation === "dualTrail";

  // One lap = one full outline traversal. Negative offset so the trail runs
  // clockwise, matching the direction the geometry is walked in.
  const offset = clock.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -geo.length],
  });
  const offsetOpposed = clock.interpolate({
    inputRange: [0, 1],
    outputRange: [-geo.length / 2, -geo.length * 1.5],
  });

  const glowOpacity =
    frame.effectiveAnimation === "pulse"
      ? clock.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [frame.effectiveGlow * 0.45, frame.effectiveGlow, frame.effectiveGlow * 0.45],
        })
      : null;

  return (
    <>
      {/* Inner glow — a wide, low-opacity copy of the outline sitting just
          inside the ring. Cheaper and steadier across platforms than a real
          blur filter, which react-native-svg does not support uniformly. */}
      {frame.effectiveGlow > 0 ? (
        glowOpacity ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: glowOpacity }]}>
            <Svg width={box} height={box}>
              <Path
                d={geo.path}
                stroke={frame.color}
                strokeWidth={stroke * 3}
                fill="none"
                opacity={0.22}
              />
            </Svg>
          </Animated.View>
        ) : (
          <Svg width={box} height={box} style={StyleSheet.absoluteFill}>
            <Path
              d={geo.path}
              stroke={frame.color}
              strokeWidth={stroke * 3}
              fill="none"
              opacity={0.22 * frame.effectiveGlow}
            />
          </Svg>
        )
      ) : null}

      <Svg width={box} height={box} style={StyleSheet.absoluteFill}>
        {/* The ring. Segmented tiers get a dash pattern; tiers 1–3 get a
            single continuous hairline and nothing else at all. */}
        {geo.isCircle && frame.segments <= 1 ? (
          <Circle
            cx={geo.cx}
            cy={geo.cy}
            r={geo.r}
            stroke={frame.color}
            strokeWidth={stroke}
            fill="none"
          />
        ) : (
          <Path
            d={geo.path}
            stroke={frame.color}
            strokeWidth={stroke}
            strokeDasharray={dash}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            fill="none"
          />
        )}

        {/* The travelling trail, drawn over the ring in the accent tone so
            it reads as light moving along the frame rather than a second
            ring. `dualTrail` adds an opposed one in the primary colour. */}
        {animating ? (
          <AnimatedPath
            d={geo.path}
            stroke={frame.accent}
            strokeWidth={stroke * 1.5}
            strokeDasharray={trail.dash}
            strokeDashoffset={offset as unknown as number}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {frame.effectiveAnimation === "dualTrail" ? (
          <AnimatedPath
            d={geo.path}
            stroke={frame.color}
            strokeWidth={stroke * 1.5}
            strokeDasharray={trail.dash}
            strokeDashoffset={offsetOpposed as unknown as number}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}

        <CornerDetail frame={frame} geo={geo} stroke={stroke} box={box} />
      </Svg>

      {frame.effectiveSparks ? (
        <Sparks frame={frame} geo={geo} box={box} clock={clock} />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * AvatarFrame
 * ------------------------------------------------------------------ */

function AvatarFrameImpl({
  size,
  children,
  level,
  rankId,
  platinumFrame,
  isPlatinum = false,
  detail = "full",
  forceStatic = false,
  style,
}: AvatarFrameProps) {
  const reducedMotion = useReducedMotion();

  const frame = useMemo(
    () =>
      resolveAvatarFrame({
        level,
        rankId,
        platinumFrame,
        isPlatinum,
        detail,
        reducedMotion: reducedMotion || forceStatic,
      }),
    [level, rankId, platinumFrame, isPlatinum, detail, reducedMotion, forceStatic]
  );

  const needsClock =
    frame.effectiveAnimation !== "none" || frame.effectiveSparks;
  const clock = useFrameClock(frame.trailPeriod, needsClock);

  // A Platinum frame wins over rank, and its art already exists — delegate
  // rather than reimplementing four chrome silhouettes here.
  if (frame.fromPlatinum) {
    return (
      <ProfileFrame
        frame={frame.platinumFrameId}
        isPlatinum={isPlatinum}
        size={size}
        style={style}
      >
        {children}
      </ProfileFrame>
    );
  }

  const box = size * (1 + FRAME_MARGIN * 2);

  return (
    <View
      style={[styles.wrap, { width: box, height: box }, style]}
      accessible={false}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <RankFrameArt frame={frame} box={box} clock={clock} />
      </View>
      {children}
    </View>
  );
}

/**
 * Memoised on props. A convoy roster re-rendering because one member's
 * position changed must not redraw thirty frames — the frame only depends on
 * rank, entitlement and size, none of which change on a position tick.
 */
export const AvatarFrame = memo(AvatarFrameImpl);

/* ------------------------------------------------------------------ *
 * Context wrappers
 * ------------------------------------------------------------------ */

export interface RankFrameRingProps {
  /** Outer diameter of the ring, in points. */
  box: number;
  level?: number | null;
  rankId?: string | null;
  platinumFrame?: string | null;
  isPlatinum?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The frame art on its own, with no avatar inside it — for surfaces that
 * already have their own avatar stack and just need the rank ring slotted
 * into a fixed-size well. The map is the reason this exists: its marker
 * already composes a livery ring, a level badge and a convoy/problem badge
 * inside tight, snapshot-clipped bounds, so wrapping it would break the
 * layout it depends on.
 *
 * Always `marker` detail, therefore always static. That is not only a
 * performance choice: `react-native-maps` snapshots each marker to a bitmap
 * on Android, so an animated frame does not animate — it freezes on whatever
 * frame the snapshot caught. The map's existing "live" affordances are
 * static for exactly this reason (see the `eventMarkerLiveRing` note in
 * `map.tsx`), and rank frames follow the same rule.
 */
export const RankFrameRing = memo(function RankFrameRing({
  box,
  level,
  rankId,
  platinumFrame,
  isPlatinum = false,
  style,
}: RankFrameRingProps) {
  const frame = useMemo(
    () =>
      resolveAvatarFrame({
        level,
        rankId,
        platinumFrame,
        isPlatinum,
        detail: "marker",
        reducedMotion: true,
      }),
    [level, rankId, platinumFrame, isPlatinum]
  );

  // Never animates, so it never needs a clock — a map of 30 markers acquires
  // zero animation loops.
  const parked = useMemo(() => new Animated.Value(0), []);

  if (frame.fromPlatinum) {
    // `ProfileFrame` sizes its own box at size * (1 + 2 * FRAME_MARGIN);
    // invert that so its outer edge lands exactly on `box`.
    return (
      <View pointerEvents="none" style={[styles.ring, { width: box, height: box }, style]}>
        <ProfileFrame
          frame={frame.platinumFrameId}
          isPlatinum={isPlatinum}
          size={box / (1 + FRAME_MARGIN * 2)}
        >
          <View />
        </ProfileFrame>
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[styles.ring, { width: box, height: box }, style]}>
      <RankFrameArt frame={frame} box={box} clock={parked} />
    </View>
  );
});

/**
 * The frame for convoy rosters, chat and the leaderboard. Shape and colour
 * always present; motion simplified and phase-locked across the list.
 */
export function ListAvatarFrame(props: Omit<AvatarFrameProps, "detail">) {
  return <AvatarFrame {...props} detail="list" />;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  mote: {
    position: "absolute",
  },
  ring: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default AvatarFrame;
