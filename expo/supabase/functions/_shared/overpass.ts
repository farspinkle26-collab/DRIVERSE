// Overpass API service: category -> OSM tag mapping, query building, fetch,
// and result normalization. This is the ONLY place that knows about Overpass
// or OSM tag shapes — swapping the POI source later (self-hosted Overpass,
// a paid provider) means changing this file, not the /places-nearby contract.

export type PlaceCategory = "cafe" | "gas_station" | "workshop" | "hangout";

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
const CATEGORY_TAGS: Record<PlaceCategory, { key: string; value: string }[]> = {
  cafe: [{ key: "amenity", value: "cafe" }],
  gas_station: [{ key: "amenity", value: "fuel" }],
  workshop: [{ key: "shop", value: "car_repair" }],
  hangout: [
    { key: "amenity", value: "bar" },
    { key: "amenity", value: "fast_food" },
    { key: "leisure", value: "park" },
    { key: "amenity", value: "restaurant" },
  ],
};

export function isPlaceCategory(value: string): value is PlaceCategory {
  return value in CATEGORY_TAGS;
}

function buildOverpassQuery(category: PlaceCategory, lat: number, lng: number, radiusMeters: number): string {
  const filters = CATEGORY_TAGS[category]
    .map(({ key, value }) => `node["${key}"="${value}"](around:${radiusMeters},${lat},${lng});`)
    .join("\n  ");

  return `
[out:json][timeout:10];
(
  ${filters}
);
out body;
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
  return elements.map((el) => normalizeElement(el, category));
}

function normalizeElement(element: unknown, category: PlaceCategory): NormalizedPlace {
  const e = element as { id: number; lat: number; lon: number; tags?: Record<string, string> };
  const tags = e.tags ?? {};
  return {
    id: `osm-${e.id}`,
    name: tags.name ?? "Unnamed",
    lat: e.lat,
    lng: e.lon,
    category,
    tags,
    source: "osm",
  };
}
