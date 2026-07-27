/**
 * Which layers the map is currently drawing, persisted across restarts.
 *
 * Two kinds of toggle live here and they are deliberately not the same
 * thing:
 *
 *   place categories — declutter. Nine OSM-backed layers, all on by
 *                      default. Toggling one is a *render* decision: the
 *                      data for every category is already fetched and held
 *                      (see hooks/usePlaces.ts), so a toggle never triggers
 *                      a network round-trip.
 *   drivers          — privacy-adjacent. Hiding other drivers is how a
 *                      driver gets a quiet map without going invisible
 *                      themselves — that is the visibility switch, which
 *                      lives in useOnlineUsers and has real consequences.
 *                      The Filters panel says so next to the toggle.
 *
 * The state shape and its storage migration are in `lib/mapFilters.ts`;
 * this is the React and AsyncStorage wrapper around it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MAP_FILTERS_STORAGE_KEY,
  defaultMapFilters,
  parseStoredFilters,
  type MapFilters,
} from "@/lib/mapFilters";
import type { PlaceCategory } from "@/constants/placesCategories";

export type { MapFilters };

export function useMapFilters() {
  const [filters, setFilters] = useState<MapFilters>(defaultMapFilters);
  // Until the stored blob has been read, writing would persist the defaults
  // over a driver's real preferences on a slow read.
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(MAP_FILTERS_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        setFilters(parseStoredFilters(raw));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Applies an update and writes it through, once hydration has happened. */
  const update = useCallback((mutate: (prev: MapFilters) => MapFilters) => {
    setFilters((prev) => {
      const next = mutate(prev);
      if (hydratedRef.current) {
        AsyncStorage.setItem(MAP_FILTERS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback(
    (category: PlaceCategory) =>
      update((prev) => ({
        ...prev,
        categories: { ...prev.categories, [category]: !prev.categories[category] },
      })),
    [update]
  );

  const toggleEvents = useCallback(
    () => update((prev) => ({ ...prev, events: !prev.events })),
    [update]
  );

  const toggleDrivers = useCallback(
    () => update((prev) => ({ ...prev, drivers: !prev.drivers })),
    [update]
  );

  const resetFilters = useCallback(() => update(() => defaultMapFilters()), [update]);

  return { filters, toggleCategory, toggleEvents, toggleDrivers, resetFilters };
}
