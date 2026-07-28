// POI source: category -> Mapbox canonical category mapping, query building,
// fetch, and result normalization. This is the ONLY place that knows which
// provider POIs come from or what its response looks like — swapping it again
// later means changing this file, not the /places-nearby contract.
//
// WHY THIS REPLACED OVERPASS
//   The previous implementation queried the public Overpass API. Overpass caps
//   *concurrent* queries per IP (two, on the main instance) and refuses the
//   rest with 429 immediately rather than queueing them. Every edge-function
//   invocation leaves Supabase from a shared regional egress IP, so the app was
//   competing not only with itself but with every other Supabase project in the
//   region. The result was not occasional flakiness: it was a steady stream of
//   `HTTP 502 — Couldn't load nearby places` across every ticked category, all
//   day. No amount of client-side windowing fixes a dependency that is refusing
//   the request before it starts.
//
//   Mapbox Search Box is a paid, SLA-backed endpoint using a token this app
//   already ships for tiles, geocoding and directions, so there is no new
//   vendor and no new credential class to manage.

export type PlaceCategory =
  | "cafe"
  | "restaurant"
  | "gas_station"
  | "workshop"
  | "hangout"
  | "shopping"
  | "parking"
  | "ev_charger"
  | "car_wash";

export interface NormalizedPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  tags: Record<string, string>;
  /** `mapbox` = provider POI, `osm` = row cached before the provider swap. */
  source: "mapbox" | "osm" | "user";
}

const SEARCH_BOX_CATEGORY_URL = "https://api.mapbox.com/search/searchbox/v1/category";

/** Mapbox caps category search at 25 results per request. */
const RESULT_LIMIT = 25;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

/**
 * How many canonical-category requests may be in flight at once.
 *
 * Unlike Overpass, Mapbox does not hand out per-IP query slots — this exists
 * to keep one category with three canonical ids from opening three sockets at
 * the same moment as its eight siblings, not because the API refuses them.
 */
const MAX_CONCURRENT_SUBQUERIES = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rate limit and gateway failures are worth another go; 4xx is not. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Our category -> one or more Mapbox canonical category ids, OR'd together by
 * issuing one request each and merging.
 *
 * These mirror the OSM tag groupings they replace, so the map's vocabulary
 * (`constants/mapLayers.ts`) does not move: `hangout` still pools bars, fast
 * food and parks; `shopping` still pools malls and department stores; parking
 * covers both surface lots and garages, which OSM lumped under one tag and
 * Mapbox splits.
 *
 * VERIFY THESE AGAINST THE LIVE LIST BEFORE TRUSTING A DEPLOY:
 *   curl "https://api.mapbox.com/search/searchbox/v1/list/category?access_token=$MAPBOX_ACCESS_TOKEN&language=en"
 * A canonical id that Mapbox does not recognise is not a crash — `fetchNearby`
 * treats a failed sub-query as contributing nothing and only fails the whole
 * category when *every* id for it failed — but it does silently thin that
 * category's results, which is exactly the kind of quiet under-reporting the
 * `nw`/`out center` fix had to undo on the Overpass side.
 */
const CATEGORY_CANONICAL_IDS: Record<PlaceCategory, string[]> = {
  cafe: ["cafe"],
  restaurant: ["restaurant"],
  gas_station: ["gas_station"],
  workshop: ["auto_repair"],
  hangout: ["bar", "fast_food", "park"],
  shopping: ["shopping_mall", "department_store"],
  parking: ["parking_lot", "parking_garage"],
  ev_charger: ["ev_charging_station"],
  car_wash: ["car_wash"],
};

/** Every category this service can answer for. Exported so callers can
 *  build an accurate error message instead of hardcoding a stale list. */
export const PLACE_CATEGORIES = Object.keys(CATEGORY_CANONICAL_IDS) as PlaceCategory[];

export function isPlaceCategory(value: string): value is PlaceCategory {
  return value in CATEGORY_CANONICAL_IDS;
}

export class PlacesSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesSourceError";
  }
}

/**
 * Converts a centre + radius into the bounding box Mapbox filters on.
 *
 * `proximity` alone is not enough and this is the same trap the landmark layer
 * hit (`MAP_MARKER_REFERENCE.md` §10): proximity only *ranks* results, it does
 * not bound them, so a sparse category in a sparse area comes back with hits
 * from the next city. `bbox` is a hard filter, so a marker can never land
 * outside the area the driver is looking at.
 */
export function boundingBoxFor(lat: number, lng: number, radiusMeters: number): string {
  const dLat = radiusMeters / 111_320;
  // Longitude degrees shrink toward the poles; clamp the cosine so a map
  // centred near one cannot divide by ~0 and produce an infinite box.
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = radiusMeters / (111_320 * cosLat);

  const minLng = clamp(lng - dLng, -180, 180);
  const minLat = clamp(lat - dLat, -90, 90);
  const maxLng = clamp(lng + dLng, -180, 180);
  const maxLat = clamp(lat + dLat, -90, 90);
  return `${minLng},${minLat},${maxLng},${maxLat}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** One GET to one canonical category, with its own abort timer. */
async function getCategory(canonicalId: string, params: URLSearchParams): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${SEARCH_BOX_CATEGORY_URL}/${canonicalId}?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new PlacesSourceError(`Mapbox category request for ${canonicalId} timed out`);
    }
    throw new PlacesSourceError(`Mapbox category request for ${canonicalId} failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetches one canonical category, retrying transient failures. */
async function fetchCanonicalCategory(
  canonicalId: string,
  category: PlaceCategory,
  params: URLSearchParams
): Promise<NormalizedPlace[]> {
  let lastError: PlacesSourceError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt);

    let response: Response;
    try {
      response = await getCategory(canonicalId, params);
    } catch (error) {
      lastError = error instanceof PlacesSourceError ? error : new PlacesSourceError(String(error));
      continue;
    }

    if (response.ok) {
      let body: { features?: unknown[] };
      try {
        body = await response.json();
      } catch {
        throw new PlacesSourceError(`Mapbox returned an unparseable response for ${canonicalId}`);
      }
      const features = Array.isArray(body.features) ? body.features : [];
      return features
        .map((feature) => normalizeFeature(feature, category))
        .filter((place): place is NormalizedPlace => place !== null);
    }

    // Drain the body so the connection can be reused rather than leaked.
    await response.body?.cancel().catch(() => {});
    lastError = new PlacesSourceError(`Mapbox category ${canonicalId} returned ${response.status}`);
    console.warn(`[placesSource] ${category}: ${lastError.message}`);
    if (!isRetryableStatus(response.status)) break;
  }

  throw lastError ?? new PlacesSourceError(`Mapbox category ${canonicalId} failed`);
}

/**
 * Queries the POI provider for a category around a point.
 *
 * Throws PlacesSourceError only when *every* canonical id backing the category
 * failed. A category like `hangout` spans three ids, and one of them being
 * rejected is not a reason to tell the driver there are no hangouts nearby —
 * the same "partial failure is not total failure" rule the client already
 * applies across categories, applied within one.
 */
export async function fetchNearby(
  category: PlaceCategory,
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<NormalizedPlace[]> {
  const token = Deno.env.get("MAPBOX_ACCESS_TOKEN");
  if (!token) {
    throw new PlacesSourceError("MAPBOX_ACCESS_TOKEN is not set on the edge function");
  }

  const params = new URLSearchParams({
    access_token: token,
    bbox: boundingBoxFor(lat, lng, radiusMeters),
    proximity: `${lng},${lat}`,
    limit: String(RESULT_LIMIT),
    language: "id",
  });

  const canonicalIds = CATEGORY_CANONICAL_IDS[category];
  const settled: NormalizedPlace[][] = [];
  const errors: PlacesSourceError[] = [];

  for (let i = 0; i < canonicalIds.length; i += MAX_CONCURRENT_SUBQUERIES) {
    const window = canonicalIds.slice(i, i + MAX_CONCURRENT_SUBQUERIES);
    const results = await Promise.allSettled(
      window.map((canonicalId) => fetchCanonicalCategory(canonicalId, category, params))
    );
    for (const result of results) {
      if (result.status === "fulfilled") settled.push(result.value);
      else {
        errors.push(
          result.reason instanceof PlacesSourceError
            ? result.reason
            : new PlacesSourceError(String(result.reason))
        );
      }
    }
  }

  if (settled.length === 0) {
    throw errors[0] ?? new PlacesSourceError(`No POI source responded for ${category}`);
  }

  // Two canonical ids can return the same feature (a mall that is also tagged
  // a department store). Keying by id keeps one marker per real place.
  const byId = new Map<string, NormalizedPlace>();
  for (const places of settled) {
    for (const place of places) {
      if (!byId.has(place.id)) byId.set(place.id, place);
    }
  }
  return [...byId.values()];
}

/**
 * Fallback names, used when a feature carries no name.
 *
 * This is not cosmetic. The categories added in the marker rebuild are exactly
 * the ones most often left unnamed — a car park or a charging point usually has
 * an operator at best — so a flat `"Unnamed"` would put a column of identical
 * labels on the map precisely where the markers are densest. A driver does not
 * need a car park's name; they need to know it is a car park.
 */
const UNNAMED_FALLBACK: Record<PlaceCategory, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  gas_station: "Fuel station",
  workshop: "Workshop",
  hangout: "Hangout spot",
  shopping: "Shopping",
  parking: "Parking",
  ev_charger: "Charging point",
  car_wash: "Car wash",
};

type SearchBoxFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    name_preferred?: string;
    mapbox_id?: string;
    full_address?: string;
    address?: string;
    poi_category?: string[];
    brand?: string[];
    coordinates?: { latitude?: number; longitude?: number };
    metadata?: Record<string, unknown>;
  };
};

/**
 * Flattens a Search Box feature into the `NormalizedPlace` the map already
 * renders.
 *
 * `tags` is deliberately kept as the loose string map the OSM implementation
 * produced rather than becoming a typed provider object: `PlacesLayer` reads
 * `tags.opening_hours` and `tags.notes` by name, community submissions write
 * arbitrary keys into the same field, and rows cached before this swap still
 * carry OSM tag shapes. Mapping the provider's metadata onto the same key
 * names is what lets all three render through one code path.
 */
function normalizeFeature(feature: unknown, category: PlaceCategory): NormalizedPlace | null {
  const f = feature as SearchBoxFeature;
  const props = f.properties ?? {};

  // Search Box puts the position in GeoJSON order on `geometry`, and repeats it
  // named on `properties`. Preferring geometry keeps this correct if a future
  // response drops the convenience copy.
  const lng = f.geometry?.coordinates?.[0] ?? props.coordinates?.longitude;
  const lat = f.geometry?.coordinates?.[1] ?? props.coordinates?.latitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Namespaced like the OSM ids were, so a provider id can never collide with
  // an `osm-node-42` still sitting in the cache or in a driver's saved places.
  const id = props.mapbox_id ? `mbx-${props.mapbox_id}` : `mbx-${lat},${lng}-${category}`;

  const metadata = props.metadata ?? {};
  const tags: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (typeof value === "string" && value) tags[key] = value;
  };
  put("name", props.name);
  put("address", props.full_address ?? props.address);
  put("brand", props.brand?.[0]);
  // Mapped onto the OSM key names the detail sheet already reads.
  put("opening_hours", metadata.open_hours ?? metadata.opening_hours);
  put("phone", metadata.phone);
  put("website", metadata.website);

  return {
    id,
    name: props.name_preferred ?? props.name ?? props.brand?.[0] ?? UNNAMED_FALLBACK[category],
    lat: lat as number,
    lng: lng as number,
    category,
    tags,
    source: "mapbox",
  };
}
