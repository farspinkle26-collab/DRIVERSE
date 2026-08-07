/**
 * Driveverse — the convoy's shared destination.
 *
 * When the leader routes somewhere, everyone in the convoy is going there.
 * That is the whole feature: one destination, owned by the leader, mirrored
 * onto the `parties` row (`dest_lat` / `dest_lng` / `dest_name` /
 * `dest_set_by` / `dest_set_at`) and pushed to every member over the realtime
 * subscription the party store already holds.
 *
 * Three rules earn a pure module rather than living inline in the map screen:
 *
 * 1. **Only the leader writes it.** The database enforces this too
 *    (`set_convoy_destination` checks `leader_id`), but the client has to know
 *    as well or every member's map would try to publish its own route the
 *    moment they tapped Route, and the last writer would win.
 * 2. **A write only happens when the destination actually changed.** The map
 *    re-runs its navigation effect on every GPS tick; without this the leader
 *    would PATCH the party row about once a second, and every member's device
 *    would take a realtime event and a full party reload for it.
 * 3. **A destination goes stale.** Nothing clears the row when a leader closes
 *    the app mid-drive, so a convoy that met up yesterday would still be
 *    pointed at yesterday's café. Age is checked on read instead of trusting
 *    a cleanup that may never run.
 */

/** Metres. Two destinations closer than this are the same place. */
const SAME_DESTINATION_METRES = 25;

/** A shared destination older than this is ignored on read. */
export const CONVOY_DESTINATION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface ConvoyDestination {
  lat: number;
  lng: number;
  /** Human label. May be a coordinate string; never empty. */
  name: string;
  /** The driver who set it — always the leader at the time of writing. */
  setBy: string;
  /** Epoch ms. */
  setAt: number;
}

/** The subset of a `parties` row this module reads. */
export interface ConvoyDestinationRow {
  dest_lat?: number | null;
  dest_lng?: number | null;
  dest_name?: string | null;
  dest_set_by?: string | null;
  dest_set_at?: string | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Reads a destination off a party row, or `null` when there isn't one.
 *
 * Returns `null` rather than a partial object for any row missing a
 * coordinate — including a row from a database that predates the columns,
 * where every field is `undefined`. That is what lets the shared-navigation
 * UI mount against an un-migrated database without erroring: no destination
 * is simply no banner.
 */
export function convoyDestinationFromRow(
  row: ConvoyDestinationRow | null | undefined
): ConvoyDestination | null {
  if (!row) return null;
  const { dest_lat: lat, dest_lng: lng } = row;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  // 0,0 is in the Gulf of Guinea. Every real row that gets there is a default
  // that was never filled in, so it is treated as "unset".
  if (lat === 0 && lng === 0) return null;

  const setAt = row.dest_set_at ? Date.parse(row.dest_set_at) : NaN;
  return {
    lat,
    lng,
    name: (row.dest_name ?? "").trim() || coordinateName(lat, lng),
    setBy: row.dest_set_by ?? "",
    setAt: Number.isFinite(setAt) ? setAt : 0,
  };
}

/** Fallback label for a destination nobody named. */
export function coordinateName(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Great-circle distance in metres. Small enough at these ranges that the
 * equirectangular approximation would do, but haversine costs nothing here
 * and doesn't need a caveat.
 */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True when a new destination is close enough to the published one that
 * re-publishing would be noise. Rule 2 above.
 */
export function sameConvoyDestination(
  a: { lat: number; lng: number } | null | undefined,
  b: { lat: number; lng: number } | null | undefined
): boolean {
  if (!a || !b) return false;
  return metresBetween(a, b) <= SAME_DESTINATION_METRES;
}

/** Rule 1: only the convoy's leader publishes a destination. */
export function canSetConvoyDestination(
  party: { leader_id: string } | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!party || !userId) return false;
  return party.leader_id === userId;
}

/** Rule 3. `maxAgeMs` is exposed for the test, not for callers to tune. */
export function isConvoyDestinationStale(
  destination: ConvoyDestination | null | undefined,
  nowMs: number,
  maxAgeMs: number = CONVOY_DESTINATION_MAX_AGE_MS
): boolean {
  if (!destination) return true;
  // setAt 0 means the row carried no timestamp — treat it as fresh rather
  // than hiding a destination that is plainly set. A missing timestamp is a
  // schema gap, not evidence of age.
  if (destination.setAt === 0) return false;
  return nowMs - destination.setAt > maxAgeMs;
}

/**
 * The destination a member's map should actually show: the published one,
 * unless it is stale or absent.
 */
export function activeConvoyDestination(
  destination: ConvoyDestination | null | undefined,
  nowMs: number
): ConvoyDestination | null {
  if (!destination) return null;
  return isConvoyDestinationStale(destination, nowMs) ? null : destination;
}

/**
 * Banner copy. The leader and the members are told different things because
 * they can do different things about it — the leader can clear it, a member
 * can only follow it.
 */
export function convoyDestinationHeadline(
  destination: ConvoyDestination,
  options: { isLeader: boolean; leaderName?: string; convoyName?: string }
): string {
  if (options.isLeader) return `Your convoy is routed to ${destination.name}`;
  const who = options.leaderName?.trim() || "The leader";
  return `${who} set a destination — ${destination.name}`;
}
