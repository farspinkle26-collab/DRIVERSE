// Client for the /places-nearby and /places-submit Supabase edge functions.
// Backend contract: { id, name, lat, lng, category, tags, source }
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
  /**
   * Where the place came from.
   *
   * `osm` is not dead: the POI provider changed to Mapbox, but cached rows and
   * saved places written before that swap still carry it, so anything reading
   * this must treat "not `user`" as "from the provider" rather than testing for
   * one provider name.
   */
  source: "mapbox" | "osm" | "user";
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
 * Each one becomes an edge-function invocation. The cap is about the phone and
 * the function pool, not the POI provider: nine simultaneous invocations on a
 * mobile connection queue at the socket anyway, and windowing them keeps the
 * first categories painting while the rest arrive.
 *
 * This used to be justified by Overpass's two-slot-per-IP limit, back when the
 * edge function queried Overpass directly. That is no longer the constraint —
 * see `supabase/functions/_shared/placesSource.ts` for why the source changed —
 * but a bound is still the right shape, so the number stays.
 */
const MAX_CONCURRENT_CATEGORY_REQUESTS = 3;

/**
 * supabase-js collapses every non-2xx into "Edge Function returned a non-2xx
 * status code" and puts the actual response on `error.context`. Reading the
 * status back is the difference between a log line that says something failed
 * and one that says *what* failed — 429 (provider rate limit), 502 (provider
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
): Promise<{ places: NormalizedPlace[]; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(`places-nearby?${params.toString()}`, {
    method: "GET",
  });

  if (error) {
    const { status, detail } = await describeInvokeError(error);
    console.error(
      `[placesApi] places-nearby ${params.get("category")} failed` +
        `${status != null ? ` (HTTP ${status})` : ""}: ${detail}`
    );
    return { places: [], error: GENERIC_FAILURE };
  }
  if (data?.error) {
    return { places: data.places ?? [], error: data.error };
  }
  return { places: data?.places ?? [], error: null };
}

/** GET /places-nearby — merged provider + approved community places for one category. */
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

  // NO RETRY HERE — ON PURPOSE.
  //
  // This used to retry any 5xx after 900ms. The edge function, meanwhile, was
  // already retrying the POI provider several times across two endpoints before
  // it ever returned that 5xx. So one ticked category cost up to eight upstream
  // requests, nine ticked categories cost seventy-two, and every one of them
  // left Supabase from the same egress IP — into a provider that was refusing
  // traffic *for making too many concurrent requests*. The retry was not
  // recovering from the rate limit, it was feeding it, and it doubled the error
  // log into the bargain (two `console.error`s per category per pan; that is
  // where "Log 84 of 84" after a few pans came from).
  //
  // Retrying belongs at exactly one layer, and that layer is the one nearest
  // the provider, where it can see the real status and back off per endpoint.
  // Here, a failure is reported once and the driver can pan to try again.
  try {
    const { places, error } = await requestNearby(params);
    return { places, error };
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
 * held for the four categories the layer shipped with and broke at nine, when
 * the edge function still queried Overpass and its per-IP slot limit refused
 * everything past the second concurrent query. The provider swap removed that
 * particular ceiling, but windowing stays: it costs a second or two on a cold
 * fetch and it keeps nine simultaneous invocations off a phone's radio.
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
