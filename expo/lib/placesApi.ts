// Client for the /places-nearby and /places-submit Supabase edge functions.
// Backend contract: { id, name, lat, lng, category, tags, source: "osm" | "user" }
import { supabase } from "@/lib/supabase";
import type { PlaceCategory } from "@/constants/placesCategories";

export interface NormalizedPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  tags: Record<string, string>;
  source: "osm" | "user";
}

export interface FetchNearbyPlacesParams {
  lat: number;
  lng: number;
  radius?: number;
  category: PlaceCategory;
}

export interface FetchNearbyPlacesResult {
  places: NormalizedPlace[];
  error: string | null;
}

/** GET /places-nearby — merged OSM + approved community places for one category. */
export async function fetchNearbyPlaces({
  lat,
  lng,
  radius = 2000,
  category,
}: FetchNearbyPlacesParams): Promise<FetchNearbyPlacesResult> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radius),
      category,
    });
    const { data, error } = await supabase.functions.invoke(`places-nearby?${params.toString()}`, {
      method: "GET",
    });

    if (error) {
      console.error("[placesApi] fetchNearbyPlaces failed:", error);
      return { places: [], error: "Nearby places didn't load — the request to the places service failed." };
    }
    if (data?.error) {
      return { places: data.places ?? [], error: data.error };
    }
    return { places: data?.places ?? [], error: null };
  } catch (err) {
    console.error("[placesApi] fetchNearbyPlaces threw:", err);
    return { places: [], error: "Nearby places didn't load — the request to the places service failed." };
  }
}

export interface FetchManyResult {
  places: NormalizedPlace[];
  /** Categories whose request failed. Empty on a clean fetch. */
  failed: PlaceCategory[];
}

/**
 * Fetches several categories at once.
 *
 * One request per category rather than one request for all of them, because
 * `/places-nearby` caches per `(category, ~1km bucket)` — a combined
 * endpoint would either lose that granularity or re-fetch categories the
 * cache already holds. They run in parallel, so the wall-clock cost is one
 * round trip regardless of how many boxes are ticked.
 *
 * A failure in one category does not fail the others: the driver gets the
 * eight layers that loaded plus a note about the one that did not, which is
 * strictly better than an empty map. Callers get the failed ids back so they
 * can say which.
 */
export async function fetchNearbyPlacesMany({
  lat,
  lng,
  radius = 2000,
  categories,
}: {
  lat: number;
  lng: number;
  radius?: number;
  categories: PlaceCategory[];
}): Promise<FetchManyResult> {
  const results = await Promise.all(
    categories.map(async (category) => ({
      category,
      result: await fetchNearbyPlaces({ lat, lng, radius, category }),
    }))
  );

  const places: NormalizedPlace[] = [];
  const failed: PlaceCategory[] = [];
  for (const { category, result } of results) {
    places.push(...result.places);
    if (result.error) failed.push(category);
  }
  return { places, failed };
}

export interface SubmitPlaceInput {
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  notes?: string;
  photoUrl?: string;
}

/** POST /places-submit — authenticated community place submission. */
export async function submitPlace(input: SubmitPlaceInput): Promise<{ place: NormalizedPlace | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("places-submit", {
      method: "POST",
      body: input,
    });

    if (error) {
      console.error("[placesApi] submitPlace failed:", error);
      return { place: null, error: "The submission didn't reach the server." };
    }
    if (data?.error) {
      return { place: null, error: data.error };
    }
    return { place: data?.place ?? null, error: null };
  } catch (err) {
    console.error("[placesApi] submitPlace threw:", err);
    return { place: null, error: "The submission didn't reach the server." };
  }
}
