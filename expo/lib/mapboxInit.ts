import Mapbox from "@/lib/mapboxCompat";
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}
