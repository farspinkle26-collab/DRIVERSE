/**
 * The shape of a driver on the live map, and the rule for folding the two
 * paths they can arrive on into one list.
 *
 * This lives apart from `useOnlineUsers` for one reason: the hook itself
 * pulls in Supabase, expo-location and React Native's AppState, none of which
 * a unit test can load — while the merge rule is the part most worth testing,
 * because getting it wrong makes drivers flicker on and off the map rather
 * than fail loudly.
 */

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
  /**
   * Which path this driver reached us on. `presence` is instant; `directory`
   * means we only have their last persisted position from `user_locations`,
   * which is up to one poll interval behind. Nothing in the UI has to care,
   * but it makes the two paths distinguishable when debugging a device that
   * can see others but isn't being seen.
   */
  source?: "presence" | "directory";
}

/**
 * A position older than this is not "someone near you", it's a ghost — from a
 * killed app, a suspended device, or a row the cleanup job hasn't reaped.
 */
export const STALE_AFTER_MS = 90_000;

export const isFresh = (updatedAt: string | null | undefined, now = Date.now()) => {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return false;
  return now - t < STALE_AFTER_MS;
};

/**
 * Fold the presence list and the polled directory into the one list the map
 * renders.
 *
 * Presence normally wins for the same driver — it is the fresher of the two
 * by construction — but right after a rejoin the polled row can genuinely be
 * the newer position, so the timestamp decides rather than a blanket
 * preference. Stale entries are dropped on both paths, so a driver whose app
 * was killed leaves the map instead of sitting there as a marker nobody can
 * reach.
 */
export function mergeOnlineUsers(
  presence: OnlineUser[],
  directory: OnlineUser[],
  now = Date.now()
): OnlineUser[] {
  const merged = new Map<string, OnlineUser>();
  for (const u of directory) {
    if (isFresh(u.updated_at, now)) merged.set(u.user_id, u);
  }
  for (const u of presence) {
    if (!isFresh(u.updated_at, now)) continue;
    const existing = merged.get(u.user_id);
    if (existing && Date.parse(existing.updated_at) > Date.parse(u.updated_at)) continue;
    merged.set(u.user_id, u);
  }
  return [...merged.values()];
}

/**
 * Drops anyone in `presence` whose `user_locations` row has just told us
 * `is_online: false`.
 *
 * Presence has no expiry of its own — a driver's last-tracked entry sits in
 * `channel.presenceState()` exactly as it was until an explicit `leave`
 * arrives, which never happens if `untrack()` timed out or errored on the
 * way out (`useOnlineUsers.ts`'s `goOffline` — the same failure category
 * `publishPosition`'s `track()` already had to guard against). That stale
 * entry is still fresh by timestamp for up to `STALE_AFTER_MS`, so
 * `mergeOnlineUsers` alone would keep rendering a driver who explicitly
 * turned visibility off. The `user_locations` poll is the one path
 * unaffected by presence's own failure mode, so it is what gets to say "no,
 * really, they're gone" — this is that override, kept pure and separate
 * from the merge rule itself so it can be pinned by a test the same way.
 */
export function pruneRecentlyOffline(
  presence: OnlineUser[],
  recentlyOfflineIds: Iterable<string>
): OnlineUser[] {
  const offline = recentlyOfflineIds instanceof Set ? recentlyOfflineIds : new Set(recentlyOfflineIds);
  if (offline.size === 0) return presence;
  return presence.filter((u) => !offline.has(u.user_id));
}
