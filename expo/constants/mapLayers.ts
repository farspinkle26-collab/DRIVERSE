/**
 * Driveverse — the map's layer vocabulary.
 *
 * Ids, labels and ordering only. No glyphs, no colours, no React.
 *
 * This is split from `placesCategories.ts` so the filter rule
 * (`hooks/mapFiltersState.ts`) can be unit-tested: the moment a module
 * touches `MapGlyphs`, it pulls in `react-native-svg` and `theme.ts`'s
 * `Platform.OS` lookup, and a bare test runner cannot load either. The
 * vocabulary is also the part most likely to be read by something that has
 * no business rendering anything — the fetch layer, the cache key, the edge
 * function contract.
 *
 * Keep the category ids in sync with
 * `supabase/functions/_shared/overpass.ts`.
 */

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/** The nine OSM/community-backed categories. */
export type PlaceCategory =
  | "cafe"
  | "restaurant"
  | "gas_station"
  | "workshop"
  | "hangout"
  | "shopping"
  | "parking"
  | "ev_charger"
  | "car_wash";

/**
 * Display order — the order of the Filters panel and the chip row.
 * Grouped by what a driver is actually looking for rather than
 * alphabetically: fuel and charging adjacent, the two service categories
 * together, the social ones together, shopping last.
 */
export const PLACE_CATEGORIES: PlaceCategory[] = [
  "gas_station",
  "ev_charger",
  "workshop",
  "car_wash",
  "parking",
  "cafe",
  "restaurant",
  "hangout",
  "shopping",
];

/**
 * Layers the Filters panel can toggle: the nine categories, plus the two
 * that do not come from OSM.
 *
 * `users` is in the same list as the POI categories on purpose. Hiding
 * other drivers is the same gesture as hiding parking, and giving it a
 * separate mechanism somewhere else in the UI would mean two ways to make
 * something disappear from the map and two places to look when it does.
 * What makes it distinct is the copy, not the plumbing — see
 * `MAP_LAYER_DESCRIPTIONS.users`.
 */
export type MapLayerId = PlaceCategory | "events" | "users";

export const MAP_LAYERS: MapLayerId[] = [...PLACE_CATEGORIES, "events", "users"];

/** True for the nine OSM-backed ids. Narrows `MapLayerId` to `PlaceCategory`. */
export function isPlaceCategory(id: string): id is PlaceCategory {
  return (PLACE_CATEGORIES as string[]).includes(id);
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

/** Short labels, for chips and marker badges where width is scarce. */
export const PLACE_CATEGORY_LABELS: Record<MapLayerId, string> = {
  gas_station: "Fuel",
  ev_charger: "Charging",
  workshop: "Workshop",
  car_wash: "Car Wash",
  parking: "Parking",
  cafe: "Cafe",
  restaurant: "Food",
  hangout: "Hangout",
  shopping: "Shops",
  events: "Events",
  users: "Drivers",
};

/**
 * What each toggle does, shown under its label in the Filters panel.
 *
 * `users` carries the longest one because hiding other drivers sits next to
 * a privacy question, and the label "Drivers" alone does not answer it. It
 * hides them from you; it does not hide you from them. That is Go Offline,
 * and confusing the two would be the worst possible misunderstanding for a
 * control in this panel to invite.
 */
export const MAP_LAYER_DESCRIPTIONS: Record<MapLayerId, string> = {
  gas_station: "Petrol and diesel stations",
  ev_charger: "Public charging points",
  workshop: "Repair shops and garages",
  car_wash: "Car washes and detailers",
  parking: "Car parks and parking areas",
  cafe: "Coffee shops and warkops",
  restaurant: "Places to eat",
  hangout: "Bars, parks and meet-up spots",
  shopping: "Malls and department stores",
  events: "Meetups, convoys, cruises and races",
  users: "Other drivers on the map. Hiding them does not hide you.",
};
