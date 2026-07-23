// Shared metadata for the OSM/community "nearby places" feature.
// Keep the category ids in sync with supabase/functions/_shared/overpass.ts.
import { Coffee, Fuel, Wrench, MapPin } from "lucide-react-native";
import Colors from "@/constants/colors";

export type PlaceCategory = "cafe" | "gas_station" | "workshop" | "hangout";

export const PLACE_CATEGORIES: PlaceCategory[] = ["cafe", "gas_station", "workshop", "hangout"];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  cafe: "Cafe",
  gas_station: "Gas",
  workshop: "Workshop",
  hangout: "Hangout",
};

export const PLACE_CATEGORY_COLORS: Record<PlaceCategory, string> = {
  cafe: Colors.poiCafe,
  gas_station: Colors.poiFuel,
  workshop: Colors.poiWorkshop,
  hangout: Colors.poiCommunity,
};

export const PLACE_CATEGORY_ICONS: Record<PlaceCategory, typeof Coffee> = {
  cafe: Coffee,
  gas_station: Fuel,
  workshop: Wrench,
  hangout: MapPin,
};
