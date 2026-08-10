/**
 * Priority #4 — quest completion, reward, and reset logic.
 *
 * Quests auto-complete server-side; the client's shared model (lib/questEngine.ts)
 * decides completion detection, reward preview, what's still claimable (so XP
 * isn't shown as double-awarded), and the UTC day boundary that resets dailies.
 */
import {
  computeReward,
  currentTimeWindow,
  DIFFICULTY_TIERS,
  EVENT_FOR_OBJECTIVE,
  isComplete,
  levelBonus,
  OBJECTIVES,
  pendingRewards,
  progressLabel,
  progressPercent,
  progressRatio,
  questDay,
  sortByDifficulty,
  type DailyQuest,
  type ObjectiveType,
} from "@/lib/questEngine";

// Minimal quest factory — only the fields the pure helpers read.
function quest(over: Partial<DailyQuest> = {}): DailyQuest {
  return {
    id: "q1",
    user_id: "u1",
    quest_date: "2026-07-31",
    difficulty: "easy",
    template_id: null,
    poi_id: null,
    title: "Drive 5 km",
    description: "",
    icon: "car",
    accent_color: "#fff",
    category: "driving",
    objective_type: "drive_distance",
    objective_category: null,
    target: 5,
    progress: 0,
    unit: "km",
    xp_reward: 120,
    coin_reward: 25,
    badge_id: null,
    status: "active",
    generation_context: null,
    completed_at: null,
    expires_at: "2026-08-01T00:00:00Z",
    created_at: "2026-07-31T00:00:00Z",
    ...over,
  };
}

describe("progressRatio / progressPercent", () => {
  it("is a clean fraction of target", () => {
    expect(progressRatio({ progress: 2, target: 5 })).toBeCloseTo(0.4, 5);
    expect(progressPercent({ progress: 2, target: 5 })).toBe(40);
  });

  it("clamps to 1 once progress meets or exceeds target", () => {
    expect(progressRatio({ progress: 5, target: 5 })).toBe(1);
    expect(progressRatio({ progress: 9, target: 5 })).toBe(1);
    expect(progressPercent({ progress: 9, target: 5 })).toBe(100);
  });

  it("never goes negative", () => {
    expect(progressRatio({ progress: -3, target: 5 })).toBe(0);
  });

  it("treats a non-positive target as done-if-any-progress", () => {
    expect(progressRatio({ progress: 1, target: 0 })).toBe(1);
    expect(progressRatio({ progress: 0, target: 0 })).toBe(0);
  });
});

describe("isComplete — completion detection", () => {
  it("is complete when status is already completed, regardless of progress", () => {
    expect(isComplete(quest({ status: "completed", progress: 0, target: 5 }))).toBe(
      true
    );
  });

  it("is complete when progress reaches the target", () => {
    expect(isComplete(quest({ status: "active", progress: 5, target: 5 }))).toBe(
      true
    );
    expect(isComplete(quest({ status: "active", progress: 6, target: 5 }))).toBe(
      true
    );
  });

  it("is not complete while progress is below target", () => {
    expect(isComplete(quest({ status: "active", progress: 4, target: 5 }))).toBe(
      false
    );
  });

  it("does not treat an expired-but-unfinished quest as complete", () => {
    expect(isComplete(quest({ status: "expired", progress: 2, target: 5 }))).toBe(
      false
    );
  });
});

describe("computeReward — reward preview (mirror of the SQL generator)", () => {
  it("uses the difficulty tier's base at level 1 (bonus = 1.01)", () => {
    // levelBonus(1) = 1 + 1*0.01 = 1.01.
    expect(computeReward("easy", 1)).toEqual({
      xp: Math.round(DIFFICULTY_TIERS.easy.baseXp * 1.01),
      coins: Math.round(DIFFICULTY_TIERS.easy.baseCoins * 1.01),
    });
  });

  it("scales up with level via levelBonus", () => {
    expect(computeReward("hard", 100).xp).toBeGreaterThan(
      computeReward("hard", 1).xp
    );
  });

  it("caps the level bonus at level 100 (2×)", () => {
    expect(levelBonus(100)).toBeCloseTo(2, 5);
    expect(levelBonus(1000)).toBeCloseTo(2, 5); // clamped
    expect(levelBonus(0)).toBeCloseTo(1.01, 5); // floored to level 1
  });

  it("applies a reward multiplier", () => {
    const single = computeReward("medium", 1, 1);
    const double = computeReward("medium", 1, 2);
    expect(double.xp).toBe(Math.round(single.xp * 2));
  });

  it("ranks the tiers hard > medium > easy", () => {
    expect(computeReward("hard", 1).xp).toBeGreaterThan(
      computeReward("medium", 1).xp
    );
    expect(computeReward("medium", 1).xp).toBeGreaterThan(
      computeReward("easy", 1).xp
    );
  });
});

describe("pendingRewards — only unclaimed (active) quests count", () => {
  it("sums active quests and excludes completed ones (no double-award)", () => {
    const quests = [
      quest({ id: "a", status: "active", xp_reward: 120, coin_reward: 25 }),
      quest({ id: "b", status: "completed", xp_reward: 280, coin_reward: 60 }),
      quest({ id: "c", status: "active", xp_reward: 550, coin_reward: 130 }),
    ];
    // Completed quest 'b' already paid out — it must not appear in pending.
    expect(pendingRewards(quests)).toEqual({ xp: 670, coins: 155 });
  });

  it("excludes expired quests too", () => {
    const quests = [
      quest({ id: "a", status: "active", xp_reward: 100, coin_reward: 10 }),
      quest({ id: "b", status: "expired", xp_reward: 999, coin_reward: 999 }),
    ];
    expect(pendingRewards(quests)).toEqual({ xp: 100, coins: 10 });
  });

  it("is zero for an all-completed set", () => {
    expect(
      pendingRewards([quest({ status: "completed" }), quest({ status: "completed" })])
    ).toEqual({ xp: 0, coins: 0 });
  });
});

describe("progressLabel", () => {
  it("shows whole numbers and never over-reports past target", () => {
    expect(progressLabel({ progress: 3, target: 5, unit: "km" })).toBe("3 / 5 km");
    expect(progressLabel({ progress: 9, target: 5, unit: "km" })).toBe("5 / 5 km");
  });

  it("keeps one decimal for fractional distance", () => {
    expect(progressLabel({ progress: 2.5, target: 5, unit: "km" })).toBe(
      "2.5 / 5 km"
    );
  });
});

describe("sortByDifficulty", () => {
  it("orders easy → medium → hard", () => {
    const ordered = sortByDifficulty([
      quest({ difficulty: "hard" }),
      quest({ difficulty: "easy" }),
      quest({ difficulty: "medium" }),
    ]);
    expect(ordered.map((q) => q.difficulty)).toEqual(["easy", "medium", "hard"]);
  });
});

describe("questDay / currentTimeWindow — the daily reset boundary (UTC)", () => {
  it("returns the UTC calendar day, so every driver rolls over together", () => {
    expect(questDay(new Date("2026-07-31T23:59:59Z"))).toBe("2026-07-31");
    // One second later is a new quest day everywhere at once.
    expect(questDay(new Date("2026-08-01T00:00:00Z"))).toBe("2026-08-01");
  });

  it("uses UTC, not local time, for the day string", () => {
    // 30 Jul 23:30 UTC is still the 30th regardless of the runner's timezone.
    expect(questDay(new Date("2026-07-30T23:30:00Z"))).toBe("2026-07-30");
  });

  it("buckets the time-of-day window by UTC hour", () => {
    expect(currentTimeWindow(new Date("2026-07-31T06:00:00Z"))).toBe("morning");
    expect(currentTimeWindow(new Date("2026-07-31T12:00:00Z"))).toBe("midday");
    expect(currentTimeWindow(new Date("2026-07-31T16:00:00Z"))).toBe("afternoon");
    expect(currentTimeWindow(new Date("2026-07-31T20:00:00Z"))).toBe("evening");
    expect(currentTimeWindow(new Date("2026-07-31T02:00:00Z"))).toBe("night");
  });
});

describe("attend_meetup — the convoy objective", () => {
  it("is registered with a real-world indicator, same as every other objective", () => {
    expect(EVENT_FOR_OBJECTIVE.attend_meetup).toBe("attend_meetup");
    expect(OBJECTIVES.attend_meetup).toBeDefined();
    expect(OBJECTIVES.attend_meetup.incremental).toBe(true);
  });

  it("every objective maps to an indicator event — no dangling entries either way", () => {
    const objectiveKeys = Object.keys(OBJECTIVES) as ObjectiveType[];
    const eventKeys = Object.keys(EVENT_FOR_OBJECTIVE) as ObjectiveType[];
    expect(objectiveKeys.sort()).toEqual(eventKeys.sort());
    objectiveKeys.forEach((key) => {
      expect(EVENT_FOR_OBJECTIVE[key]).toBeTruthy();
    });
  });
});

describe("no location-based objective ever sneaks in", () => {
  // This app has no reliable places API to verify a visit or a proximity
  // against — every objective (including attend_meetup, verified by the
  // convoy roster, never GPS) must stay describable without naming a place.
  const LOCATION_WORDS = ["place", "location", "poi", "visit", "café", "gps", "proximity"];

  it("no objective id, label or progress noun names a place", () => {
    Object.values(OBJECTIVES).forEach((meta) => {
      const haystack = `${meta.type} ${meta.label} ${meta.progressNoun}`.toLowerCase();
      LOCATION_WORDS.forEach((word) => {
        expect(haystack).not.toContain(word);
      });
    });
  });
});
