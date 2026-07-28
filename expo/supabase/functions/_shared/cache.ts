// Cache layer in front of Overpass. Nearby requests round to a ~1km grid
// bucket so tiny coordinate differences (a few meters of GPS drift) hit the
// same cache row instead of missing.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { NormalizedPlace, PlaceCategory } from "./placesSource.ts";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function latLngBucket(lat: number, lng: number): { latBucket: number; lngBucket: number } {
  return { latBucket: Math.round(lat * 100), lngBucket: Math.round(lng * 100) };
}

// Radius is intentionally not part of the key (per the ~1km grid-bucket
// strategy) — the Overpass fetch always uses a fixed default radius
// (see places-nearby/index.ts) so cache entries stay comparable regardless
// of what radius a particular client request asked for.
export function cacheKeyFor(category: PlaceCategory, lat: number, lng: number): string {
  const { latBucket, lngBucket } = latLngBucket(lat, lng);
  return `${category}:${latBucket}:${lngBucket}`;
}

interface CacheRow {
  cache_key: string;
  category: string;
  lat_bucket: number;
  lng_bucket: number;
  payload: NormalizedPlace[];
  fetched_at: string;
}

export function isStale(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() > TTL_MS;
}

export interface CachedEntry {
  payload: NormalizedPlace[];
  /** True when the row is past its TTL and should be refreshed if possible. */
  stale: boolean;
}

/**
 * Returns whatever is cached for this bucket, fresh or not, or null if nothing
 * has ever been cached for it.
 *
 * Staleness is reported rather than enforced so the caller can decide. A row
 * that is eight days old is a far better answer than a 502 when the provider
 * is unreachable — POIs do not move — and `/places-nearby` uses it exactly
 * that way: fresh rows short-circuit the fetch, stale rows are refreshed when
 * the provider answers and served as-is when it does not.
 */
export async function getCachedEntry(
  supabase: SupabaseClient,
  category: PlaceCategory,
  lat: number,
  lng: number
): Promise<CachedEntry | null> {
  const cacheKey = cacheKeyFor(category, lat, lng);
  const { data, error } = await supabase
    .from("osm_places_cache")
    .select("payload, fetched_at")
    .eq("cache_key", cacheKey)
    .maybeSingle<Pick<CacheRow, "payload" | "fetched_at">>();

  if (error || !data) return null;
  return { payload: data.payload, stale: isStale(data.fetched_at) };
}

/** Returns the cached payload if present and fresh, otherwise null. */
export async function getCached(
  supabase: SupabaseClient,
  category: PlaceCategory,
  lat: number,
  lng: number
): Promise<NormalizedPlace[] | null> {
  const entry = await getCachedEntry(supabase, category, lat, lng);
  if (!entry || entry.stale) return null;
  return entry.payload;
}

export async function setCached(
  supabase: SupabaseClient,
  category: PlaceCategory,
  lat: number,
  lng: number,
  payload: NormalizedPlace[]
): Promise<void> {
  const cacheKey = cacheKeyFor(category, lat, lng);
  const { latBucket, lngBucket } = latLngBucket(lat, lng);
  await supabase.from("osm_places_cache").upsert({
    cache_key: cacheKey,
    category,
    lat_bucket: latBucket,
    lng_bucket: lngBucket,
    payload,
    fetched_at: new Date().toISOString(),
  });
}
