// Background refresh for stale osm_places_cache rows, so real user requests
// never wait on a live Overpass call if avoidable.
//
// Not wired to user traffic — schedule it with Supabase's cron
// (dashboard: Edge Functions -> places-refresh-cache -> Schedule, e.g. every
// 6 hours) or pg_cron calling this function's URL. Refreshes the oldest
// stale rows first and stops after a small batch so one run can't itself
// hammer Overpass or run long.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchFromOverpass, isPlaceCategory, OverpassError } from "../_shared/overpass.ts";
import { isStale, setCached } from "../_shared/cache.ts";

const BATCH_SIZE = 20;
const OVERPASS_RADIUS_METERS = 2000;

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: rows, error } = await supabase
    .from("osm_places_cache")
    .select("cache_key, category, lat_bucket, lng_bucket, fetched_at")
    .order("fetched_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error(`[places-refresh-cache] failed to list cache rows: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const stale = (rows ?? []).filter((row) => isStale(row.fetched_at));
  let refreshed = 0;
  let failed = 0;

  for (const row of stale) {
    if (!isPlaceCategory(row.category)) continue;
    const lat = row.lat_bucket / 100;
    const lng = row.lng_bucket / 100;
    try {
      const places = await fetchFromOverpass(row.category, lat, lng, OVERPASS_RADIUS_METERS);
      await setCached(supabase, row.category, lat, lng, places);
      refreshed++;
    } catch (err) {
      failed++;
      if (err instanceof OverpassError) {
        console.error(`[places-refresh-cache] Overpass error for ${row.cache_key}: ${err.message}`);
      } else {
        console.error(`[places-refresh-cache] unexpected error for ${row.cache_key}:`, err);
      }
      // Leave the stale row as-is; a live request will retry the fetch
      // on-demand, and this job will try again next run.
    }
  }

  console.log(`[places-refresh-cache] checked=${rows?.length ?? 0} stale=${stale.length} refreshed=${refreshed} failed=${failed}`);
  return new Response(JSON.stringify({ checked: rows?.length ?? 0, stale: stale.length, refreshed, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
