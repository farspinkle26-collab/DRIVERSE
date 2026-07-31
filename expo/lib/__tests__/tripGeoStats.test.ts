/**
 * Priority #3 — trip stat calculation from GPS point sequences.
 *
 * Distance, duration, average and top speed derived from timestamped GPS fixes
 * (lib/tripGeoStats.ts, the same haversine kernel the live map recorder uses).
 * Covers the happy path and the edge cases the task calls out: too few points,
 * a GPS dropout, and a near-instant trip.
 */
import {
  bearingBetween,
  computeTripStats,
  haversineMeters,
  headingDelta,
  pathDistanceMeters,
  type GpsSample,
} from "@/lib/tripGeoStats";

// A degree of latitude is ~111.19 km on this sphere; a small east–west step at
// the equator is the same, which gives us hand-checkable reference distances.
const EQ = { latitude: 0, longitude: 0 };

describe("haversineMeters", () => {
  it("is 0 for identical points", () => {
    expect(haversineMeters(EQ, { ...EQ })).toBe(0);
  });

  it("matches the known ~111.19 km per degree of latitude", () => {
    const d = haversineMeters(EQ, { latitude: 1, longitude: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("is symmetric", () => {
    const a = { latitude: -6.2, longitude: 106.8 };
    const b = { latitude: -6.9, longitude: 107.6 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("does not return NaN for near-antipodal points (asin guard)", () => {
    const d = haversineMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 180 }
    );
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeGreaterThan(0);
  });
});

describe("bearingBetween / headingDelta (map heading helpers)", () => {
  it("points due north / east / south / west correctly", () => {
    expect(bearingBetween(EQ, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 3);
    expect(bearingBetween(EQ, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 3);
    expect(bearingBetween(EQ, { latitude: -1, longitude: 0 })).toBeCloseTo(180, 3);
    expect(bearingBetween(EQ, { latitude: 0, longitude: -1 })).toBeCloseTo(270, 3);
  });

  it("returns the shortest signed turn, wrapping across 0/360", () => {
    expect(headingDelta(10, 20)).toBe(10);
    expect(headingDelta(350, 10)).toBe(20); // forward across north, not -340
    expect(headingDelta(10, 350)).toBe(-20); // backward across north
    expect(headingDelta(0, 180)).toBe(-180);
  });
});

describe("pathDistanceMeters", () => {
  it("is 0 for an empty or single-point path", () => {
    expect(pathDistanceMeters([])).toBe(0);
    expect(pathDistanceMeters([EQ])).toBe(0);
  });

  it("sums consecutive segments", () => {
    const path = [
      { latitude: 0, longitude: 0 },
      { latitude: 0.01, longitude: 0 },
      { latitude: 0.02, longitude: 0 },
    ];
    const oneStep = haversineMeters(path[0], path[1]);
    expect(pathDistanceMeters(path)).toBeCloseTo(oneStep * 2, 3);
  });
});

describe("computeTripStats", () => {
  const t0 = 1_700_000_000_000; // fixed epoch ms

  it("returns all zeros for fewer than two fixes", () => {
    expect(computeTripStats([])).toEqual({
      distanceMeters: 0,
      durationSeconds: 0,
      avgSpeedKmh: 0,
      topSpeedKmh: 0,
    });
    expect(computeTripStats([{ ...EQ, t: t0 }])).toEqual({
      distanceMeters: 0,
      durationSeconds: 0,
      avgSpeedKmh: 0,
      topSpeedKmh: 0,
    });
  });

  it("computes a clean two-point drive's distance, duration and speed", () => {
    // 0.001° north ≈ 111.19 m, covered in 10 s → 40.03 km/h.
    const samples: GpsSample[] = [
      { latitude: 0, longitude: 0, t: t0 },
      { latitude: 0.001, longitude: 0, t: t0 + 10_000 },
    ];
    const s = computeTripStats(samples);
    expect(s.distanceMeters).toBeCloseTo(111.19, 1);
    expect(s.durationSeconds).toBe(10);
    expect(s.avgSpeedKmh).toBeCloseTo(40.03, 1);
    // Single segment, so top speed equals the average here.
    expect(s.topSpeedKmh).toBeCloseTo(40.03, 1);
  });

  it("reports top speed as the fastest single segment, not the average", () => {
    const samples: GpsSample[] = [
      { latitude: 0, longitude: 0, t: t0 },
      // slow leg: 0.001° in 20 s ≈ 20 km/h
      { latitude: 0.001, longitude: 0, t: t0 + 20_000 },
      // fast leg: 0.001° in 4 s ≈ 100 km/h
      { latitude: 0.002, longitude: 0, t: t0 + 24_000 },
    ];
    const s = computeTripStats(samples);
    expect(s.topSpeedKmh).toBeCloseTo(100.07, 0);
    expect(s.avgSpeedKmh).toBeLessThan(s.topSpeedKmh);
  });

  it("counts a GPS dropout's distance and, if plausible, its speed", () => {
    // One 20 s gap covering ~333 m ≈ 60 km/h — a believable stretch, kept.
    const samples: GpsSample[] = [
      { latitude: 0, longitude: 0, t: t0 },
      { latitude: 0.003, longitude: 0, t: t0 + 20_000 },
    ];
    const s = computeTripStats(samples);
    expect(s.distanceMeters).toBeCloseTo(333.57, 0);
    expect(s.topSpeedKmh).toBeCloseTo(60.04, 0);
  });

  it("excludes an implausible GPS jump from the speed stats but keeps distance", () => {
    // A 1° jump (~111 km) in 1 s implies ~400,000 km/h — a glitch. Distance
    // still accrues, but it must not become the top speed.
    const samples: GpsSample[] = [
      { latitude: 0, longitude: 0, t: t0 },
      { latitude: 1, longitude: 0, t: t0 + 1_000 },
      // then a normal 0.001° / 10 s ≈ 40 km/h leg
      { latitude: 1.001, longitude: 0, t: t0 + 11_000 },
    ];
    const s = computeTripStats(samples);
    expect(s.distanceMeters).toBeGreaterThan(111_000);
    // Top speed comes from the sane leg, not the glitch.
    expect(s.topSpeedKmh).toBeCloseTo(40.03, 0);
  });

  it("keeps speeds finite on a near-instant trip (zero-time segments ignored)", () => {
    // Two fixes at the SAME timestamp: distance counts, but dividing by a zero
    // time gap must not produce Infinity in the speed.
    const samples: GpsSample[] = [
      { latitude: 0, longitude: 0, t: t0 },
      { latitude: 0.0001, longitude: 0, t: t0 }, // same instant
    ];
    const s = computeTripStats(samples);
    expect(s.durationSeconds).toBe(0);
    expect(s.avgSpeedKmh).toBe(0);
    expect(Number.isFinite(s.topSpeedKmh)).toBe(true);
    expect(s.topSpeedKmh).toBe(0);
  });

  it("respects a custom sanity cap", () => {
    const samples: GpsSample[] = [
      { latitude: 0, longitude: 0, t: t0 },
      { latitude: 0.002, longitude: 0, t: t0 + 4_000 }, // ~200 km/h
    ];
    // With a 100 km/h cap the segment is treated as a glitch → topSpeed 0.
    expect(computeTripStats(samples, { maxSpeedKmh: 100 }).topSpeedKmh).toBe(0);
  });
});
