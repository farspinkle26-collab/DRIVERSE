/**
 * Driveverse — the recorded route drawn as a speed heatmap, in SVG.
 *
 * The map-less half of the share card's route block. `TripMapSnapshot` paints
 * the same trace over real Mapbox/Google tiles; this one draws it on nothing,
 * and it is what the card shows in three situations:
 *
 *   • the driver chose the "Trace" route style (no map, just the shape),
 *   • the map snapshot has not come back yet — a trace is a better first
 *     frame than an empty box that pops,
 *   • the snapshot failed (no tiles, no network, an emulator without Play
 *     services). A share card must never render a hole.
 *
 * Colour is `lib/speedTrace.ts` — see that file for where the per-point speeds
 * come from and why the ramp ends on `racingRed`. Geometry is the same
 * aspect-preserving fit `RoutePreview` uses; this component exists alongside
 * it rather than replacing it because the feed preview wants one cheap flat
 * path and the share card wants a dozen coloured ones with end caps.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import type { LatLng } from "@/lib/polyline";
import {
  SPEED_HEAT_FLAT,
  SPEED_HEAT_STOPS,
  heatSegments,
  type SpeedDomain,
} from "@/lib/speedTrace";
import { alpha, colors, fontFamily, spacing } from "@/constants/theme";
import { convertSpeed, type SpeedUnit } from "@/lib/speedUnits";

export interface SpeedTraceProps {
  points: LatLng[];
  /** One km/h reading per point. Shorter is tolerated; missing reads as 0. */
  speeds: number[];
  domain: SpeedDomain;
  width: number;
  height: number;
  strokeWidth?: number;
  /** Draw one flat `racingRed` line — used when there is no usable profile. */
  flat?: boolean;
  /** Inset from the box edge, so the end caps are never clipped. */
  padding?: number;
}

interface Projected {
  x: number;
  y: number;
}

export default function SpeedTrace({
  points,
  speeds,
  domain,
  width,
  height,
  strokeWidth = 4,
  flat = false,
  padding,
}: SpeedTraceProps) {
  const pad = padding ?? strokeWidth * 2 + spacing.spacingSm;

  const { segments, start, end } = useMemo(() => {
    if (points.length < 2) {
      return { segments: [], start: null as Projected | null, end: null as Projected | null };
    }

    let minLat = points[0].latitude;
    let maxLat = points[0].latitude;
    let minLng = points[0].longitude;
    let maxLng = points[0].longitude;
    for (const p of points) {
      minLat = Math.min(minLat, p.latitude);
      maxLat = Math.max(maxLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLng = Math.max(maxLng, p.longitude);
    }

    const spanLat = Math.max(maxLat - minLat, 1e-6);
    const spanLng = Math.max(maxLng - minLng, 1e-6);
    // Preserve aspect ratio — a stretched route is a different route.
    const scale = Math.min((width - pad * 2) / spanLng, (height - pad * 2) / spanLat);
    const offsetX = (width - spanLng * scale) / 2;
    const offsetY = (height - spanLat * scale) / 2;

    const projected: Projected[] = points.map((p) => ({
      x: offsetX + (p.longitude - minLng) * scale,
      // Invert Y so north is up.
      y: offsetY + (maxLat - p.latitude) * scale,
    }));

    const runs = flat
      ? [{ points: projected, color: SPEED_HEAT_FLAT, speedKmh: 0 }]
      : heatSegments(projected, speeds, domain);

    return {
      segments: runs.map((run) => ({
        d: run.points
          .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
          .join(" "),
        color: run.color,
      })),
      start: projected[0],
      end: projected[projected.length - 1],
    };
  }, [points, speeds, domain, width, height, pad, flat]);

  return (
    <Svg width={width} height={height}>
      {/* Soft underlay, drawn as its own full pass under every coloured run —
          not interleaved with them, or each run's glow would sit on top of the
          previous run's line and wash the trace out from the second segment on. */}
      {segments.map((seg, i) => (
        <Path
          key={`glow${i}`}
          d={seg.d}
          stroke={alpha(colors.racingRed, 0.18)}
          strokeWidth={strokeWidth * 2.4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {segments.map((seg, i) => (
        <Path
          key={`seg${i}`}
          d={seg.d}
          stroke={seg.color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Start is hollow, finish is solid — direction without a second hue,
          the same convention RouteLine and RoutePreview use. */}
      {start ? (
        <Circle
          cx={start.x}
          cy={start.y}
          r={strokeWidth * 1.4}
          fill={colors.voidBlack}
          stroke={colors.textSecondary}
          strokeWidth={2}
        />
      ) : null}
      {end ? (
        <>
          <Circle
            cx={end.x}
            cy={end.y}
            r={strokeWidth * 2.2}
            fill={alpha(colors.racingRed, 0.25)}
          />
          <Circle cx={end.x} cy={end.y} r={strokeWidth * 1.2} fill={colors.racingRed} />
        </>
      ) : null}
    </Svg>
  );
}

/* ------------------------------------------------------------------ *
 * Legend
 * ------------------------------------------------------------------ */

export interface SpeedLegendProps {
  /** Top of the ramp, km/h — the number the reddest stretch reached. */
  topSpeedKmh: number;
  width: number;
  /** The viewer's own regional unit (`speedUnitForCountry`). Defaults to km/h. */
  unit?: SpeedUnit;
}

/**
 * The key for the heatmap: a 16pt gradient bar with "0" at one end and the
 * drive's top speed at the other. Without it the colours are decoration; with
 * it they are data, which is the whole difference between this card and a
 * template. The bare number has no unit label next to it by design (it reads
 * as a key, not a readout) — which is exactly why it has to be converted
 * before it gets here rather than trusted to carry its own label.
 */
export function SpeedLegend({ topSpeedKmh, width, unit = "kmh" }: SpeedLegendProps) {
  const barWidth = Math.max(0, width - 96);
  return (
    <View style={legendStyles.row}>
      <Text style={legendStyles.label}>SPEED</Text>
      <Svg width={barWidth} height={6}>
        <Defs>
          <LinearGradient id="speedLegend" x1="0" y1="0" x2="1" y2="0">
            {SPEED_HEAT_STOPS.map((stop, i) => (
              <Stop
                key={stop}
                offset={`${(i / (SPEED_HEAT_STOPS.length - 1)) * 100}%`}
                stopColor={stop}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={barWidth} height={6} fill="url(#speedLegend)" />
      </Svg>
      <Text style={legendStyles.value}>{Math.round(convertSpeed(topSpeedKmh, unit))}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  label: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },
  value: {
    fontFamily: fontFamily.dataMedium,
    fontSize: 10,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
});
