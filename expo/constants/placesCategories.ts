// Shared metadata for the OSM/community "nearby places" feature.
// Keep the category ids in sync with supabase/functions/_shared/overpass.ts.
//
// There is deliberately no colour-per-category map here any more. The old
// one pulled four hues out of `constants/colors.ts` (purple cafe, amber
// fuel, orange workshop, blue hangout), which is four values the six-value
// palette has no room for — and it meant a filter chip's colour said
// "cafe" while the same colour elsewhere in the app said "info".
//
// Under the token system the split is:
//   category → the glyph shape (components/MapGlyphs.tsx)
//   state    → the colour (racingRed when active/selected, hairline when not)
import {
  CafeGlyph,
  FuelGlyph,
  HangoutGlyph,
  WorkshopGlyph,
  type MapGlyphComponent,
} from "@/components/MapGlyphs";

export type PlaceCategory = "cafe" | "gas_station" | "workshop" | "hangout";

export const PLACE_CATEGORIES: PlaceCategory[] = ["cafe", "gas_station", "workshop", "hangout"];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  cafe: "Cafe",
  gas_station: "Gas",
  workshop: "Workshop",
  hangout: "Hangout",
};

export const PLACE_CATEGORY_ICONS: Record<PlaceCategory, MapGlyphComponent> = {
  cafe: CafeGlyph,
  gas_station: FuelGlyph,
  workshop: WorkshopGlyph,
  // Was lucide's `MapPin` — a generic map pin standing in for a category.
  hangout: HangoutGlyph,
};
