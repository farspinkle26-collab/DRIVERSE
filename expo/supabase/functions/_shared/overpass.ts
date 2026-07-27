// Overpass API service: category -> OSM tag mapping, query building, fetch,
// and result normalization. This is the ONLY place that knows about Overpass
// or OSM tag shapes — swapping the POI source later (self-hosted Overpass,
// a paid provider) means changing this file, not the /places-nearby contract.

// The taxonomy is shared with the client (constants/placesCategories.ts).
// Adding one here means adding its glyph and label there, and widening the
// `places.category` check constraint (database_migration_places_taxonomy.sql).
export type PlaceCategory =
  | "cafe"
  | "restaurant"
  | "gas_station"
  | "workshop"
  | "shopping"
  | "parking"
  | "ev_charger"
  | "car_wash"
  | "hangout";

export interface NormalizedPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  tags: Record<string, string>;
  source: "osm" | "user";
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_MS = 12_000;

// Category -> one or more OSM tags, OR'd together in the query.
//
// `restaurant` used to live under the `hangout` umbrella. It is its own
// category now: a driver looking for food and a driver looking for
// somewhere to park up and talk are two different searches, and merging
// them made `hangout` the densest layer on the map by a wide margin.
const CATEGORY_TAGS: Record<PlaceCategory, { key: string; value: string }[]> = {
  cafe: [{ key: "amenity", value: "cafe" }],
  restaurant: [{ key: "amenity", value: "restaurant" }],
  gas_station: [{ key: "amenity", value: "fuel" }],
  workshop: [{ key: "shop", value: "car_repair" }],
  shopping: [
    { key: "shop", value: "mall" },
    { key: "shop", value: "department_store" },
  ],
  parking: [{ key: "amenity", value: "parking" }],
  ev_charger: [{ key: "amenity", value: "charging_station" }],
  car_wash: [{ key: "shop", value: "car_wash" }],
  hangout: [
    { key: "amenity", value: "bar" },
    { key: "amenity", value: "fast_food" },
    { key: "leisure", value: "park" },
  ],
};

// Malls, car parks, car washes and forecourts are mapped in OSM as areas far
// more often than as points, so querying `node` alone misses most of them.
// `nwr` matches nodes, ways and relations, and `out center` gives every
// non-node result a single representative coordinate — which is all a marker
// needs. Nodes are unaffected: they keep returning their own lat/lon.
const OVERPASS_ELEMENT_TYPE = "nwr";

export const PLACE_CATEGORIES = Object.keys(CATEGORY_TAGS) as PlaceCategory[];

export function isPlaceCategory(value: string): value is PlaceCategory {
  return value in CATEGORY_TAGS;
}

/** The 400-response text for a bad `category`, built from the live taxonomy
 *  so adding a category can never leave a stale list in an error message. */
export const CATEGORY_ERROR_MESSAGE = `category must be one of ${PLACE_CATEGORIES.join(", ")}`;

function buildOverpassQuery(category: PlaceCategory, lat: number, lng: number, radiusMeters: number): string {
  const filters = CATEGORY_TAGS[category]
    .map(
      ({ key, value }) =>
        `${OVERPASS_ELEMENT_TYPE}["${key}"="${value}"](around:${radiusMeters},${lat},${lng});`
    )
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

/** Queries Overpass for a category around a point. Throws OverpassError on timeout/failure. */
export async function fetchFromOverpass(
  category: PlaceCategory,
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<NormalizedPlace[]> {
  const query = buildOverpassQuery(category, lat, lng, radiusMeters);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OVERPASS_URL, {
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

  if (!response.ok) {
    throw new OverpassError(`Overpass returned ${response.status}`);
  }

  let data: { elements?: unknown[] };
  try {
    data = await response.json();
  } catch {
    throw new OverpassError("Overpass returned an unparseable response");
  }

  const elements = Array.isArray(data.elements) ? data.elements : [];
  return elements
    .map((el) => normalizeElement(el, category))
    .filter((place): place is NormalizedPlace => place !== null);
}

/**
 * Most car parks and charging bays carry no `name` tag at all, so "Unnamed"
 * would be the label on a large share of two whole categories. Falling back
 * to what the thing *is* keeps the marker readable.
 */
const UNNAMED_FALLBACK: Record<PlaceCategory, string> = {
  cafe: "Cafe",
  restaurant: "Restaurant",
  gas_station: "Fuel station",
  workshop: "Workshop",
  shopping: "Shopping",
  parking: "Car park",
  ev_charger: "Charging point",
  car_wash: "Car wash",
  hangout: "Hangout",
};

/** Returns null for an element Overpass gave no usable coordinate for. */
function normalizeElement(element: unknown, category: PlaceCategory): NormalizedPlace | null {
  const e = element as {
    type?: string;
    id: number;
    lat?: number;
    lon?: number;
    /** Present on ways/relations under `out center`. */
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  };
  const tags = e.tags ?? {};
  const lat = typeof e.lat === "number" ? e.lat : e.center?.lat;
  const lng = typeof e.lon === "number" ? e.lon : e.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  // Ids are namespaced by element type because a node, a way and a relation
  // can all carry the same numeric id in OSM.
  const type = e.type ?? "node";
  return {
    id: `osm-${type}-${e.id}`,
    name: tags.name ?? UNNAMED_FALLBACK[category],
    lat,
    lng,
    category,
    tags,
    source: "osm",
  };
}
