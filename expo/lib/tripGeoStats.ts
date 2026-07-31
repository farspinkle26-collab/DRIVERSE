/**
 * Driveverse — trip geometry & stat computation from a raw GPS fix sequence.
 *
 * The live map screen (`app/(tabs)/map.tsx`) accumulates a drive's distance,
 * duration and top speed *incrementally* as location fixes arrive, off the
 * same `haversineMeters` kernel exported here. This module holds that kernel
 * plus the batch equivalents (`pathDistanceMeters`, `computeTripStats`) so the
 * geometry can be unit-tested without standing up a map, and so anything that
 * needs to derive stats from a stored coordinate list has one implementation
 * to call rather than re-deriving haversine inline.
 *
 * The numbers a `trips` row stores — `distance_km`, `duration_seconds`,
 * `avg_speed_kmh`, `top_speed_kmh` — are exactly what `computeTripStats`
 * returns, converted at the call site. Get the geometry wrong here and every
 * Drive Hub readout, XP award and drive score downstream is wrong too, which
 * is why it lives in a pure, tested unit.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** A timestamped GPS fix. `t` is epoch milliseconds. */
export interface GpsSample extends LatLng {
  t: number;
}

/**
 * A per-segment speed above this (km/h) is treated as a GPS glitch — a fix
 * that jumped — and is excluded from the speed stats. Matches the `< 200`
 * guard the live recorder uses before it will believe a sample. Distance is
 * *not* filtered: a real drive that briefly looked fast still covered ground.
 */
export const GPS_SPEED_SANITY_KMH = 200;

// --- Haversine distance (meters) ---
// Great-circle distance between two coordinates on a sphere of Earth's mean
// radius. `Math.min(1, h)` guards the asin against a floating-point h that
// creeps just above 1 for antipodal-ish points, which would otherwise be NaN.
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

// --- Compass bearing (degrees, 0-360) from point a to point b ---
export function bearingBetween(a: LatLng, b: LatLng): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// --- Shortest signed delta between two headings (-180..180) ---
export function headingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Total path length in metres — the sum of haversine distances between
 * consecutive coordinates. Zero for an empty or single-point path (a driver
 * who never moved covered no distance). This is the batch form of the
 * `dist += haversineMeters(prev, next)` accumulation the recorder does live.
 */
export function pathDistanceMeters(coords: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i]);
  }
  return total;
}

export interface TripStats {
  distanceMeters: number;
  durationSeconds: number;
  /** distance / duration, in km/h. 0 when duration is 0. */
  avgSpeedKmh: number;
  /** Fastest believable per-segment speed, in km/h. */
  topSpeedKmh: number;
}

/**
 * Derive a trip's distance, duration, average and top speed from an ordered
 * list of timestamped GPS fixes.
 *
 * Distance is the full haversine path length. Duration is the span from the
 * first fix to the last. Average speed is distance/duration. Top speed is the
 * fastest single segment whose implied speed is physically plausible
 * (≤ `GPS_SPEED_SANITY_KMH`) and whose time delta is positive — a segment with
 * a zero or negative timestamp gap (two fixes at the same instant, or clocks
 * going backwards) contributes distance but no speed sample.
 *
 * Edge cases the callers actually hit:
 *   - fewer than 2 fixes  → all zeros (nothing to measure between)
 *   - a GPS dropout       → one long segment; its distance counts, and its
 *                           speed counts too if still under the sanity cap
 *   - a near-instant trip → tiny duration; avg/top speed still finite because
 *                           only strictly-positive time gaps are divided by
 */
export function computeTripStats(
  samples: GpsSample[],
  opts: { maxSpeedKmh?: number } = {}
): TripStats {
  const cap = opts.maxSpeedKmh ?? GPS_SPEED_SANITY_KMH;
  if (samples.length < 2) {
    return {
      distanceMeters: 0,
      durationSeconds: 0,
      avgSpeedKmh: 0,
      topSpeedKmh: 0,
    };
  }

  let distanceMeters = 0;
  let topSpeedKmh = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const segMeters = haversineMeters(prev, cur);
    distanceMeters += segMeters;

    const dtSec = (cur.t - prev.t) / 1000;
    if (dtSec > 0) {
      const segKmh = segMeters / 1000 / (dtSec / 3600);
      if (segKmh <= cap && segKmh > topSpeedKmh) topSpeedKmh = segKmh;
    }
  }

  const durationSeconds = Math.max(
    0,
    (samples[samples.length - 1].t - samples[0].t) / 1000
  );
  const avgSpeedKmh =
    durationSeconds > 0
      ? distanceMeters / 1000 / (durationSeconds / 3600)
      : 0;

  return { distanceMeters, durationSeconds, avgSpeedKmh, topSpeedKmh };
}
