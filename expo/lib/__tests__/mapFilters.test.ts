import { describe, expect, it } from "bun:test";
import { allLayersVisible, defaultMapFilters, parseStoredFilters } from "../mapFilters";
import { PLACE_CATEGORIES } from "@/constants/placesCategories";

describe("defaultMapFilters", () => {
  it("starts with every layer on", () => {
    const defaults = defaultMapFilters();
    expect(defaults.events).toBe(true);
    expect(defaults.drivers).toBe(true);
    for (const category of PLACE_CATEGORIES) {
      expect(defaults.categories[category]).toBe(true);
    }
  });

  it("hands out a fresh object each call, so one caller can't mutate another's", () => {
    const a = defaultMapFilters();
    a.categories.parking = false;
    expect(defaultMapFilters().categories.parking).toBe(true);
  });
});

describe("parseStoredFilters", () => {
  it("falls back to the defaults with nothing stored", () => {
    expect(parseStoredFilters(null)).toEqual(defaultMapFilters());
  });

  it("falls back to the defaults on unparseable JSON", () => {
    expect(parseStoredFilters("{not json")).toEqual(defaultMapFilters());
  });

  it("falls back to the defaults when the stored value isn't an object", () => {
    expect(parseStoredFilters('"hidden"')).toEqual(defaultMapFilters());
    expect(parseStoredFilters("null")).toEqual(defaultMapFilters());
    expect(parseStoredFilters("42")).toEqual(defaultMapFilters());
  });

  it("restores the categories a driver switched off", () => {
    const stored = JSON.stringify({
      categories: { parking: false, shopping: false },
      events: true,
      drivers: true,
    });
    const filters = parseStoredFilters(stored);
    expect(filters.categories.parking).toBe(false);
    expect(filters.categories.shopping).toBe(false);
    expect(filters.categories.cafe).toBe(true);
  });

  it("restores the events and drivers toggles independently", () => {
    const filters = parseStoredFilters(JSON.stringify({ events: false, drivers: false }));
    expect(filters.events).toBe(false);
    expect(filters.drivers).toBe(false);
    // Places are untouched by those two.
    expect(filters.categories.cafe).toBe(true);
  });

  it("defaults a category added since the blob was written to ON", () => {
    // A blob from before the taxonomy grew. A new layer must appear rather
    // than stay silently hidden for every existing user.
    const old = JSON.stringify({ categories: { cafe: false }, events: true, drivers: true });
    const filters = parseStoredFilters(old);
    expect(filters.categories.cafe).toBe(false);
    expect(filters.categories.ev_charger).toBe(true);
    expect(filters.categories.parking).toBe(true);
  });

  it("drops ids that are no longer categories", () => {
    // The pre-merge client ids, which must not survive into the new shape.
    const stale = JSON.stringify({ categories: { spbu: false, carwash: false, charging: false } });
    const filters = parseStoredFilters(stale);
    expect(Object.keys(filters.categories).sort()).toEqual([...PLACE_CATEGORIES].sort());
    expect(filters.categories.gas_station).toBe(true);
    expect(filters.categories.car_wash).toBe(true);
  });

  it("ignores non-boolean values rather than making them truthy", () => {
    const filters = parseStoredFilters(
      JSON.stringify({ categories: { parking: "no" }, events: 0, drivers: "yes" })
    );
    expect(filters.categories.parking).toBe(true);
    expect(filters.events).toBe(true);
    expect(filters.drivers).toBe(true);
  });

  it("round-trips a full state", () => {
    const filters = defaultMapFilters();
    filters.categories.hangout = false;
    filters.drivers = false;
    expect(parseStoredFilters(JSON.stringify(filters))).toEqual(filters);
  });
});

describe("allLayersVisible", () => {
  it("is true for the defaults", () => {
    expect(allLayersVisible(defaultMapFilters())).toBe(true);
  });

  it("is false when any single layer is hidden", () => {
    for (const mutate of [
      (f: ReturnType<typeof defaultMapFilters>) => { f.categories.parking = false; },
      (f: ReturnType<typeof defaultMapFilters>) => { f.events = false; },
      (f: ReturnType<typeof defaultMapFilters>) => { f.drivers = false; },
    ]) {
      const filters = defaultMapFilters();
      mutate(filters);
      expect(allLayersVisible(filters)).toBe(false);
    }
  });
});
