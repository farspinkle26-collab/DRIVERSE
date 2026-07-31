import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { applyXpGain, xpForLevel, type XPState } from "@/lib/xpMath";

const STORAGE_KEY = "driveverse_xp";

const INITIAL_STATE: XPState = { level: 1, xp: 0, totalXp: 0 };

export const [XPProvider, useXP] = createContextHook(() => {
  const [state, setState] = useState<XPState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Always-current mirror of `state`. `addXP` reads and advances this rather
  // than the value captured in its closure, so two awards fired in the same
  // tick (drive XP + a quest completing, say) compound instead of the second
  // clobbering the first from a stale base. See lib/xpMath.ts.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Check for session to sync with Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load XP from Supabase (or AsyncStorage fallback) when userId changes
  useEffect(() => {
    if (!userId) {
      // No auth — load from local storage
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as XPState;
            setState(parsed);
          }
        } catch {
          // Use defaults
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // Load from Supabase
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_xp")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (error || !data) {
          // Create XP row if missing
          await supabase.from("user_xp").upsert({
            user_id: userId,
            level: 1,
            xp: 0,
            total_xp: 0,
            xp_required_for_level: xpForLevel(1),
          });
          setState(INITIAL_STATE);
        } else {
          setState({
            level: data.level,
            xp: data.xp,
            totalXp: data.total_xp,
          });
        }
      } catch {
        // Fallback to local
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as XPState;
            setState(parsed);
          }
        } catch {
          // Use defaults
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Reflect server-side XP grants (e.g. quests auto-completing from
  // indicators) live, so the client never double-applies or drifts.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user-xp-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_xp",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as
            | { level: number; xp: number; total_xp: number }
            | undefined;
          if (row) {
            setState({ level: row.level, xp: row.xp, totalXp: row.total_xp });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Persist — to Supabase if authenticated, otherwise AsyncStorage
  const persist = useCallback(
    async (s: XPState) => {
      // Always save locally as fallback
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      } catch {
        // Silent
      }

      // Sync to Supabase if authenticated
      if (userId) {
        try {
          await supabase.from("user_xp").upsert({
            user_id: userId,
            level: s.level,
            xp: s.xp,
            total_xp: s.totalXp,
            xp_required_for_level: xpForLevel(s.level),
          });
        } catch {
          // Silent
        }
      }
    },
    [userId]
  );

  const addXP = useCallback(
    (amount: number): number => {
      const next = applyXpGain(stateRef.current, amount);
      stateRef.current = next;
      persist(next);
      setState(next);
      return next.level;
    },
    [persist]
  );

  const xpCurrentLevel = state.xp;
  const xpRequired = xpForLevel(state.level);
  const xpProgress = xpRequired > 0 ? state.xp / xpRequired : 1;

  return {
    level: state.level,
    xp: state.xp,
    totalXp: state.totalXp,
    xpCurrentLevel,
    xpRequired,
    xpProgress,
    loading,
    addXP,
  };
});
