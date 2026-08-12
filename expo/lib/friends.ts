/**
 * Driveverse — a driver's accepted friends.
 *
 * `friends` rows are directional (`user_id` sent the request, `friend_id`
 * accepted it), so "my friends" is the union of both sides where
 * `status = 'accepted'` — and `friends.user_id`/`friend_id` reference
 * `auth.users`, not `public.profiles`, so there is no FK PostgREST can embed
 * through; profiles are fetched separately and joined client-side.
 *
 * Lifted out of `app/messages/index.tsx`'s compose sheet so
 * `components/ShareTripToFriendModal.tsx` doesn't duplicate the same two
 * queries — same shape, same reasoning, one call site each now instead of
 * two copies drifting apart.
 */

import { supabase } from "@/lib/supabase";

export interface FriendContact {
  id: string;
  name: string;
  avatar?: string;
}

export async function fetchAcceptedFriends(userId: string): Promise<FriendContact[]> {
  const { data: sent } = await supabase
    .from("friends")
    .select("friend_id, status")
    .eq("user_id", userId)
    .eq("status", "accepted");
  const { data: received } = await supabase
    .from("friends")
    .select("user_id, status")
    .eq("friend_id", userId)
    .eq("status", "accepted");

  const otherIds = [
    ...new Set([
      ...(sent ?? []).map((r) => r.friend_id),
      ...(received ?? []).map((r) => r.user_id),
    ]),
  ];

  const { data: profs } = otherIds.length
    ? await supabase.from("profiles").select("id, name, avatar").in("id", otherIds)
    : { data: [] as { id: string; name: string; avatar: string | null }[] };
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  return [
    ...(sent ?? []).map((r) => ({
      id: r.friend_id,
      name: profMap.get(r.friend_id)?.name ?? "Driver",
      avatar: profMap.get(r.friend_id)?.avatar ?? undefined,
    })),
    ...(received ?? []).map((r) => ({
      id: r.user_id,
      name: profMap.get(r.user_id)?.name ?? "Driver",
      avatar: profMap.get(r.user_id)?.avatar ?? undefined,
    })),
  ];
}
