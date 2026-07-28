// Client for the /places-nearby and /places-submit Supabase edge functions.
// Backend contract: { id, name, lat, lng, category, tags, source: "osm" | "user" }
import { supabase } from "@/lib/supabase";
import { mapWithConcurrency } from "@/lib/concurrency";
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

const GENERIC_FAILURE = "Nearby places didn't load — the request to the places service failed.";

/**
 * How many category requests may be in flight at once.
 *
 * Each one becomes an edge-function invocation which, on a cache miss, makes
 * its own Overpass query — and every one of those leaves Supabase from the
 * same egress IP. `overpass-api.de` hands out a small number of slots per IP
 * (two, by default) and answers everything over that with **429 Too Many
 * Requests**, immediately. Firing all nine ticked categories at once
 * therefore did not fetch nine categories faster; it fetched two or three and
 * turned the rest into `Edge Function returned a non-2xx status code`, which
 * is exactly the error the map was showing.
 *
 * Three is one above Overpass's slot count, so a request is queued and ready
 * the moment a slot frees, without piling up rejections.
 */
const MAX_CONCURRENT_CATEGORY_REQUESTS = 3;

/** Overpass rejections are transient by definition — one retry is worth it. */
const RETRY_DELAY_MS = 900;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * supabase-js collapses every non-2xx into "Edge Function returned a non-2xx
 * status code" and puts the actual response on `error.context`. Reading the
 * status back is the difference between a log line that says something failed
 * and one that says *what* failed — 429 (Overpass rate limit), 502 (Overpass
 * error), 400 (bad category), 404 (function not deployed) all need different
 * fixes and all look identical without this.
 */
async function describeInvokeError(error: unknown): Promise<{ status: number | null; detail: string }> {
  const context = (error as { context?: unknown })?.context as Response | undefined;
  const status = typeof context?.status === "number" ? context.status : null;
  let detail = (error as Error)?.message ?? String(error);
  if (context && typeof context.text === "function") {
    try {
      const body = await context.clone().text();
      if (body) detail = `${detail} — ${body.slice(0, 300)}`;
    } catch {
      // Body already consumed or unreadable; the status alone still helps.
    }
  }
  return { status, detail };
}

/** One request. Returns the parsed body, or the HTTP status that stopped it. */
async function requestNearby(
  params: URLSearchParams
): Promise<{ places: NormalizedPlace[]; error: string | null; status: number | null }> {
  const { data, error } = await supabase.functions.invoke(`places-nearby?${params.toString()}`, {
    method: "GET",
  });

  if (error) {
    const { status, detail } = await describeInvokeError(error);
    console.error(
      `[placesApi] places-nearby ${params.get("category")} failed` +
        `${status != null ? ` (HTTP ${status})` : ""}: ${detail}`
    );
    return { places: [], error: GENERIC_FAILURE, status };
  }
  if (data?.error) {
    return { places: data.places ?? [], error: data.error, status: 200 };
  }
  return { places: data?.places ?? [], error: null, status: 200 };
}

/** GET /places-nearby — merged OSM + approved community places for one category. */
export async function fetchNearbyPlaces({
  lat,
  lng,
  radius = 2000,
  category,
}: FetchNearbyPlacesParams): Promise<FetchNearbyPlacesResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(radius),
    category,
  });

  try {
    const first = await requestNearby(params);
    if (!first.error) return { places: first.places, error: null };

    // 4xx other than 429 means the request itself is wrong — a bad category,
    // a function that isn't deployed. Retrying that just doubles the failure.
    const retryable = first.status == null || first.status === 429 || first.status >= 500;
    if (!retryable) return { places: first.places, error: first.error };

    await sleep(RETRY_DELAY_MS);
    const second = await requestNearby(params);
    return { places: second.places, error: second.error };
  } catch (err) {
    console.error("[placesApi] fetchNearbyPlaces threw:", err);
    return { places: [], error: GENERIC_FAILURE };
  }
}

export interface FetchManyResult {
  places: NormalizedPlace[];
  /** Categories whose request failed. Empty on a clean fetch. */
  failed: PlaceCategory[];
}

/**
 * Fetches several categories at once, at most
 * `MAX_CONCURRENT_CATEGORY_REQUESTS` at a time.
 *
 * One request per category rather than one request for all of them, because
 * `/places-nearby` caches per `(category, ~1km bucket)` — a combined
 * endpoint would either lose that granularity or re-fetch categories the
 * cache already holds.
 *
 * They used to run *all* in parallel, on the reasoning that the wall-clock
 * cost is then one round trip however many boxes are ticked. That reasoning
 * held for the four categories the layer shipped with and broke at nine: the
 * bottleneck is not this client, it is Overpass's per-IP slot limit, and past
 * two or three simultaneous queries the extra ones do not queue, they are
 * refused. Windowing them costs a second or two on a cold fetch and is the
 * difference between nine categories loading and three.
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
  const results = await mapWithConcurrency(
    categories,
    MAX_CONCURRENT_CATEGORY_REQUESTS,
    async (category) => ({
      category,
      result: await fetchNearbyPlaces({ lat, lng, radius, category }),
    })
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
