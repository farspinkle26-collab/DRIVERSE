// Pure analytics functions over already-fetched rows. No I/O, no server
// imports — safe to run in client components so range toggles recompute
// instantly. Every function is deterministic given its inputs.

import { RangeKey, parseDate, rangeWindow, previousWindow, dayKey, lastNDays } from "./dates";
import { rankForLevel, RANKS } from "./ranks";
import type {
  ProfileRow,
  TripRow,
  DailyQuestRow,
  EventRow,
  EventParticipantRow,
  PartyRow,
  PartyMemberRow,
  PlaceRow,
  CarRow,
} from "./types";

// ── Generic counting ─────────────────────────────────────────────────
export function countInRange<T>(
  rows: T[],
  getTs: (r: T) => string | null,
  key: RangeKey,
  now = new Date(),
): number {
  const w = rangeWindow(key, now);
  return rows.reduce((n, r) => {
    const d = parseDate(getTs(r));
    return d && d >= w.start && d <= w.end ? n + 1 : n;
  }, 0);
}

export function countInPrev<T>(
  rows: T[],
  getTs: (r: T) => string | null,
  key: RangeKey,
  now = new Date(),
): number | null {
  const w = previousWindow(key, now);
  if (!w) return null;
  return rows.reduce((n, r) => {
    const d = parseDate(getTs(r));
    return d && d >= w.start && d <= w.end ? n + 1 : n;
  }, 0);
}

// ── Activity (DAU/WAU/MAU + retention) ───────────────────────────────
// IMPORTANT: Driveverse does not track true app-opens / last-active. These are
// APPROXIMATIONS built by unioning per-day activity timestamps from trips,
// messages, quests and saved routes. They count users who *did something*, not
// users who merely opened the app. Surface this caveat in the UI.

export interface ActivityEvent {
  userId: string;
  ts: string | null;
}

/** Map of UTC day -> set of user ids active that day. */
export function activityByDay(events: ActivityEvent[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of events) {
    const d = parseDate(e.ts);
    if (!d || !e.userId) continue;
    const k = dayKey(d);
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(e.userId);
  }
  return map;
}

/** Distinct active users within the last `days` days. */
export function activeUsers(byDay: Map<string, Set<string>>, days: number, now = new Date()): number {
  const keys = lastNDays(days, now);
  const set = new Set<string>();
  for (const k of keys) {
    const s = byDay.get(k);
    if (s) s.forEach((u) => set.add(u));
  }
  return set.size;
}

/** DAU time series for the last N days. */
export function dauSeries(byDay: Map<string, Set<string>>, days: number, now = new Date()) {
  return lastNDays(days, now).map((k) => ({
    day: k,
    dau: byDay.get(k)?.size ?? 0,
  }));
}

/** Per-user set of active UTC days. */
export function activityByUser(events: ActivityEvent[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of events) {
    const d = parseDate(e.ts);
    if (!d || !e.userId) continue;
    if (!map.has(e.userId)) map.set(e.userId, new Set());
    map.get(e.userId)!.add(dayKey(d));
  }
  return map;
}

/**
 * N-day retention (approximate): of users whose signup was at least N days ago,
 * the fraction that had any activity on their (signup + N) UTC calendar day.
 * Returns null when no cohort qualifies yet.
 */
export function retention(
  profiles: ProfileRow[],
  byUser: Map<string, Set<string>>,
  n: number,
  now = new Date(),
): number | null {
  let denom = 0;
  let num = 0;
  for (const p of profiles) {
    const signup = parseDate(p.created_at);
    if (!signup) continue;
    const target = new Date(signup.getTime() + n * 86400000);
    if (target > now) continue; // hasn't had the chance to return yet
    denom++;
    const set = byUser.get(p.id);
    if (set && set.has(dayKey(target))) num++;
  }
  if (denom === 0) return null;
  return (num / denom) * 100;
}

// ── Users ────────────────────────────────────────────────────────────
export function cumulativeUsers(profiles: ProfileRow[]) {
  const days = profiles
    .map((p) => parseDate(p.created_at))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  const byDay = new Map<string, number>();
  for (const d of days) {
    const k = dayKey(d);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  let running = 0;
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, added]) => {
      running += added;
      return { day, total: running, added };
    });
}

export function roleDistribution(profiles: ProfileRow[]) {
  const roles = ["customer", "driver", "company"] as const;
  return roles.map((role) => ({
    role,
    count: profiles.filter((p) => p.role === role).length,
  }));
}

export function verificationBreakdown(profiles: ProfileRow[]) {
  const roles = ["customer", "driver", "company"] as const;
  return roles.map((role) => {
    const subset = profiles.filter((p) => p.role === role);
    const verified = subset.filter((p) => p.verification_status === "verified").length;
    const pending = subset.filter(
      (p) => p.verification_status === "pending" || p.verification_status === "under_review",
    ).length;
    const other = subset.length - verified - pending;
    return { role, verified, pending, other, total: subset.length };
  });
}

// ── Trips ────────────────────────────────────────────────────────────
export function tripsInRange(trips: TripRow[], key: RangeKey, now = new Date()): TripRow[] {
  const w = rangeWindow(key, now);
  return trips.filter((t) => {
    const d = parseDate(t.created_at);
    return d && d >= w.start && d <= w.end;
  });
}

export function tripAggregates(trips: TripRow[]) {
  const n = trips.length;
  if (n === 0) {
    return { count: 0, totalDistance: 0, avgDistance: 0, avgDuration: 0, avgSpeed: 0 };
  }
  const totalDistance = trips.reduce((s, t) => s + (t.distance_km ?? 0), 0);
  const totalDuration = trips.reduce((s, t) => s + (t.duration_seconds ?? 0), 0);
  const speedVals = trips.map((t) => t.avg_speed_kmh ?? 0).filter((v) => v > 0);
  const avgSpeed = speedVals.length ? speedVals.reduce((a, b) => a + b, 0) / speedVals.length : 0;
  return {
    count: n,
    totalDistance,
    avgDistance: totalDistance / n,
    avgDuration: totalDuration / n,
    avgSpeed,
  };
}

/** Trips-per-day series for the last N days. */
export function tripsPerDay(trips: TripRow[], days: number, now = new Date()) {
  const byDay = new Map<string, number>();
  for (const t of trips) {
    const d = parseDate(t.created_at);
    if (!d) continue;
    const k = dayKey(d);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  return lastNDays(days, now).map((k) => ({ day: k, trips: byDay.get(k) ?? 0 }));
}

/** Best-effort top destinations by trip volume (clusters by destination name). */
export function topDestinations(trips: TripRow[], limit = 10) {
  const byName = new Map<string, number>();
  for (const t of trips) {
    const name = (t.destination_name || "").trim();
    if (!name) continue;
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }
  return Array.from(byName.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ── Quests & XP ──────────────────────────────────────────────────────
export function questCompletionByDifficulty(quests: DailyQuestRow[]) {
  const diffs = ["easy", "medium", "hard"] as const;
  return diffs.map((difficulty) => {
    const subset = quests.filter((q) => q.difficulty === difficulty);
    const completed = subset.filter((q) => q.status === "completed").length;
    return {
      difficulty,
      assigned: subset.length,
      completed,
      rate: subset.length ? (completed / subset.length) * 100 : 0,
    };
  });
}

export function questCompletionByCategory(quests: DailyQuestRow[]) {
  const cats = new Map<string, { assigned: number; completed: number }>();
  for (const q of quests) {
    const c = q.category || "unknown";
    if (!cats.has(c)) cats.set(c, { assigned: 0, completed: 0 });
    const rec = cats.get(c)!;
    rec.assigned++;
    if (q.status === "completed") rec.completed++;
  }
  return Array.from(cats.entries())
    .map(([category, r]) => ({
      category,
      assigned: r.assigned,
      completed: r.completed,
      rate: r.assigned ? (r.completed / r.assigned) * 100 : 0,
    }))
    .sort((a, b) => b.assigned - a.assigned);
}

export function questsByTemplate(
  quests: DailyQuestRow[],
  templateTitle: (id: string) => string,
) {
  const byTpl = new Map<string, { assigned: number; completed: number; difficulty: string }>();
  for (const q of quests) {
    const id = q.template_id || "(none)";
    if (!byTpl.has(id)) byTpl.set(id, { assigned: 0, completed: 0, difficulty: q.difficulty || "" });
    const rec = byTpl.get(id)!;
    rec.assigned++;
    if (q.status === "completed") rec.completed++;
  }
  return Array.from(byTpl.entries()).map(([id, r]) => ({
    templateId: id,
    title: templateTitle(id),
    difficulty: r.difficulty,
    assigned: r.assigned,
    completed: r.completed,
    rate: r.assigned ? (r.completed / r.assigned) * 100 : 0,
  }));
}

/** Histogram of users across the 12 rank tiers, from current level. */
export function rankDistribution(xp: { level: number | null }[]) {
  const counts = new Map<string, number>();
  for (const r of RANKS) counts.set(r.id, 0);
  for (const u of xp) {
    const rank = rankForLevel(u.level ?? 1);
    counts.set(rank.id, (counts.get(rank.id) ?? 0) + 1);
  }
  return RANKS.map((r) => ({ id: r.id, name: r.name, color: r.color, count: counts.get(r.id) ?? 0 }));
}

// ── Events & Convoys ─────────────────────────────────────────────────
export function eventsByType(events: EventRow[]) {
  const types = ["meetup", "convoy", "cruise", "race"] as const;
  return types.map((event_type) => ({
    type: event_type,
    count: events.filter((e) => e.event_type === event_type).length,
  }));
}

export function avgAttendance(events: EventRow[], participants: EventParticipantRow[]): number {
  if (events.length === 0) return 0;
  const byEvent = new Map<string, number>();
  for (const p of participants) byEvent.set(p.event_id, (byEvent.get(p.event_id) ?? 0) + 1);
  const total = events.reduce((s, e) => s + (byEvent.get(e.id) ?? 0), 0);
  return total / events.length;
}

export function convoySizeDistribution(parties: PartyRow[], members: PartyMemberRow[]) {
  const byParty = new Map<string, number>();
  for (const m of members) {
    if (m.status === "accepted") byParty.set(m.party_id, (byParty.get(m.party_id) ?? 0) + 1);
  }
  const buckets = [
    { label: "1", test: (n: number) => n <= 1 },
    { label: "2", test: (n: number) => n === 2 },
    { label: "3", test: (n: number) => n === 3 },
    { label: "4", test: (n: number) => n === 4 },
    { label: "5+", test: (n: number) => n >= 5 },
  ];
  return buckets.map((b) => ({
    size: b.label,
    count: parties.filter((p) => b.test(byParty.get(p.id) ?? 0)).length,
  }));
}

export function topOrganizers(
  events: EventRow[],
  nameFor: (userId: string) => string,
  limit = 10,
) {
  const byUser = new Map<string, number>();
  for (const e of events) byUser.set(e.creator_id, (byUser.get(e.creator_id) ?? 0) + 1);
  return Array.from(byUser.entries())
    .map(([userId, count]) => ({ userId, name: nameFor(userId), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ── Places ───────────────────────────────────────────────────────────
export function placesByCategory(places: PlaceRow[]) {
  const cats = new Map<string, { approved: number; pending: number; rejected: number }>();
  for (const p of places) {
    const c = p.category || "unknown";
    if (!cats.has(c)) cats.set(c, { approved: 0, pending: 0, rejected: 0 });
    const rec = cats.get(c)!;
    if (p.status === "approved") rec.approved++;
    else if (p.status === "pending") rec.pending++;
    else if (p.status === "rejected") rec.rejected++;
  }
  return Array.from(cats.entries()).map(([category, r]) => ({ category, ...r, total: r.approved + r.pending + r.rejected }));
}

/** De-dupe OSM cache payloads by category + rounded coords + name (approx). */
export function osmPlaceCountByCategory(cacheRows: { category: string | null; payload: unknown }[]) {
  const seen = new Map<string, Set<string>>();
  for (const row of cacheRows) {
    const payload = row.payload;
    if (!Array.isArray(payload)) continue;
    for (const place of payload as any[]) {
      const cat = (place?.category as string) || row.category || "unknown";
      const lat = typeof place?.lat === "number" ? place.lat.toFixed(4) : "?";
      const lng = typeof place?.lng === "number" ? place.lng.toFixed(4) : "?";
      const key = `${(place?.name || "").toLowerCase()}|${lat}|${lng}`;
      if (!seen.has(cat)) seen.set(cat, new Set());
      seen.get(cat)!.add(key);
    }
  }
  return Array.from(seen.entries()).map(([category, set]) => ({ category, count: set.size }));
}

// ── Garage ───────────────────────────────────────────────────────────
export function carsAggregate(cars: CarRow[], userCount: number) {
  return {
    total: cars.length,
    avgPerUser: userCount > 0 ? cars.length / userCount : 0,
  };
}

/** Most common makes. Free-text field, so we normalise case + trim. */
export function topMakes(cars: CarRow[], excludeStarter: boolean, limit = 12) {
  const byMake = new Map<string, number>();
  for (const c of cars) {
    // The starter car everyone is seeded with is a Honda Civic Type R.
    if (excludeStarter && (c.make || "").toLowerCase() === "honda" && (c.model || "").toLowerCase() === "civic type r") {
      continue;
    }
    const make = (c.make || "").trim();
    if (!make) continue;
    const norm = make.charAt(0).toUpperCase() + make.slice(1).toLowerCase();
    byMake.set(norm, (byMake.get(norm) ?? 0) + 1);
  }
  return Array.from(byMake.entries())
    .map(([make, count]) => ({ make, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function topModels(cars: CarRow[], excludeStarter: boolean, limit = 12) {
  const byModel = new Map<string, number>();
  for (const c of cars) {
    if (excludeStarter && (c.make || "").toLowerCase() === "honda" && (c.model || "").toLowerCase() === "civic type r") {
      continue;
    }
    const make = (c.make || "").trim();
    const model = (c.model || "").trim();
    if (!model) continue;
    const label = [make, model].filter(Boolean).join(" ");
    byModel.set(label, (byModel.get(label) ?? 0) + 1);
  }
  return Array.from(byModel.entries())
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
