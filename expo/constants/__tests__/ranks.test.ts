/**
 * Priority #2 — rank calculation & rank-up threshold crossing.
 *
 * The rank a level maps to (and the progress toward the next rank) drives the
 * badge, aura and frame a driver sees. Off-by-one at a band boundary shows the
 * wrong rank, so every boundary is tested on both sides.
 */
import {
  RANKS,
  nextRankForLevel,
  rankForLevel,
  rankProgress,
} from "@/constants/ranks";

describe("rankForLevel — level → rank band", () => {
  it("maps representative levels to the right rank", () => {
    expect(rankForLevel(1).id).toBe("rookie");
    expect(rankForLevel(9).id).toBe("rookie");
    expect(rankForLevel(10).id).toBe("explorer");
    expect(rankForLevel(20).id).toBe("street-driver");
    expect(rankForLevel(60).id).toBe("elite");
    expect(rankForLevel(100).id).toBe("racer");
    expect(rankForLevel(1000).id).toBe("king");
  });

  it("is correct on both sides of every band boundary", () => {
    for (let i = 1; i < RANKS.length; i++) {
      const rank = RANKS[i];
      const boundary = rank.minLevel;
      // The level just below belongs to the previous band…
      expect(rankForLevel(boundary - 1).id).toBe(RANKS[i - 1].id);
      // …and the boundary level itself belongs to this band.
      expect(rankForLevel(boundary).id).toBe(rank.id);
    }
  });

  it("clamps sub-1 / zero / NaN levels up to the first rank", () => {
    expect(rankForLevel(0).id).toBe("rookie");
    expect(rankForLevel(-5).id).toBe("rookie");
    expect(rankForLevel(NaN).id).toBe("rookie");
  });

  it("keeps the top rank for any level at or above 1000", () => {
    expect(rankForLevel(1000).id).toBe("king");
    expect(rankForLevel(50_000).id).toBe("king");
  });

  it("floors fractional levels into their band", () => {
    expect(rankForLevel(9.9).id).toBe("rookie");
    expect(rankForLevel(10.1).id).toBe("explorer");
  });
});

describe("nextRankForLevel", () => {
  it("returns the next band up mid-ladder", () => {
    expect(nextRankForLevel(1)?.id).toBe("explorer");
    expect(nextRankForLevel(9)?.id).toBe("explorer");
    expect(nextRankForLevel(10)?.id).toBe("street-driver");
  });

  it("returns null once the driver is King of the Road", () => {
    expect(nextRankForLevel(1000)).toBeNull();
    expect(nextRankForLevel(5000)).toBeNull();
  });
});

describe("rankProgress — progress through the current band", () => {
  it("is 0 at the start of a band", () => {
    const p = rankProgress(10); // start of explorer (10–19)
    expect(p.progress).toBe(0);
    expect(p.next?.id).toBe("street-driver");
    expect(p.levelsToNext).toBe(10); // 20 - 10
  });

  it("is a partial fraction mid-band", () => {
    // Explorer spans 10→20 (next.minLevel). At 15, 5 of 10 levels done.
    const p = rankProgress(15);
    expect(p.progress).toBeCloseTo(0.5, 5);
    expect(p.levelsToNext).toBe(5);
  });

  it("approaches 1 at the last level before the next band", () => {
    const p = rankProgress(19);
    expect(p.progress).toBeCloseTo(0.9, 5);
    expect(p.levelsToNext).toBe(1);
  });

  it("is a full, terminal 1 at the top rank", () => {
    const p = rankProgress(1000);
    expect(p.progress).toBe(1);
    expect(p.levelsToNext).toBe(0);
    expect(p.next).toBeNull();
  });

  it("clamps a sub-1 level to the first band's start", () => {
    const p = rankProgress(0);
    expect(p.progress).toBe(0);
    expect(p.next?.id).toBe("explorer");
  });
});

describe("rank ladder integrity", () => {
  it("has contiguous, non-overlapping, ascending bands", () => {
    for (let i = 0; i < RANKS.length - 1; i++) {
      const cur = RANKS[i];
      const next = RANKS[i + 1];
      expect(cur.maxLevel).not.toBeNull();
      // No gap and no overlap between adjacent bands.
      expect((cur.maxLevel as number) + 1).toBe(next.minLevel);
    }
  });

  it("has a single open-ended top band", () => {
    expect(RANKS[RANKS.length - 1].maxLevel).toBeNull();
  });
});
