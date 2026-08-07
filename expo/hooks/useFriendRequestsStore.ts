import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuthStore";
import { useNotifications } from "@/hooks/useNotificationStore";

// The 👋 prefix is the only place a "meetup" direct message is produced
// (`app/(tabs)/map.tsx` → `handleAskMeetupFromMap`), so it's a safe marker
// for telling a meetup ask apart from an ordinary DM here.
const MEETUP_PREFIX = "👋";

/**
 * App-wide "someone wants my attention" toasts: incoming friend requests and
 * meetup asks.
 *
 * This used to live only inside `ProfileScreen`'s realtime subscription, so
 * the toast only fired while the driver happened to be on the Profile tab.
 * Called once from a component mounted in `app/_layout.tsx` (see
 * `FriendRequestsListener` below), it fires from any screen — map, quest,
 * wherever — because `NotificationBanner` is already rendered at the root,
 * above the active route.
 *
 * No native call happens here at module scope or even on mount — this is a
 * plain Supabase Realtime subscription set up from a `useEffect`, the same
 * shape as `usePartyStore`'s `party_members` subscription.
 */
export function useFriendRequestsStore() {
  const { user, isAuthenticated } = useAuth();
  const { showRequestNotification, showNotification } = useNotifications();

  // Incoming friend requests.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const channel = supabase
      .channel(`friend_requests_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friends" },
        (payload) => {
          const row = payload.new as { id: string; user_id: string; friend_id: string; status: string };
          if (row.friend_id !== user.id || row.status !== "pending") return;
          supabase
            .from("profiles")
            .select("name")
            .eq("id", row.user_id)
            .single()
            .then(({ data }) => {
              const senderName = data?.name ?? "Someone";
              showRequestNotification(
                "New friend request",
                `${senderName} sent you a friend request`,
                row.id
              );
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user, showRequestNotification]);

  // Incoming meetup asks (a direct message sent from the map's "Ask a
  // Meetup" action — see `MEETUP_PREFIX` above).
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const channel = supabase
      .channel(`meetup_requests_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new as { id: string; sender_id: string; receiver_id: string; content: string };
          if (row.receiver_id !== user.id) return;
          if (!row.content?.startsWith(MEETUP_PREFIX)) return;
          supabase
            .from("profiles")
            .select("name")
            .eq("id", row.sender_id)
            .single()
            .then(({ data }) => {
              const senderName = data?.name ?? "A driver";
              showNotification(
                "Meetup request",
                `${senderName} wants to meet up nearby`,
                "request",
                { senderId: row.sender_id }
              );
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user, showNotification]);
}

/**
 * Mounted once in `app/_layout.tsx`, inside `NotificationContext`, next to
 * `LastActivePing` — renders nothing, just keeps the subscriptions above
 * alive for the app's lifetime regardless of which screen is on top.
 */
export function FriendRequestsListener() {
  useFriendRequestsStore();
  return null;
}
