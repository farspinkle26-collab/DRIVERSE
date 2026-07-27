/**
 * The aura config is data, so it is testable as data.
 *
 * Two failure modes are worth guarding specifically, and both render
 * perfectly when broken:
 *
 *   1. A tier whose aura is quieter than the tier below it. Silently turns a
 *      promotion into a demotion. Same regression `rankFrames.test.ts` guards.
 *   2. The aura and the frame disagreeing on a tier's colour. The whole point
 *      of routing colour through `frameForRankId()` is that this cannot
 *      happen; the test is there so a future refactor cannot un-route it.
 */

import { describe, expect, it } from "bun:test";
import {
  RANK_AURAS,
  auraForLevel,
  auraForRankId,
  resolveAura,
  LIST_MIN_TIER,
} from "@/constants/rankAuras";
import { RANK_FRAMES, frameForLevel } from "@/constants/rankFrames";
import { RANKS } from "@/constants/ranks";

describe("the table", () => {
  it("has exactly one aura per rank, in ladder order", () => {
    expect(RANK_AURAS).toHaveLength(RANKS.length);
    expect(RANK_AURAS.map((a) => a.rankId)).toEqual(RANKS.map((r) => r.id));
  });

  it("shares the frame system's colours exactly", () => {
    for (const [i, aura] of RANK_AURAS.entries()) {
      expect(aura.color).toBe(RANK_FRAMES[i].color);
      expect(aura.accent).toBe(RANK_FRAMES[i].accent);
      // …which are, transitively, the ones ranks.ts owns.
      expect(aura.color).toBe(RANKS[i].color);
      expect(aura.accent).toBe(RANKS[i].colorDark);
    }
  });

  it("agrees with the frame system on tier numbering", () => {
    for (const [i, aura] of RANK_AURAS.entries()) {
      expect(aura.tier).toBe(RANK_FRAMES[i].tier);
      expect(aura.rankName).toBe(RANK_FRAMES[i].rankName);
    }
  });

  it("never makes a promotion look like a demotion", () => {
    for (let i = 1; i < RANK_AURAS.length; i++) {
      const prev = RANK_AURAS[i - 1];
      const next = RANK_AURAS[i];
      expect(next.rings).toBeGreaterThanOrEqual(prev.rings);
      expect(next.opacity).toBeGreaterThanOrEqual(prev.opacity);
      expect(next.spread).toBeGreaterThanOrEqual(prev.spread);
      expect(next.wash).toBeGreaterThanOrEqual(prev.wash);
    }
  });

  it("never slows a breath down as the ladder climbs", () => {
    const moving = RANK_AURAS.filter((a) => a.pulsePeriod > 0);
    for (let i = 1; i < moving.length; i++) {
      expect(moving[i].pulsePeriod).toBeLessThanOrEqual(moving[i - 1].pulsePeriod);
    }
  });

  it("keeps every tier inside the restraint budget", () => {
    for (const aura of RANK_AURAS) {
      // If this ceiling ever needs raising to make the effect land, the
      // effect is wrong — see the header note in rankAuras.ts.
      expect(aura.opacity).toBeLessThanOrEqual(0.26);
      expect(aura.wash).toBeLessThanOrEqual(0.26);
      expect(aura.rings).toBeLessThanOrEqual(3);
      // Nothing in the set may breathe faster than once per four seconds.
      if (aura.pulsePeriod > 0) expect(aura.pulsePeriod).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("the escalation bands", () => {
  it("gives tier 1 no aura at all", () => {
    const rookie = RANK_AURAS[0];
    expect(rookie.rings).toBe(0);
    expect(rookie.opacity).toBe(0);
    expect(rookie.motion).toBe("none");
    expect(resolveAura({ level: 1 }).visible).toBe(false);
  });

  it("keeps tiers 2-3 static and barely there", () => {
    for (const aura of RANK_AURAS.slice(1, 3)) {
      expect(aura.rings).toBe(1);
      expect(aura.motion).toBe("none");
      expect(aura.opacity).toBeLessThanOrEqual(0.08);
      expect(aura.wash).toBe(0);
    }
  });

  it("gives tiers 4-7 exactly one breathing ring and no wash", () => {
    for (const aura of RANK_AURAS.slice(3, 7)) {
      expect(aura.rings).toBe(1);
      expect(aura.motion).toBe("pulse");
      expect(aura.wash).toBe(0);
      expect(aura.twoTone).toBe(false);
    }
  });

  it("gives tiers 8-11 layered out-of-phase rings and a wash", () => {
    for (const aura of RANK_AURAS.slice(7, 11)) {
      expect(aura.rings).toBeGreaterThanOrEqual(2);
      expect(aura.motion).toBe("phased");
      expect(aura.phaseOffset).toBeGreaterThan(0);
      expect(aura.wash).toBeGreaterThan(0);
      expect(aura.sweepPeriod).toBe(0);
    }
  });

  it("makes the top tier the only one that sweeps", () => {
    const king = RANK_AURAS[RANK_AURAS.length - 1];
    expect(king.rankId).toBe("king");
    expect(king.motion).toBe("sweep");
    expect(king.sweepPeriod).toBeGreaterThan(0);
    expect(king.twoTone).toBe(true);

    for (const aura of RANK_AURAS.slice(0, -1)) {
      expect(aura.motion).not.toBe("sweep");
      expect(aura.sweepPeriod).toBe(0);
    }
  });

  it("keeps the top-tier sweep infrequent rather than constant", () => {
    const king = RANK_AURAS[RANK_AURAS.length - 1];
    // A sweep you see more often than every ~8s stops reading as an event.
    expect(king.sweepPeriod).toBeGreaterThanOrEqual(8);
  });

  it("gives the top tier a more visible wash than the high band", () => {
    const king = RANK_AURAS[RANK_AURAS.length - 1];
    for (const aura of RANK_AURAS.slice(7, 11)) {
      expect(king.wash).toBeGreaterThan(aura.wash);
    }
  });
});

describe("lookup", () => {
  it("resolves a level to the same rank the frame system does", () => {
    for (const level of [1, 9, 10, 39, 40, 100, 250, 600, 999, 1000, 5000]) {
      expect(auraForLevel(level).rankId).toBe(frameForLevel(level).rankId);
    }
  });

  it("falls back to tier 1 for an unknown or missing rank id", () => {
    expect(auraForRankId("not-a-rank").tier).toBe(1);
    expect(auraForRankId(null).tier).toBe(1);
    expect(auraForRankId(undefined).tier).toBe(1);
  });

  it("prefers an explicit rankId over level", () => {
    expect(resolveAura({ level: 1, rankId: "king" }).rankId).toBe("king");
  });
});

describe("reduced motion", () => {
  it("removes the motion at every tier without removing the colour", () => {
    for (const aura of RANK_AURAS) {
      const resolved = resolveAura({ rankId: aura.rankId, reducedMotion: true });
      expect(resolved.effectiveMotion).toBe("none");
      expect(resolved.color).toBe(aura.color);
      // Rings and wash survive — only the movement goes.
      expect(resolved.effectiveRings).toBe(aura.rings);
      expect(resolved.effectiveWash).toBe(aura.wash);
    }
  });

  it("still suppresses the top tier's sweep", () => {
    expect(resolveAura({ rankId: "king", reducedMotion: true }).effectiveMotion).toBe(
      "none"
    );
  });
});

describe("detail levels", () => {
  it("draws nothing in a list below the cutoff", () => {
    for (const aura of RANK_AURAS.filter((a) => a.tier < LIST_MIN_TIER)) {
      const resolved = resolveAura({ rankId: aura.rankId, detail: "list" });
      expect(resolved.visible).toBe(false);
      expect(resolved.effectiveRings).toBe(0);
    }
  });

  it("draws a static, wash-free aura in a list at and above the cutoff", () => {
    const listed = RANK_AURAS.filter((a) => a.tier >= LIST_MIN_TIER);
    expect(listed.length).toBeGreaterThan(0);

    for (const aura of listed) {
      const resolved = resolveAura({ rankId: aura.rankId, detail: "list" });
      expect(resolved.visible).toBe(true);
      expect(resolved.effectiveMotion).toBe("none");
      // A list row has no header to wash.
      expect(resolved.effectiveWash).toBe(0);
      // Colour identity and ring count survive the degrade.
      expect(resolved.effectiveRings).toBe(aura.rings);
      expect(resolved.color).toBe(aura.color);
    }
  });

  it("schedules no motion anywhere in a list, at any tier", () => {
    for (const aura of RANK_AURAS) {
      expect(resolveAura({ rankId: aura.rankId, detail: "list" }).effectiveMotion).toBe(
        "none"
      );
    }
  });
});

describe("platinum resolution", () => {
  it("suppresses the rank aura entirely for a subscriber", () => {
    for (const aura of RANK_AURAS) {
      const resolved = resolveAura({ rankId: aura.rankId, isPlatinum: true });
      expect(resolved.fromPlatinum).toBe(true);
      expect(resolved.visible).toBe(false);
      expect(resolved.effectiveRings).toBe(0);
      expect(resolved.effectiveWash).toBe(0);
      expect(resolved.effectiveMotion).toBe("none");
    }
  });

  it("keeps reporting the underlying rank so callers can still tint by it", () => {
    const resolved = resolveAura({ rankId: "king", isPlatinum: true });
    expect(resolved.rankId).toBe("king");
    expect(resolved.tier).toBe(12);
    expect(resolved.color).toBe(RANKS[RANKS.length - 1].color);
  });

  it("restores the earned aura when a subscription lapses", () => {
    const subscribed = resolveAura({ rankId: "mythic-driver", isPlatinum: true });
    const lapsed = resolveAura({ rankId: "mythic-driver", isPlatinum: false });
    expect(subscribed.visible).toBe(false);
    expect(lapsed.visible).toBe(true);
    expect(lapsed.effectiveMotion).toBe("phased");
  });

  it("never lets a Platinum driver stack two auras", () => {
    // The concrete regression: a Platinum King drawing chrome bezel + three
    // gold rings + a sweep in one 72pt circle.
    const king = resolveAura({ rankId: "king", isPlatinum: true });
    expect(king.visible).toBe(false);
    expect(king.effectiveMotion).not.toBe("sweep");
  });
});
