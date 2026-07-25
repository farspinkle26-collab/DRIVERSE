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
