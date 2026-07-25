import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { decodePolyline } from "@/lib/polyline";
import { borderWidth, colors, radius } from "@/constants/theme";

interface RoutePreviewProps {
  polyline: string;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Lightweight static map-less preview of a recorded route.
 * Normalizes the decoded polyline into the box and draws it as an SVG
 * path — cheap enough to render many of them in a scrolling feed.
 *
 * The trace is flat `racingRed`, matching the live route on the map screen
 * and the trip-card trace in `components/RouteLine.tsx`. It was previously
 * an orange→pink gradient with a teal start dot and a pink end dot — three
 * hues outside the palette, and the only place a recorded route did not
 * look like a recorded route. Start is hollow, finish is solid: direction
 * without a second colour, the same convention RouteLine uses.
 */
function RoutePreviewBase({
  polyline,
  width = 300,
  height = 130,
  color = colors.racingRed,
  strokeWidth = 3,
}: RoutePreviewProps) {
  const { d, startPt, endPt } = useMemo(() => {
    const pts = polyline ? decodePolyline(polyline) : [];
    if (pts.length < 2) return { d: "", startPt: null, endPt: null };

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

    const pad = 12;
    const spanLat = Math.max(maxLat - minLat, 1e-6);
    const spanLng = Math.max(maxLng - minLng, 1e-6);
    // Preserve aspect ratio so the route isn't stretched
    const scale = Math.min((width - pad * 2) / spanLng, (height - pad * 2) / spanLat);
    const offsetX = (width - spanLng * scale) / 2;
    const offsetY = (height - spanLat * scale) / 2;

    const project = (lat: number, lng: number) => ({
      x: offsetX + (lng - minLng) * scale,
      // invert Y so north is up
      y: offsetY + (maxLat - lat) * scale,
    });

    const projected = pts.map((p) => project(p.latitude, p.longitude));
    const path = projected
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(" ");

    return {
      d: path,
      startPt: projected[0],
      endPt: projected[projected.length - 1],
    };
  }, [polyline, width, height, strokeWidth]);

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        {d ? (
          <>
            <Path
              d={d}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {startPt && (
              <Circle
                cx={startPt.x}
                cy={startPt.y}
                r={5}
                fill={colors.carbonSurface}
                stroke={colors.textSecondary}
                strokeWidth={borderWidth.emphasis}
              />
            )}
            {endPt && <Circle cx={endPt.x} cy={endPt.y} r={5} fill={colors.racingRed} />}
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Utility surface: the frame around a trace is a plain rectangle.
  wrap: {
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
});

export default React.memo(RoutePreviewBase);
