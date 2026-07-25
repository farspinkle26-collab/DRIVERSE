// Date-range utilities shared by every section. All ranges are computed
// client-side over already-fetched rows so the 7d/30d/90d/all-time toggle is
// instant and adds no extra round trips.

export type RangeKey = "7d" | "30d" | "90d" | "all";

export const RANGE_OPTIONS: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "all", label: "All time", days: null },
];

export function rangeDays(key: RangeKey): number | null {
  return RANGE_OPTIONS.find((o) => o.key === key)?.days ?? null;
}

/** [start, end] for the selected range. For "all", start is the epoch. */
export function rangeWindow(key: RangeKey, now = new Date()): { start: Date; end: Date } {
  const end = now;
  const days = rangeDays(key);
  if (days == null) return { start: new Date(0), end };
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** The immediately-preceding window of equal length, for trend comparison. */
export function previousWindow(key: RangeKey, now = new Date()): { start: Date; end: Date } | null {
  const days = rangeDays(key);
  if (days == null) return null;
  const end = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function inWindow(d: Date | null, w: { start: Date; end: Date }): boolean {
  if (!d) return false;
  return d >= w.start && d <= w.end;
}

/** YYYY-MM-DD in UTC. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** An array of UTC day keys spanning the last `days` days, oldest first. */
export function lastNDays(days: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return out;
}
