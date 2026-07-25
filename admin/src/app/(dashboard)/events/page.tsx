import { getEvents, getEventParticipants, getParties, getPartyMembers, getProfiles } from "@/lib/queries";
import { EventsClient } from "./EventsClient";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const [events, participants, parties, members, profiles] = await Promise.all([
    getEvents(),
    getEventParticipants(),
    getParties(),
    getPartyMembers(),
    getProfiles(),
  ]);

  const nameMap: Record<string, string> = {};
  for (const p of profiles.rows) nameMap[p.id] = p.name || p.id.slice(0, 8);

  return (
    <EventsClient
      events={events.rows}
      participants={participants.rows}
      parties={parties.rows}
      members={members.rows}
      names={nameMap}
    />
  );
}
