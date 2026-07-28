/**
 * Driveverse — the map layer filter rule.
 *
 * The pure half of `useMapFilters`, split out for the same reason
 * `onlineUsersMerge.ts` is split out of `useOnlineUsers`: the hook drags in
 * AsyncStorage and React, while the part actually worth testing is the
 * state rule — and a filter that silently stops filtering is the exact bug
 * the marker rebuild was asked to make impossible.
 *
 * The rule the whole feature rests on is `isLayerVisible`. Every render
 * site on the map asks it, and nothing renders a marker without asking.
 * That is what stops the failure mode where a toggle looks off while its
 * markers are still drawn: there is one predicate, it is pure, and it is
 * tested.
 */

import { MAP_LAYERS, type MapLayerId } from "@/constants/mapLayers";

export type FilterState = Record<MapLayerId, boolean>;

/** Everything on. A driver who has never opened Filters sees the whole map. */
export function defaultFilters(): FilterState {
  return Object.fromEntries(MAP_LAYERS.map((id) => [id, true])) as FilterState;
}

/**
 * The one predicate the map renders through.
 *
 * Unknown ids return `true` rather than `false`: a layer added in a later
 * build and read back from an older stored payload should appear, not
 * silently vanish with no control to bring it back.
 */
export function isLayerVisible(state: FilterState, layer: MapLayerId): boolean {
  return state[layer] !== false;
}

/** Flips one layer, leaving the rest untouched. */
export function toggleLayer(state: FilterState, layer: MapLayerId): FilterState {
  return { ...state, [layer]: !isLayerVisible(state, layer) };
}

/** Every layer on or every layer off, for the panel's bulk control. */
export function setAllLayers(value: boolean): FilterState {
  return Object.fromEntries(MAP_LAYERS.map((id) => [id, value])) as FilterState;
}

/** The subset of place categories currently switched on — what the fetch
 *  layer asks Overpass for, so a hidden category costs no network. */
export function visibleCategories<T extends MapLayerId>(
  state: FilterState,
  candidates: readonly T[]
): T[] {
  return candidates.filter((c) => isLayerVisible(state, c));
}

/** How many layers are on, for the panel's summary line. */
export function visibleCount(state: FilterState): number {
  return MAP_LAYERS.filter((id) => isLayerVisible(state, id)).length;
}

/**
 * Rebuilds a valid state from whatever came out of storage.
 *
 * Persisted preferences are the one input here that can be arbitrarily old
 * — written by a previous version, hand-edited, or truncated by a crash
 * mid-write. Anything unrecognised is dropped and anything missing defaults
 * to visible, so a corrupt payload degrades to "everything shows" rather
 * than to a blank map the driver cannot explain or recover from.
 */
export function parseFilters(raw: unknown): FilterState {
  const base = defaultFilters();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const stored = raw as Record<string, unknown>;
  for (const id of MAP_LAYERS) {
    if (typeof stored[id] === "boolean") base[id] = stored[id] as boolean;
  }
  return base;
}
