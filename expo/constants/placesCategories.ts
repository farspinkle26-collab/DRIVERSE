// The single place taxonomy for the map.
//
// Keep the category ids in sync with
// supabase/functions/_shared/overpass.ts (the OSM tag mapping) and with the
// `places_category_check` constraint in
// database_migration_places_taxonomy.sql.
//
// HISTORY — there used to be two taxonomies. `LandmarkCategory` lived in
// app/(tabs)/map.tsx (cafe / restaurant / spbu / shopping / carwash /
// charging / workshop, populated by Mapbox Geocoding keyword searches) and
// drove the markers a driver actually saw; `PlaceCategory` lived here
// (cafe / gas_station / workshop / hangout, populated by Overpass) and drove
// the Places layer, which had no entry point in the shipping build
// (MAP_SCREEN_REFERENCE §8). Two id sets for the same nine things is a
// standing bug, so they are merged here, onto the Overpass ids — the layer
// with a real backend, a server-side cache and a community submission flow.
//
// There is deliberately no colour-per-category map. The old one pulled four
// hues out of `constants/colors.ts` (purple cafe, amber fuel, orange
// workshop, blue hangout), which is four values the six-value palette has no
// room for — and it meant a filter chip's colour said "cafe" while the same
// colour elsewhere in the app said "info".
//
// Under the token system the split is:
//   category → the glyph shape (PLACE_CATEGORY_GLYPHS in
//              components/MapGlyphs.tsx, which is where the drawing lives)
//   state    → the colour (racingRed when active/selected, hairline when not)
//
// That rule is what lets nine categories live inside a six-value palette.
// See MAP_SCREEN_REFERENCE.md §2 and checklist rule 10.
//
// This module is deliberately free of React and React Native imports: it is
// the taxonomy itself, shared with the edge functions, and keeping it pure
// is what lets it be unit-tested and imported from non-render code.
export type PlaceCategory =
  | "cafe"
  | "restaurant"
  | "gas_station"
  | "workshop"
  | "shopping"
  | "parking"
  | "ev_charger"
  | "car_wash"
  | "hangout";

/**
 * Display order, which is also the order of the Filters panel rows and of
 * the fetch queue. Roughly "what a driver needs most often" first: fuel and
 * charging before shopping.
 */
export const PLACE_CATEGORIES: PlaceCategory[] = [
  "gas_station",
  "ev_charger",
  "parking",
  "workshop",
  "car_wash",
  "cafe",
  "restaurant",
  "shopping",
  "hangout",
];

/** Short label — marker callouts, filter rows, chips. */
export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  cafe: "Cafes",
  restaurant: "Food",
  gas_station: "Fuel",
  workshop: "Workshop",
  shopping: "Shops",
  parking: "Parking",
  ev_charger: "Charging",
  car_wash: "Car Wash",
  hangout: "Hangout",
};

export function isPlaceCategory(value: string): value is PlaceCategory {
  return (PLACE_CATEGORIES as string[]).includes(value);
}
