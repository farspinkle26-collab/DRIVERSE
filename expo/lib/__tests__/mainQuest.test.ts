/**
 * The Main Quest's pure rules. The cases worth pinning are the ones where a
 * wrong answer is invisible rather than loud: the optional step quietly
 * becoming what the homepage nags about, the nudge flashing at drivers who
 * finished the chain months ago, and the capstone's gate silently opening
 * early (which is the bug `constants/mainQuests.ts` explains at length —
 * step 1 pays exactly the Level 2 threshold).
 */

import {
  CAPSTONE_STEP_ID,
  CLIENT_REPORTABLE_STEP_IDS,
  MAIN_QUEST_STEPS,
  REQUIRED_STEP_IDS,
  mainQuestStep,
  type MainQuestStepId,
} from "@/constants/mainQuests";
import {
  capstoneUnlocked,
  isMainQuestStepId,
  mainQuestProgressLabel,
  mainQuestState,
  remainingChainXp,
  shouldNudge,
  totalChainXp,
} from "@/lib/mainQuest";

const ALL_IDS = MAIN_QUEST_STEPS.map((s) => s.id);

describe("the catalogue itself", () => {
  it("is eight steps, ordered 1..8 with no gaps or duplicates", () => {
    expect(MAIN_QUEST_STEPS).toHaveLength(8);
    expect(MAIN_QUEST_STEPS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(ALL_IDS).size).toBe(8);
  });

  it("pins the XP values the SQL mirror has to agree with", () => {
    // main_quest_step_xp() in database_migration_main_quests.sql is the
    // half that actually grants these. If this test is updated, that
    // function must be updated in the same commit.
    const xp: Record<string, number> = Object.fromEntries(
      MAIN_QUEST_STEPS.map((s) => [s.id, s.xp])
    );
    expect(xp).toEqual({
      first_drive: 100,
      inspect_trip: 50,
      mark_territory: 75,
      know_rank: 50,
      share_trip: 100,
      not_alone: 150,
      first_daily_quest: 100,
      reach_level_2: 250,
    });
    expect(totalChainXp()).toBe(875);
  });

  it("marks exactly one step optional, and it is the social one", () => {
    const optional = MAIN_QUEST_STEPS.filter((s) => s.optional);
    expect(optional.map((s) => s.id)).toEqual(["not_alone"]);
  });

  it("lets the client report only the three view-only steps", () => {
    // The SQL RPC whitelists this same set. Anything else being added here
    // without the migration matching means a step the server will refuse.
    expect(CLIENT_REPORTABLE_STEP_IDS).toEqual([
      "inspect_trip",
      "know_rank",
      "share_trip",
    ]);
    // Nothing the client can report may be worth more than the cheap steps —
    // the capstone and the first drive in particular must stay server-only.
    expect(CLIENT_REPORTABLE_STEP_IDS).not.toContain("first_drive");
    expect(CLIENT_REPORTABLE_STEP_IDS).not.toContain(CAPSTONE_STEP_ID);
  });

  it("excludes the capstone and the optional step from what the capstone waits for", () => {
    expect(REQUIRED_STEP_IDS).toEqual([
      "first_drive",
      "inspect_trip",
      "mark_territory",
      "know_rank",
      "share_trip",
      "first_daily_quest",
    ]);
  });
});

describe("mainQuestState", () => {
  it("points at the first step on a fresh account", () => {
    const state = mainQuestState([]);
    expect(state.next?.id).toBe("first_drive");
    expect(state.completed).toBe(0);
    expect(state.allComplete).toBe(false);
    expect(state.steps.filter((s) => s.current)).toHaveLength(1);
  });

  it("advances to the next incomplete step", () => {
    const state = mainQuestState(["first_drive", "inspect_trip"]);
    expect(state.next?.id).toBe("mark_territory");
    expect(state.completed).toBe(2);
    expect(mainQuestProgressLabel(state)).toBe("2 / 8");
  });

  it("never points at the optional step, even when it is the only one left", () => {
    // The whole reason `not_alone` is optional: a driver with nobody else
    // nearby cannot finish it, and a chain that nags about it dead-ends.
    const allButSocial = ALL_IDS.filter((id) => id !== "not_alone");
    const state = mainQuestState(allButSocial);
    expect(state.next).toBeNull();
    expect(state.steps.some((s) => s.current)).toBe(false);
  });

  it("skips over the optional step when pointing at what's next", () => {
    const done: MainQuestStepId[] = [
      "first_drive",
      "inspect_trip",
      "mark_territory",
      "know_rank",
      "share_trip",
    ];
    // `not_alone` (order 6) is undone, but the pointer moves past it to 7.
    expect(mainQuestState(done).next?.id).toBe("first_daily_quest");
  });

  it("still counts the optional step toward the displayed progress", () => {
    const state = mainQuestState(["first_drive", "not_alone"]);
    expect(state.completed).toBe(2);
    expect(mainQuestProgressLabel(state)).toBe("2 / 8");
  });

  it("is complete only once the capstone lands", () => {
    const almost = ALL_IDS.filter((id) => id !== CAPSTONE_STEP_ID);
    expect(mainQuestState(almost).allComplete).toBe(false);
    expect(mainQuestState(ALL_IDS).allComplete).toBe(true);
    expect(mainQuestState(ALL_IDS).ratio).toBe(1);
  });

  it("ignores ids that are not in the catalogue", () => {
    const state = mainQuestState(["first_drive", "some_retired_step"]);
    expect(state.completed).toBe(1);
    expect(state.next?.id).toBe("inspect_trip");
  });
});

describe("capstoneUnlocked", () => {
  it("stays shut until every required step is done", () => {
    expect(capstoneUnlocked([])).toBe(false);
    // The exact bug the gate exists for: step 1 alone pays 100 XP, which is
    // exactly xpForLevel(1), so the level condition is already satisfied
    // here. Without the chain gate the payoff step would fire right now.
    expect(capstoneUnlocked(["first_drive"])).toBe(false);
    expect(capstoneUnlocked(REQUIRED_STEP_IDS)).toBe(true);
  });

  it("does not wait for the optional step", () => {
    expect(REQUIRED_STEP_IDS).not.toContain("not_alone");
    expect(capstoneUnlocked(REQUIRED_STEP_IDS)).toBe(true);
  });
});

describe("shouldNudge", () => {
  const base = { signedIn: true, loaded: true, completedIds: [] as string[] };

  it("nudges a signed-in driver with an unfinished chain", () => {
    expect(shouldNudge(base)).toBe(true);
    expect(shouldNudge({ ...base, completedIds: ["first_drive"] })).toBe(true);
  });

  it("goes quiet once the chain is finished", () => {
    expect(shouldNudge({ ...base, completedIds: ALL_IDS })).toBe(false);
  });

  it("stays quiet while progress is still loading", () => {
    // The case that matters: an empty array is indistinguishable from a new
    // account, so a nudge driven off the array alone would flash on every
    // cold start for someone who finished months ago.
    expect(shouldNudge({ ...base, loaded: false })).toBe(false);
  });

  it("stays quiet when signed out", () => {
    expect(shouldNudge({ ...base, signedIn: false })).toBe(false);
  });
});

describe("remainingChainXp", () => {
  it("is the whole chain when nothing is done", () => {
    expect(remainingChainXp([])).toBe(875);
  });

  it("drops by the step's own value as steps land", () => {
    expect(remainingChainXp(["first_drive"])).toBe(775);
    expect(remainingChainXp(ALL_IDS)).toBe(0);
  });
});

describe("isMainQuestStepId", () => {
  it("accepts catalogue ids and rejects anything else", () => {
    expect(isMainQuestStepId("first_drive")).toBe(true);
    expect(isMainQuestStepId("nope")).toBe(false);
  });
});

describe("mainQuestStep", () => {
  it("resolves an id to its catalogue entry", () => {
    expect(mainQuestStep("share_trip")?.title).toBe("Prove It");
    expect(mainQuestStep("nope" as MainQuestStepId)).toBeUndefined();
  });
});
