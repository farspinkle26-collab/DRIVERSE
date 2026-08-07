/**
 * Driveverse — trip readout formatting and the derived drive score.
 *
 * Every number the Drive Hub renders comes through here, so the same trip
 * shows the same digits everywhere and screens never format inline. The
 * formatters return the value and its unit separately: the value is set in
 * JetBrains Mono (`dataLg` / `dataSm`), the unit in Inter (`caption`), so a
 * unit suffix never lands inside a mono readout.
 *
 * `driveScoreBreakdown` and every other calculation here stay in km/h no
 * matter what — that is the one canonical unit `trips`/`saved_routes` store
 * and the drive score, XP and quest math are all tuned against. Only
 * `formatSpeed`, the display layer, knows about `lib/speedUnits.ts`.
 */

import { convertSpeed, speedUnitLabel, type SpeedUnit } from "@/lib/speedUnits";

export interface TripLike {
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  top_speed_kmh?: number | null;
  estimated_duration_seconds?: number | null;
}

export interface Readout {
  /** Set in JetBrains Mono. */
  value: string;
  /** Set in Inter, uppercased by the caller. */
  unit: string;
}

/* ------------------------------------------------------------------ *
 * Formatters
 * ------------------------------------------------------------------ */

/** `42.6 km` → { value: "42.6", unit: "km" }. */
export function formatDistance(km: number): Readout {
  const safe = Number.isFinite(km) ? Math.max(0, km) : 0;
  return { value: safe >= 100 ? safe.toFixed(0) : safe.toFixed(1), unit: "km" };
}

/**
 * Duration as a clock, not as prose: `07:41`, `1:04:22`. Colons keep the
 * readout monospaced — "1h 4m" would mix Inter letterforms into a mono
 * field and break the column alignment across stacked cards.
 */
export function formatDuration(seconds: number): Readout {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    value: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
    unit: h > 0 ? "h:m:s" : "m:s",
  };
}

/**
 * Average speed, rounded — sub-integer precision is noise at this size.
 * `unit` defaults to `"kmh"` so every existing call site keeps its current
 * behaviour untouched; pass the viewer's own unit (`speedUnitForCountry`)
 * to localise it.
 */
export function formatSpeed(kmh: number, unit: SpeedUnit = "kmh"): Readout {
  return { value: String(Math.round(convertSpeed(kmh, unit))), unit: speedUnitLabel(unit) };
}

/**
 * Absolute timestamp, in Inter/caption. Deliberately not "2 hours ago":
 * a trip log is a record, and a record wants a fixed point in time. Recent
 * trips still get the friendlier day word because "Today, 14:02" is what a
 * driver actually recognises.
 */
export function formatTripTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown time";

  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (sameDay(d, now)) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`;

  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

/**
 * The date stamp on a share card: `03 AUG 2026 · 16:17`.
 *
 * Deliberately not {@link formatTripTimestamp}. "Today, 14:02" is right in the
 * Drive Hub, where the list is read minutes after the drive — and wrong on an
 * exported image, which outlives the day it was made: a card posted on Tuesday
 * and looked at on Friday would claim the drive happened on Friday. An
 * absolute stamp is also a large part of what stops a card reading as
 * generated rather than recorded.
 *
 * Uppercased month, 24-hour clock, and the whole thing set in mono so it sits
 * with the other measurements rather than with the prose.
 */
export function formatShareStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`;
}

/**
 * Trip identifier shown on the card header, newest first: `R-014`.
 * `total` is the number of trips in the list so the newest keeps the
 * highest number as the log grows.
 */
export function tripCode(indexFromNewest: number, total: number): string {
  const n = Math.max(1, total - indexFromNewest);
  return `R-${String(n).padStart(3, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Drive score
 * ------------------------------------------------------------------ */

export interface ScoreBreakdown {
  score: number;
  /** Points lost, keyed by cause — surfaced on the trip detail screen. */
  penalties: { smoothness: number; pace: number; speed: number };
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/**
 * A 0–100 drive score derived from what a recorded trip already stores.
 *
 * The `trips` table has no score column — the live "smooth drive" score on
 * the map screen is computed from the accelerometer-ish delta of successive
 * GPS speeds and is discarded when recording stops. Rather than show a
 * number the database cannot reproduce, the score is derived here from
 * persisted telemetry, so it is stable across sessions and devices:
 *
 *   smoothness (≤30)  how far top speed sat above the average. A trip whose
 *                     peak is close to its mean was driven at a steady pace;
 *                     a large spread means hard acceleration and braking.
 *   pace       (≤20)  actual duration against the routing estimate. Only
 *                     applied when an estimate was recorded.
 *   speed      (≤20)  top speed above 120 km/h.
 *
 * Deliberately generous at the top: a clean, unremarkable commute should
 * read in the 90s. The score is a summary of a drive, not a grade.
 */
export function driveScoreBreakdown(trip: TripLike): ScoreBreakdown {
  const avg = Number.isFinite(trip.avg_speed_kmh) ? Math.max(0, trip.avg_speed_kmh) : 0;
  const top = Number.isFinite(trip.top_speed_kmh ?? NaN)
    ? Math.max(0, trip.top_speed_kmh as number)
    : 0;
  const duration = Math.max(0, trip.duration_seconds || 0);
  const estimate = Math.max(0, trip.estimated_duration_seconds || 0);

  // Spread of 1.6× (peak 60% above mean) is normal for mixed roads; every
  // 0.1× beyond that costs 5 points, to a ceiling of 30.
  let smoothness = 0;
  if (avg > 5 && top > 0) {
    smoothness = clamp((top / avg - 1.6) * 50, 0, 30);
  }

  // 10% over the estimate costs 5 points; 40% over hits the ceiling.
  let pace = 0;
  if (estimate > 60 && duration > 0) {
    pace = clamp((duration / estimate - 1) * 50, 0, 20);
  }

  // Above 120 km/h, every 10 km/h costs 5 points.
  const speed = top > 120 ? clamp((top - 120) * 0.5, 0, 20) : 0;

  const score = Math.round(clamp(100 - smoothness - pace - speed, 0, 100));
  return {
    score,
    penalties: {
      smoothness: Math.round(smoothness),
      pace: Math.round(pace),
      speed: Math.round(speed),
    },
  };
}

export function driveScore(trip: TripLike): number {
  return driveScoreBreakdown(trip).score;
}

/**
 * A score at or above this reads as an outstanding drive and is the only
 * state where the score badge is allowed to take racingRed. See
 * DRIVE_HUB_REFERENCE.md — one accent per card is what keeps red an accent.
 */
export const SCORE_STANDOUT = 90;

/* ------------------------------------------------------------------ *
 * Drive XP
 * ------------------------------------------------------------------ */

/**
 * XP for a recorded (or in-progress) drive, scaled off what actually
 * happened on the road — distance covered, time behind the wheel, and the
 * pace that implies — rather than a flat per-trip number. A quick errand
 * and a long highway run should not earn the same XP. Distance is the
 * dominant term, at thousands of XP per km, so the total tracks the length
 * of the drive rather than sitting near a flat per-trip floor.
 *
 *   distance   the primary driver: every km covered counts, at 2000 XP/km.
 *   time       a steady trickle for time spent driving.
 *   pace       average speed scales the total up (open-road driving) or
 *              down (crawling in traffic), clamped so neither a GPS blip
 *              nor a long traffic jam produces an absurd number.
 *   ETA bonus  stacked on top when a routed destination was beaten, same
 *              intent as before but additive rather than being the reward.
 */
export function calculateDriveXP(params: {
  distanceMeters: number;
  durationSeconds: number;
  estimatedDurationSeconds?: number | null;
}): number {
  const distanceKm = Math.max(0, params.distanceMeters) / 1000;
  const durationMin = Math.max(0, params.durationSeconds) / 60;
  if (distanceKm <= 0 || durationMin <= 0) return 0;

  const avgSpeedKmh = clamp(distanceKm / (durationMin / 60), 0, 180);

  const distanceXp = distanceKm * 2000;
  const timeXp = durationMin * 30;
  const paceMultiplier = clamp(avgSpeedKmh / 45, 0.6, 2.2);

  let xp = (distanceXp + timeXp) * paceMultiplier;

  const estimatedSec = params.estimatedDurationSeconds ?? 0;
  if (estimatedSec > 60 && params.durationSeconds < estimatedSec) {
    const ratio = clamp((estimatedSec - params.durationSeconds) / estimatedSec, 0, 1);
    xp += 500 + ratio * 1500;
  }

  return Math.max(5, Math.round(xp));
}
