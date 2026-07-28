// Background refresh for stale osm_places_cache rows, so real user requests
// never wait on a live provider call if avoidable.
//
// SCHEDULE THIS. It is not wired to user traffic, and an unscheduled warmer is
// the difference between "the cache absorbs provider outages" and "the cache
// only ever holds what a driver already waited for". Supabase dashboard:
// Edge Functions -> places-refresh-cache -> Schedule, every 6 hours; or pg_cron
// against this function's URL. Refreshes the oldest stale rows first and stops
// after a small batch so one run can't itself run long or spike provider spend.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchNearby, isPlaceCategory, PlacesSourceError } from "../_shared/placesSource.ts";
import { isStale, setCached } from "../_shared/cache.ts";

const BATCH_SIZE = 20;
const FETCH_RADIUS_METERS = 2000;

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
      const places = await fetchNearby(row.category, lat, lng, FETCH_RADIUS_METERS);
      await setCached(supabase, row.category, lat, lng, places);
      refreshed++;
    } catch (err) {
      failed++;
      if (err instanceof PlacesSourceError) {
        console.error(`[places-refresh-cache] provider error for ${row.cache_key}: ${err.message}`);
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
