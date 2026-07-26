/**
 * Driveverse — "is that other driver Platinum?"
 *
 * The badge renders next to every username in the app, and a client can only
 * read its OWN RevenueCat entitlement. Other drivers' status comes from the
 * `are_platinum()` RPC, which returns nothing but a boolean per id — see
 * `database_migration_platinum.sql` for why the projection is that narrow.
 *
 * This is a DISPLAY lookup. Nothing is authorised on it: the signed-in
 * driver's own gate is still `usePlatinum().isPlatinum`, straight from the
 * RevenueCat SDK, and every write is still checked by the database triggers.
 *
 * CACHING
 *   A module-level cache shared by every caller, so a screen that renders
 *   forty names asks once and a second screen showing the same drivers asks
 *   not at all. Entries expire after 5 minutes — a badge appearing a few
 *   minutes late for someone who just subscribed is not worth a round trip
 *   per list render.
 *
 * Usage:
 *   const platinumIds = usePlatinumDirectory(members.map((m) => m.user_id));
 *   <PlatinumNameBadge show={platinumIds.has(member.user_id)} />
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  isPlatinum: boolean;
  fetchedAt: number;
}

/** Shared across every hook instance, deliberately — see header. */
const cache = new Map<string, CacheEntry>();

/** Ids currently being fetched, so concurrent lists don't duplicate work. */
const inFlight = new Set<string>();

function fresh(id: string): boolean {
  const entry = cache.get(id);
  return entry !== undefined && Date.now() - entry.fetchedAt < TTL_MS;
}

async function fetchStatuses(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  ids.forEach((id) => inFlight.add(id));
  try {
    const { data, error } = await supabase.rpc("are_platinum", { uids: ids });
    if (error) throw error;
    const now = Date.now();
    for (const row of (data ?? []) as { user_id: string; is_platinum: boolean }[]) {
      cache.set(row.user_id, { isPlatinum: row.is_platinum, fetchedAt: now });
    }
    // Ids the RPC didn't answer for are cached as false rather than left
    // unknown, so a list doesn't re-ask for them on every render.
    for (const id of ids) {
      if (!cache.has(id)) cache.set(id, { isPlatinum: false, fetchedAt: now });
    }
  } catch {
    // A failed lookup means no badges this pass — never a broken list. Not
    // cached, so the next render retries.
  } finally {
    ids.forEach((id) => inFlight.delete(id));
  }
}

/**
 * The subset of `userIds` that hold an active Platinum subscription.
 *
 * Returns a `Set` so call sites are a membership test rather than a find.
 */
export function usePlatinumDirectory(userIds: (string | null | undefined)[]): Set<string> {
  // Stable key so the effect doesn't re-run on every parent render for the
  // same list of drivers.
  const ids = useMemo(
    () => Array.from(new Set(userIds.filter((id): id is string => !!id))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userIds.join(",")]
  );

  const [version, setVersion] = useState(0);

  useEffect(() => {
    const missing = ids.filter((id) => !fresh(id) && !inFlight.has(id));
    if (missing.length === 0) return;

    let active = true;
    void fetchStatuses(missing).then(() => {
      if (active) setVersion((v) => v + 1);
    });
    return () => {
      active = false;
    };
  }, [ids]);

  return useMemo(() => {
    const result = new Set<string>();
    for (const id of ids) {
      if (cache.get(id)?.isPlatinum) result.add(id);
    }
    return result;
    // `version` is the invalidation signal — the cache itself is not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, version]);
}

/** Single-driver convenience, for a profile page viewing one other person. */
export function useIsDriverPlatinum(userId: string | null | undefined): boolean {
  const ids = useMemo(() => [userId], [userId]);
  const directory = usePlatinumDirectory(ids);
  return userId ? directory.has(userId) : false;
}

/**
 * Drops a driver from the cache. Call after the signed-in driver's own
 * entitlement changes so their badge updates immediately in lists that read
 * through the directory rather than through `usePlatinum()`.
 */
export function invalidatePlatinumStatus(userId: string): void {
  cache.delete(userId);
}

export default usePlatinumDirectory;
