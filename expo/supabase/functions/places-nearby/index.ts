// GET /places-nearby?lat=&lng=&radius=&category=
//
// Returns merged provider (cached) + approved community places. Contract stays
// stable regardless of where POIs come from — swap the provider by editing
// _shared/placesSource.ts only.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fetchNearby,
  isPlaceCategory,
  PlacesSourceError,
  PLACE_CATEGORIES,
  type NormalizedPlace,
} from "../_shared/placesSource.ts";
import { getCachedEntry, setCached } from "../_shared/cache.ts";
import { mergePlaces } from "../_shared/merge.ts";

const DEFAULT_RADIUS_METERS = 2000;
const MAX_RADIUS_METERS = 5000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  // Support both real GET query params and supabase-js .invoke() POST bodies.
  const params: Record<string, string> =
    req.method === "POST" ? await req.json().catch(() => ({})) : Object.fromEntries(url.searchParams);

  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const category = String(params.category ?? "");
  const requestedRadius = Number(params.radius ?? DEFAULT_RADIUS_METERS);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: "lat and lng are required numeric query parameters" }, 400);
  }
  if (!isPlaceCategory(category)) {
    return jsonResponse({ error: `category must be one of ${PLACE_CATEGORIES.join(", ")}` }, 400);
  }
  const radius = Math.min(Number.isFinite(requestedRadius) ? requestedRadius : DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Cache-first, and — this is the part that matters — cache-last too.
  //
  // The previous version returned 502 the moment the POI provider failed, even
  // when it was holding a perfectly good copy of this exact bucket from an hour
  // earlier. That turned every provider hiccup into an empty map and a red
  // error in the driver's face. POIs do not move: a stale answer is very nearly
  // as good as a fresh one, and enormously better than nothing. So the only
  // request that can still fail is one for a bucket that has never been fetched.
  let providerPlaces: NormalizedPlace[];
  const cached = await getCachedEntry(supabase, category, lat, lng);

  if (cached && !cached.stale) {
    console.log(`[places-nearby] cache hit category=${category} lat=${lat} lng=${lng}`);
    providerPlaces = cached.payload;
  } else {
    const reason = cached ? "stale" : "miss";
    console.log(`[places-nearby] cache ${reason} category=${category} lat=${lat} lng=${lng} -> querying provider`);
    try {
      providerPlaces = await fetchNearby(category, lat, lng, DEFAULT_RADIUS_METERS);
      await setCached(supabase, category, lat, lng, providerPlaces);
    } catch (error) {
      if (!(error instanceof PlacesSourceError)) throw error;

      if (cached) {
        console.warn(
          `[places-nearby] provider error (${error.message}) — serving stale cache for category=${category}`
        );
        providerPlaces = cached.payload;
      } else {
        console.error(`[places-nearby] provider error, nothing cached: ${error.message}`);
        return jsonResponse(
          { error: "Couldn't load nearby places, try again.", places: [] },
          502
        );
      }
    }
  }

  const { data: userPlaceRows, error: userPlacesError } = await supabase
    .from("places")
    .select("id, name, lat, lng, category, tags, notes, photo_url, submitted_by_user_id, created_at")
    .eq("category", category)
    .eq("status", "approved")
    .gte("lat", lat - radius / 111_000)
    .lte("lat", lat + radius / 111_000)
    .gte("lng", lng - radius / 111_000)
    .lte("lng", lng + radius / 111_000);

  if (userPlacesError) {
    console.error(`[places-nearby] failed to load user places: ${userPlacesError.message}`);
  }

  const userPlaces: NormalizedPlace[] = (userPlaceRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    category: row.category,
    tags: {
      ...(row.tags ?? {}),
      ...(row.notes ? { notes: row.notes } : {}),
      ...(row.photo_url ? { photo_url: row.photo_url } : {}),
      submitted_by_user_id: row.submitted_by_user_id,
      created_at: row.created_at,
    },
    source: "user" as const,
  }));

  const merged = mergePlaces(providerPlaces, userPlaces);
  return jsonResponse({ places: merged });
});
