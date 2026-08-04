/**
 * Driveverse — the speed heatmap on a recorded route.
 *
 * A share card that draws a drive as one flat red line says "you went there".
 * Colouring that line by how fast the car was moving says "you went there, and
 * *this* is the bit that was fun" — which is the part a driver actually wants
 * to post. Faster is redder; slow crawling traffic cools to a dark ember.
 *
 * WHERE THE SPEED COMES FROM — two sources, in order of trust:
 *
 *   1. `trips.speed_profile` — one km/h reading per stored polyline point,
 *      written by the recorder from real timestamps (see
 *      `database_migration_trip_speed_profile.sql`). Exact, and the only
 *      source that can tell "stopped at a light" from "the GPS stopped
 *      reporting". Present on drives recorded after that migration.
 *
 *   2. Derived from the geometry — every drive recorded before it, which is
 *      every drive already in the table. The recorder samples position on a
 *      ~1 Hz timer (`watchPositionAsync({ timeInterval: 1000 })`) and
 *      `simplifyPath` thins by a constant index step, so consecutive stored
 *      points are separated by roughly equal *time*. Under that assumption
 *      segment length is proportional to speed, and the shape of the profile
 *      is right even though its scale is not — so the derived profile is
 *      rescaled onto the two speeds the row *does* store exactly,
 *      `avg_speed_kmh` and `top_speed_kmh`.
 *
 * The second source is an approximation and is labelled as one at the call
 * site ({@link speedProfileForTrip} reports which source it used) — the card
 * never claims a per-point speed it did not measure, it just colours a line.
 *
 * Everything here is pure and React-free; the drawing lives in
 * `components/SpeedTrace.tsx` and the map overlay in
 * `components/TripMapSnapshot.tsx`. Tested in
 * `lib/__tests__/speedTrace.test.ts`.
 */

import type { LatLng } from "@/lib/polyline";
import { haversineMeters } from "@/lib/tripGeoStats";

/* ------------------------------------------------------------------ *
 * Storage format
 * ------------------------------------------------------------------ */

/**
 * `speed_profile` is stored as comma-separated whole km/h — "0,14,32,31,…",
 * one entry per point of `route_polyline`. Deliberately not JSON and not a
 * binary packing: at 400 points it is under 1.6 kB, it diffs and greps as
 * plain text in a psql session, and a malformed entry degrades to one bad
 * sample rather than an unparseable row.
 */
export function encodeSpeedProfile(speeds: number[]): string {
  return speeds
    .map((v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0))
    .join(",");
}

/** Parse a stored `speed_profile`. Unparseable entries become 0, never NaN. */
export function decodeSpeedProfile(encoded: string | null | undefined): number[] {
  if (typeof encoded !== "string" || encoded.trim() === "") return [];
  return encoded.split(",").map((part) => {
    const n = Number(part);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
}

/* ------------------------------------------------------------------ *
 * Building a profile from raw fixes
 * ------------------------------------------------------------------ */

/** A per-segment speed above this (km/h) is a GPS jump, not a car. */
export const SPEED_SANITY_KMH = 200;

/**
 * Per-point speed (km/h) for a list of timestamped fixes — what the recorder
 * stores. Point *i* carries the speed of the segment that arrived at it, so
 * the first point (nothing arrived at it yet) takes the second point's speed
 * and a single-fix drive is all zeroes.
 *
 * A segment with a non-positive time delta, or one implying more than
 * {@link SPEED_SANITY_KMH}, contributes no reading and inherits the previous
 * one — the same sanity rule `computeTripStats` applies to top speed, so the
 * colour of the line and the number under it agree about what was believable.
 */
export function speedProfileFromFixes(
  fixes: { latitude: number; longitude: number; t: number }[]
): number[] {
  const n = fixes.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const out = new Array<number>(n).fill(0);
  let last = 0;
  for (let i = 1; i < n; i++) {
    const dtSec = (fixes[i].t - fixes[i - 1].t) / 1000;
    if (dtSec > 0) {
      const kmh = haversineMeters(fixes[i - 1], fixes[i]) / 1000 / (dtSec / 3600);
      if (kmh <= SPEED_SANITY_KMH) last = kmh;
    }
    out[i] = last;
  }
  // The first point has no arriving segment; give it the second's reading so
  // the trace does not open on a black stub.
  out[0] = out[1];
  return out;
}

/* ------------------------------------------------------------------ *
 * Deriving a profile from geometry alone
 * ------------------------------------------------------------------ */

export interface DerivedProfileScale {
  /** The trip's stored average speed, km/h. */
  avgSpeedKmh?: number | null;
  /** The trip's stored top speed, km/h. */
  topSpeedKmh?: number | null;
}

/**
 * A speed profile for a route with no recorded timings, from segment lengths
 * under the equal-time assumption documented at the top of this file.
 *
 * The raw per-segment lengths carry the *shape*; the scale comes from the
 * trip's own stored numbers. Top speed anchors the peak, so the reddest part
 * of the line is the part that hit the number printed beside it. Average
 * anchors the mean when the peak is missing or nonsensical (a stored top speed
 * below the average means one of the two is junk — trust the average, which is
 * derived from distance and duration and cannot be a GPS spike).
 *
 * Returns all-zeroes for a path with fewer than two points, so callers can
 * treat "no profile" and "a flat profile" the same way.
 */
export function derivedSpeedProfile(
  points: LatLng[],
  scale: DerivedProfileScale = {}
): number[] {
  const n = points.length;
  if (n < 2) return new Array<number>(Math.max(0, n)).fill(0);

  const raw = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) raw[i] = haversineMeters(points[i - 1], points[i]);
  raw[0] = raw[1];

  const avg = finitePositive(scale.avgSpeedKmh);
  const top = finitePositive(scale.topSpeedKmh);

  const rawMax = Math.max(...raw);
  const rawMean = raw.reduce((a, b) => a + b, 0) / n;

  // Nothing moved, or no stored speed to anchor against: a flat profile is
  // honest here — the trace falls back to a single colour.
  if (rawMax <= 0 || (avg == null && top == null)) return new Array<number>(n).fill(0);

  // Prefer the peak anchor, but only when it is consistent with the average.
  const factor =
    top != null && (avg == null || top >= avg)
      ? top / rawMax
      : (avg as number) / (rawMean > 0 ? rawMean : rawMax);

  return raw.map((v) => Math.max(0, v * factor));
}

function finitePositive(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/* ------------------------------------------------------------------ *
 * Choosing a profile for a trip
 * ------------------------------------------------------------------ */

export interface TripSpeedInput {
  speed_profile?: string | null;
  avg_speed_kmh?: number | null;
  top_speed_kmh?: number | null;
}

export interface TripSpeedProfile {
  /** One km/h reading per point of `points`. Always the same length. */
  speeds: number[];
  /**
   * `measured` — read from `speed_profile`, one real reading per point.
   * `derived` — reconstructed from segment lengths (older rows).
   * `none`    — nothing to colour by; draw the trace in a single colour.
   */
  source: "measured" | "derived" | "none";
}

/**
 * The profile the card should draw, for a trip and its decoded polyline.
 *
 * A stored profile is only used when it has exactly one reading per point: a
 * length mismatch means the polyline was rewritten without the profile (or the
 * other way round), and a profile offset by even one point paints the fast
 * stretch onto the wrong corner. Mismatch falls through to the derived path
 * rather than guessing at an alignment.
 */
export function speedProfileForTrip(
  trip: TripSpeedInput,
  points: LatLng[]
): TripSpeedProfile {
  if (points.length < 2) {
    return { speeds: new Array<number>(points.length).fill(0), source: "none" };
  }

  const stored = decodeSpeedProfile(trip.speed_profile);
  if (stored.length === points.length && stored.some((v) => v > 0)) {
    return { speeds: stored, source: "measured" };
  }

  const derived = derivedSpeedProfile(points, {
    avgSpeedKmh: trip.avg_speed_kmh,
    topSpeedKmh: trip.top_speed_kmh,
  });
  return derived.some((v) => v > 0)
    ? { speeds: derived, source: "derived" }
    : { speeds: derived, source: "none" };
}

/* ------------------------------------------------------------------ *
 * The colour ramp
 * ------------------------------------------------------------------ */

/**
 * Slow → fast, four stops. This is the one place in the app that is allowed a
 * gradient outside the six-colour palette, and it stays inside the brand by
 * *ending* on `racingRed` (#FF2E37) and never going warmer than it: the ramp
 * is a desaturated slide up to the accent, not a rainbow. Read
 * `MAP_SCREEN_REFERENCE.md` §2 before adding a stop — "category is shape,
 * state is colour" is the rule this is an exception to, and exceptions are
 * quarantined in one file each (the other is `constants/mapCategoryColors.ts`).
 *
 * The dark end is deliberately not black: a stationary segment still has to be
 * visible against `voidBlack`, or the trace develops holes where the driver
 * stopped at a light.
 */
export const SPEED_HEAT_STOPS = [
  "#4A2530", // stopped / crawling — a cold ember, still readable on black
  "#8E2B33", // town speeds
  "#D02C37", // open road
  "#FF2E37", // racingRed — the fastest thing on the card
] as const;

/** Flat colour for a trace with no usable profile. */
export const SPEED_HEAT_FLAT = "#FF2E37";

export interface SpeedDomain {
  /** km/h mapped to the coldest stop. */
  min: number;
  /** km/h mapped to `racingRed`. */
  max: number;
}

/**
 * The km/h range the ramp spans for one drive, so a 40 km/h city crawl and a
 * 180 km/h run both use the full ramp instead of the city drive rendering as
 * one uniform dark smear. Anchored at 0 at the cold end — "half the ramp" has
 * to mean "half the top speed", not "half way between this drive's slowest and
 * fastest moment", or a drive that never dropped below 90 would paint its
 * slowest stretch the same colour as a jam.
 *
 * The floor on `max` stops a stationary or near-stationary track from dividing
 * by ~0 and flashing the whole trace red.
 */
export function speedDomain(speeds: number[]): SpeedDomain {
  let max = 0;
  for (const v of speeds) if (Number.isFinite(v) && v > max) max = v;
  return { min: 0, max: Math.max(max, 1) };
}

/** Linear interpolation between two `#rrggbb` colours. */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const pa = parseHex(a);
  const pb = parseHex(b);
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * k);
  return `#${[ch(0), ch(1), ch(2)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [255, 46, 55];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The ramp colour for one speed. Values outside the domain clamp to its ends,
 * which is what makes a stored top speed that came from a GPS spike harmless:
 * it takes the reddest colour and nothing else changes.
 */
export function heatColor(speedKmh: number, domain: SpeedDomain): string {
  const span = Math.max(1e-6, domain.max - domain.min);
  const t = Math.max(0, Math.min(1, (speedKmh - domain.min) / span));
  const stops = SPEED_HEAT_STOPS;
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  return mixHex(stops[i], stops[i + 1], scaled - i);
}

/* ------------------------------------------------------------------ *
 * Segmenting a path for drawing
 * ------------------------------------------------------------------ */

export interface HeatSegment<P> {
  /** Two or more consecutive points sharing one colour. */
  points: P[];
  color: string;
  /** Representative speed for the run, km/h — used by tests and legends. */
  speedKmh: number;
}

/**
 * Cut a path into runs of consecutive points that quantise to the same colour.
 *
 * Both renderers need this. The SVG trace could colour every segment
 * individually, but the map cannot: each run becomes a native `<Polyline>`,
 * and 400 of those is a stutter on a mid-range Android and a snapshot that
 * takes seconds. Quantising to {@link HEAT_BUCKETS} bands caps the count while
 * keeping the fast stretches distinguishable, and consecutive runs overlap by
 * one point so the line has no gaps at the joins.
 */
export const HEAT_BUCKETS = 12;

export function heatSegments<P>(
  points: P[],
  speeds: number[],
  domain: SpeedDomain,
  buckets: number = HEAT_BUCKETS
): HeatSegment<P>[] {
  if (points.length < 2) return [];
  const bandCount = Math.max(1, Math.floor(buckets));
  const span = Math.max(1e-6, domain.max - domain.min);
  const bandOf = (kmh: number) => {
    const t = Math.max(0, Math.min(1, ((kmh ?? 0) - domain.min) / span));
    return Math.min(bandCount - 1, Math.floor(t * bandCount));
  };
  // Colour a band at its centre so the coldest band is not pure stop-colour
  // and the hottest is not reached by a single outlying sample.
  const bandSpeed = (band: number) =>
    domain.min + ((band + 0.5) / bandCount) * span;

  const out: HeatSegment<P>[] = [];
  let runStart = 0;
  let runBand = bandOf(speeds[1] ?? speeds[0] ?? 0);

  for (let i = 2; i < points.length; i++) {
    const band = bandOf(speeds[i] ?? 0);
    if (band !== runBand) {
      out.push({
        points: points.slice(runStart, i),
        color: heatColor(bandSpeed(runBand), domain),
        speedKmh: bandSpeed(runBand),
      });
      // Overlap by one point: the new run starts where the last one ended.
      runStart = i - 1;
      runBand = band;
    }
  }
  out.push({
    points: points.slice(runStart),
    color: heatColor(bandSpeed(runBand), domain),
    speedKmh: bandSpeed(runBand),
  });

  return out.filter((s) => s.points.length > 1);
}
