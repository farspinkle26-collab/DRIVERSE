import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuthStore";
import { PING_INTERVAL_MS, isMissingRpc, shouldPing } from "@/lib/lastActive";

/**
 * Keeps `profiles.last_active_at` current for the signed-in driver.
 *
 * Three triggers, which between them cover the whole shape of a session:
 *
 *   - **Mount**, once a session exists. This is the one that makes a driver
 *     who opens the app, looks at the map and closes it again countable — the
 *     case the trips/messages/quests approximation cannot see at all.
 *   - **Foreground**, on every AppState transition back to `active`. A phone
 *     that sat in a pocket for six hours has a stale timestamp and a live user.
 *   - **Heartbeat**, while the app stays open, so a 40-minute drive is
 *     recorded as ending when it ended rather than when it started.
 *
 * All three go through the same throttle (`lib/lastActive.ts`), and the RPC
 * throttles again server-side, so the steady-state cost of the heartbeat is
 * one indexed read every five minutes.
 *
 * LAUNCH SAFETY — this file is reachable from `app/_layout.tsx`, so it must
 * stay import-safe: everything it imports is already in the launch path
 * (`lib/supabase`, `hooks/useAuthStore`), no native module is looked up here,
 * and nothing runs at module scope. Every failure path below is swallowed:
 * this is a metric, and a metric must never be the reason a driver's app
 * misbehaves.
 */
export function useLastActivePing() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  // Local clock reading of the last ping we sent, per signed-in user. A ref
  // rather than state: nothing renders off it, and writing state here would
  // re-render the whole provider stack every five minutes.
  const lastPingedAtRef = useRef<number | null>(null);
  const pingedUserRef = useRef<string | null>(null);
  // Set once the RPC has answered "no such function" — the migration has not
  // been run against this project. Retrying that on every foreground for the
  // life of the process only fills the log; the next launch tries again.
  const disabledRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    // A different account signed in: their timestamp has its own throttle.
    if (pingedUserRef.current !== userId) {
      pingedUserRef.current = userId;
      lastPingedAtRef.current = null;
    }

    let cancelled = false;

    const ping = async () => {
      if (cancelled || disabledRef.current) return;
      const now = Date.now();
      if (!shouldPing(lastPingedAtRef.current, now)) return;
      // Claim the slot before awaiting, so a foreground event landing in the
      // same tick as the heartbeat does not send two requests.
      lastPingedAtRef.current = now;
      try {
        const { error } = await supabase.rpc("touch_last_active");
        if (!error) return;
        if (isMissingRpc(error)) {
          disabledRef.current = true;
          console.warn(
            "[lastActive] touch_last_active() is missing — run expo/database_migration_last_active.sql",
          );
          return;
        }
        // Transient: let the next trigger retry rather than waiting out the
        // full interval on a request that never landed.
        lastPingedAtRef.current = null;
        console.warn("[lastActive] ping failed:", error.message);
      } catch (e) {
        lastPingedAtRef.current = null;
        console.warn("[lastActive] ping threw:", (e as Error)?.message ?? e);
      }
    };

    void ping();

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") void ping();
    };
    const sub = AppState.addEventListener("change", onAppState);
    const heartbeat = setInterval(() => void ping(), PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(heartbeat);
    };
  }, [userId]);
}
