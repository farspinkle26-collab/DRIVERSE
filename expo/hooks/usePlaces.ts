import { useCallback, useRef, useState } from "react";
import { fetchNearbyPlaces, submitPlace as submitPlaceApi, type NormalizedPlace, type SubmitPlaceInput } from "@/lib/placesApi";
import type { PlaceCategory } from "@/constants/placesCategories";

const FETCH_DEBOUNCE_MS = 600;
const DEFAULT_RADIUS_METERS = 2000;

/**
 * Drives the OSM + community "nearby places" layer: debounced fetch on
 * category/region change, plus optimistic insertion for a just-submitted
 * place so it appears on the map before any refetch.
 */
export function usePlaces() {
  const [category, setCategory] = useState<PlaceCategory>("cafe");
  const [places, setPlaces] = useState<NormalizedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const fetchForRegion = useCallback((lat: number, lng: number, cat: PlaceCategory) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      const result = await fetchNearbyPlaces({ lat, lng, radius: DEFAULT_RADIUS_METERS, category: cat });
      if (requestId !== requestIdRef.current) return; // a newer request superseded this one
      setPlaces(result.places);
      setError(result.error);
      setLoading(false);
    }, FETCH_DEBOUNCE_MS);
  }, []);

  const addOptimisticPlace = useCallback((place: NormalizedPlace) => {
    setPlaces((prev) => [place, ...prev]);
  }, []);

  const submitPlace = useCallback(async (input: SubmitPlaceInput) => {
    const result = await submitPlaceApi(input);
    if (result.place) {
      addOptimisticPlace(result.place);
    }
    return result;
  }, [addOptimisticPlace]);

  return {
    category,
    setCategory,
    places,
    loading,
    error,
    fetchForRegion,
    submitPlace,
  };
}
