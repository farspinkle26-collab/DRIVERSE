// Overpass API service: category -> OSM tag mapping, query building, fetch,
// and result normalization. This is the ONLY place that knows about Overpass
// or OSM tag shapes — swapping the POI source later (self-hosted Overpass,
// a paid provider) means changing this file, not the /places-nearby contract.

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
  source: "osm" | "user";
}

/**
 * Overpass endpoints, tried in order.
 *
 * The main instance limits **concurrent queries per IP** (two, by default)
 * and answers anything over that with 429 immediately rather than queueing
 * it. Every edge-function invocation leaves Supabase from the same egress
 * IP, so a driver with several categories ticked is competing with themself
 * — and with every other driver on the same Supabase region. The client
 * windows its requests (`lib/placesApi.ts`), which is the main fix; this list
 * plus the retry below cover what still slips through.
 *
 * kumi.systems is a public mirror running the same API and the same data,
 * maintained for exactly this purpose.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 12_000;
/** Attempts per endpoint before moving to the next one. */
const OVERPASS_ATTEMPTS_PER_ENDPOINT = 2;
const OVERPASS_RETRY_DELAY_MS = 700;

/** Statuses worth trying again: rate limit, gateway, and Overpass's own 504. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 504 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Category -> one or more OSM tags, OR'd together in the query.
//
// `restaurant` used to live inside `hangout`'s tag list. It is its own
// category now: it is the single densest POI type in a city, so it swamped
// the bars and parks it was pooled with, and a driver looking for somewhere
// to eat and a driver looking for somewhere to park up are not the same
// search.
const CATEGORY_TAGS: Record<PlaceCategory, { key: string; value: string }[]> = {
  cafe: [{ key: "amenity", value: "cafe" }],
  restaurant: [{ key: "amenity", value: "restaurant" }],
  gas_station: [{ key: "amenity", value: "fuel" }],
  workshop: [{ key: "shop", value: "car_repair" }],
  hangout: [
    { key: "amenity", value: "bar" },
    { key: "amenity", value: "fast_food" },
    { key: "leisure", value: "park" },
  ],
  shopping: [
    { key: "shop", value: "mall" },
    { key: "shop", value: "department_store" },
  ],
  parking: [{ key: "amenity", value: "parking" }],
  ev_charger: [{ key: "amenity", value: "charging_station" }],
  car_wash: [{ key: "shop", value: "car_wash" }],
};

/** Every category this service can answer for. Exported so callers can
 *  build an accurate error message instead of hardcoding a stale list. */
export const PLACE_CATEGORIES = Object.keys(CATEGORY_TAGS) as PlaceCategory[];

export function isPlaceCategory(value: string): value is PlaceCategory {
  return value in CATEGORY_TAGS;
}

/**
 * Queries `nw` (nodes *and* ways), not `node` alone, and closes with
 * `out center`.
 *
 * The node-only query this replaced quietly under-reported half the new
 * categories. A car park, a mall and a department store are almost always
 * mapped in OSM as a closed way — the polygon of the building or the lot —
 * with no node carrying the tag at all; `amenity=parking` in particular is
 * overwhelmingly a way. Asking only for nodes returned a near-empty result
 * that looked like "there is no parking here" rather than "the query is
 * wrong shape". `out center` makes Overpass hand back a single
 * representative point per way, which is what a marker needs anyway.
 *
 * Relations are left out: multipolygon parking and malls exist but are rare
 * enough that the extra query cost is not worth it, and any that matter are
 * usually also mapped as ways.
 */
function buildOverpassQuery(category: PlaceCategory, lat: number, lng: number, radiusMeters: number): string {
  const filters = CATEGORY_TAGS[category]
    .map(({ key, value }) => `nw["${key}"="${value}"](around:${radiusMeters},${lat},${lng});`)
    .join("\n  ");

  return `
[out:json][timeout:10];
(
  ${filters}
);
out center;
`.trim();
}

export class OverpassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverpassError";
  }
}

/** One POST to one endpoint, with its own abort timer. */
async function postQuery(endpoint: string, query: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: query,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new OverpassError("Overpass request timed out");
    }
    throw new OverpassError(`Overpass request failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Queries Overpass for a category around a point, retrying a rate-limited or
 * failing instance before falling through to the mirror. Throws OverpassError
 * once every endpoint has been exhausted.
 *
 * A 429 here is not "there are no places", it is "ask again in a moment" —
 * and the previous version turned it straight into a 502 the client rendered
 * as a dead category. Retrying is the whole difference for a request that was
 * only ever refused for arriving alongside its eight siblings.
 */
export async function fetchFromOverpass(
  category: PlaceCategory,
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<NormalizedPlace[]> {
  const query = buildOverpassQuery(category, lat, lng, radiusMeters);

  let response: Response | null = null;
  let lastError: OverpassError | null = null;

  outer: for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < OVERPASS_ATTEMPTS_PER_ENDPOINT; attempt++) {
      if (attempt > 0) await sleep(OVERPASS_RETRY_DELAY_MS * attempt);

      let attempted: Response;
      try {
        attempted = await postQuery(endpoint, query);
      } catch (error) {
        lastError = error instanceof OverpassError ? error : new OverpassError(String(error));
        continue;
      }

      if (attempted.ok) {
        response = attempted;
        break outer;
      }

      // Drain the body so the connection can be reused rather than leaked.
      await attempted.body?.cancel().catch(() => {});
      lastError = new OverpassError(`Overpass (${endpoint}) returned ${attempted.status}`);
      console.warn(`[overpass] ${category}: ${lastError.message}`);
      if (!isRetryableStatus(attempted.status)) break;
    }
  }

  if (!response) {
    throw lastError ?? new OverpassError("Overpass request failed");
  }

  let data: { elements?: unknown[] };
  try {
    data = await response.json();
  } catch {
    throw new OverpassError("Overpass returned an unparseable response");
  }

  const elements = Array.isArray(data.elements) ? data.elements : [];
  // A way whose geometry Overpass could not centre has no usable position;
  // dropping it here keeps `NormalizedPlace.lat/lng` honestly non-nullable
  // rather than pushing NaN coordinates onto a marker.
  return elements
    .map((el) => normalizeElement(el, category))
    .filter((p): p is NormalizedPlace => p !== null);
}

/**
 * Fallback names, used when an OSM feature carries no `name` tag.
 *
 * This is not cosmetic. The categories added in the marker rebuild are
 * exactly the ones OSM most often leaves unnamed — a car park or a charging
 * point usually has an operator at best — so the old flat `"Unnamed"` would
 * have put a column of identical labels on the map precisely where the new
 * markers are densest. A driver does not need a car park's name; they need
 * to know it is a car park.
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

type OverpassElement = {
  id: number;
  type?: string;
  lat?: number;
  lon?: number;
  /** Present on ways when the query ends `out center`. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function normalizeElement(element: unknown, category: PlaceCategory): NormalizedPlace | null {
  const e = element as OverpassElement;
  const tags = e.tags ?? {};
  // A node carries lat/lon directly; a way carries it under `center`.
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // The id is namespaced by element type: OSM node 42 and way 42 are
  // different features, and `osm-42` for both would let one evict the other
  // from the cache and from any keyed list on the client.
  const kind = e.type === "way" ? "way" : "node";

  return {
    id: `osm-${kind}-${e.id}`,
    name: tags.name ?? tags.operator ?? UNNAMED_FALLBACK[category],
    lat: lat as number,
    lng: lng as number,
    category,
    tags,
    source: "osm",
  };
}
