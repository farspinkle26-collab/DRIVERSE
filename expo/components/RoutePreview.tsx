import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { decodePolyline } from "@/lib/polyline";

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
 */
function RoutePreviewBase({
  polyline,
  width = 300,
  height = 130,
  color = "#FF6B35",
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
        <Defs>
          <SvgGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor="#FF3B6F" stopOpacity="1" />
          </SvgGradient>
        </Defs>
        {d ? (
          <>
            <Path
              d={d}
              stroke="url(#routeGrad)"
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {startPt && (
              <Circle cx={startPt.x} cy={startPt.y} r={5} fill="#00D4AA" stroke="#0A0A0F" strokeWidth={2} />
            )}
            {endPt && (
              <Circle cx={endPt.x} cy={endPt.y} r={5} fill="#FF3B6F" stroke="#0A0A0F" strokeWidth={2} />
            )}
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#12121C",
    borderRadius: 14,
    overflow: "hidden",
  },
});

export default React.memo(RoutePreviewBase);
