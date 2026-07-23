import { describe, expect, it, mock, afterEach } from "bun:test";
import { fetchFromOverpass, isPlaceCategory, OverpassError, type NormalizedPlace } from "../overpass.ts";
import { mergePlaces } from "../merge.ts";
import { cacheKeyFor, latLngBucket, isStale } from "../cache.ts";

// Known Jakarta coordinate (Monas) used throughout — matches the manual
// validation coordinate described in the feature spec.
const JAKARTA = { lat: -6.1754, lng: 106.8272 };

describe("isPlaceCategory", () => {
  it("accepts the four supported categories", () => {
    expect(isPlaceCategory("cafe")).toBe(true);
    expect(isPlaceCategory("gas_station")).toBe(true);
    expect(isPlaceCategory("workshop")).toBe(true);
    expect(isPlaceCategory("hangout")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPlaceCategory("restaurant")).toBe(false);
    expect(isPlaceCategory("")).toBe(false);
  });
});

describe("fetchFromOverpass", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("normalizes Overpass elements into { id, name, lat, lng, category, tags, source }", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          elements: [
            { id: 111, lat: JAKARTA.lat, lon: JAKARTA.lng, tags: { name: "Kopi Kenangan", opening_hours: "08:00-22:00" } },
          ],
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const places = await fetchFromOverpass("cafe", JAKARTA.lat, JAKARTA.lng, 2000);
    expect(places).toHaveLength(1);
    expect(places[0]).toEqual({
      id: "osm-111",
      name: "Kopi Kenangan",
      lat: JAKARTA.lat,
      lng: JAKARTA.lng,
      category: "cafe",
      tags: { name: "Kopi Kenangan", opening_hours: "08:00-22:00" },
      source: "osm",
    });
  });

  it("falls back to 'Unnamed' when tags.name is missing", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ elements: [{ id: 222, lat: 0, lon: 0, tags: {} }] }), { status: 200 })
    ) as unknown as typeof fetch;

    const places = await fetchFromOverpass("gas_station", 0, 0, 2000);
    expect(places[0].name).toBe("Unnamed");
  });

  it("throws OverpassError (not a raw exception) when Overpass returns a non-200", async () => {
    globalThis.fetch = mock(async () => new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;

    await expect(fetchFromOverpass("workshop", 0, 0, 2000)).rejects.toBeInstanceOf(OverpassError);
  });

  it("throws OverpassError when the request aborts (simulated slow/hung Overpass)", async () => {
    globalThis.fetch = mock(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;

    await expect(fetchFromOverpass("cafe", 0, 0, 2000)).rejects.toBeInstanceOf(OverpassError);
  });
});

describe("mergePlaces", () => {
  const osm: NormalizedPlace[] = [
    { id: "osm-1", name: "Warkop OSM", lat: JAKARTA.lat, lng: JAKARTA.lng, category: "cafe", tags: {}, source: "osm" },
  ];

  it("keeps a user place that is far from any OSM entry", () => {
    const user: NormalizedPlace[] = [
      { id: "user-1", name: "My Cafe", lat: JAKARTA.lat + 1, lng: JAKARTA.lng + 1, category: "cafe", tags: {}, source: "user" },
    ];
    const merged = mergePlaces(osm, user);
    expect(merged).toHaveLength(2);
    expect(merged.some((p) => p.id === "user-1")).toBe(true);
  });

  it("prefers the OSM entry when a user place is within ~30m of it (dedupe)", () => {
    const user: NormalizedPlace[] = [
      // ~0.0002 deg ~= 22m north — inside the 30m dedupe radius
      { id: "user-2", name: "Same Cafe (duplicate)", lat: JAKARTA.lat + 0.0002, lng: JAKARTA.lng, category: "cafe", tags: {}, source: "user" },
    ];
    const merged = mergePlaces(osm, user);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("osm");
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
