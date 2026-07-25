import { getPlaces, getOsmCache } from "@/lib/queries";
import { PlacesClient } from "./PlacesClient";
import { osmPlaceCountByCategory } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function PlacesPage() {
  const [places, osm] = await Promise.all([getPlaces(), getOsmCache()]);

  // OSM counts are derived server-side from cached payloads (approx, deduped).
  const osmCounts = osmPlaceCountByCategory(osm.rows);

  return (
    <PlacesClient
      places={places.rows}
      placesAvailable={places.available}
      osmCounts={osmCounts}
      osmAvailable={osm.available}
    />
  );
}
