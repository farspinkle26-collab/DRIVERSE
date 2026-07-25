import { getProfiles } from "@/lib/queries";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const profiles = await getProfiles();
  return <UsersClient profiles={profiles.rows} />;
}
