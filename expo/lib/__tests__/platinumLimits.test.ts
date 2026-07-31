/**
 * Priority #1 — parsing the server-side cap rejection.
 *
 * Every cap is also a Postgres trigger, so a client that loses the race (two
 * devices adding a car at once) still gets rejected server-side. This module
 * turns that raw `PLATINUM_LIMIT:<feature>:<cap>` error back into the feature
 * and paywall benefit, so the driver sees the right upgrade prompt instead of
 * a raw Postgres error. A parsing bug here means a real cap hit shows as a
 * generic failure.
 */
import {
  isLimitRejection,
  parseLimitRejection,
} from "@/lib/platinumLimits";

describe("parseLimitRejection", () => {
  it("parses a well-formed garage-cap error into feature, cap and benefit", () => {
    const err = { message: "PLATINUM_LIMIT:garage_cars:2 Your garage is full." };
    const parsed = parseLimitRejection(err);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      feature: "garageCars",
      cap: 2,
      benefit: "garage",
      message: "Your garage is full.",
    });
  });

  it("maps every db feature name onto the app's LimitedFeature keys", () => {
    const cases: [string, string, string][] = [
      ["garage_cars", "garageCars", "garage"],
      ["active_events", "activeEvents", "events"],
      ["saved_places", "savedPlaces", "places"],
      ["convoy_members", "convoyMembers", "convoy"],
      ["saved_routes", "savedRoutes", "routes"],
      ["ai_showcases", "aiShowcasesPerMonth", "showcase"],
    ];
    for (const [dbName, feature, benefit] of cases) {
      const parsed = parseLimitRejection({
        message: `PLATINUM_LIMIT:${dbName}:5 capped`,
      });
      expect(parsed).toMatchObject({ feature, benefit, cap: 5 });
    }
  });

  it("accepts a bare string error, not just an Error-shaped object", () => {
    expect(parseLimitRejection("PLATINUM_LIMIT:saved_places:10")?.feature).toBe(
      "savedPlaces"
    );
  });

  it("falls back to a default sentence when the trigger sent no copy", () => {
    const parsed = parseLimitRejection("PLATINUM_LIMIT:saved_routes:10");
    expect(parsed?.message).toBe("You've reached your Regular limit.");
  });

  it("is case-insensitive on the marker and feature name", () => {
    expect(
      parseLimitRejection("platinum_limit:GARAGE_CARS:2 nope")?.feature
    ).toBe("garageCars");
  });

  it("returns null for an unrelated Postgres error", () => {
    expect(
      parseLimitRejection({ message: "duplicate key value violates unique" })
    ).toBeNull();
  });

  it("returns null for an unknown feature name (not one we cap)", () => {
    expect(parseLimitRejection("PLATINUM_LIMIT:teleporters:3")).toBeNull();
  });

  it("returns null for null / undefined / empty inputs", () => {
    expect(parseLimitRejection(null)).toBeNull();
    expect(parseLimitRejection(undefined)).toBeNull();
    expect(parseLimitRejection({})).toBeNull();
    expect(parseLimitRejection("")).toBeNull();
  });
});

describe("isLimitRejection", () => {
  it("is true only for a genuine tier-cap rejection", () => {
    expect(isLimitRejection("PLATINUM_LIMIT:garage_cars:2 full")).toBe(true);
    expect(isLimitRejection("some other error")).toBe(false);
    expect(isLimitRejection(null)).toBe(false);
  });
});
