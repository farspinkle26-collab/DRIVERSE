/**
 * Priority #2 — XP leveling math.
 *
 * The exact curve and carry-over reducer the app ships (lib/xpMath.ts, used by
 * hooks/useXPStore.ts). Tested for the real numbers, threshold crossings, and
 * the edge cases the task calls out: exactly at a threshold, a burst that
 * crosses several levels, zero, and negative amounts.
 */
import {
  applyXpGain,
  totalXpForLevel,
  xpForLevel,
  type XPState,
} from "@/lib/xpMath";

const at = (level: number, xp: number, totalXp: number): XPState => ({
  level,
  xp,
  totalXp,
});

describe("xpForLevel — the per-level cost curve", () => {
  it("returns the known geometric values (100 × 1.6^(n-1), rounded)", () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(160);
    expect(xpForLevel(3)).toBe(256);
    expect(xpForLevel(4)).toBe(410); // 655.36 → 409.6 rounds to 410
    expect(xpForLevel(5)).toBe(655);
  });

  it("is strictly increasing", () => {
    for (let l = 1; l < 30; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });
});

describe("totalXpForLevel — cumulative XP to reach a level", () => {
  it("is 0 to reach level 1 (you start there)", () => {
    expect(totalXpForLevel(1)).toBe(0);
  });

  it("sums the prior levels' costs", () => {
    expect(totalXpForLevel(2)).toBe(xpForLevel(1)); // 100
    expect(totalXpForLevel(3)).toBe(xpForLevel(1) + xpForLevel(2)); // 260
    expect(totalXpForLevel(4)).toBe(
      xpForLevel(1) + xpForLevel(2) + xpForLevel(3)
    ); // 516
  });
});

describe("applyXpGain — awarding XP", () => {
  it("accrues XP within a level without leveling up below the threshold", () => {
    const next = applyXpGain(at(1, 0, 0), 50);
    expect(next).toEqual(at(1, 50, 50));
  });

  it("levels up and carries the remainder over", () => {
    // Level 1 needs 100; awarding 130 → level 2 with 30 carried.
    const next = applyXpGain(at(1, 0, 0), 130);
    expect(next).toEqual(at(2, 30, 130));
  });

  it("levels up on landing EXACTLY on the threshold (>=), leaving 0 progress", () => {
    const next = applyXpGain(at(1, 0, 0), 100);
    expect(next.level).toBe(2);
    expect(next.xp).toBe(0);
    expect(next.totalXp).toBe(100);
  });

  it("crosses several levels in one award, spending each level's real cost", () => {
    // From L1: 100 (→L2) + 160 (→L3) + 256 (→L4) = 516 clears three levels.
    const next = applyXpGain(at(1, 0, 0), 516);
    expect(next).toEqual(at(4, 0, 516));

    // One more XP starts level 4's progress.
    expect(applyXpGain(at(1, 0, 0), 517)).toEqual(at(4, 1, 517));
  });

  it("respects the starting progress within the current level", () => {
    // Already 90/100 into level 1; +20 → level 2 with 10 over.
    expect(applyXpGain(at(1, 90, 90), 20)).toEqual(at(2, 10, 110));
  });

  it("handles rapid consecutive awards identically when folded", () => {
    // Two awards folded through the pure reducer must equal their sum applied
    // once — this is the invariant the hook's ref-based addXP relies on.
    const start = at(1, 0, 0);
    const folded = [130, 200].reduce(applyXpGain, start);
    const atOnce = applyXpGain(start, 330);
    expect(folded).toEqual(atOnce);
  });

  it("treats a zero award as a no-op", () => {
    expect(applyXpGain(at(3, 40, 500), 0)).toEqual(at(3, 40, 500));
  });

  it("does not mutate the input state", () => {
    const start = at(1, 10, 10);
    applyXpGain(start, 500);
    expect(start).toEqual(at(1, 10, 10));
  });

  it("does not level up or crash on a negative award (defensive)", () => {
    // Negative awards aren't expected, but must not throw or advance a level.
    const next = applyXpGain(at(2, 30, 200), -10);
    expect(next.level).toBe(2);
    expect(next.xp).toBe(20);
    expect(next.totalXp).toBe(190);
  });
});
