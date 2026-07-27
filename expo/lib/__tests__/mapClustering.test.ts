import { describe, expect, it } from "bun:test";
import {
  boundsOf,
  clusterPlaceMarkers,
  clusterPoints,
  CLUSTER_MIN_DELTA,
  GLOBAL_CLUSTER_DELTA,
  type ClusterNode,
  type Region,
} from "../mapClustering";

interface P {
  id: string;
  lat: number;
  lng: number;
  category: string;
}

const JAKARTA = { lat: -6.1754, lng: 106.8272 };

function point(id: string, dLat = 0, dLng = 0, category = "cafe"): P {
  return { id, lat: JAKARTA.lat + dLat, lng: JAKARTA.lng + dLng, category };
}

function region(latitudeDelta: number): Region {
  return {
    latitude: JAKARTA.lat,
    longitude: JAKARTA.lng,
    latitudeDelta,
    longitudeDelta: latitudeDelta,
  };
}

/** Zoomed out far enough to cluster, but inside the per-category range. */
const CLUSTERING_REGION = region(0.1);

function leaves(nodes: ClusterNode<P>[]): string[] {
  return nodes.filter((n) => n.kind === "leaf").map((n) => n.id).sort();
}

function clusters(nodes: ClusterNode<P>[]) {
  return nodes.filter((n): n is Extract<ClusterNode<P>, { kind: "cluster" }> => n.kind === "cluster");
}

describe("clusterPoints", () => {
  it("returns nothing for an empty input", () => {
    expect(clusterPoints([], CLUSTERING_REGION)).toEqual([]);
  });

  it("draws every marker individually when zoomed in past the threshold", () => {
    const items = [point("a"), point("b", 0.00001), point("c", 0.00002)];
    const nodes = clusterPoints(items, region(CLUSTER_MIN_DELTA / 2));
    expect(nodes).toHaveLength(3);
    expect(leaves(nodes)).toEqual(["a", "b", "c"]);
  });

  it("draws every marker individually when there is no region yet", () => {
    const items = [point("a"), point("b", 0.00001)];
    expect(leaves(clusterPoints(items, null))).toEqual(["a", "b"]);
  });

  it("merges co-located markers into one cluster when zoomed out", () => {
    const items = [point("a"), point("b", 0.00001), point("c", 0.00002)];
    const nodes = clusterPoints(items, CLUSTERING_REGION);
    expect(nodes).toHaveLength(1);
    const [cluster] = clusters(nodes);
    expect(cluster.count).toBe(3);
    expect(cluster.items.map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("places a cluster at the centroid of its members", () => {
    const items = [point("a", 0), point("b", 0.0002)];
    const [cluster] = clusters(clusterPoints(items, CLUSTERING_REGION));
    expect(cluster.latitude).toBeCloseTo(JAKARTA.lat + 0.0001, 6);
    expect(cluster.longitude).toBeCloseTo(JAKARTA.lng, 6);
  });

  it("never emits a cluster of one — a lone marker stays a leaf", () => {
    // Two points far enough apart to land in different cells.
    const items = [point("a"), point("b", 0.05, 0.05)];
    const nodes = clusterPoints(items, CLUSTERING_REGION);
    expect(clusters(nodes)).toHaveLength(0);
    expect(leaves(nodes)).toEqual(["a", "b"]);
  });

  it("keeps groups apart when groupBy is supplied", () => {
    const items = [
      point("cafe1", 0, 0, "cafe"),
      point("cafe2", 0.00001, 0, "cafe"),
      point("fuel1", 0, 0.00001, "gas_station"),
      point("fuel2", 0.00001, 0.00001, "gas_station"),
    ];
    const nodes = clusterPoints(items, CLUSTERING_REGION, { groupBy: (i) => i.category });
    const groups = clusters(nodes).map((c) => c.groupKey).sort();
    expect(groups).toEqual(["cafe", "gas_station"]);
  });

  it("merges those same groups when groupBy is omitted", () => {
    const items = [
      point("cafe1", 0, 0, "cafe"),
      point("cafe2", 0.00001, 0, "cafe"),
      point("fuel1", 0, 0.00001, "gas_station"),
    ];
    const nodes = clusterPoints(items, CLUSTERING_REGION);
    expect(clusters(nodes)).toHaveLength(1);
    expect(clusters(nodes)[0].count).toBe(3);
  });

  it("loses no items — every input is in exactly one output node", () => {
    const items = Array.from({ length: 250 }, (_, i) =>
      point(`p${i}`, (i % 25) * 0.004, Math.floor(i / 25) * 0.004, i % 2 ? "cafe" : "parking")
    );
    const nodes = clusterPoints(items, CLUSTERING_REGION, { groupBy: (i) => i.category });
    const seen = new Set<string>();
    for (const node of nodes) {
      if (node.kind === "leaf") seen.add(node.id);
      else for (const item of node.items) seen.add(item.id);
    }
    expect(seen.size).toBe(250);
  });

  it("cuts a dense city view down to a readable number of markers", () => {
    // 400 POIs inside ~2km — the "every gas station and cafe at once" case.
    const items = Array.from({ length: 400 }, (_, i) =>
      point(`p${i}`, (i % 20) * 0.001, Math.floor(i / 20) * 0.001)
    );
    const nodes = clusterPoints(items, CLUSTERING_REGION);
    expect(nodes.length).toBeLessThan(items.length / 4);
  });

  it("is stable — the same input and region cluster identically", () => {
    const items = Array.from({ length: 60 }, (_, i) => point(`p${i}`, i * 0.002, i * 0.001));
    const a = clusterPoints(items, CLUSTERING_REGION);
    const b = clusterPoints([...items].reverse(), CLUSTERING_REGION);
    const idsOf = (nodes: ClusterNode<P>[]) => nodes.map((n) => n.id).sort();
    expect(idsOf(a)).toEqual(idsOf(b));
  });

  it("ignores a region with non-finite deltas rather than dividing by it", () => {
    const items = [point("a"), point("b", 0.00001)];
    const bad = { ...CLUSTERING_REGION, latitudeDelta: Number.NaN };
    expect(leaves(clusterPoints(items, bad))).toEqual(["a", "b"]);
  });

  it("treats a negative latitudeDelta by magnitude", () => {
    const items = [point("a"), point("b", 0.00001), point("c", 0.00002)];
    const negative = { ...CLUSTERING_REGION, latitudeDelta: -0.1, longitudeDelta: -0.1 };
    expect(clusters(clusterPoints(items, negative))).toHaveLength(1);
  });
});

describe("clusterPlaceMarkers", () => {
  const mixed = [
    point("cafe1", 0, 0, "cafe"),
    point("cafe2", 0.00001, 0, "cafe"),
    point("fuel1", 0, 0.00001, "gas_station"),
    point("fuel2", 0.00001, 0.00001, "gas_station"),
  ];

  it("keeps categories separate through the normal zoom range", () => {
    const nodes = clusterPlaceMarkers(mixed, region(GLOBAL_CLUSTER_DELTA / 2));
    const cs = clusters(nodes);
    expect(cs).toHaveLength(2);
    expect(cs.every((c) => c.groupKey !== null)).toBe(true);
  });

  it("merges across categories once the viewport is wider than the global threshold", () => {
    const nodes = clusterPlaceMarkers(mixed, region(GLOBAL_CLUSTER_DELTA * 2));
    const cs = clusters(nodes);
    expect(cs).toHaveLength(1);
    expect(cs[0].count).toBe(4);
    // No shared category, so the badge drops the glyph for a bare count.
    expect(cs[0].groupKey).toBeNull();
  });
});

describe("boundsOf", () => {
  it("returns null for an empty cluster", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("centres on the members and spans them with padding", () => {
    const bounds = boundsOf([point("a", 0, 0), point("b", 0.02, 0.04)])!;
    expect(bounds.latitude).toBeCloseTo(JAKARTA.lat + 0.01, 6);
    expect(bounds.longitude).toBeCloseTo(JAKARTA.lng + 0.02, 6);
    expect(bounds.latitudeDelta).toBeCloseTo(0.02 * 1.4, 6);
    expect(bounds.longitudeDelta).toBeCloseTo(0.04 * 1.4, 6);
  });

  it("floors the span so co-located members don't zoom to nothing", () => {
    const bounds = boundsOf([point("a"), point("b", 0.000001)])!;
    expect(bounds.latitudeDelta).toBeGreaterThan(0.003);
    expect(bounds.longitudeDelta).toBeGreaterThan(0.003);
  });
});
