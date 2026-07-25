import { getCars, getProfiles } from "@/lib/queries";
import { GarageClient } from "./GarageClient";

export const dynamic = "force-dynamic";

export default async function GaragePage() {
  const [cars, profiles] = await Promise.all([getCars(), getProfiles()]);
  return <GarageClient cars={cars.rows} available={cars.available} userCount={profiles.rows.length} />;
}
