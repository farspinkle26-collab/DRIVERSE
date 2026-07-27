import { useCallback, useRef, useState } from "react";
import {
  fetchNearbyPlaces,
  submitPlace as submitPlaceApi,
  type NormalizedPlace,
  type SubmitPlaceInput,
} from "@/lib/placesApi";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/constants/placesCategories";

const FETCH_DEBOUNCE_MS = 600;
const DEFAULT_RADIUS_METERS = 2000;

/**
 * How many category requests are in flight at once. All nine at once is
 * fine for the edge function (it answers from its own cache most of the
 * time) but is nine simultaneous Overpass calls on a cold bucket, which is
 * exactly the sort of burst Overpass rate-limits.
 */
const FETCH_CONCURRENCY = 3;

/**
 * Upper bound on markers held in memory. Panning merges rather than
 * replaces, so without a cap a long session accumulates every POI the
 * driver has ever driven past. Oldest entries are dropped first.
 */
const MAX_PLACES = 600;

/** ~1km buckets, matching the server-side cache key in _shared/cache.ts. */
function regionKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100)}:${Math.round(lng * 100)}`;
}

/**
 * Drives the map's POI layer: a debounced, all-categories fetch around the
 * visible region, plus optimistic insertion for a just-submitted place so
 * it appears before any refetch.
 *
 * WHY EVERY CATEGORY, NOT JUST THE VISIBLE ONES
 *   The Filters panel promises an instant toggle — turning "parking" back
 *   on must not sit behind a network round-trip. That only holds if the
 *   data is already here, so the fetch ignores the filters entirely and the
 *   filtering happens at render. The cost is bounded by the two caches: the
 *   edge function holds Overpass results for 7 days, and `fetchedRef` below
 *   stops the client re-asking for a bucket it already has.
 */
export function usePlaces() {
  const [places, setPlaces] = useState<NormalizedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  // Buckets already fetched this session, so panning back over ground the
  // driver has already covered costs nothing.
  const fetchedRef = useRef<Set<string>>(new Set());

  const runFetch = useCallback(async (lat: number, lng: number, requestId: number) => {
    setLoading(true);
    let firstError: string | null = null;
    const collected: NormalizedPlace[] = [];

    for (let i = 0; i < PLACE_CATEGORIES.length; i += FETCH_CONCURRENCY) {
      // A newer region superseded this one — stop before spending the rest
      // of the requests on a view the driver has already panned away from.
      if (requestId !== requestIdRef.current) return;
      const batch = PLACE_CATEGORIES.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map((category) =>
          fetchNearbyPlaces({ lat, lng, radius: DEFAULT_RADIUS_METERS, category })
        )
      );
      for (const result of results) {
        collected.push(...result.places);
        if (result.error && !firstError) firstError = result.error;
      }
    }

    if (requestId !== requestIdRef.current) return;

    setPlaces((prev) => {
      // Merge rather than replace: markers already on screen should not
      // blink out and back in when the driver nudges the map.
      const byId = new Map<string, NormalizedPlace>();
      for (const place of prev) byId.set(place.id, place);
      for (const place of collected) byId.set(place.id, place);
      const merged = [...byId.values()];
      return merged.length > MAX_PLACES ? merged.slice(merged.length - MAX_PLACES) : merged;
    });
    // Only surface an error when nothing came back at all. One category
    // failing out of nine should not put a failure banner over a map that
    // is showing eight categories' worth of markers.
    setError(collected.length === 0 ? firstError : null);
    setLoading(false);
  }, []);

  /** Debounced fetch of every category around a point. */
  const fetchForRegion = useCallback(
    (lat: number, lng: number, options: { force?: boolean } = {}) => {
      const key = regionKey(lat, lng);
      if (!options.force && fetchedRef.current.has(key)) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Marked here rather than above: a debounce window can span two
        // buckets, and marking on the *call* would record a bucket whose
        // request was then cancelled — leaving ground permanently unfetched.
        fetchedRef.current.add(key);
        const requestId = ++requestIdRef.current;
        void runFetch(lat, lng, requestId);
      }, FETCH_DEBOUNCE_MS);
    },
    [runFetch]
  );

  /** Drops the bucket cache so the next region change refetches. */
  const retry = useCallback(
    (lat: number, lng: number) => {
      fetchedRef.current.clear();
      setError(null);
      fetchForRegion(lat, lng, { force: true });
    },
    [fetchForRegion]
  );

  const addOptimisticPlace = useCallback((place: NormalizedPlace) => {
    setPlaces((prev) => (prev.some((p) => p.id === place.id) ? prev : [place, ...prev]));
  }, []);

  const submitPlace = useCallback(
    async (input: SubmitPlaceInput) => {
      const result = await submitPlaceApi(input);
      if (result.place) {
        addOptimisticPlace(result.place);
      }
      return result;
    },
    [addOptimisticPlace]
  );

  return { places, loading, error, fetchForRegion, retry, submitPlace };
}

export type { PlaceCategory };
