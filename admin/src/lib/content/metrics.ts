// Deterministic analytics over the post set. Pure + client-safe (no server-only
// imports) so both the dashboard tabs and the server-side learning loop share
// exactly one implementation. Nothing here calls a model — these are the
// numbers every generated narrative is anchored to.

import {
  MIN_VIEWS_FLOOR,
  PILLARS,
  type Pillar,
  type Platform,
  type Post,
} from "./types";

// ── Basic stats ─────────────────────────────────────────────────────────────
export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Linear-interpolation quantile (q in 0..1). */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined
    ? s[base] + rest * (s[base + 1] - s[base])
    : s[base];
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

// ── Analysis population ──────────────────────────────────────────────────────
/** Posts eligible for learning aggregates: reposts and anything not yet
 *  Published (no real metrics) are always excluded. */
export function analysisPosts(posts: Post[]): Post[] {
  return posts.filter((p) => !p.frontmatter.is_repost && p.frontmatter.status === "published");
}

export function publishedPosts(posts: Post[]): Post[] {
  return posts.filter((p) => p.frontmatter.status === "published");
}

/** Scheduled (upcoming) posts, soonest first. */
export function scheduledPosts(posts: Post[]): Post[] {
  return posts
    .filter((p) => p.frontmatter.status === "scheduled")
    .sort((a, b) =>
      `${a.frontmatter.date}T${a.frontmatter.time || "00:00"}`.localeCompare(
        `${b.frontmatter.date}T${b.frontmatter.time || "00:00"}`,
      ),
    );
}

/** Ranking population: analysis posts that also clear the min-views floor. */
export function rankablePosts(posts: Post[], floor = MIN_VIEWS_FLOOR): Post[] {
  return analysisPosts(posts).filter((p) => p.frontmatter.views >= floor);
}

// ── Per-pillar distributions (the grounding for Takeaways) ───────────────────
export interface PillarStats {
  pillar: Pillar;
  n: number;
  saveRateMedian: number;
  saveRateQ1: number;
  saveRateQ3: number;
  viewsMedian: number;
  holdRateMedian: number;
  engagementMedian: number;
  seeded: number;
  organic: number;
  organicPickupRate: number; // organic / (seeded + organic)
}

export function pillarStats(posts: Post[], pillar: Pillar): PillarStats {
  const rows = analysisPosts(posts).filter(
    (p) => p.frontmatter.pillar === pillar,
  );
  const saveRates = rows.map((p) => p.frontmatter.save_rate);
  const seeded = sum(rows.map((p) => p.frontmatter.comments_seeded));
  const organic = sum(rows.map((p) => p.frontmatter.comments_organic_pickup));
  return {
    pillar,
    n: rows.length,
    saveRateMedian: median(saveRates),
    saveRateQ1: quantile(saveRates, 0.25),
    saveRateQ3: quantile(saveRates, 0.75),
    viewsMedian: median(rows.map((p) => p.frontmatter.views)),
    holdRateMedian: median(rows.map((p) => p.frontmatter.hold_rate)),
    engagementMedian: median(rows.map((p) => p.frontmatter.engagement_rate)),
    seeded,
    organic,
    organicPickupRate: seeded + organic > 0 ? organic / (seeded + organic) : 0,
  };
}

export function allPillarStats(posts: Post[]): PillarStats[] {
  return PILLARS.map((p) => pillarStats(posts, p)).filter((s) => s.n > 0);
}

// ── Generic group-by ─────────────────────────────────────────────────────────
export interface GroupStat {
  key: string;
  n: number;
  saveRateMedian: number;
  viewsMedian: number;
  seeded: number;
  organic: number;
  organicPickupRate: number;
}

function summarize(key: string, rows: Post[]): GroupStat {
  const seeded = sum(rows.map((p) => p.frontmatter.comments_seeded));
  const organic = sum(rows.map((p) => p.frontmatter.comments_organic_pickup));
  return {
    key,
    n: rows.length,
    saveRateMedian: median(rows.map((p) => p.frontmatter.save_rate)),
    viewsMedian: median(rows.map((p) => p.frontmatter.views)),
    seeded,
    organic,
    organicPickupRate: seeded + organic > 0 ? organic / (seeded + organic) : 0,
  };
}

export function groupBy(
  posts: Post[],
  keyOf: (p: Post) => string | null,
): GroupStat[] {
  const buckets = new Map<string, Post[]>();
  for (const p of analysisPosts(posts)) {
    const k = keyOf(p);
    if (k == null || k === "") continue;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p);
  }
  return [...buckets.entries()]
    .map(([k, rows]) => summarize(k, rows))
    .sort((a, b) => b.saveRateMedian - a.saveRateMedian);
}

// ── Dayparts ─────────────────────────────────────────────────────────────────
export const DAYPARTS = [
  "Morning",
  "Midday",
  "Afternoon",
  "Evening",
  "Night",
] as const;
export type Daypart = (typeof DAYPARTS)[number];

export function daypartOf(time: string): Daypart {
  const h = parseInt((time || "").split(":")[0] ?? "", 10);
  if (Number.isNaN(h)) return "Evening";
  if (h >= 5 && h < 11) return "Morning";
  if (h >= 11 && h < 15) return "Midday";
  if (h >= 15 && h < 18) return "Afternoon";
  if (h >= 18 && h < 22) return "Evening";
  return "Night";
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export interface HeatCell {
  weekday: string;
  daypart: Daypart;
  n: number;
  saveRateMedian: number;
  viewsMedian: number;
}

/** weekday × daypart grid (only populated cells returned). */
export function weekdayDaypartHeat(posts: Post[]): HeatCell[] {
  const buckets = new Map<string, Post[]>();
  for (const p of analysisPosts(posts)) {
    const wd = p.frontmatter.weekday;
    if (!wd) continue;
    const dp = daypartOf(p.frontmatter.time);
    const k = `${wd}|${dp}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p);
  }
  const out: HeatCell[] = [];
  for (const [k, rows] of buckets) {
    const [weekday, daypart] = k.split("|");
    out.push({
      weekday,
      daypart: daypart as Daypart,
      n: rows.length,
      saveRateMedian: median(rows.map((r) => r.frontmatter.save_rate)),
      viewsMedian: median(rows.map((r) => r.frontmatter.views)),
    });
  }
  return out;
}

// ── Top posts by save rate for a pillar (for the Scriptor exemplars) ─────────
export function topBySaveRate(
  posts: Post[],
  opts: { pillar?: Pillar; limit?: number } = {},
): Post[] {
  let rows = rankablePosts(posts);
  if (opts.pillar) rows = rows.filter((p) => p.frontmatter.pillar === opts.pillar);
  return rows
    .sort((a, b) => b.frontmatter.save_rate - a.frontmatter.save_rate)
    .slice(0, opts.limit ?? 5);
}

// ── Period windows (for Overview "this period vs last") ──────────────────────
export function inLastDays(dateStr: string, days: number, now = new Date()): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date(now.getTime() - days * 86400000);
  return d >= start && d <= now;
}

export function inPrevDays(dateStr: string, days: number, now = new Date()): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const end = new Date(now.getTime() - days * 86400000);
  const start = new Date(end.getTime() - days * 86400000);
  return d >= start && d < end;
}

export interface PeriodTotals {
  posts: number;
  views: number;
  saves: number;
  follows: number;
  seeded: number;
  organic: number;
  organicPickupRate: number;
}

export function periodTotals(rows: Post[]): PeriodTotals {
  const seeded = sum(rows.map((p) => p.frontmatter.comments_seeded));
  const organic = sum(rows.map((p) => p.frontmatter.comments_organic_pickup));
  return {
    posts: rows.length,
    views: sum(rows.map((p) => p.frontmatter.views)),
    saves: sum(rows.map((p) => p.frontmatter.saves)),
    follows: sum(rows.map((p) => p.frontmatter.new_follows)),
    seeded,
    organic,
    organicPickupRate: seeded + organic > 0 ? organic / (seeded + organic) : 0,
  };
}

// Platform helper for grouping.
export function platformLabel(p: Platform): string {
  return p === "instagram" ? "Instagram" : "TikTok";
}
