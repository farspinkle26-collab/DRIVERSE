import { OverviewClient } from "./OverviewClient";
import {
  getProfiles,
  getTrips,
  getDailyQuests,
  getDirectMessages,
  getGroupMessages,
  getEvents,
  getParties,
  getUserXp,
} from "@/lib/queries";

// Server component: one paginated fetch per table, then hand serializable rows
// to the client for instant range recompute.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [profiles, trips, quests, dms, gms, events, parties, xp] = await Promise.all([
    getProfiles(),
    getTrips(),
    getDailyQuests(),
    getDirectMessages(),
    getGroupMessages(),
    getEvents(),
    getParties(),
    getUserXp(),
  ]);

  // Merge activity signals into a single {userId, ts} stream (approx DAU basis).
  const activity = [
    ...trips.rows.map((t) => ({ userId: t.user_id, ts: t.created_at })),
    ...quests.rows.map((q) => ({ userId: q.user_id, ts: q.created_at })),
    ...dms.rows.map((m) => ({ userId: m.sender_id, ts: m.created_at })),
    ...gms.rows.map((m) => ({ userId: m.sender_id, ts: m.created_at })),
  ];

  return (
    <OverviewClient
      profiles={profiles.rows}
      trips={trips.rows.map((t) => ({ created_at: t.created_at, distance_km: t.distance_km, xp_earned: t.xp_earned }))}
      quests={quests.rows.map((q) => ({ created_at: q.created_at, status: q.status, xp_reward: q.xp_reward }))}
      events={events.rows.map((e) => ({ created_at: e.created_at }))}
      parties={parties.rows.map((p) => ({ created_at: p.created_at }))}
      xp={xp.rows.map((u) => ({ total_xp: u.total_xp }))}
      activity={activity}
      generatedAt={new Date().toISOString()}
    />
  );
}
