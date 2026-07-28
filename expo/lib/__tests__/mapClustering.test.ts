/**
 * Clustering is the one part of the marker rebuild whose failure mode is
 * silent: a wrong threshold does not throw, it just shows the driver a "12"
 * where twelve individual places should be, or twelve overlapping badges
 * where a "12" should be. These assertions pin the boundaries.
 */

import { describe, expect, it } from "bun:test";
import { clusterPlaces, isCluster, type Clusterable } from "@/lib/mapClustering";

const JAKARTA = { lat: -6.1754, lng: 106.8272 };

/** n places within a few hundred metres of each other. */
function tightGroup(category: string, n: number, offset = 0): Clusterable[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${category}-${offset + i}`,
    lat: JAKARTA.lat + i * 0.0004,
    lng: JAKARTA.lng + i * 0.0004,
    category,
  }));
}

describe("zoom threshold", () => {
  it("does not cluster when zoomed in past the threshold", () => {
    const out = clusterPlaces(tightGroup("cafe", 5), { latitudeDelta: 0.01 });
    expect(out).toHaveLength(5);
    expect(out.every((c) => c.count === 1)).toBe(true);
  });

  it("clusters once zoomed out beyond it", () => {
    const out = clusterPlaces(tightGroup("cafe", 5), { latitudeDelta: 0.5 });
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(5);
    expect(isCluster(out[0])).toBe(true);
  });

  it("treats the threshold itself as zoomed-in", () => {
    const atThreshold = clusterPlaces(tightGroup("cafe", 4), {
      latitudeDelta: 0.02,
      disableBelowDelta: 0.02,
    });
    // 0.02 is not *below* 0.02, so clustering is active.
    expect(atThreshold.length).toBeLessThan(4);
  });

  it("survives the first frame, before the map reports a real region", () => {
    for (const delta of [0, -1, NaN, Infinity]) {
      const out = clusterPlaces(tightGroup("cafe", 3), { latitudeDelta: delta });
      expect(out).toHaveLength(3);
    }
  });
});

describe("per-category clustering", () => {
  it("never merges two categories into one cluster", () => {
    const items = [...tightGroup("cafe", 4), ...tightGroup("parking", 3)];
    const out = clusterPlaces(items, { latitudeDelta: 0.5 });
    expect(out).toHaveLength(2);
    const byCategory = Object.fromEntries(out.map((c) => [c.category, c.count]));
    expect(byCategory.cafe).toBe(4);
    expect(byCategory.parking).toBe(3);
  });

  it("gives every cluster a category, so a badge always has a colour", () => {
    const items = [...tightGroup("cafe", 4), ...tightGroup("ev_charger", 2)];
    const out = clusterPlaces(items, { latitudeDelta: 0.5 });
    expect(out.every((c) => c.category !== null)).toBe(true);
  });

  it("keeps distant places of the same category apart", () => {
    const near = tightGroup("cafe", 2);
    const far = [{ id: "cafe-far", lat: JAKARTA.lat + 5, lng: JAKARTA.lng, category: "cafe" }];
    const out = clusterPlaces([...near, ...far], { latitudeDelta: 0.5 });
    expect(out).toHaveLength(2);
  });
});

describe("global clustering", () => {
  it("merges categories into one cluster", () => {
    const items = [...tightGroup("cafe", 4), ...tightGroup("parking", 3)];
    const out = clusterPlaces(items, { latitudeDelta: 0.5, mode: "global" });
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(7);
  });

  // The reason per-category is the default: a mixed cluster has no honest
  // colour, and the render site needs to be told that rather than guessing.
  it("reports a mixed cluster's category as null", () => {
    const items = [...tightGroup("cafe", 2), ...tightGroup("parking", 2)];
    const out = clusterPlaces(items, { latitudeDelta: 0.5, mode: "global" });
    expect(out[0].category).toBeNull();
  });

  it("still reports a single-category cluster's category", () => {
    const out = clusterPlaces(tightGroup("cafe", 3), {
      latitudeDelta: 0.5,
      mode: "global",
    });
    expect(out[0].category).toBe("cafe");
  });
});

describe("cluster shape", () => {
  it("returns a singleton cluster for a lone place, not a bare place", () => {
    const out = clusterPlaces([{ id: "solo", lat: 1, lng: 1, category: "cafe" }], {
      latitudeDelta: 0.5,
    });
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
    expect(out[0].items).toHaveLength(1);
    expect(isCluster(out[0])).toBe(false);
    // A singleton keeps the place's own id so tapping it can resolve back.
    expect(out[0].id).toBe("solo");
  });

  it("positions a cluster at the centroid of its members", () => {
    const out = clusterPlaces(
      [
        { id: "a", lat: 0, lng: 0, category: "cafe" },
        { id: "b", lat: 2, lng: 4, category: "cafe" },
      ],
      { latitudeDelta: 90 }
    );
    expect(out[0].lat).toBeCloseTo(1, 6);
    expect(out[0].lng).toBeCloseTo(2, 6);
  });

  it("keeps every input place in exactly one cluster", () => {
    const items = [...tightGroup("cafe", 9), ...tightGroup("parking", 6, 100)];
    const out = clusterPlaces(items, { latitudeDelta: 0.5 });
    const seen = out.flatMap((c) => c.items.map((i) => i.id));
    expect(seen).toHaveLength(items.length);
    expect(new Set(seen).size).toBe(items.length);
  });

  it("drops places with an unusable coordinate", () => {
    const out = clusterPlaces(
      [
        { id: "ok", lat: 1, lng: 1, category: "cafe" },
        { id: "bad", lat: NaN, lng: 1, category: "cafe" },
      ],
      { latitudeDelta: 0.5 }
    );
    expect(out.flatMap((c) => c.items.map((i) => i.id))).toEqual(["ok"]);
  });

  it("returns a stable order regardless of input order", () => {
    const items = [...tightGroup("cafe", 4), ...tightGroup("parking", 3)];
    const a = clusterPlaces(items, { latitudeDelta: 0.5 }).map((c) => c.id);
    const b = clusterPlaces([...items].reverse(), { latitudeDelta: 0.5 }).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("handles an empty input", () => {
    expect(clusterPlaces([], { latitudeDelta: 0.5 })).toEqual([]);
  });
});

describe("grid density", () => {
  it("splits into more clusters as the grid gets finer", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `p-${i}`,
      lat: JAKARTA.lat + (i % 8) * 0.02,
      lng: JAKARTA.lng + Math.floor(i / 8) * 0.02,
      category: "cafe",
    }));
    const coarse = clusterPlaces(items, { latitudeDelta: 0.5, grid: 2 });
    const fine = clusterPlaces(items, { latitudeDelta: 0.5, grid: 16 });
    expect(fine.length).toBeGreaterThan(coarse.length);
  });
});
