import { describe, expect, it } from "bun:test";
import {
  HEAT_BUCKETS,
  SPEED_HEAT_STOPS,
  decodeSpeedProfile,
  derivedSpeedProfile,
  encodeSpeedProfile,
  heatColor,
  heatSegments,
  mixHex,
  speedDomain,
  speedProfileForTrip,
  speedProfileFromFixes,
} from "@/lib/speedTrace";
import type { LatLng } from "@/lib/polyline";

/** ~111 m per 0.001° of latitude, close enough for readable fixtures. */
function northLine(count: number, stepDeg = 0.001): LatLng[] {
  return Array.from({ length: count }, (_, i) => ({
    latitude: -6.2 + i * stepDeg,
    longitude: 106.8,
  }));
}

describe("encode/decodeSpeedProfile", () => {
  it("round-trips whole km/h", () => {
    expect(decodeSpeedProfile(encodeSpeedProfile([0, 12.4, 88.6]))).toEqual([0, 12, 89]);
  });

  it("treats an absent or empty profile as no profile", () => {
    expect(decodeSpeedProfile(null)).toEqual([]);
    expect(decodeSpeedProfile(undefined)).toEqual([]);
    expect(decodeSpeedProfile("")).toEqual([]);
    expect(decodeSpeedProfile("   ")).toEqual([]);
  });

  it("degrades a corrupt entry to 0 rather than NaN", () => {
    expect(decodeSpeedProfile("10,oops,-4,30")).toEqual([10, 0, 0, 30]);
  });

  it("never encodes NaN or a negative", () => {
    expect(encodeSpeedProfile([NaN, -5, Infinity, 3])).toBe("0,0,0,3");
  });
});

describe("speedProfileFromFixes", () => {
  it("gives one reading per fix, first inheriting the second", () => {
    const fixes = [
      { latitude: -6.2, longitude: 106.8, t: 0 },
      { latitude: -6.199, longitude: 106.8, t: 10_000 },
      { latitude: -6.197, longitude: 106.8, t: 20_000 },
    ];
    const speeds = speedProfileFromFixes(fixes);
    expect(speeds).toHaveLength(3);
    expect(speeds[0]).toBeCloseTo(speeds[1], 6);
    // Second leg covers twice the ground in the same time.
    expect(speeds[2]).toBeGreaterThan(speeds[1] * 1.8);
  });

  it("holds the last reading through a GPS jump instead of spiking", () => {
    const fixes = [
      { latitude: -6.2, longitude: 106.8, t: 0 },
      { latitude: -6.199, longitude: 106.8, t: 10_000 },
      // 1° of latitude in one second — physically impossible.
      { latitude: -5.2, longitude: 106.8, t: 11_000 },
    ];
    const speeds = speedProfileFromFixes(fixes);
    expect(speeds[2]).toBe(speeds[1]);
    expect(speeds[2]).toBeLessThan(200);
  });

  it("ignores a zero or backwards time delta", () => {
    const fixes = [
      { latitude: -6.2, longitude: 106.8, t: 1000 },
      { latitude: -6.199, longitude: 106.8, t: 1000 },
    ];
    expect(speedProfileFromFixes(fixes)).toEqual([0, 0]);
  });

  it("handles the degenerate drives", () => {
    expect(speedProfileFromFixes([])).toEqual([]);
    expect(speedProfileFromFixes([{ latitude: 0, longitude: 0, t: 0 }])).toEqual([0]);
  });
});

describe("derivedSpeedProfile", () => {
  it("anchors its peak on the stored top speed", () => {
    // Three even steps then one long one: the long segment is the fast bit.
    const pts: LatLng[] = [
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: 0 },
      { latitude: 0.002, longitude: 0 },
      { latitude: 0.008, longitude: 0 },
    ];
    const speeds = derivedSpeedProfile(pts, { avgSpeedKmh: 40, topSpeedKmh: 120 });
    expect(Math.max(...speeds)).toBeCloseTo(120, 5);
    expect(speeds[3]).toBeGreaterThan(speeds[2]);
  });

  it("falls back to the average when the stored top speed is junk", () => {
    const pts = northLine(5);
    // top < avg is impossible; the average is the trustworthy number.
    const speeds = derivedSpeedProfile(pts, { avgSpeedKmh: 60, topSpeedKmh: 10 });
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    expect(mean).toBeCloseTo(60, 5);
  });

  it("returns a flat profile when there is nothing to scale against", () => {
    expect(derivedSpeedProfile(northLine(4))).toEqual([0, 0, 0, 0]);
  });

  it("returns a flat profile for a driver who never moved", () => {
    const parked: LatLng[] = [
      { latitude: 1, longitude: 1 },
      { latitude: 1, longitude: 1 },
      { latitude: 1, longitude: 1 },
    ];
    expect(derivedSpeedProfile(parked, { avgSpeedKmh: 30, topSpeedKmh: 50 })).toEqual([
      0, 0, 0,
    ]);
  });

  it("handles paths too short to have a segment", () => {
    expect(derivedSpeedProfile([])).toEqual([]);
    expect(derivedSpeedProfile([{ latitude: 0, longitude: 0 }])).toEqual([0]);
  });
});

describe("speedProfileForTrip", () => {
  const points = northLine(4);

  it("prefers a stored profile of the right length", () => {
    const result = speedProfileForTrip(
      { speed_profile: "10,20,30,40", avg_speed_kmh: 25, top_speed_kmh: 40 },
      points
    );
    expect(result.source).toBe("measured");
    expect(result.speeds).toEqual([10, 20, 30, 40]);
  });

  it("refuses a stored profile that does not line up with the polyline", () => {
    const result = speedProfileForTrip(
      { speed_profile: "10,20", avg_speed_kmh: 25, top_speed_kmh: 40 },
      points
    );
    expect(result.source).toBe("derived");
    expect(result.speeds).toHaveLength(points.length);
  });

  it("derives one for a trip recorded before profiles existed", () => {
    const result = speedProfileForTrip({ avg_speed_kmh: 50, top_speed_kmh: 90 }, points);
    expect(result.source).toBe("derived");
    expect(Math.max(...result.speeds)).toBeCloseTo(90, 5);
  });

  it("reports `none` when nothing can be coloured", () => {
    expect(speedProfileForTrip({}, points).source).toBe("none");
    expect(speedProfileForTrip({}, []).source).toBe("none");
    expect(speedProfileForTrip({}, [points[0]]).speeds).toEqual([0]);
  });
});

describe("speedDomain", () => {
  it("anchors the cold end at zero and the hot end at the peak", () => {
    expect(speedDomain([10, 90, 45])).toEqual({ min: 0, max: 90 });
  });

  it("never produces a zero-width domain", () => {
    expect(speedDomain([0, 0]).max).toBeGreaterThan(0);
    expect(speedDomain([]).max).toBeGreaterThan(0);
  });
});

describe("heatColor", () => {
  const domain = { min: 0, max: 100 };

  it("lands on the ramp ends exactly", () => {
    expect(heatColor(0, domain)).toBe(SPEED_HEAT_STOPS[0].toUpperCase());
    expect(heatColor(100, domain)).toBe(SPEED_HEAT_STOPS[3].toUpperCase());
  });

  it("clamps outside the domain instead of wrapping", () => {
    expect(heatColor(-40, domain)).toBe(SPEED_HEAT_STOPS[0].toUpperCase());
    expect(heatColor(1000, domain)).toBe(SPEED_HEAT_STOPS[3].toUpperCase());
  });

  it("gets redder as it gets faster", () => {
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    expect(red(heatColor(80, domain))).toBeGreaterThan(red(heatColor(20, domain)));
  });
});

describe("mixHex", () => {
  it("returns the ends untouched", () => {
    expect(mixHex("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mixHex("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
  });

  it("interpolates the middle", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  it("clamps t and expands shorthand", () => {
    expect(mixHex("#000", "#FFF", 5)).toBe("#FFFFFF");
    expect(mixHex("#000", "#FFF", -5)).toBe("#000000");
  });
});

describe("heatSegments", () => {
  const domain = { min: 0, max: 100 };

  it("keeps a uniform path as one segment", () => {
    const pts = northLine(6);
    const segs = heatSegments(pts, [50, 50, 50, 50, 50, 50], domain);
    expect(segs).toHaveLength(1);
    expect(segs[0].points).toHaveLength(6);
  });

  it("splits where the speed band changes and overlaps at the join", () => {
    const pts = northLine(6);
    const segs = heatSegments(pts, [10, 10, 10, 95, 95, 95], domain);
    expect(segs.length).toBeGreaterThan(1);
    // No gap: the last point of one run is the first of the next.
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1].points;
      expect(segs[i].points[0]).toBe(prev[prev.length - 1]);
    }
    // Every point is still covered.
    expect(segs[0].points[0]).toBe(pts[0]);
    expect(segs[segs.length - 1].points.at(-1)).toBe(pts[5]);
    expect(segs[segs.length - 1].speedKmh).toBeGreaterThan(segs[0].speedKmh);
  });

  it("caps the number of native polylines it asks for", () => {
    const pts = northLine(400);
    // Worst case: alternate between the coldest and hottest band every point.
    const speeds = pts.map((_, i) => (i % 2 === 0 ? 0 : 100));
    const segs = heatSegments(pts, speeds, domain);
    expect(segs.length).toBeLessThanOrEqual(pts.length);
    for (const s of segs) expect(s.points.length).toBeGreaterThan(1);
  });

  it("quantises into at most HEAT_BUCKETS distinct colours", () => {
    const pts = northLine(60);
    const speeds = pts.map((_, i) => i * 2);
    const segs = heatSegments(pts, speeds, domain);
    expect(new Set(segs.map((s) => s.color)).size).toBeLessThanOrEqual(HEAT_BUCKETS);
  });

  it("draws nothing for a path that is not a line", () => {
    expect(heatSegments([], [], domain)).toEqual([]);
    expect(heatSegments([{ latitude: 0, longitude: 0 }], [0], domain)).toEqual([]);
  });

  it("survives a profile shorter than the path", () => {
    const pts = northLine(5);
    const segs = heatSegments(pts, [30], domain);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every((s) => Number.isFinite(s.speedKmh))).toBe(true);
  });
});
