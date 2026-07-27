import { readSchedule } from "@/lib/marketing/store";
import { MarketingClient } from "./MarketingClient";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const schedule = await readSchedule();
  return <MarketingClient schedule={schedule} />;
}
