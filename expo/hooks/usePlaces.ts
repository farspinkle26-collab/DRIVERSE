import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNearbyPlacesMany,
  submitPlace as submitPlaceApi,
  type NormalizedPlace,
  type SubmitPlaceInput,
} from "@/lib/placesApi";
import {
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/constants/placesCategories";

const FETCH_DEBOUNCE_MS = 600;
const DEFAULT_RADIUS_METERS = 2000;

/**
 * Drives the OSM + community places layer.
 *
 * WHAT CHANGED WITH THE MARKER REBUILD
 *   This used to hold a single `category` and swap the whole marker set when
 *   the driver picked a different chip. The Filters panel made that shape
 *   wrong: filters are additive — a driver ticks Fuel *and* Parking *and*
 *   Charging and expects all three on the map at once — so the hook now
 *   holds a set of categories and a merged list.
 *
 * ONLY VISIBLE CATEGORIES ARE FETCHED
 *   `categories` comes straight from the filter state, so switching a layer
 *   off stops its network traffic as well as its markers. This is the reason
 *   the filter predicate is not applied at render time only: with nine
 *   categories live, fetching all of them and drawing two would mean the
 *   driver pays for seven Overpass round trips they asked not to see.
 *
 * PARTIAL FAILURE IS NOT TOTAL FAILURE
 *   Requests run in parallel and are folded together per category. If
 *   Overpass times out on one, the other eight still render and the error
 *   names the one that did not — an empty map with a generic error was the
 *   previous behaviour and it made a single flaky category look like a dead
 *   feature.
 */
export function usePlaces() {
  const [places, setPlaces] = useState<NormalizedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Places submitted this session, kept apart from the fetched set so a
  // refetch that has not yet indexed them cannot make them disappear from
  // under the driver who just added them.
  const [optimistic, setOptimistic] = useState<NormalizedPlace[]>([]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const fetchForRegion = useCallback(
    (lat: number, lng: number, categories: PlaceCategory[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Nothing ticked is a valid state, not an empty result to fetch for.
      // Bailing here also means an in-flight response cannot repopulate the
      // map after the driver has switched everything off.
      if (categories.length === 0) {
        requestIdRef.current++;
        setPlaces([]);
        setError(null);
        setLoading(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        const { places: fetched, failed } = await fetchNearbyPlacesMany({
          lat,
          lng,
          radius: DEFAULT_RADIUS_METERS,
          categories,
        });
        if (requestId !== requestIdRef.current) return; // superseded
        setPlaces(fetched);
        setError(failed.length ? describeFailure(failed) : null);
        setLoading(false);
      }, FETCH_DEBOUNCE_MS);
    },
    []
  );

  const submitPlace = useCallback(async (input: SubmitPlaceInput) => {
    const result = await submitPlaceApi(input);
    if (result.place) {
      const place = result.place;
      setOptimistic((prev) => [place, ...prev]);
    }
    return result;
  }, []);

  // The optimistic entries are folded in here rather than pushed into
  // `places`, so each refetch starts from the server's answer and cannot
  // accumulate duplicates of a place that has since been indexed.
  const merged = optimistic.length
    ? [...optimistic.filter((o) => !places.some((p) => p.id === o.id)), ...places]
    : places;

  return {
    places: merged,
    loading,
    error,
    fetchForRegion,
    submitPlace,
  };
}

/** Names the categories that failed, so "it didn't load" is actionable. */
function describeFailure(failed: PlaceCategory[]): string {
  const names = failed.map((c) => PLACE_CATEGORY_LABELS[c]);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} didn't load — the request to the places service failed. Pan the map to retry this area.`;
}
