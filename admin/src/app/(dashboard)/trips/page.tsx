import { getTrips } from "@/lib/queries";
import { TripsClient } from "./TripsClient";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const trips = await getTrips();
  return <TripsClient trips={trips.rows} available={trips.available} />;
}
