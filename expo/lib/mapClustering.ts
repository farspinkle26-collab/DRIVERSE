/**
 * Driveverse — marker clustering for the map.
 *
 * `react-native-maps` has no clustering of its own (the Mapbox
 * `ShapeSource cluster` property the rebuild brief assumes belongs to
 * `@rnmapbox/maps`, which this app does not use), so the grouping happens
 * here, in JS, before anything is handed to the map. That turns out to be
 * the right place for it anyway: each marker on this map is a React view
 * that Android snapshots into a bitmap, so the cost being avoided is not
 * "drawing 400 symbols" but "laying out and rasterising 400 view trees".
 *
 * GRID, NOT DISTANCE
 *   Cells on a fixed grid, not a distance-based agglomeration. Grid
 *   clustering is O(n) with no distance matrix, and — more importantly for
 *   a map you can pan — it is *stable*: a marker's cell depends only on its
 *   own coordinate and the current zoom, so panning by half a screen does
 *   not reshuffle which points grouped with which. Agglomerative clustering
 *   re-seeds from whatever is in view and makes clusters visibly jump
 *   around as you drag.
 *
 * PER-CATEGORY BY DEFAULT
 *   Clusters group within a category, so a cluster is always "5 cafes",
 *   never "5 things". Two reasons:
 *
 *   1. A mixed cluster has no honest colour. With category colours now
 *      carrying the meaning of a marker, a cluster containing a cafe, a car
 *      park and a charger could only be drawn in a neutral tone — which
 *      throws away the exact signal the coloured markers were added to
 *      provide, and does it at the zoom level where the map is busiest and
 *      the driver needs it most.
 *   2. A mixed cluster is not actionable. "7 places here" answers no
 *      question a driver has; "3 fuel" does.
 *
 *   The cost is real and worth naming: at a dense city zoom, per-category
 *   clustering can leave up to one cluster per category per cell where
 *   global clustering would leave one. `mode: "global"` implements the
 *   other behaviour and both are tested, so the comparison the brief asks
 *   for is a one-line change — see `MAP_MARKER_REFERENCE.md` for what is
 *   still owed on device.
 */

export interface Clusterable {
  id: string;
  lat: number;
  lng: number;
  /** Used to keep clusters within a category. Ignored in `global` mode. */
  category?: string;
}

export interface Cluster<T extends Clusterable> {
  /** Stable across renders for the same cell + category. */
  id: string;
  /** Centroid of the members — not the cell centre, which can sit in the
   *  sea beside a coastal town. */
  lat: number;
  lng: number;
  count: number;
  items: T[];
  /** The shared category, or `null` for a mixed cluster in `global` mode. */
  category: string | null;
}

export interface ClusterOptions {
  /** The map region's `latitudeDelta` — how much world is on screen. */
  latitudeDelta: number;
  /** Cells across the visible height. Higher = smaller cells = more,
   *  tighter clusters. 6 puts a cell at roughly a sixth of the screen. */
  grid?: number;
  /**
   * Below this `latitudeDelta`, nothing is clustered.
   *
   * 0.02° is about 2 km of visible height — roughly a neighbourhood. Zoomed
   * in that far the driver is choosing between individual places, and
   * collapsing two cafes on the same street into a "2" is actively worse
   * than a little overlap.
   */
  disableBelowDelta?: number;
  mode?: "category" | "global";
}

const DEFAULT_GRID = 6;
const DEFAULT_DISABLE_BELOW = 0.02;

/** True when a cluster holds more than one place and should draw as a count. */
export function isCluster<T extends Clusterable>(c: Cluster<T>): boolean {
  return c.count > 1;
}

/**
 * Groups places into clusters for the current region.
 *
 * Always returns a `Cluster` per drawn marker, including singles (`count`
 * 1, one item) — so the render site has one shape to handle rather than a
 * union of "place or cluster", which is where off-by-one marker bugs live.
 */
export function clusterPlaces<T extends Clusterable>(
  items: T[],
  {
    latitudeDelta,
    grid = DEFAULT_GRID,
    disableBelowDelta = DEFAULT_DISABLE_BELOW,
    mode = "category",
  }: ClusterOptions
): Cluster<T>[] {
  if (items.length === 0) return [];

  // Zoomed in past the threshold, or handed a nonsense region: every place
  // draws as itself. Guarding on non-finite/non-positive deltas here keeps
  // the cell maths below from dividing by zero during the first frame,
  // before the map has reported a real region.
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0 || latitudeDelta < disableBelowDelta) {
    return items.map(singleton);
  }

  const cell = latitudeDelta / grid;
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
    const row = Math.floor(item.lat / cell);
    // Longitude uses the same cell size in degrees. Away from the equator a
    // degree of longitude is shorter than a degree of latitude, so cells are
    // wider than they are tall in metres — which suits a landscape-ish
    // phone viewport and costs nothing at the latitudes this app runs at.
    const col = Math.floor(item.lng / cell);
    const key =
      mode === "category" ? `${item.category ?? "_"}:${row}:${col}` : `${row}:${col}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const clusters: Cluster<T>[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      clusters.push(singleton(group[0]));
      continue;
    }
    let latSum = 0;
    let lngSum = 0;
    for (const g of group) {
      latSum += g.lat;
      lngSum += g.lng;
    }
    const categories = new Set(group.map((g) => g.category ?? null));
    clusters.push({
      id: `cluster:${key}`,
      lat: latSum / group.length,
      lng: lngSum / group.length,
      count: group.length,
      items: group,
      category: categories.size === 1 ? (group[0].category ?? null) : null,
    });
  }

  // Insertion order of a Map is stable, but bucket order depends on the
  // input order, which the fetch layer does not guarantee across refetches.
  // Sorting by id keeps React's reconciliation stable between renders.
  return clusters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function singleton<T extends Clusterable>(item: T): Cluster<T> {
  return {
    id: item.id,
    lat: item.lat,
    lng: item.lng,
    count: 1,
    items: [item],
    category: item.category ?? null,
  };
}
