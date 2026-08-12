/**
 * Driveverse — the Main Quest's client state.
 *
 * Reads `user_main_quests` (the set of step ids this driver has finished),
 * keeps it live over realtime, and exposes the derived chain state from
 * `lib/mainQuest.ts`. The catalogue is `constants/mainQuests.ts`.
 *
 * WHY THIS IS A SEPARATE STORE FROM `useQuestStore`
 *   They look adjacent and are not. `useQuestStore` runs a generator
 *   (`ensure_daily_quests`), owns a per-day lifecycle, and reports indicator
 *   events. This one has no generator, no expiry and no events: eight fixed
 *   steps, one ledger table, read-only from the client except for three
 *   whitelisted RPC calls. Folding it into the quest store would put a
 *   day-scoped lifecycle around something that has none.
 *
 * WHY `loaded` IS EXPOSED SEPARATELY FROM THE IDS
 *   Before the first fetch resolves, "no completed steps" and "brand-new
 *   account" are the same empty array. The homepage nudge would flash on
 *   every cold start for drivers who finished the chain months ago if it
 *   could not tell those apart — so `shouldNudge` takes `loaded` as its own
 *   input rather than inferring it. See `lib/mainQuest.ts`.
 */

import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  capstoneUnlocked,
  mainQuestState,
  shouldNudge,
  type MainQuestState,
} from "@/lib/mainQuest";
import type { MainQuestStepId } from "@/constants/mainQuests";

interface MainQuestRow {
  step_id: string;
}

export const [MainQuestProvider, useMainQuest] = createContextHook(() => {
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  /* ─── Auth ──────────────────────────────────────────────── */

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

  /* ─── Load ──────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setCompletedIds([]);
      setLoaded(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("user_main_quests")
        .select("step_id")
        .eq("user_id", uid);
      if (error) return; // keep the last good list rather than blanking it
      setCompletedIds(((data ?? []) as MainQuestRow[]).map((r) => r.step_id));
      setLoaded(true);
    } catch {
      // Silent, matching the other stores. `loaded` stays false, which keeps
      // the homepage nudge quiet rather than showing a chain we can't read.
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setCompletedIds([]);
      setLoaded(false);
      return;
    }
    void refresh();

    // Five of the eight steps land from database triggers with no client
    // involvement at all — recording a drive, saving a place, a friend
    // accepting, a daily quest completing, a level change. Without this
    // subscription the chain would only ever update on a remount.
    const channel = supabase
      .channel(`main-quests-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_main_quests",
          filter: `user_id=eq.${userId}`,
        },
        () => void refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  /* ─── Report a client-observed step ─────────────────────── */

  /**
   * The three "you looked at this" steps. The SQL refuses anything else by
   * name, so calling this with a trigger-driven id is a no-op rather than a
   * hole — see `constants/mainQuests.ts`'s header.
   *
   * Fire-and-forget on purpose: every call site is a screen mounting or a
   * share completing, and none of them should show a spinner, block, or
   * surface an error for a tutorial tick. A failed call simply means the
   * step is picked up next time the driver does the same thing.
   */
  const completeStep = useCallback(
    async (stepId: MainQuestStepId): Promise<void> => {
      const uid = userIdRef.current;
      if (!uid) return;
      // Already done — skip the round trip entirely. The RPC is idempotent,
      // but these fire on every screen mount, so not asking is better.
      if (completedIds.includes(stepId)) return;
      try {
        const { data } = await supabase.rpc("complete_main_quest_step", {
          p_step_id: stepId,
        });
        // `true` means it was newly granted; refresh so the chain and the
        // XP bar move now rather than on the realtime round trip.
        if (data === true) await refresh();
      } catch {
        // Never surfaced. See above.
      }
    },
    [completedIds, refresh]
  );

  /* ─── Derived ───────────────────────────────────────────── */

  const state: MainQuestState = useMemo(
    () => mainQuestState(completedIds),
    [completedIds]
  );

  const nudge = useMemo(
    () => shouldNudge({ signedIn: !!userId, loaded, completedIds }),
    [userId, loaded, completedIds]
  );

  return useMemo(
    () => ({
      /** Every step with its done/current flag, in chain order. */
      steps: state.steps,
      /** The step to point the driver at, or null when the chain is done. */
      next: state.next,
      completed: state.completed,
      total: state.total,
      ratio: state.ratio,
      allComplete: state.allComplete,
      /** Whether the capstone is waiting only on the level, not the chain. */
      capstoneUnlocked: capstoneUnlocked(completedIds),
      /** Whether the homepage shows its notification. */
      showNudge: nudge,
      loaded,
      completedIds,
      refresh,
      completeStep,
    }),
    [state, completedIds, loaded, nudge, refresh, completeStep]
  );
});

export default useMainQuest;
