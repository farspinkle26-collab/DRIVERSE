/**
 * Driveverse — the rule for when to ping `profiles.last_active_at`.
 *
 * The hook that does the pinging (`hooks/useLastActivePing.ts`) pulls in
 * Supabase, React and React Native's AppState. The part worth testing is the
 * decision, not the transport: a ping that fires too often turns a metric
 * nobody reads in real time into a row update per driver per foreground event,
 * and a ping that fires too rarely reports a driver as gone while they are
 * looking at the map.
 *
 * The interval here is deliberately the same 5 minutes the SQL side throttles
 * to (`database_migration_last_active.sql`). The client throttle saves the
 * round trip; the SQL throttle is what actually protects the table, because a
 * build that shipped with the wrong number here cannot be recalled.
 */

/**
 * Minimum gap between two pings from one device. Matches the server-side
 * throttle — see the migration's header for why the check exists in both
 * places.
 */
export const PING_INTERVAL_MS = 5 * 60_000;

/**
 * Should we ping now?
 *
 * `lastPingedAt` is the local clock reading from this device's previous ping,
 * or `null`/`undefined` when it has not pinged yet in this process — the first
 * ping of a launch always goes, which is the one that makes "opened the app
 * and did nothing" countable at all.
 *
 * A `lastPingedAt` in the future is treated as "ping" rather than "wait": that
 * is a clock that moved backwards (a manual time change, an NTP correction),
 * and the alternative is a device that goes silent until real time catches up
 * with the bad reading.
 */
export function shouldPing(
  lastPingedAt: number | null | undefined,
  now: number,
  intervalMs: number = PING_INTERVAL_MS,
): boolean {
  if (lastPingedAt == null || !Number.isFinite(lastPingedAt)) return true;
  const elapsed = now - lastPingedAt;
  if (elapsed < 0) return true;
  return elapsed >= intervalMs;
}

/**
 * True when a Supabase error means the RPC does not exist on this project —
 * i.e. the migration has not been run against the database this build is
 * pointed at.
 *
 * Worth distinguishing because the two failure modes want opposite handling: a
 * network error is transient and the next foreground should try again, while a
 * missing function will fail identically forever, and retrying it every five
 * minutes only fills the log. PostgREST reports it as `PGRST202`; the message
 * check is a fallback for older versions that answered with a bare 404.
 */
export function isMissingRpc(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("could not find the function") || msg.includes("does not exist");
}
