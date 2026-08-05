import React, { useMemo } from "react";
import { loadMapbox } from "@/lib/mapboxNative";
import { lineFeature } from "@/lib/mapboxCoords";
import type { LatLng } from "@/lib/polyline";

/**
 * One line on the map — what `<Polyline>` was under `react-native-maps`.
 *
 * Mapbox has no polyline component. A line is a GeoJSON source plus a style
 * layer that draws it, which is two components and a required unique `id` per
 * line where there used to be one component and no id. This wraps that back up
 * so the call sites read the way they did.
 *
 * WHY COLOUR AND OPACITY ARE SEPARATE PROPS
 *   The route lines were written as `strokeColor={alpha(colors.racingRed,
 *   0.22)}`, and `alpha()` returns eight-digit hex (`#RRGGBBAA`). Mapbox's
 *   style-spec colour parser accepts CSS colour forms — `#rgb`, `#rrggbb`,
 *   `rgb()`, `rgba()`, named colours — but **not** eight-digit hex, which it
 *   drops rather than errors on. The casing would have come back fully opaque
 *   and the "what is left to drive is faint" distinction would have vanished
 *   silently. So transparency goes through `lineOpacity`, which is a number,
 *   and the colour stays a plain six-digit hex.
 *
 * `id` must be unique across every source and layer mounted at once; Mapbox
 * silently keeps the first registration when two collide, so a duplicated id
 * shows one line and hides the other.
 */
export interface MapPolylineProps {
  id: string;
  points: LatLng[];
  color: string;
  width: number;
  /** 0–1. Kept off the colour string — see the note above. */
  opacity?: number;
}

export default function MapPolyline({ id, points, color, width, opacity = 1 }: MapPolylineProps) {
  const Mapbox = loadMapbox();

  const shape = useMemo(() => lineFeature(points), [points]);

  // Two points make the shortest drawable line; one is a source Mapbox will
  // accept and draw nothing for, which is just work with no pixels.
  if (!Mapbox || points.length < 2) return null;

  return (
    <Mapbox.ShapeSource id={id} shape={shape}>
      <Mapbox.LineLayer
        id={`${id}-layer`}
        style={{
          lineColor: color,
          lineWidth: width,
          lineOpacity: opacity,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
    </Mapbox.ShapeSource>
  );
}
