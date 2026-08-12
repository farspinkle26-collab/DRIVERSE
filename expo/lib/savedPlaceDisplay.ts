/**
 * Driveverse — the pure half of a "territory" pin: a driver's own
 * dropped-and-named place, saved through `hooks/useSavedPlacesStore.ts` with
 * `category: "custom"` and `source: "user"` rather than a provider POI.
 *
 * Split out for the same reason `lib/tutorialSteps.ts` is split from its
 * component: this needs no React Native and no `react-native-svg` (the icon
 * itself, `TerritoryGlyph`, lives in `components/MapGlyphs.tsx` and is
 * resolved at the two render sites directly — pulling it in here would drag
 * `react-native-svg` into a test file that has no business loading it, per
 * `constants/placesCategories.ts`'s header).
 */

import { PLACE_CATEGORY_LABELS, type PlaceCategory } from "@/constants/mapLayers";

/** The one non-provider category a saved place can carry. */
export const CUSTOM_PLACE_CATEGORY = "custom" as const;

/** What `saved_places.category` can be — the nine provider categories, or a driver's own mark. */
export type SavedPlaceCategory = PlaceCategory | typeof CUSTOM_PLACE_CATEGORY;

/**
 * A fresh, unique `place_id` for a territory pin.
 *
 * Provider bookmarks use the OSM/Mapbox id already on the POI; a territory
 * pin has no such id to reuse, and `saved_places` needs one for its
 * `unique (user_id, place_id)` constraint. Timestamp + a short random suffix
 * is unique enough for one client's own inserts — this never has to
 * coordinate with anything else, unlike a provider id.
 */
export function generateCustomPlaceId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The label a saved place shows in a list or a marker callout. */
export function savedPlaceLabel(category: SavedPlaceCategory): string {
  if (category === CUSTOM_PLACE_CATEGORY) return "My place";
  return PLACE_CATEGORY_LABELS[category];
}
