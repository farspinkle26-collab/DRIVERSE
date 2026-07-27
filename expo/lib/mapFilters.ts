/**
 * The map's layer-filter state, and how it survives a restart.
 *
 * Pure: no React, no AsyncStorage. `hooks/useMapFilters.ts` is the thin
 * React wrapper that reads and writes it. The split exists because the
 * interesting part is the migration in `parseStoredFilters` — a blob
 * written by an older build of the app has to keep working when the
 * taxonomy changes underneath it, and that is worth testing directly.
 */
import {
  PLACE_CATEGORIES,
  isPlaceCategory,
  type PlaceCategory,
} from "@/constants/placesCategories";

/** One AsyncStorage key for the whole blob: one read on mount, one write
 *  per change, instead of eleven of each. */
export const MAP_FILTERS_STORAGE_KEY = "mapFilters.v1";

export interface MapFilters {
  categories: Record<PlaceCategory, boolean>;
  events: boolean;
  drivers: boolean;
}

export function defaultMapFilters(): MapFilters {
  return {
    categories: Object.fromEntries(PLACE_CATEGORIES.map((c) => [c, true])) as Record<
      PlaceCategory,
      boolean
    >,
    events: true,
    drivers: true,
  };
}

/**
 * Merges a stored blob onto the defaults.
 *
 * Written to survive its own history. A category added in a later release
 * is absent from every previously-stored blob, and defaulting it to *on* is
 * what makes a new layer appear rather than silently stay hidden for every
 * existing user. Ids from a category that no longer exists — including the
 * pre-merge `spbu` / `carwash` / `charging` — are dropped rather than
 * carried forward as dead keys. Anything unparseable falls back whole.
 */
export function parseStoredFilters(raw: string | null): MapFilters {
  const defaults = defaultMapFilters();
  if (!raw) return defaults;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (typeof stored !== "object" || stored === null) return defaults;

  const s = stored as Partial<MapFilters>;
  const categories = defaults.categories;
  if (typeof s.categories === "object" && s.categories !== null) {
    for (const [key, value] of Object.entries(s.categories)) {
      if (isPlaceCategory(key) && typeof value === "boolean") {
        categories[key] = value;
      }
    }
  }
  return {
    categories,
    events: typeof s.events === "boolean" ? s.events : defaults.events,
    drivers: typeof s.drivers === "boolean" ? s.drivers : defaults.drivers,
  };
}

/** True when nothing is hidden — drives whether "Show all" is offered. */
export function allLayersVisible(filters: MapFilters): boolean {
  return (
    filters.events && filters.drivers && PLACE_CATEGORIES.every((c) => filters.categories[c])
  );
}
