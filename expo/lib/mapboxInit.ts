import Mapbox from "@/lib/mapboxCompat";
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";

if (MAPBOX_ACCESS_TOKEN) {
  try {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
  } catch (error) {
    console.warn("[mapboxInit] Failed to set Mapbox access token.", error);
  }
}
