/**
 * Grid clustering for map markers.
 *
 * `react-native-maps` has no clustering of its own — it renders whatever
 * `<Marker>` children it is given, and each one on Android is a view
 * snapshotted into a bitmap. A city centre with nine POI categories on is
 * several hundred of those, which is both unreadable and the single
 * biggest cost on the screen. So the marker list is reduced here, in JS,
 * before it reaches the map.
 *
 * WHY A GRID AND NOT A DISTANCE-BASED CLUSTERER
 *   Grid bucketing is O(n) with one pass and no sort, it is stable (the
 *   same input at the same region always produces the same clusters, so
 *   markers do not reshuffle when an unrelated piece of state changes),
 *   and its cell size can be derived directly from the visible region.
 *   Hierarchical/k-means clustering produces prettier groupings and is
 *   neither of those things.
 *
 * THE TWO MODES, AND WHICH ONE READS BETTER
 *   Both were built because the brief asked for the comparison.
 *
 *   per-category — one cluster per (cell, category). The badge keeps its
 *                  category glyph and gains a count, so a cluster reads as
 *                  "twelve fuel stations here". Meaning survives.
 *   global       — one cluster per cell across every category. The badge
 *                  loses the glyph and becomes a bare count.
 *
 *   Per-category wins for most of the zoom range: the glyph is the whole
 *   point of the marker set, and a cluster that keeps it is still telling
 *   the driver something. Its failure mode is the far zoom-out, where nine
 *   categories put nine overlapping badges in every cell and the map turns
 *   to mush — exactly the case a bare count handles well. So the mode is
 *   chosen by zoom rather than picked once: per-category through the
 *   normal range, global past `GLOBAL_CLUSTER_DELTA`.
 */

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface ClusterablePoint {
  id: string;
  lat: number;
  lng: number;
}

export type ClusterNode<T extends ClusterablePoint> =
  | {
      kind: "leaf";
      /** Stable across renders — the item's own id. */
      id: string;
      latitude: number;
      longitude: number;
      item: T;
    }
  | {
      kind: "cluster";
      /** Derived from the cell, so it is stable while the region holds. */
      id: string;
      latitude: number;
      longitude: number;
      count: number;
      /** The shared category when clustering per-category, else null. */
      groupKey: string | null;
      items: T[];
    };

/**
 * Below this latitude span the map is zoomed in far enough that markers
 * stop overlapping, and clustering only hides detail the driver zoomed in
 * to see. ~0.02° is roughly a 2km-tall viewport.
 */
export const CLUSTER_MIN_DELTA = 0.02;

/**
 * Above this span, per-category clustering stops helping — nine categories
 * put nine badges in every cell — so clusters merge across categories and
 * the badge becomes a bare count. ~0.35° is roughly a 39km-tall viewport,
 * about "the whole metro area on screen".
 */
export const GLOBAL_CLUSTER_DELTA = 0.35;

/**
 * How many grid cells span the viewport in each axis. Eight gives cells of
 * roughly 45–50pt on a 390×844 screen, which is a little under one marker
 * badge — close enough that two markers in the same cell would genuinely
 * have overlapped, and far enough that the grid does not visibly quantise
 * marker positions.
 */
export const CELLS_PER_VIEWPORT = 8;

/** Fewer than this in a cell renders as individual markers, not a badge. */
export const MIN_CLUSTER_SIZE = 2;

export interface ClusterOptions<T extends ClusterablePoint> {
  /**
   * Groups items that may cluster together. Return the same key for two
   * items and they can merge; return different keys and they never will.
   * Omit for global clustering.
   */
  groupBy?: (item: T) => string;
  minDelta?: number;
  cellsPerViewport?: number;
  minClusterSize?: number;
}

function leafOf<T extends ClusterablePoint>(item: T): ClusterNode<T> {
  return { kind: "leaf", id: item.id, latitude: item.lat, longitude: item.lng, item };
}

/**
 * Buckets `items` into clusters for the given region.
 *
 * Returns leaves unchanged when the region is zoomed in past `minDelta`,
 * and never clusters a single item — a "cluster of 1" is just a marker
 * that lost its glyph.
 */
export function clusterPoints<T extends ClusterablePoint>(
  items: T[],
  region: Region | null,
  options: ClusterOptions<T> = {}
): ClusterNode<T>[] {
  const {
    groupBy,
    minDelta = CLUSTER_MIN_DELTA,
    cellsPerViewport = CELLS_PER_VIEWPORT,
    minClusterSize = MIN_CLUSTER_SIZE,
  } = options;

  if (items.length === 0) return [];
  // No region yet (first frame, before onRegionChangeComplete fires) means
  // no zoom to reason about — draw everything rather than guess.
  if (!region) return items.map(leafOf);

  const latDelta = Math.abs(region.latitudeDelta);
  const lngDelta = Math.abs(region.longitudeDelta);
  if (!Number.isFinite(latDelta) || !Number.isFinite(lngDelta)) return items.map(leafOf);
  if (latDelta < minDelta) return items.map(leafOf);

  const latCell = latDelta / cellsPerViewport;
  const lngCell = lngDelta / cellsPerViewport;
  if (latCell <= 0 || lngCell <= 0) return items.map(leafOf);

  const buckets = new Map<string, { key: string; group: string | null; items: T[] }>();
  for (const item of items) {
    const latIdx = Math.floor(item.lat / latCell);
    const lngIdx = Math.floor(item.lng / lngCell);
    const group = groupBy ? groupBy(item) : null;
    const key = `${group ?? "*"}:${latIdx}:${lngIdx}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(item);
    else buckets.set(key, { key, group, items: [item] });
  }

  const nodes: ClusterNode<T>[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.items.length < minClusterSize) {
      for (const item of bucket.items) nodes.push(leafOf(item));
      continue;
    }
    let latSum = 0;
    let lngSum = 0;
    for (const item of bucket.items) {
      latSum += item.lat;
      lngSum += item.lng;
    }
    nodes.push({
      kind: "cluster",
      id: `cluster:${bucket.key}`,
      latitude: latSum / bucket.items.length,
      longitude: lngSum / bucket.items.length,
      count: bucket.items.length,
      groupKey: bucket.group,
      items: bucket.items,
    });
  }
  return nodes;
}

/**
 * The clustering the map actually uses: per-category through the normal
 * zoom range, merging across categories once the viewport is wider than
 * `GLOBAL_CLUSTER_DELTA`. See the mode note at the top of the file.
 */
export function clusterPlaceMarkers<T extends ClusterablePoint & { category: string }>(
  items: T[],
  region: Region | null,
  globalDelta = GLOBAL_CLUSTER_DELTA
): ClusterNode<T>[] {
  const wideView = region != null && Math.abs(region.latitudeDelta) >= globalDelta;
  return clusterPoints(items, region, {
    groupBy: wideView ? undefined : (item) => item.category,
  });
}

/**
 * A bounding box around a cluster's members, for the "tap a cluster to zoom
 * into it" gesture. Padded so the outermost markers are not flush against
 * the screen edge, and floored at a span the camera can actually resolve.
 */
export function boundsOf<T extends ClusterablePoint>(items: T[], padding = 1.4): Region | null {
  if (items.length === 0) return null;
  let minLat = items[0].lat;
  let maxLat = items[0].lat;
  let minLng = items[0].lng;
  let maxLng = items[0].lng;
  for (const item of items) {
    if (item.lat < minLat) minLat = item.lat;
    if (item.lat > maxLat) maxLat = item.lat;
    if (item.lng < minLng) minLng = item.lng;
    if (item.lng > maxLng) maxLng = item.lng;
  }
  const MIN_SPAN = 0.004; // ~450m — below this the camera just jumps
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * padding, MIN_SPAN),
    longitudeDelta: Math.max((maxLng - minLng) * padding, MIN_SPAN),
  };
}
