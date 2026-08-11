/// <reference types="jest" />

/**
 * Priority #1 — Entitlement / Platinum cap enforcement.
 *
 * These are the highest-stakes checks in the app: a wrong answer either leaks
 * a paid feature to a Regular driver or wrongly blocks a paying subscriber.
 * `limitFor` / `isAtLimit` are the single pure rule every gated surface
 * (garage, events, saved places, saved routes, convoy, AI showcase) resolves
 * through, so they are tested in both directions for every capped feature.
 */
import {
  TIER_LIMITS,
  FEATURE_BENEFIT,
  PLATINUM_BENEFITS,
  benefitById,
  isAtLimit,
  limitFor,
  type LimitedFeature,
} from "@/constants/platinum";

const REGULAR = false;
const PLATINUM = true;

describe("limitFor — the cap that applies to a driver", () => {
  it("returns the Regular caps for a non-subscriber", () => {
    expect(limitFor("garageCars", REGULAR)).toBe(2);
    expect(limitFor("activeEvents", REGULAR)).toBe(1);
    expect(limitFor("savedPlaces", REGULAR)).toBe(10);
    expect(limitFor("convoyMembers", REGULAR)).toBe(2);
    expect(limitFor("savedRoutes", REGULAR)).toBe(10);
    // The core action: 5 recorded drives per calendar month.
    expect(limitFor("drivesPerMonth", REGULAR)).toBe(5);
    // Regular drivers have no AI-showcase access at all.
    expect(limitFor("aiShowcasesPerMonth", REGULAR)).toBe(0);
  });

  it("lifts the caps Platinum makes unlimited to null", () => {
    expect(limitFor("garageCars", PLATINUM)).toBeNull();
    expect(limitFor("activeEvents", PLATINUM)).toBeNull();
    expect(limitFor("savedPlaces", PLATINUM)).toBeNull();
    expect(limitFor("savedRoutes", PLATINUM)).toBeNull();
    expect(limitFor("drivesPerMonth", PLATINUM)).toBeNull();
  });

  it("keeps convoy and AI showcase bounded even for Platinum (deliberate)", () => {
    // Convoys cap at 8, not unlimited — a coherent perk, not a free-for-all.
    expect(limitFor("convoyMembers", PLATINUM)).toBe(8);
    // AI showcase is a real per-image spend, so it is capped at 5/month.
    expect(limitFor("aiShowcasesPerMonth", PLATINUM)).toBe(5);
  });
});

describe("isAtLimit — garage slot enforcement", () => {
  it("blocks a Regular driver only once the 2-car garage is full", () => {
    expect(isAtLimit("garageCars", 0, REGULAR)).toBe(false);
    expect(isAtLimit("garageCars", 1, REGULAR)).toBe(false);
    // At the cap: the 3rd car is refused.
    expect(isAtLimit("garageCars", 2, REGULAR)).toBe(true);
    expect(isAtLimit("garageCars", 3, REGULAR)).toBe(true);
  });

  it("never blocks a Platinum driver's garage, however many cars", () => {
    expect(isAtLimit("garageCars", 2, PLATINUM)).toBe(false);
    expect(isAtLimit("garageCars", 50, PLATINUM)).toBe(false);
    expect(isAtLimit("garageCars", 10_000, PLATINUM)).toBe(false);
  });
});

describe("isAtLimit — active events enforcement", () => {
  it("blocks a Regular driver at 1 running event", () => {
    expect(isAtLimit("activeEvents", 0, REGULAR)).toBe(false);
    expect(isAtLimit("activeEvents", 1, REGULAR)).toBe(true);
  });

  it("never blocks a Platinum host", () => {
    expect(isAtLimit("activeEvents", 1, PLATINUM)).toBe(false);
    expect(isAtLimit("activeEvents", 99, PLATINUM)).toBe(false);
  });
});

describe("isAtLimit — saved places enforcement", () => {
  it("blocks a Regular driver at exactly 10 saved places, not before", () => {
    expect(isAtLimit("savedPlaces", 9, REGULAR)).toBe(false);
    expect(isAtLimit("savedPlaces", 10, REGULAR)).toBe(true);
    expect(isAtLimit("savedPlaces", 11, REGULAR)).toBe(true);
  });

  it("never blocks a Platinum driver's saved places", () => {
    expect(isAtLimit("savedPlaces", 10, PLATINUM)).toBe(false);
    expect(isAtLimit("savedPlaces", 1000, PLATINUM)).toBe(false);
  });
});

describe("isAtLimit — saved routes enforcement", () => {
  it("blocks a Regular driver at the 10-route library cap", () => {
    expect(isAtLimit("savedRoutes", 9, REGULAR)).toBe(false);
    expect(isAtLimit("savedRoutes", 10, REGULAR)).toBe(true);
  });

  it("never blocks a Platinum driver's route library", () => {
    expect(isAtLimit("savedRoutes", 10, PLATINUM)).toBe(false);
    expect(isAtLimit("savedRoutes", 500, PLATINUM)).toBe(false);
  });
});

describe("isAtLimit — convoy capacity enforcement", () => {
  it("caps a Regular-led convoy at 2 (organiser + 1)", () => {
    expect(isAtLimit("convoyMembers", 1, REGULAR)).toBe(false);
    expect(isAtLimit("convoyMembers", 2, REGULAR)).toBe(true);
    expect(isAtLimit("convoyMembers", 3, REGULAR)).toBe(true);
  });

  it("caps a Platinum-led convoy at 8 — bigger, but still bounded", () => {
    expect(isAtLimit("convoyMembers", 7, PLATINUM)).toBe(false);
    expect(isAtLimit("convoyMembers", 8, PLATINUM)).toBe(true);
    expect(isAtLimit("convoyMembers", 9, PLATINUM)).toBe(true);
  });
});

describe("isAtLimit — AI showcase enforcement", () => {
  it("blocks every Regular attempt — the cap is 0", () => {
    // A cap of 0 means the very first attempt is already at the limit.
    expect(isAtLimit("aiShowcasesPerMonth", 0, REGULAR)).toBe(true);
    expect(isAtLimit("aiShowcasesPerMonth", 5, REGULAR)).toBe(true);
  });

  it("allows a Platinum driver up to 5 per month, then blocks", () => {
    expect(isAtLimit("aiShowcasesPerMonth", 4, PLATINUM)).toBe(false);
    expect(isAtLimit("aiShowcasesPerMonth", 5, PLATINUM)).toBe(true);
    expect(isAtLimit("aiShowcasesPerMonth", 6, PLATINUM)).toBe(true);
  });
});

describe("isAtLimit — monthly drive enforcement", () => {
  it("blocks a Regular driver only once 5 drives are recorded this month", () => {
    expect(isAtLimit("drivesPerMonth", 0, REGULAR)).toBe(false);
    expect(isAtLimit("drivesPerMonth", 4, REGULAR)).toBe(false);
    // The 6th drive is refused.
    expect(isAtLimit("drivesPerMonth", 5, REGULAR)).toBe(true);
    expect(isAtLimit("drivesPerMonth", 6, REGULAR)).toBe(true);
  });

  it("never blocks a Platinum driver, however many drives", () => {
    expect(isAtLimit("drivesPerMonth", 5, PLATINUM)).toBe(false);
    expect(isAtLimit("drivesPerMonth", 500, PLATINUM)).toBe(false);
  });
});

describe("cap ↔ benefit wiring", () => {
  /**
   * Derived from TIER_LIMITS rather than hand-listed, so a cap added to the
   * table without a paywall benefit fails here instead of shipping as a
   * block with no way past it.
   */
  const features = Object.keys(TIER_LIMITS.regular) as LimitedFeature[];

  it("maps every capped feature to a real paywall benefit id", () => {
    for (const f of features) {
      const benefitId = FEATURE_BENEFIT[f];
      expect(benefitId).toBeTruthy();
      // `aura` resolves to the badge row; everything else resolves directly.
      expect(benefitById(benefitId)).toBeDefined();
    }
  });

  it("keeps TIER_LIMITS and the feature union in lockstep", () => {
    for (const f of features) {
      expect(TIER_LIMITS.regular).toHaveProperty(f);
      expect(TIER_LIMITS.platinum).toHaveProperty(f);
    }
  });

  it("resolves the aura benefit onto the badge row", () => {
    expect(benefitById("aura")?.id).toBe("badge");
  });

  it("exposes exactly the paywall benefits the UI iterates", () => {
    expect(PLATINUM_BENEFITS.length).toBeGreaterThan(0);
    // Contextual triggers rely on ids being unique.
    const ids = PLATINUM_BENEFITS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
