import { describe, expect, it, mock, afterEach, beforeAll } from "bun:test";
import {
  boundingBoxFor,
  fetchNearby,
  isPlaceCategory,
  PlacesSourceError,
  PLACE_CATEGORIES,
  type NormalizedPlace,
} from "../placesSource.ts";
import { mergePlaces } from "../merge.ts";
import { cacheKeyFor, latLngBucket, isStale } from "../cache.ts";

// Known Jakarta coordinate (Monas) used throughout — matches the manual
// validation coordinate described in the feature spec.
const JAKARTA = { lat: -6.1754, lng: 106.8272 };

// The source reads its token from Deno's env, which does not exist under bun.
// Stubbing it here rather than in each test keeps the failure mode honest: the
// "missing token" test clears it deliberately and puts it back.
beforeAll(() => {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => (key === "MAPBOX_ACCESS_TOKEN" ? "test-token" : undefined) },
  };
});

/** Builds a Search Box feature in the shape Mapbox actually returns. */
function feature(overrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [JAKARTA.lng, JAKARTA.lat] },
    properties: { name: "Kopi Kenangan", mapbox_id: "poi.123", ...props },
    ...overrides,
  };
}

function jsonResponse(features: unknown[]) {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200 });
}

describe("isPlaceCategory", () => {
  it("accepts all nine supported categories", () => {
    for (const category of [
      "cafe",
      "restaurant",
      "gas_station",
      "workshop",
      "hangout",
      "shopping",
      "parking",
      "ev_charger",
      "car_wash",
    ]) {
      expect(isPlaceCategory(category)).toBe(true);
    }
    expect(PLACE_CATEGORIES).toHaveLength(9);
  });

  it("rejects anything else", () => {
    expect(isPlaceCategory("petrol")).toBe(false);
    expect(isPlaceCategory("users")).toBe(false);
    expect(isPlaceCategory("events")).toBe(false);
    expect(isPlaceCategory("")).toBe(false);
  });
});

// `proximity` only ranks results; `bbox` is what actually bounds them. Getting
// this wrong puts markers from the next city on the driver's map — the same
// trap the landmark layer hit (MAP_MARKER_REFERENCE.md §10).
describe("boundingBoxFor", () => {
  it("returns minLng,minLat,maxLng,maxLat around the centre", () => {
    const [minLng, minLat, maxLng, maxLat] = boundingBoxFor(JAKARTA.lat, JAKARTA.lng, 2000)
      .split(",")
      .map(Number);
    expect(minLng).toBeLessThan(JAKARTA.lng);
    expect(maxLng).toBeGreaterThan(JAKARTA.lng);
    expect(minLat).toBeLessThan(JAKARTA.lat);
    expect(maxLat).toBeGreaterThan(JAKARTA.lat);
  });

  it("grows with the radius", () => {
    const small = boundingBoxFor(JAKARTA.lat, JAKARTA.lng, 1000).split(",").map(Number);
    const large = boundingBoxFor(JAKARTA.lat, JAKARTA.lng, 5000).split(",").map(Number);
    expect(large[0]).toBeLessThan(small[0]);
    expect(large[2]).toBeGreaterThan(small[2]);
  });

  it("stays inside legal lng/lat bounds near a pole", () => {
    const [minLng, minLat, maxLng, maxLat] = boundingBoxFor(89.99, 179.99, 5000).split(",").map(Number);
    expect(minLng).toBeGreaterThanOrEqual(-180);
    expect(maxLng).toBeLessThanOrEqual(180);
    expect(minLat).toBeGreaterThanOrEqual(-90);
    expect(maxLat).toBeLessThanOrEqual(90);
  });
});

describe("fetchNearby", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("normalizes a feature into { id, name, lat, lng, category, tags, source }", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse([feature({}, { metadata: { open_hours: "08:00-22:00" } })])
    ) as unknown as typeof fetch;

    const places = await fetchNearby("cafe", JAKARTA.lat, JAKARTA.lng, 2000);
    expect(places).toHaveLength(1);
    expect(places[0]).toEqual({
      id: "mbx-poi.123",
      name: "Kopi Kenangan",
      lat: JAKARTA.lat,
      lng: JAKARTA.lng,
      category: "cafe",
      tags: { name: "Kopi Kenangan", opening_hours: "08:00-22:00" },
      source: "mapbox",
    });
  });

  it("bounds the request with bbox, not just proximity", async () => {
    let requested = "";
    globalThis.fetch = mock(async (input: string) => {
      requested = String(input);
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    await fetchNearby("cafe", JAKARTA.lat, JAKARTA.lng, 2000);
    expect(requested).toContain("bbox=");
    expect(requested).toContain("proximity=");
  });

  it("falls back to properties.coordinates when geometry is absent", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse([
        feature(
          { geometry: undefined },
          { coordinates: { latitude: JAKARTA.lat, longitude: JAKARTA.lng } }
        ),
      ])
    ) as unknown as typeof fetch;

    const places = await fetchNearby("cafe", JAKARTA.lat, JAKARTA.lng, 2000);
    expect(places).toHaveLength(1);
    expect(places[0].lat).toBe(JAKARTA.lat);
    expect(places[0].lng).toBe(JAKARTA.lng);
  });

  it("drops a feature with no usable coordinate rather than emitting NaN", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse([
        feature({ geometry: undefined }, { name: "Positionless", mapbox_id: "poi.none" }),
        feature({}, { name: "Fine", mapbox_id: "poi.fine" }),
      ])
    ) as unknown as typeof fetch;

    const places = await fetchNearby("parking", 0, 0, 2000);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe("Fine");
  });

  // Unnamed features cluster in exactly the newer categories, so a flat
  // "Unnamed" would put a column of identical labels where markers are densest.
  it("falls back to the brand, then to a category name, when unnamed", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse([
        feature({}, { name: undefined, mapbox_id: "poi.a" }),
        feature({}, { name: undefined, brand: ["PLN"], mapbox_id: "poi.b" }),
      ])
    ) as unknown as typeof fetch;

    const places = await fetchNearby("ev_charger", 0, 0, 2000);
    expect(places[0].name).toBe("Charging point");
    expect(places[1].name).toBe("PLN");
  });

  it("throws PlacesSourceError when every canonical id fails", async () => {
    globalThis.fetch = mock(async () => new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;

    await expect(fetchNearby("workshop", 0, 0, 2000)).rejects.toBeInstanceOf(PlacesSourceError);
  });

  it("throws PlacesSourceError when the request aborts (simulated hung provider)", async () => {
    globalThis.fetch = mock(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;

    await expect(fetchNearby("cafe", 0, 0, 2000)).rejects.toBeInstanceOf(PlacesSourceError);
  });

  // `hangout` spans bar + fast_food + park. One id being rejected — including
  // because it is a canonical id Mapbox does not recognise — is not a reason to
  // tell the driver there are no hangouts nearby.
  it("returns what it got when only some canonical ids fail", async () => {
    globalThis.fetch = mock(async (input: string) => {
      if (String(input).includes("/bar?")) return new Response("not found", { status: 404 });
      return jsonResponse([feature({}, { name: "Taman Suropati", mapbox_id: "poi.park" })]);
    }) as unknown as typeof fetch;

    const places = await fetchNearby("hangout", JAKARTA.lat, JAKARTA.lng, 2000);
    expect(places.length).toBeGreaterThan(0);
    expect(places.some((p) => p.name === "Taman Suropati")).toBe(true);
  });

  it("keeps one marker per place when two canonical ids return the same feature", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse([feature({}, { name: "Plaza Indonesia", mapbox_id: "poi.mall" })])
    ) as unknown as typeof fetch;

    // `shopping` queries shopping_mall + department_store; both answer here.
    const places = await fetchNearby("shopping", JAKARTA.lat, JAKARTA.lng, 2000);
    expect(places).toHaveLength(1);
  });

  // A 429 is "ask again in a moment", not "there is nothing here". Turning it
  // straight into a failure is what made a ticked category read as dead.
  it("retries a 429 and returns what the retry got", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return jsonResponse([feature({}, { name: "SPBU 31", mapbox_id: "poi.spbu" })]);
    }) as unknown as typeof fetch;

    const places = await fetchNearby("gas_station", JAKARTA.lat, JAKARTA.lng, 2000);
    expect(calls).toBe(2);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe("SPBU 31");
  });

  // A malformed request is malformed on every attempt. Retrying it just spends
  // the driver's time to fail three times instead of once.
  it("does not retry a 400", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      return new Response("bad request", { status: 400 });
    }) as unknown as typeof fetch;

    await expect(fetchNearby("cafe", 0, 0, 2000)).rejects.toBeInstanceOf(PlacesSourceError);
    expect(calls).toBe(1);
  });

  it("fails loudly when the token is not configured, rather than querying anonymously", async () => {
    const stub = (globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno!;
    const restore = stub.env.get;
    stub.env.get = () => undefined;
    try {
      await expect(fetchNearby("cafe", 0, 0, 2000)).rejects.toBeInstanceOf(PlacesSourceError);
    } finally {
      stub.env.get = restore;
    }
  });
});

describe("mergePlaces", () => {
  const provider: NormalizedPlace[] = [
    { id: "mbx-1", name: "Warkop", lat: JAKARTA.lat, lng: JAKARTA.lng, category: "cafe", tags: {}, source: "mapbox" },
  ];

  it("keeps a user place that is far from any provider entry", () => {
    const user: NormalizedPlace[] = [
      { id: "user-1", name: "My Cafe", lat: JAKARTA.lat + 1, lng: JAKARTA.lng + 1, category: "cafe", tags: {}, source: "user" },
    ];
    const merged = mergePlaces(provider, user);
    expect(merged).toHaveLength(2);
    expect(merged.some((p) => p.id === "user-1")).toBe(true);
  });

  it("prefers the provider entry when a user place is within ~30m of it (dedupe)", () => {
    const user: NormalizedPlace[] = [
      // ~0.0002 deg ~= 22m north — inside the 30m dedupe radius
      { id: "user-2", name: "Same Cafe (duplicate)", lat: JAKARTA.lat + 0.0002, lng: JAKARTA.lng, category: "cafe", tags: {}, source: "user" },
    ];
    const merged = mergePlaces(provider, user);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("mapbox");
  });

  // Rows cached before the provider swap still carry `osm` and must keep
  // deduping against community submissions exactly as they did.
  it("still dedupes against rows cached under the previous provider", () => {
    const legacy: NormalizedPlace[] = [
      { id: "osm-node-1", name: "Warkop OSM", lat: JAKARTA.lat, lng: JAKARTA.lng, category: "cafe", tags: {}, source: "osm" },
    ];
    const user: NormalizedPlace[] = [
      { id: "user-3", name: "Same spot", lat: JAKARTA.lat + 0.0002, lng: JAKARTA.lng, category: "cafe", tags: {}, source: "user" },
    ];
    expect(mergePlaces(legacy, user)).toHaveLength(1);
  });
});

describe("cache bucketing", () => {
  it("rounds lat/lng to a ~1km grid so nearby coordinates share a cache key", () => {
    const a = cacheKeyFor("cafe", JAKARTA.lat, JAKARTA.lng);
    const b = cacheKeyFor("cafe", JAKARTA.lat + 0.0001, JAKARTA.lng - 0.0001); // ~15m away
    expect(a).toBe(b);
  });

  it("produces a different key for a different category or a distant point", () => {
    const cafe = cacheKeyFor("cafe", JAKARTA.lat, JAKARTA.lng);
    const gas = cacheKeyFor("gas_station", JAKARTA.lat, JAKARTA.lng);
    const farAway = cacheKeyFor("cafe", JAKARTA.lat + 1, JAKARTA.lng);
    expect(cafe).not.toBe(gas);
    expect(cafe).not.toBe(farAway);
  });

  it("bucket math matches Math.round(lat*100)/Math.round(lng*100)", () => {
    const { latBucket, lngBucket } = latLngBucket(JAKARTA.lat, JAKARTA.lng);
    expect(latBucket).toBe(Math.round(JAKARTA.lat * 100));
    expect(lngBucket).toBe(Math.round(JAKARTA.lng * 100));
  });

  it("treats a fetched_at older than 7 days as stale", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isStale(eightDaysAgo)).toBe(true);
    expect(isStale(oneHourAgo)).toBe(false);
  });
});
