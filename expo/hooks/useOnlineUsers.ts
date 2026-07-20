import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import * as Location from "expo-location";

// ─── Types ─────────────────────────────────────────────────
export interface OnlineUser {
  user_id: string;
  name: string;
  level: number;
  latitude: number;
  longitude: number;
  heading: number;
  updated_at: string;
}

const LOCATION_BROADCAST_MS = 4000; // how often we push our own position
const PRESENCE_CHANNEL = "online-players";

// ─── Context Hook ──────────────────────────────────────────
// Online player locations use Supabase Realtime Presence:
// each online player tracks their position on a shared channel, so
// every client receives live moves instantly without DB round-trips.
// Positions are also upserted to user_locations for persistence.
export const [OnlineUsersProvider, useOnlineUsers] = createContextHook(() => {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileRef = useRef<{ name: string; level: number }>({ name: "Driver", level: 1 });

  // ─── Listen for auth state ───────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // ─── Rebuild the players list from channel presence state ──
  const syncFromPresence = useCallback((selfId: string) => {
    const channel = channelRef.current;
    if (!channel) return;

    const state = channel.presenceState<OnlineUser>();
    const users: OnlineUser[] = [];
    for (const key of Object.keys(state)) {
      if (key === selfId) continue; // own car is rendered separately
      const metas = state[key];
      const latest = metas[metas.length - 1];
      if (!latest || typeof latest.latitude !== "number") continue;
      users.push({
        user_id: key,
        name: latest.name ?? "Driver",
        level: latest.level ?? 1,
        latitude: latest.latitude,
        longitude: latest.longitude,
        heading: latest.heading ?? 0,
        updated_at: latest.updated_at ?? new Date().toISOString(),
      });
    }
    setOnlineUsers(users);
  }, []);

  // ─── Read current GPS position ───────────────────────────
  const getPosition = useCallback(async () => {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      heading: loc.coords.heading ?? 0,
    };
  }, []);

  // ─── Broadcast own position: presence track + DB persist ──
  const publishPosition = useCallback(
    async (uid: string, pos: { latitude: number; longitude: number; heading: number }) => {
      const payload: OnlineUser = {
        user_id: uid,
        name: profileRef.current.name,
        level: profileRef.current.level,
        latitude: pos.latitude,
        longitude: pos.longitude,
        heading: pos.heading,
        updated_at: new Date().toISOString(),
      };

      // Realtime: everyone on the channel sees this move instantly
      try {
        await channelRef.current?.track(payload);
      } catch {
        // Silent
      }

      // Persistence: survives reconnects and feeds stale-cleanup
      try {
        await supabase.from("user_locations").upsert({
          user_id: uid,
          latitude: pos.latitude,
          longitude: pos.longitude,
          heading: pos.heading,
          is_online: true,
        });
      } catch {
        // Silent
      }
    },
    []
  );

  // ─── Go online ───────────────────────────────────────────
  const goOnline = useCallback(async () => {
    if (!userId || channelRef.current) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const pos = await getPosition();

      // Load own profile name + level for the presence payload
      try {
        const [{ data: profile }, { data: xp }] = await Promise.all([
          supabase.from("profiles").select("name").eq("id", userId).single(),
          supabase.from("user_xp").select("level").eq("user_id", userId).single(),
        ]);
        profileRef.current = {
          name: profile?.name ?? "Driver",
          level: xp?.level ?? 1,
        };
      } catch {
        // Defaults stay
      }

      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: userId } },
      });

      channel
        .on("presence", { event: "sync" }, () => syncFromPresence(userId))
        .on("presence", { event: "join" }, () => syncFromPresence(userId))
        .on("presence", { event: "leave" }, () => syncFromPresence(userId))
        .subscribe(async (subscribeStatus) => {
          if (subscribeStatus === "SUBSCRIBED") {
            await publishPosition(userId, pos);
          }
        });

      channelRef.current = channel;
      setIsOnline(true);

      // Periodically re-broadcast own location
      locationIntervalRef.current = setInterval(async () => {
        try {
          const next = await getPosition();
          await publishPosition(userId, next);
        } catch {
          // Silent
        }
      }, LOCATION_BROADCAST_MS);
    } catch {
      // Silent
    }
  }, [userId, getPosition, publishPosition, syncFromPresence]);

  // ─── Go offline: cleanup ─────────────────────────────────
  const goOffline = useCallback(async () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }

    if (channelRef.current) {
      try {
        await channelRef.current.untrack();
      } catch {
        // Silent
      }
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (userId) {
      try {
        await supabase
          .from("user_locations")
          .update({ is_online: false })
          .eq("user_id", userId);
      } catch {
        // Silent
      }
    }

    setIsOnline(false);
    setOnlineUsers([]);
  }, [userId]);

  // ─── Cleanup on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, []);

  // ─── Auto-go-offline when auth is lost ───────────────────
  useEffect(() => {
    if (!userId && isOnline) {
      goOffline();
    }
  }, [userId, isOnline, goOffline]);

  return {
    onlineUsers,
    isOnline,
    goOnline,
    goOffline,
  };
});
