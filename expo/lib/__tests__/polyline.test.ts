import { describe, expect, it } from "bun:test";
import {
  decodePolyline,
  encodePolyline,
  simplifyIndices,
  simplifyPath,
  type LatLng,
} from "@/lib/polyline";

function line(count: number): LatLng[] {
  return Array.from({ length: count }, (_, i) => ({
    latitude: -6.2 + i * 0.0005,
    longitude: 106.8 + i * 0.0005,
  }));
}

describe("encode/decodePolyline", () => {
  it("round-trips to 5 decimal places", () => {
    const pts = line(5);
    const back = decodePolyline(encodePolyline(pts));
    expect(back).toHaveLength(pts.length);
    back.forEach((p, i) => {
      expect(p.latitude).toBeCloseTo(pts[i].latitude, 5);
      expect(p.longitude).toBeCloseTo(pts[i].longitude, 5);
    });
  });

  it("treats an empty string as no path", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("simplifyIndices", () => {
  it("keeps everything when the track is already short enough", () => {
    expect(simplifyIndices(4, 400)).toEqual([0, 1, 2, 3]);
  });

  it("always keeps the first and last fix", () => {
    const idx = simplifyIndices(1000, 400);
    expect(idx).toHaveLength(400);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(999);
  });

  it("stays in range and in order", () => {
    const idx = simplifyIndices(977, 400);
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
      expect(idx[i]).toBeLessThan(977);
    }
  });

  it("handles a track with nothing in it", () => {
    expect(simplifyIndices(0, 400)).toEqual([]);
  });

  /**
   * The reason this function is exported at all: the map screen thins the
   * coordinates and their capture timestamps separately, and a profile offset
   * by one point paints the fast stretch onto the wrong corner of the card.
   */
  it("thins two parallel arrays to the same points", () => {
    const coords = line(900);
    const times = coords.map((_, i) => i * 1000);
    const idx = simplifyIndices(coords.length, 400);
    const thinnedCoords = idx.map((i) => coords[i]);
    const thinnedTimes = idx.map((i) => times[i]);
    expect(thinnedCoords).toEqual(simplifyPath(coords, 400));
    expect(thinnedTimes).toHaveLength(thinnedCoords.length);
    thinnedTimes.forEach((t, i) => {
      expect(t / 1000).toBe(coords.indexOf(thinnedCoords[i]));
    });
  });
});

describe("simplifyPath", () => {
  it("leaves a short path untouched", () => {
    const pts = line(10);
    expect(simplifyPath(pts, 400)).toBe(pts);
  });

  it("caps a long path and preserves both ends", () => {
    const pts = line(2000);
    const out = simplifyPath(pts, 400);
    expect(out).toHaveLength(400);
    expect(out[0]).toEqual(pts[0]);
    expect(out[399]).toEqual(pts[1999]);
  });
});
