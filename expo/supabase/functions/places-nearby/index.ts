// GET /places-nearby?lat=&lng=&radius=&category=
//
// Returns merged OSM (cached, from Overpass) + approved community places.
// Contract stays stable regardless of where POIs come from — swap Overpass
// for a self-hosted instance or a paid provider by editing _shared/overpass.ts
// only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchFromOverpass, isPlaceCategory, OverpassError, type NormalizedPlace } from "../_shared/overpass.ts";
import { getCached, setCached } from "../_shared/cache.ts";
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
    return jsonResponse({ error: "category must be one of cafe, gas_station, workshop, hangout" }, 400);
  }
  const radius = Math.min(Number.isFinite(requestedRadius) ? requestedRadius : DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let osmPlaces: NormalizedPlace[];
  const cached = await getCached(supabase, category, lat, lng);
  if (cached) {
    console.log(`[places-nearby] cache hit category=${category} lat=${lat} lng=${lng}`);
    osmPlaces = cached;
  } else {
    console.log(`[places-nearby] cache miss category=${category} lat=${lat} lng=${lng} -> querying Overpass`);
    try {
      osmPlaces = await fetchFromOverpass(category, lat, lng, DEFAULT_RADIUS_METERS);
      await setCached(supabase, category, lat, lng, osmPlaces);
    } catch (error) {
      if (error instanceof OverpassError) {
        console.error(`[places-nearby] Overpass error: ${error.message}`);
        return jsonResponse(
          { error: "Couldn't load nearby places, try again.", places: [] },
          502
        );
      }
      throw error;
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

  const merged = mergePlaces(osmPlaces, userPlaces);
  return jsonResponse({ places: merged });
});
