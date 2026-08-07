import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import {
  DailyQuest,
  QuestStats,
  Badge,
  UserBadge,
  QuestEventResult,
  QuestEventType,
  sortByDifficulty,
  pendingRewards,
  questDay,
} from "@/lib/questEngine";

// ─── Store ───────────────────────────────────────────────────────────
// Talks to the server-side quest engine (ensure_daily_quests +
// record_quest_event RPCs). Generation is lazy: the first call each day
// generates the user's 3 universal quests. Quests are AUTO-completed —
// there is no manual "mark complete". Progress advances only through real
// indicators (distance driven, top speed reached, a friend made) reported
// via record_quest_event (and server-side triggers for distance/speed/friends).
// Rewards — XP, coins, streak, badges — are granted server-side the moment
// an indicator meets the target, so levelling has a single source of truth.
export const [QuestsProvider, useQuests] = createContextHook(() => {
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [stats, setStats] = useState<QuestStats | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earnedBadgeIds, setEarnedBadgeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const generatedForRef = useRef<string | null>(null); // guards duplicate generation
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // ─── Auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // ─── Best-effort current location (never blocks quest loading) ──────
  const getLocation = useCallback(async (): Promise<{
    lat: number | null;
    lng: number | null;
  }> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      let granted = status === "granted";
      if (!granted) {
        const req = await Location.requestForegroundPermissionsAsync();
        granted = req.status === "granted";
      }
      if (!granted) return { lat: null, lng: null };
      const pos = await Location.getLastKnownPositionAsync();
      const point =
        pos ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      return { lat: point.coords.latitude, lng: point.coords.longitude };
    } catch {
      return { lat: null, lng: null };
    }
  }, []);

  // ─── Fetch today's quests + stats + badges ─────────────────────────
  const fetchState = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setQuests([]);
      setStats(null);
      setEarnedBadgeIds([]);
      return;
    }
    try {
      const day = questDay();

      const [{ data: questRows }, { data: statRow }, { data: earned }] =
        await Promise.all([
          supabase
            .from("daily_quests")
            .select("*")
            .eq("user_id", uid)
            .eq("quest_date", day)
            .neq("status", "expired"),
          supabase
            .from("user_quest_stats")
            .select("*")
            .eq("user_id", uid)
            .maybeSingle(),
          supabase.from("user_badges").select("badge_id").eq("user_id", uid),
        ]);

      setQuests(sortByDifficulty((questRows ?? []) as DailyQuest[]));
      setStats((statRow as QuestStats | null) ?? null);
      setEarnedBadgeIds(
        ((earned ?? []) as UserBadge[]).map((b) => b.badge_id)
      );
    } catch {
      // Silent — keep last good state
    }
  }, []);

  // ─── Generate (or fetch existing) today's quests ───────────────────
  const generateQuests = useCallback(
    async (opts?: { weather?: string; event?: string }) => {
      const uid = userIdRef.current;
      if (!uid) return;

      // Only auto-generate once per day per session.
      const guardKey = `${uid}:${questDay()}`;

      setGenerating(true);
      try {
        const { lat, lng } = await getLocation();
        const { data, error } = await supabase.rpc("ensure_daily_quests", {
          p_lat: lat,
          p_lng: lng,
          p_weather: opts?.weather ?? null,
          p_event: opts?.event ?? null,
        });
        if (!error && data) {
          setQuests(sortByDifficulty(data as DailyQuest[]));
          generatedForRef.current = guardKey;
        }
      } catch {
        // Silent — fall back to whatever fetchState found
      } finally {
        setGenerating(false);
      }
      // Refresh stats/badges alongside
      await fetchState();
    },
    [getLocation, fetchState]
  );

  // ─── Load on auth + realtime + daily ensure ────────────────────────
  useEffect(() => {
    if (!userId) {
      setQuests([]);
      setStats(null);
      setEarnedBadgeIds([]);
      generatedForRef.current = null;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const day = questDay();
    const guardKey = `${userId}:${day}`;

    setLoading(true);
    (async () => {
      // Load the badge catalogue once (rarely changes)
      const { data: badgeRows } = await supabase
        .from("badges")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setBadges((badgeRows ?? []) as Badge[]);

      await fetchState();

      // If today's set isn't present yet, generate it.
      if (generatedForRef.current !== guardKey) {
        const { data: existing } = await supabase
          .from("daily_quests")
          .select("id")
          .eq("user_id", userId)
          .eq("quest_date", day)
          .neq("status", "expired");
        if (!existing || existing.length < 3) {
          await generateQuests();
        } else {
          generatedForRef.current = guardKey;
        }
      }
    })().finally(() => setLoading(false));

    const channel = supabase
      .channel("quests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_quests", filter: `user_id=eq.${userId}` },
        () => fetchState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_quest_stats", filter: `user_id=eq.${userId}` },
        () => fetchState()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_badges", filter: `user_id=eq.${userId}` },
        () => fetchState()
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ─── Report a real-world indicator ─────────────────────────────────
  // The ONLY way quest progress advances. Call this from the app's genuine
  // signals — e.g. after a drive is recorded (`drive_distance`, km) or a
  // photo is taken (`photo_capture`). Distance, top speed and friends also
  // fire server-side triggers automatically, so those need no client call.
  //
  // Any matching quest that reaches its target auto-completes server-side;
  // XP/coins/streak/badges are granted there. Returns the quests that were
  // just completed so the UI can celebrate.
  const recordEvent = useCallback(
    async (
      eventType: QuestEventType,
      amount: number = 1
    ): Promise<{ completed: QuestEventResult[]; error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { completed: [], error: "Not signed in" };
      if (!amount || amount <= 0) return { completed: [] };

      const { data, error } = await supabase.rpc("record_quest_event", {
        p_event_type: eventType,
        p_amount: amount,
      });
      if (error) {
        await fetchState();
        return { completed: [], error: error.message };
      }

      const rows = (data as QuestEventResult[] | null) ?? [];
      // Realtime will refresh, but refresh immediately for snappy UI.
      await fetchState();
      return { completed: rows.filter((r) => r.completed) };
    },
    [fetchState]
  );

  // Convenience wrappers for the common indicators.
  const recordDrive = useCallback(
    (km: number) => recordEvent("drive_distance", km),
    [recordEvent]
  );
  const recordSpeed = useCallback(
    (kmh: number) => recordEvent("reach_speed", kmh),
    [recordEvent]
  );
  const recordPhoto = useCallback(
    (count: number = 1) => recordEvent("photo_capture", count),
    [recordEvent]
  );

  // ─── Derived helpers ───────────────────────────────────────────────
  const activeQuests = quests.filter((q) => q.status === "active");
  const completedQuests = quests.filter((q) => q.status === "completed");
  const allDone = quests.length > 0 && activeQuests.length === 0;
  const claimable = pendingRewards(quests);
  const coins = stats?.coins ?? 0;
  const streak = stats?.current_streak ?? 0;

  return {
    quests,
    activeQuests,
    completedQuests,
    allDone,
    stats,
    coins,
    streak,
    claimable,
    badges,
    earnedBadgeIds,
    loading,
    generating,
    refresh: fetchState,
    generateQuests,
    // Indicator intake (quests auto-complete — no manual claim).
    recordEvent,
    recordDrive,
    recordSpeed,
    recordPhoto,
  };
});
