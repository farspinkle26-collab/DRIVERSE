import { LatLng } from "@/lib/polyline";

/** [longitude, latitude] tuple — the coordinate order Mapbox/GeoJSON expects. */
export type LngLat = [number, number];

export function toLngLat(p: LatLng): LngLat {
  return [p.longitude, p.latitude];
}

/** A GeoJSON LineString Feature for a path, for use with Mapbox's <ShapeSource>. */
export function lineStringFeature(points: LatLng[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map(toLngLat),
    },
  };
}
