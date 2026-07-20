import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import { useXP } from "@/hooks/useXPStore";
import {
  DailyQuest,
  QuestStats,
  Badge,
  UserBadge,
  CompleteQuestResult,
  sortByDifficulty,
  pendingRewards,
} from "@/lib/questEngine";

// ─── Store ───────────────────────────────────────────────────────────
// Talks to the server-side quest engine (ensure_daily_quests /
// complete_quest / update_quest_progress RPCs). Generation is lazy: the
// first call each day generates the user's 3 quests using their live
// location, level, and the server clock. XP is applied through the
// existing useXP pipeline so levelling has a single source of truth;
// coins/streak/badges are tracked server-side.
export const [QuestsProvider, useQuests] = createContextHook(() => {
  const { addXP } = useXP();

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
      const today = new Date();
      const jakartaDay = new Date(today.getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);

      const [{ data: questRows }, { data: statRow }, { data: earned }] =
        await Promise.all([
          supabase
            .from("daily_quests")
            .select("*")
            .eq("user_id", uid)
            .eq("quest_date", jakartaDay)
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
      const today = new Date();
      const jakartaDay = new Date(today.getTime() + 7 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      const guardKey = `${uid}:${jakartaDay}`;

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

    const today = new Date();
    const jakartaDay = new Date(today.getTime() + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const guardKey = `${userId}:${jakartaDay}`;

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
          .eq("quest_date", jakartaDay)
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

  // ─── Update progress on an active quest ────────────────────────────
  const updateProgress = useCallback(
    async (questId: string, progress: number): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };

      // Optimistic
      setQuests((prev) =>
        prev.map((q) =>
          q.id === questId
            ? { ...q, progress: Math.max(0, Math.min(progress, q.target)) }
            : q
        )
      );

      const { error } = await supabase.rpc("update_quest_progress", {
        p_quest_id: questId,
        p_progress: progress,
      });
      if (error) {
        await fetchState();
        return { error: error.message };
      }
      return {};
    },
    [fetchState]
  );

  // ─── Complete / claim a quest ──────────────────────────────────────
  const completeQuest = useCallback(
    async (
      questId: string
    ): Promise<{ result?: CompleteQuestResult; error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };

      const { data, error } = await supabase.rpc("complete_quest", {
        p_quest_id: questId,
      });
      if (error) return { error: error.message };

      // RPC returns a single-row table
      const row = (Array.isArray(data) ? data[0] : data) as
        | CompleteQuestResult
        | undefined;

      if (row?.awarded) {
        // Apply XP through the existing levelling pipeline (single source
        // of truth). Coins/streak/badges were granted server-side.
        if (row.xp_reward > 0) addXP(row.xp_reward);
      }
      await fetchState();
      return { result: row };
    },
    [addXP, fetchState]
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
    updateProgress,
    completeQuest,
  };
});
