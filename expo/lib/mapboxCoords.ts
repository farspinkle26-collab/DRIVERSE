/**
 * Coordinate translation between this app's `{latitude, longitude}` world and
 * Mapbox's `[longitude, latitude]` one.
 *
 * WHY THIS FILE EXISTS AT ALL
 *   `react-native-maps` takes `{latitude, longitude}` objects. `@rnmapbox/maps`
 *   takes GeoJSON positions — `[longitude, latitude]` arrays, longitude FIRST.
 *   Both are two finite numbers in the same ranges, so a swap does not throw,
 *   does not fail a type check once it is inside a `number[]`, and does not
 *   look wrong in a diff. It silently puts Jakarta (-6.2, 106.8) in the Indian
 *   Ocean off Somalia (106.8, -6.2) — and only on a device, only when someone
 *   opens the map.
 *
 *   So the flip happens HERE, once, in functions with names that say which way
 *   they go, and nowhere else. No call site is allowed to write a bare
 *   `[p.longitude, p.latitude]`: that is the line that gets copy-pasted with
 *   the fields the wrong way round. Everything is pure, so all of it is tested
 *   without a renderer — which is the only way any of this gets verified
 *   before it reaches a phone.
 *
 * The other half of the impedance mismatch is zoom. This app stores viewport
 * size as a region `latitudeDelta` (how much world is on screen) and several
 * live rules are written against it — `lib/mapClustering.ts` disables
 * clustering below a delta, the landmark refetch compares distances. Mapbox
 * expresses the same thing as a `zoomLevel`. `zoomForLatitudeDelta` and its
 * inverse keep those existing rules working unchanged rather than forcing a
 * rewrite of every threshold into zoom units.
 */

import type { LatLng } from "@/lib/polyline";

/** A GeoJSON position: `[longitude, latitude]`. Longitude is first. */
export type Position = [number, number];

/** `{latitude, longitude}` → `[longitude, latitude]`. */
export function toPosition(point: LatLng): Position {
  return [point.longitude, point.latitude];
}

/** `[longitude, latitude]` → `{latitude, longitude}`. */
export function fromPosition(position: Position): LatLng {
  return { latitude: position[1], longitude: position[0] };
}

/** Maps a path into GeoJSON positions, preserving order. */
export function toPositions(points: LatLng[]): Position[] {
  return points.map(toPosition);
}

/** Maps GeoJSON positions back into this app's points, preserving order. */
export function fromPositions(positions: Position[]): LatLng[] {
  return positions.map(fromPosition);
}

/**
 * A GeoJSON LineString feature for a path — what `ShapeSource` takes where
 * `react-native-maps` took a `<Polyline coordinates={...} />`.
 *
 * `properties` is passed through so a caller can carry per-feature styling
 * (the speed heatmap's colour per segment) into a data-driven layer style
 * instead of mounting one layer per segment.
 */
export function lineFeature(
  points: LatLng[],
  properties: Record<string, unknown> = {}
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates: toPositions(points) },
  };
}

/**
 * A GeoJSON Point feature for one location — what a `Marker`/`MarkerView`
 * takes where the drawing has to stay inside Mapbox's native render surface
 * instead of an RN overlay view. `TripMapSnapshot` is the reason this exists:
 * `MapView.takeSnap()` captures the map's own rendering (GL surface on
 * Android, the view hierarchy on iOS) but a `MarkerView` is composited
 * outside that surface on Android, so an endpoint drawn as one would be
 * invisible in the exported PNG there. A `ShapeSource`+`CircleLayer` point is
 * part of the map's native rendering on both platforms.
 */
export function pointFeature(
  point: LatLng,
  properties: Record<string, unknown> = {}
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates: toPosition(point) },
  };
}

/** Wraps features into the FeatureCollection a `ShapeSource` expects. */
export function featureCollection<T extends GeoJSON.Geometry>(
  features: GeoJSON.Feature<T>[]
): GeoJSON.FeatureCollection<T> {
  return { type: "FeatureCollection", features };
}

/**
 * The bounding box of a path, in the shape `Camera.fitBounds` wants.
 *
 * Returns `null` for an empty path rather than a degenerate box, because
 * `fitBounds` on a zero-area box zooms to maximum on some styles — a caller
 * with no points wants its default camera, not a street-level view of the
 * null island.
 */
export function boundsForPoints(
  points: LatLng[]
): { ne: Position; sw: Position } | null {
  if (points.length === 0) return null;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }

  // north-east is (maxLng, maxLat); south-west is (minLng, minLat).
  return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}

/**
 * Web-Mercator zoom level for a region's `latitudeDelta`, and back.
 *
 * At zoom z the whole 360° of longitude spans 2^z tiles, so a viewport showing
 * `d` degrees is at `log2(360 / d)`. It is an approximation — true scale varies
 * with latitude and viewport aspect — but it is the same approximation the
 * existing delta thresholds were tuned against, so round-tripping through it
 * keeps `mapClustering`'s behaviour where it was.
 *
 * Clamped to Mapbox's own 0–22 range: a delta of 0 is not a zoom of infinity,
 * it is a caller with no region yet.
 */
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;

export function zoomForLatitudeDelta(latitudeDelta: number): number {
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) return MAX_ZOOM;
  const zoom = Math.log2(360 / latitudeDelta);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function latitudeDeltaForZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 360;
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  return 360 / Math.pow(2, clamped);
}
