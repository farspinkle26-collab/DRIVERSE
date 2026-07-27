import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import * as Location from "expo-location";

// ─── Types ─────────────────────────────────────────────────

// A driver in trouble raises one of these. The set is deliberately small:
// each type maps to a different kind of help, so a driver reading a marker
// or the alert banner knows at a glance what the person needs — a tow, the
// emergency services, a jerry can, or just anyone at all.
export type ProblemType = "breakdown" | "accident" | "fuel" | "sos";

export interface ProblemSignal {
  type: ProblemType;
  /** When the signal was raised, so the UI can show how long it's been up. */
  since: string;
}

export interface OnlineUser {
  user_id: string;
  name: string;
  level: number;
  avatar?: string;
  latitude: number;
  longitude: number;
  heading: number;
  updated_at: string;
  /** Set while this driver has an active problem signal raised. */
  problem?: ProblemSignal | null;
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
  const [myProblem, setMyProblem] = useState<ProblemSignal | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileRef = useRef<{ name: string; level: number; avatar?: string }>({ name: "Driver", level: 1 });
  // Held in a ref so the periodic broadcaster and goOnline's first publish
  // both pick up the current signal without re-creating those callbacks.
  const problemRef = useRef<ProblemSignal | null>(null);

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
        avatar: latest.avatar,
        latitude: latest.latitude,
        longitude: latest.longitude,
        heading: latest.heading ?? 0,
        updated_at: latest.updated_at ?? new Date().toISOString(),
        problem: latest.problem ?? null,
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
        avatar: profileRef.current.avatar,
        latitude: pos.latitude,
        longitude: pos.longitude,
        heading: pos.heading,
        updated_at: new Date().toISOString(),
        problem: problemRef.current,
      };

      // Realtime: everyone on the channel sees this move instantly
      try {
        await channelRef.current?.track(payload);
      } catch {
        // Silent
      }

      // Persistence: survives reconnects and feeds stale-cleanup. The problem
      // columns are new (database_migration_problem_signal.sql); an older DB
      // without them just ignores the extra keys on the presence path.
      try {
        await supabase.from("user_locations").upsert({
          user_id: uid,
          latitude: pos.latitude,
          longitude: pos.longitude,
          heading: pos.heading,
          is_online: true,
          problem_type: problemRef.current?.type ?? null,
          problem_since: problemRef.current?.since ?? null,
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
          supabase.from("profiles").select("name, avatar").eq("id", userId).single(),
          supabase.from("user_xp").select("level").eq("user_id", userId).single(),
        ]);
        profileRef.current = {
          name: profile?.name ?? "Driver",
          level: xp?.level ?? 1,
          avatar: profile?.avatar ?? undefined,
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

    // Going invisible clears your signal — you can't ask for help from a
    // map you've stepped off, and a stale "SOS" left hanging would mislead.
    problemRef.current = null;
    setMyProblem(null);
    setIsOnline(false);
    setOnlineUsers([]);
  }, [userId]);

  // ─── Raise / clear my own problem signal ─────────────────
  //
  // A signal rides the same presence payload as position, so every driver
  // on the map — convoy-mate or stranger — sees it the instant it's raised,
  // with no extra channel or DB round-trip. Raising one also brings you onto
  // the map if you were hidden: a problem nobody can see helps nobody.
  const raiseProblem = useCallback(
    async (type: ProblemType) => {
      const signal: ProblemSignal = { type, since: new Date().toISOString() };
      problemRef.current = signal;
      setMyProblem(signal);

      if (!channelRef.current) {
        // goOnline's first publish reads problemRef, so the signal goes out
        // with the very first position it broadcasts.
        await goOnline();
        return;
      }
      if (!userId) return;
      try {
        const pos = await getPosition();
        await publishPosition(userId, pos);
      } catch {
        // The next interval tick will carry the flag regardless.
      }
    },
    [userId, getPosition, publishPosition, goOnline]
  );

  const clearProblem = useCallback(async () => {
    problemRef.current = null;
    setMyProblem(null);
    if (!channelRef.current || !userId) return;
    try {
      const pos = await getPosition();
      await publishPosition(userId, pos);
    } catch {
      // Silent — the next tick broadcasts the cleared state.
    }
  }, [userId, getPosition, publishPosition]);

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
    /** My own active problem signal, or null. */
    myProblem,
    raiseProblem,
    clearProblem,
  };
});
