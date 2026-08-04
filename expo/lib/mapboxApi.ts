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

export interface ReverseGeocodedPlace {
  /** The feature's own short name — "Kopi Nako", "Jalan Bintaro Utama". */
  name: string | null;
  /** The full comma-separated address Mapbox returns as `place_name`. */
  address: string | null;
}

/**
 * Reverse geocode for a *label*, not an address.
 *
 * {@link reverseGeocode} returns `place_name`, the whole postal string, which
 * is the right answer for an address field and the wrong one for the line
 * under a share-card title. Mapbox also gives each feature a `text` — the
 * name by itself — and that is what a driver would call the place, so it is
 * returned separately here with the address kept as a fallback.
 *
 * `types` is ordered POI-first: a pin dropped on a café should come back as
 * the café, and only fall through to the street and the neighbourhood when
 * it was dropped on neither.
 *
 * Never throws and never rejects: a missing token, an offline device or a
 * Mapbox error all resolve to `null`, because the only consequence of no
 * name is that the card says "Point B".
 */
export async function reverseGeocodePlace(
  latitude: number,
  longitude: number,
  language: string = "id"
): Promise<ReverseGeocodedPlace | null> {
  if (!MAPBOX_ACCESS_TOKEN) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json` +
    `?types=poi,address,neighborhood,locality,place&limit=1&language=${language}` +
    `&access_token=${MAPBOX_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    return {
      name: typeof feature.text === "string" ? feature.text : null,
      address: typeof feature.place_name === "string" ? feature.place_name : null,
    };
  } catch (error) {
    console.error("Mapbox reverse geocode (place) error:", error);
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

export interface SearchPlacesOptions {
  /**
   * Mapbox `types` filter, e.g. `"poi"`. Left unset the geocoder answers
   * with every feature class it has — country, region, place, locality,
   * address — which is right for a driver typing a destination and wrong
   * for anything trying to use this as a POI lookup. See
   * `maxDistanceMeters` for why the two go together.
   */
  types?: string;
  /** `limit` passed straight through. Mapbox caps this at 10. */
  limit?: number;
  /**
   * Drop results further than this from `proximity`.
   *
   * The geocoder is a **name** matcher, not a category search: `proximity`
   * only re-ranks, it does not restrict, and a fuzzy name hit always beats
   * an empty answer. Searching "parking" near Jakarta is how the map ended
   * up drawing *Paring Raya* — a street 724 km away whose name is one
   * letter off. Nothing but a hard radius keeps that off a map of what is
   * near you.
   */
  maxDistanceMeters?: number;
}

/** Metres between two coordinates (equirectangular; fine at city scale). */
function approxMetresBetween(a: RoutePoint, b: RoutePoint): number {
  const R = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const meanLat = (((b.latitude + a.latitude) / 2) * Math.PI) / 180;
  const x = dLng * Math.cos(meanLat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

export async function searchPlaces(
  query: string,
  proximity?: RoutePoint | null,
  language: string = "id",
  options: SearchPlacesOptions = {}
): Promise<PlaceSuggestion[]> {
  if (!MAPBOX_ACCESS_TOKEN || !query.trim()) return [];

  const params = new URLSearchParams({
    access_token: MAPBOX_ACCESS_TOKEN,
    autocomplete: "true",
    country: "id",
    language,
    limit: String(options.limit ?? 10),
  });
  if (options.types) {
    params.set("types", options.types);
  }
  if (proximity) {
    params.set("proximity", `${proximity.longitude},${proximity.latitude}`);
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.features) return [];

    const suggestions: PlaceSuggestion[] = data.features
      .filter((feature: any) => Array.isArray(feature?.center) && feature.center.length === 2)
      .map((feature: any) => ({
        id: feature.id,
        name: feature.text,
        fullAddress: feature.place_name,
        latitude: feature.center[1],
        longitude: feature.center[0],
        category: feature.place_type?.[0],
      }));

    if (proximity && options.maxDistanceMeters != null) {
      const limit = options.maxDistanceMeters;
      return suggestions.filter((s) => approxMetresBetween(proximity, s) <= limit);
    }
    return suggestions;
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
  const token = MAPBOX_ACCESS_TOKEN;
  if (!token) return [];

  const requests = queryTerms.map(async (term) => {
    const params = new URLSearchParams({
      access_token: token,
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
