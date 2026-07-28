// Glyph binding for the map's place layers.
//
// The vocabulary itself — ids, ordering, labels, descriptions — lives in
// `constants/mapLayers.ts` and is re-exported here so every existing
// `from "@/constants/placesCategories"` import keeps working. The split
// exists so the filter rule can be unit-tested without pulling
// `react-native-svg` in behind it; see that file's header.
//
// COLOUR
//   Category colours live in `constants/mapCategoryColors.ts`, quarantined
//   there because they contradict the documented "category is shape, state
//   is colour" rule. Read that file's header before using one.
import {
  CafeGlyph,
  ChargeGlyph,
  DriverGlyph,
  EventGlyph,
  FoodGlyph,
  FuelGlyph,
  HangoutGlyph,
  ParkingGlyph,
  ShopGlyph,
  WashGlyph,
  WorkshopGlyph,
  type MapGlyphComponent,
} from "@/components/MapGlyphs";
import type { MapLayerId } from "@/constants/mapLayers";

export {
  isPlaceCategory,
  MAP_LAYER_DESCRIPTIONS,
  MAP_LAYERS,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
} from "@/constants/mapLayers";
export type { MapLayerId, PlaceCategory } from "@/constants/mapLayers";

/**
 * One purpose-drawn glyph per layer — no shared icons, no default pins.
 *
 * `hangout` was lucide's `MapPin` before the Phase 3 pass: a generic map
 * pin standing in for a category, which says "somewhere" rather than "a
 * place drivers park up together".
 */
export const PLACE_CATEGORY_ICONS: Record<MapLayerId, MapGlyphComponent> = {
  gas_station: FuelGlyph,
  ev_charger: ChargeGlyph,
  workshop: WorkshopGlyph,
  car_wash: WashGlyph,
  parking: ParkingGlyph,
  cafe: CafeGlyph,
  restaurant: FoodGlyph,
  hangout: HangoutGlyph,
  shopping: ShopGlyph,
  events: EventGlyph,
  users: DriverGlyph,
};
