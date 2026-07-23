import type { NormalizedPlace } from "./overpass.ts";

const DEDUPE_RADIUS_METERS = 30;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Merges OSM results with user-submitted places, preferring the OSM entry
 * whenever a user-submitted place sits within DEDUPE_RADIUS_METERS of one
 * (same spot, avoid showing the same POI twice).
 */
export function mergePlaces(osmPlaces: NormalizedPlace[], userPlaces: NormalizedPlace[]): NormalizedPlace[] {
  const deduped = userPlaces.filter(
    (userPlace) =>
      !osmPlaces.some((osmPlace) => haversineMeters(userPlace.lat, userPlace.lng, osmPlace.lat, osmPlace.lng) <= DEDUPE_RADIUS_METERS)
  );
  return [...osmPlaces, ...deduped];
}
