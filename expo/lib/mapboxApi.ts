// Mapbox REST API helpers (Directions, Geocoding) used to replace the
// equivalent Google Maps REST APIs across the app.
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface DirectionsResult {
  coordinates: RoutePoint[];
  distanceKm: number;
  durationMin: number;
}

export async function getDirections(
  origin: RoutePoint,
  destination: RoutePoint,
  language: string = "id"
): Promise<DirectionsResult | null> {
  if (!MAPBOX_ACCESS_TOKEN) return null;

  const coordsPath = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsPath}` +
    `?geometries=geojson&overview=full&language=${language}&access_token=${MAPBOX_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      return null;
    }

    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
        latitude: lat,
        longitude: lng,
      })),
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    };
  } catch (error) {
    console.error("Mapbox directions error:", error);
    return null;
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  language: string = "id"
): Promise<string | null> {
  if (!MAPBOX_ACCESS_TOKEN) return null;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json` +
    `?types=address,poi,place&language=${language}&access_token=${MAPBOX_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.features?.[0]?.place_name ?? null;
  } catch (error) {
    console.error("Mapbox reverse geocode error:", error);
    return null;
  }
}

export interface DirectionsStep {
  instruction: string;
  street: string;
  maneuverType: string;
  maneuverModifier?: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface DetailedDirectionsResult {
  coordinates: RoutePoint[];
  distanceMeters: number;
  durationSeconds: number;
  steps: DirectionsStep[];
}

/** Like getDirections, but also returns turn-by-turn steps and raw meters/seconds. */
export async function getDirectionsWithSteps(
  origin: RoutePoint,
  destination: RoutePoint,
  language: string = "id"
): Promise<DetailedDirectionsResult | null> {
  if (!MAPBOX_ACCESS_TOKEN) return null;

  const coordsPath = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsPath}` +
    `?geometries=geojson&overview=full&steps=true&language=${language}&access_token=${MAPBOX_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
        latitude: lat,
        longitude: lng,
      })),
      distanceMeters: leg.distance,
      durationSeconds: leg.duration,
      steps: (leg.steps ?? []).map((step: any) => ({
        instruction: step.maneuver?.instruction ?? "",
        street: step.name ?? "",
        maneuverType: step.maneuver?.type ?? "straight",
        maneuverModifier: step.maneuver?.modifier,
        distanceMeters: step.distance ?? 0,
        durationSeconds: step.duration ?? 0,
      })),
    };
  } catch (error) {
    console.error("Mapbox directions error:", error);
    return null;
  }
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  category?: string;
}

export async function searchPlaces(
  query: string,
  proximity?: RoutePoint | null,
  language: string = "id"
): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_ACCESS_TOKEN || !query.trim()) return [];

  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    autocomplete: "true",
    country: "id",
    language,
    limit: "10",
  });
  if (proximity) {
    params.set("proximity", `${proximity.longitude},${proximity.latitude}`);
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.features) return [];

    return data.features.map((feature: any) => ({
      id: feature.id,
      name: feature.text,
      fullAddress: feature.place_name,
      latitude: feature.center[1],
      longitude: feature.center[0],
      category: feature.place_type?.[0],
    }));
  } catch (error) {
    console.error("Mapbox search error:", error);
    return [];
  }
}

export interface NearbyCandidate {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
}

/**
 * Approximates Google's Places "Nearby Search" using the Mapbox Geocoding API:
 * runs one forward-geocoding lookup per query term (biased toward `proximity`)
 * and merges/dedupes the results. Unlike Google Places, Mapbox's Geocoding API
 * doesn't return ratings or open-now status.
 */
export async function searchNearby(
  queryTerms: string[],
  proximity: RoutePoint,
  language: string = "id"
): Promise<NearbyCandidate[]> {
  if (!MAPBOX_ACCESS_TOKEN) return [];

  const requests = queryTerms.map(async (term) => {
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      language,
      limit: "10",
      types: "poi",
      proximity: `${proximity.longitude},${proximity.latitude}`,
    });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(term)}.json?${params.toString()}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      return (data.features ?? []) as any[];
    } catch (error) {
      console.error("Mapbox nearby search error:", error);
      return [];
    }
  });

  const results = await Promise.all(requests);
  const seen = new Set<string>();
  const merged: NearbyCandidate[] = [];

  results.flat().forEach((feature) => {
    if (seen.has(feature.id)) return;
    seen.add(feature.id);
    merged.push({
      id: feature.id,
      name: feature.text,
      address: feature.place_name,
      latitude: feature.center[1],
      longitude: feature.center[0],
    });
  });

  return merged;
}
