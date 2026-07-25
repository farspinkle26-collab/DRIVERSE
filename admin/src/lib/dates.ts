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

// ── Table date-range picker ──────────────────────────────────────────
// Distinct from RangeKey above (which drives the existing stat-card
// period toggles): this backs the DateRangePicker control placed above
// filterable tables, and supports an explicit custom start/end.

export type DateRangePreset = "today" | "7d" | "30d" | "90d" | "all" | "custom";

export const DATE_RANGE_PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

export interface DateRangeValue {
  preset: DateRangePreset;
  /** Only meaningful when preset === "custom". ISO date strings (YYYY-MM-DD). */
  customStart?: string;
  customEnd?: string;
}

const PRESET_DAYS: Partial<Record<DateRangePreset, number>> = { today: 0, "7d": 7, "30d": 30, "90d": 90 };

/** Resolve a DateRangeValue to a concrete [start, end] window. */
export function resolveDateRange(value: DateRangeValue, now = new Date()): { start: Date; end: Date } {
  if (value.preset === "all") return { start: new Date(0), end: now };
  if (value.preset === "custom") {
    const start = value.customStart ? new Date(`${value.customStart}T00:00:00Z`) : new Date(0);
    const end = value.customEnd ? new Date(`${value.customEnd}T23:59:59.999Z`) : now;
    return { start, end };
  }
  const days = PRESET_DAYS[value.preset] ?? 0;
  if (days === 0) {
    // "Today": from local midnight (WIB) through now.
    const start = new Date(now.getTime());
    start.setUTCHours(-WIB_OFFSET_MINUTES / 60, 0, 0, 0);
    return { start, end: now };
  }
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end: now };
}

// ── Relative / absolute display + explicit UTC → WIB conversion ─────────
// All timestamps are stored and computed in UTC. Driveverse ops are based
// in Indonesia, so every displayed timestamp is converted to WIB
// (Waktu Indonesia Barat, UTC+7, no DST) explicitly here rather than
// relying on the viewer's browser timezone.
export const WIB_OFFSET_MINUTES = 7 * 60;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return isNaN(d.getTime()) ? null : d;
}

/** Convert a UTC instant to the wall-clock Date it represents in WIB. */
export function toWIB(value: string | Date | null | undefined): Date | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(d.getTime() + WIB_OFFSET_MINUTES * 60 * 1000);
}

/** "2 days ago", "5h ago", "Just now", falling back to a short date past ~30d. */
export function fmtRelative(value: string | Date | null | undefined, now = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return diffSec <= 5 ? "Just now" : `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return diffDay === 1 ? "Yesterday" : `${diffDay}d ago`;
  return fmtDateShort(d);
}

/** "Jul 23" — short absolute date, WIB wall-clock day. */
export function fmtDateShort(value: string | Date | null | undefined): string {
  const wib = toWIB(value);
  if (!wib) return "—";
  return wib.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Mon" / "Tue" / … — abbreviated weekday, WIB wall-clock day. */
export function fmtWeekdayAbbrev(value: string | Date | null | undefined): string {
  const wib = toWIB(value);
  if (!wib) return "—";
  return wib.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/** Full date + time + timezone, for tooltips — e.g. "Wed, Jul 23, 2026, 14:05 WIB". */
export function fmtAbsoluteWIB(value: string | Date | null | undefined): string {
  const wib = toWIB(value);
  if (!wib) return "—";
  const datePart = wib.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const timePart = wib.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${datePart}, ${timePart} WIB`;
}
