/**
 * The marker rebuild's second non-negotiable was that filters must actually
 * hide places rather than render a toggled-looking checkbox over markers
 * that are still drawn. These assertions are where that is pinned.
 *
 * The acceptance test in the brief is "turn one category off, confirm only
 * that category vanishes, others remain" — run against every category, one
 * at a time. `isolating a layer hides only that layer` below is exactly
 * that test, executed for all eleven layers on every run, which is the part
 * a human screenshotting a device cannot be relied on to repeat.
 *
 * What this file cannot prove is the wiring: that each render site in
 * `map.tsx` actually asks `isLayerVisible` before drawing. That is a
 * one-predicate, greppable contract and it is checked by hand on device.
 */

import { describe, expect, it } from "bun:test";
import { MAP_LAYERS, PLACE_CATEGORIES, type MapLayerId } from "@/constants/mapLayers";
import {
  defaultFilters,
  isLayerVisible,
  parseFilters,
  setAllLayers,
  toggleLayer,
  visibleCategories,
  visibleCount,
} from "@/hooks/mapFiltersState";

describe("defaults", () => {
  it("starts with every layer visible", () => {
    const state = defaultFilters();
    for (const layer of MAP_LAYERS) {
      expect(isLayerVisible(state, layer)).toBe(true);
    }
    expect(visibleCount(state)).toBe(MAP_LAYERS.length);
  });

  it("covers all eleven layers — nine categories plus events and users", () => {
    expect(MAP_LAYERS).toHaveLength(11);
    expect(PLACE_CATEGORIES).toHaveLength(9);
    expect(MAP_LAYERS).toContain("events");
    expect(MAP_LAYERS).toContain("users");
  });
});

describe("toggling", () => {
  it("hides a layer when switched off", () => {
    const state = toggleLayer(defaultFilters(), "parking");
    expect(isLayerVisible(state, "parking")).toBe(false);
  });

  it("brings a layer back when switched on again", () => {
    const off = toggleLayer(defaultFilters(), "parking");
    const on = toggleLayer(off, "parking");
    expect(isLayerVisible(on, "parking")).toBe(true);
  });

  // The acceptance test from the brief, run for every layer rather than for
  // whichever one someone remembered to screenshot.
  it("isolating a layer hides only that layer", () => {
    for (const target of MAP_LAYERS) {
      const state = toggleLayer(defaultFilters(), target);
      expect(isLayerVisible(state, target)).toBe(false);
      const others = MAP_LAYERS.filter((l) => l !== target);
      for (const other of others) {
        expect(isLayerVisible(state, other)).toBe(true);
      }
      expect(visibleCount(state)).toBe(MAP_LAYERS.length - 1);
    }
  });

  it("does not mutate the state it was given", () => {
    const before = defaultFilters();
    toggleLayer(before, "cafe");
    expect(isLayerVisible(before, "cafe")).toBe(true);
  });

  it("switches everything off and back on in one step", () => {
    const none = setAllLayers(false);
    expect(visibleCount(none)).toBe(0);
    const all = setAllLayers(true);
    expect(visibleCount(all)).toBe(MAP_LAYERS.length);
  });

  it("turning users off leaves every POI category alone", () => {
    const state = toggleLayer(defaultFilters(), "users");
    expect(isLayerVisible(state, "users")).toBe(false);
    expect(visibleCategories(state, PLACE_CATEGORIES)).toEqual(PLACE_CATEGORIES);
  });
});

describe("visibleCategories", () => {
  it("drops the categories that are switched off", () => {
    let state = toggleLayer(defaultFilters(), "parking");
    state = toggleLayer(state, "shopping");
    const active = visibleCategories(state, PLACE_CATEGORIES);
    expect(active).not.toContain("parking");
    expect(active).not.toContain("shopping");
    expect(active).toHaveLength(PLACE_CATEGORIES.length - 2);
  });

  it("never returns events or users — they are not fetched from Overpass", () => {
    const active = visibleCategories(defaultFilters(), PLACE_CATEGORIES);
    expect(active).not.toContain("events" as never);
    expect(active).not.toContain("users" as never);
  });
});

describe("parseFilters", () => {
  it("round-trips a stored payload", () => {
    const saved = toggleLayer(defaultFilters(), "ev_charger");
    expect(parseFilters(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  // Everything below is the same promise from a different angle: a bad
  // stored payload must never leave the driver looking at a blank map with
  // no way to work out why.
  it("falls back to everything-visible for junk input", () => {
    for (const junk of [null, undefined, 42, "nope", [], { }]) {
      expect(parseFilters(junk)).toEqual(defaultFilters());
    }
  });

  it("ignores keys that are not layers", () => {
    const parsed = parseFilters({ parking: false, notALayer: false });
    expect(isLayerVisible(parsed, "parking")).toBe(false);
    expect(visibleCount(parsed)).toBe(MAP_LAYERS.length - 1);
  });

  it("ignores non-boolean values rather than coercing them", () => {
    // `"false"` is truthy; coercing it would switch a layer ON that the
    // driver had switched off, which is the one direction that loses data.
    const parsed = parseFilters({ parking: "false", cafe: 0 });
    expect(isLayerVisible(parsed, "parking")).toBe(true);
    expect(isLayerVisible(parsed, "cafe")).toBe(true);
  });

  it("defaults a layer missing from an older payload to visible", () => {
    // A build that predates `parking` would have stored ten keys. The
    // eleventh must appear, not vanish with no control to bring it back.
    const older: Record<string, boolean> = {};
    for (const layer of MAP_LAYERS) {
      if (layer !== "parking") older[layer] = true;
    }
    expect(isLayerVisible(parseFilters(older), "parking")).toBe(true);
  });

  it("preserves an explicit false through an unknown-layer payload", () => {
    const parsed = parseFilters({ users: false, ghost_layer: true } as Record<string, unknown>);
    expect(isLayerVisible(parsed, "users")).toBe(false);
  });
});

describe("isLayerVisible", () => {
  it("treats an absent layer as visible", () => {
    expect(isLayerVisible({} as Record<MapLayerId, boolean>, "cafe")).toBe(true);
  });
});
