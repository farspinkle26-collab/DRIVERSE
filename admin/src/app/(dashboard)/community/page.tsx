import { getDirectMessages, getGroupMessages, getGroupConversations, getProfiles } from "@/lib/queries";
import { CommunityClient } from "./CommunityClient";

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const [dms, gms, convos, profiles] = await Promise.all([
    getDirectMessages(),
    getGroupMessages(),
    getGroupConversations(),
    getProfiles(),
  ]);

  const kindByConvo: Record<string, string> = {};
  for (const c of convos.rows) kindByConvo[c.id] = c.kind || "unknown";

  return (
    <CommunityClient
      direct={dms.rows.map((m) => ({ sender_id: m.sender_id, created_at: m.created_at }))}
      group={gms.rows.map((m) => ({ sender_id: m.sender_id, created_at: m.created_at, kind: kindByConvo[m.conversation_id] || "unknown" }))}
      totalUsers={profiles.rows.length}
    />
  );
}
