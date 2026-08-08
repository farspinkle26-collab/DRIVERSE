/**
 * Driveverse — how many direct messages are waiting for the signed-in driver.
 *
 * A count, not a list. It exists so a button somewhere in the chrome can carry
 * an unread badge without that screen having to load conversations — the map
 * needs the number and nothing else, and pulling the whole inbox onto a screen
 * that renders a live map would be the expensive way to draw a "3".
 *
 * Kept live the same way `app/messages/index.tsx` and `ProfileScreen` keep
 * theirs: one realtime subscription on `direct_messages`, plus a refetch when
 * the screen regains focus (a message read on another screen has to clear the
 * badge here, and an UPDATE that flips `is_read` is not something this hook
 * can count incrementally without re-reading anyway).
 *
 * Failure is silent and returns 0. A badge is an ornament on someone else's
 * screen — a count that cannot be fetched should render as "no badge", never
 * as an error surfaced over a map.
 */

import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuthStore";

export function useUnreadMessages(): number {
  const { user, isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setCount(0);
      return;
    }
    try {
      const { count: n, error } = await supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("is_read", false);
      if (error) return;
      setCount(n ?? 0);
    } catch {
      // See the header — a badge never reports its own failure.
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back from the inbox is the single most common way this number
  // changes, and it changes by going down — which no INSERT will tell us.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const channel = supabase
      .channel(`unread_dm_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { receiver_id?: string }
            | null;
          if (row?.receiver_id !== user.id) return;
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user, load]);

  return count;
}

export default useUnreadMessages;
