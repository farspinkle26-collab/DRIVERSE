/**
 * Driveverse — persisted map layer filters.
 *
 * Owns which of the eleven map layers are switched on, and keeps that
 * choice across app restarts. The rule itself is in
 * `hooks/mapFiltersState.ts`; this file is only the React and AsyncStorage
 * wrapper around it.
 *
 * WHY THE `ready` FLAG EXISTS
 *   Reading AsyncStorage is async, so for the first frame or two the state
 *   is the default (everything on). Without a gate, a driver who had
 *   Parking switched off would watch parking markers appear and then
 *   disappear on every cold start — the app visibly overriding their
 *   preference before honouring it. The map holds POI rendering until
 *   `ready`, which costs one frame and removes the flash entirely.
 *
 * WHY WRITES ARE NOT AWAITED BY THE UI
 *   A toggle updates state synchronously and persists in the background. A
 *   filter that waits on a disk write before the marker disappears would
 *   feel broken, and a failed write is not worth blocking a gesture over —
 *   worst case the preference does not survive a restart, which is exactly
 *   what the driver had before this existed.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PLACE_CATEGORIES,
  type MapLayerId,
  type PlaceCategory,
} from "@/constants/placesCategories";
import {
  defaultFilters,
  isLayerVisible,
  parseFilters,
  setAllLayers,
  toggleLayer,
  visibleCategories,
  visibleCount,
  type FilterState,
} from "@/hooks/mapFiltersState";

const STORAGE_KEY = "driveverse.mapFilters.v1";

export const [MapFiltersContext, useMapFilters] = createContextHook(() => {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        // `parseFilters` tolerates anything — a payload from an older build,
        // a half-written string, `null`. It never throws.
        if (raw) setFilters(parseFilters(JSON.parse(raw)));
      } catch (err) {
        console.error("[useMapFilters] couldn't read stored filters:", err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: FilterState) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((err) => {
      console.error("[useMapFilters] couldn't save filters:", err);
    });
  }, []);

  const toggle = useCallback(
    (layer: MapLayerId) => {
      setFilters((prev) => {
        const next = toggleLayer(prev, layer);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setAll = useCallback(
    (value: boolean) => {
      setFilters(() => {
        const next = setAllLayers(value);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  /** The predicate every marker render site goes through. */
  const isVisible = useCallback(
    (layer: MapLayerId) => isLayerVisible(filters, layer),
    [filters]
  );

  /** Switched-on POI categories — also what the fetch layer requests, so a
   *  hidden category costs no Overpass call. */
  const activeCategories = useMemo<PlaceCategory[]>(
    () => visibleCategories(filters, PLACE_CATEGORIES),
    [filters]
  );

  return useMemo(
    () => ({
      filters,
      ready,
      toggle,
      setAll,
      isVisible,
      activeCategories,
      visibleCount: visibleCount(filters),
    }),
    [filters, ready, toggle, setAll, isVisible, activeCategories]
  );
});
