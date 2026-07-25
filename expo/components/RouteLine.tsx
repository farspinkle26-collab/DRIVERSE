/**
 * Driveverse — the recorded route, drawn as a line.
 *
 * The single motion moment on the Drive Hub: when a trip card mounts, its
 * route draws itself from start to finish, then stops. Nothing loops,
 * nothing bounces, nothing reacts to hover. The intent is a plotter laying
 * down a trace, not a UI flourish — so it runs once, at `duration.slow`,
 * on a linear curve.
 *
 * With the OS "reduce motion" setting on, the finished line is painted
 * immediately: the end state, not a faster animation.
 *
 * This is deliberately not a map. A tile-backed preview per card costs a
 * map instance per row and drags in a provider's colour palette (green
 * parks, blue water) that the six-value palette has no room for. The trace
 * alone is the information a trip log actually carries.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Polyline } from "react-native-svg";
import { decodePolyline, type LatLng } from "@/lib/polyline";
import {
  alpha,
  borderWidth,
  colors,
  duration as durationTokens,
  spacing,
  textStyle,
} from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface RouteLineProps {
  /** Encoded polyline from `trips.route_polyline`. */
  polyline?: string | null;
  width: number;
  height: number;
  /** Straight-line fallback framing when no trace was recorded. */
  origin?: { lat?: number | null; lng?: number | null };
  destination?: { lat?: number | null; lng?: number | null };
  /** Suppress the draw-in (used for cards that are already on screen). */
  animate?: boolean;
}

interface Projected {
  d: string;
  points: { x: number; y: number }[];
  length: number;
}

/** Fit a lat/lng path into the box, north up, aspect ratio preserved. */
function project(pts: LatLng[], width: number, height: number, pad: number): Projected {
  let minLat = pts[0].latitude;
  let maxLat = pts[0].latitude;
  let minLng = pts[0].longitude;
  let maxLng = pts[0].longitude;
  for (const p of pts) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }

  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max(maxLng - minLng, 1e-6);
  const scale = Math.min((width - pad * 2) / spanLng, (height - pad * 2) / spanLat);
  const offsetX = (width - spanLng * scale) / 2;
  const offsetY = (height - spanLat * scale) / 2;

  const points = pts.map((p) => ({
    x: offsetX + (p.longitude - minLng) * scale,
    y: offsetY + (maxLat - p.latitude) * scale,
  }));

  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }

  const d = points
    .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(" ");

  return { d, points, length };
}

export function RouteLine({
  polyline,
  width,
  height,
  origin,
  destination,
  animate = true,
}: RouteLineProps) {
  const reducedMotion = useReducedMotion();

  const path = useMemo(() => {
    const decoded = polyline ? decodePolyline(polyline) : [];
    if (decoded.length > 1) return project(decoded, width, height, spacing.spacingLg);

    // No recorded trace: fall back to the origin/destination pair so the
    // card still shows the shape of the trip, at reduced emphasis.
    const ends: LatLng[] = [];
    if (origin?.lat != null && origin?.lng != null && (origin.lat !== 0 || origin.lng !== 0)) {
      ends.push({ latitude: origin.lat, longitude: origin.lng });
    }
    if (
      destination?.lat != null &&
      destination?.lng != null &&
      (destination.lat !== 0 || destination.lng !== 0)
    ) {
      ends.push({ latitude: destination.lat, longitude: destination.lng });
    }
    if (ends.length > 1) return project(ends, width, height, spacing.spacingXl);
    return null;
  }, [polyline, width, height, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  // strokeDashoffset is an SVG attribute, not a transform, so this cannot
  // run on the native driver. It is one short property animation per card;
  // the cost is a handful of JS-thread frames on mount and nothing after.
  const progress = useRef(new Animated.Value(0)).current;
  const shouldAnimate = animate && !reducedMotion && !!path;

  useEffect(() => {
    if (!path) return;
    if (!shouldAnimate) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: durationTokens.slow,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [path, shouldAnimate, progress]);

  if (!path) {
    return (
      <View style={[styles.frame, { width, height }]}>
        <Text style={styles.emptyTrace}>No route trace recorded</Text>
      </View>
    );
  }

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [path.length, 0],
  });
  const start = path.points[0];
  const end = path.points[path.points.length - 1];

  return (
    <View style={[styles.frame, { width, height }]}>
      <Svg width={width} height={height}>
        {/* Grid: two hairlines, enough to read the trace as a plot rather
            than a doodle. Any denser and it competes with the route. */}
        <Polyline
          points={`0,${height / 2} ${width},${height / 2}`}
          stroke={colors.hairline}
          strokeWidth={borderWidth.hairline}
        />
        <Polyline
          points={`${width / 2},0 ${width / 2},${height}`}
          stroke={colors.hairline}
          strokeWidth={borderWidth.hairline}
        />

        {/* The full route at low opacity, so the card never looks empty
            while the trace draws in. */}
        <Path
          d={path.d}
          stroke={alpha(colors.racingRed, 0.18)}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <AnimatedPath
          d={path.d}
          stroke={colors.racingRed}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${path.length}, ${path.length}`}
          strokeDashoffset={dashOffset as unknown as number}
        />

        {/* Start is hollow, finish is solid — direction without a second
            hue. */}
        <Circle
          cx={start.x}
          cy={start.y}
          r={3}
          fill={colors.carbonSurface}
          stroke={colors.textSecondary}
          strokeWidth={borderWidth.hairline}
        />
        <Circle cx={end.x} cy={end.y} r={3} fill={colors.racingRed} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyTrace: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
});

export default React.memo(RouteLine);
