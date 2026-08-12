/**
 * Driveverse — the Main Quest ("First Mile"), the guided chain a brand-new
 * driver walks before the daily quests mean anything to them.
 *
 * WHY THIS IS A HAND-WRITTEN CATALOGUE AND NOT A TEMPLATE TABLE
 *   `daily_quests` is procedurally generated from `quest_templates` because
 *   there has to be a fresh, non-repeating set every day forever. The main
 *   quest is the opposite: eight fixed steps, in one fixed order, run once
 *   per account, ever. Generating that from a template table would buy
 *   nothing and cost a migration every time the copy changes. So the
 *   catalogue lives here, in TypeScript, and the database stores only which
 *   steps a given driver has finished (`user_main_quests`).
 *
 *   The XP numbers below are mirrored in `main_quest_step_xp()` in
 *   `database_migration_main_quests.sql`, which is what actually grants
 *   them — same "server is authoritative on reward" split
 *   `lib/questEngine.ts`'s `computeReward` already has with
 *   `quest_base_reward()`. **Change one and you must change the other**;
 *   `lib/__tests__/mainQuest.test.ts` pins the values on this side.
 *
 * TWO CLASSES OF STEP, AND WHY IT MATTERS
 *   `DAILY_QUEST_SYSTEM.md` §1 states the rule that daily quests are
 *   "auto-completed — never self-marked", enforced by there being no client
 *   UPDATE policy and no self-mark RPC. Five of these eight steps hold to
 *   that exactly: they are driven by database triggers on real rows (a
 *   `trips` insert, a `saved_places` insert, a `friends`/`party_members`
 *   acceptance, a `daily_quests` completion, a `user_xp` level change).
 *
 *   Three of them cannot be. "Open your finished trip and look at the
 *   stats", "open your Rank screen" and "share your trip card" are all
 *   *the driver looking at something* — the app learns they happened on the
 *   client and nowhere else, because no row is written when you read a
 *   screen. Those three are marked `verifiedBy: "client"` and are completed
 *   through an RPC whose SQL whitelists exactly these three ids, so a
 *   modified client still cannot self-grant `first_drive` or the capstone.
 *
 *   What that exposure is worth, stated plainly: the chain runs once per
 *   account and cannot be farmed, so the entire cheatable surface is the
 *   200 XP those three steps carry — about two Level-1s, against a daily
 *   quest that pays 10,000. Refusing to ship the tutorial over that would
 *   be the wrong trade; pretending the exposure is zero would be worse. See
 *   `MAIN_QUEST_REFERENCE.md` §3.
 */

/** Stable ids. These are persisted in `user_main_quests.step_id` — never rename one. */
export type MainQuestStepId =
  | "first_drive"
  | "inspect_trip"
  | "mark_territory"
  | "know_rank"
  | "share_trip"
  | "not_alone"
  | "first_daily_quest"
  | "reach_level_2";

/**
 * How a step is known to be finished.
 *
 * `trigger` — a database trigger on a real table writes the completion. The
 *   client never asks for it and cannot fake it.
 * `client`  — the app reports it, because the thing being measured is the
 *   driver looking at a screen and leaves no row behind. See the header.
 */
export type MainQuestVerification = "trigger" | "client";

export interface MainQuestStep {
  id: MainQuestStepId;
  /** 1-based position in the chain. Also the display order. */
  order: number;
  title: string;
  /** What to do, in the driver's words. One line. */
  description: string;
  /** Why it is in the chain at all — shown small, under the description. */
  teaches: string;
  xp: number;
  /** A lucide-react-native export name; resolved at the render site. */
  icon: string;
  verifiedBy: MainQuestVerification;
  /**
   * A step the chain does not wait for.
   *
   * "Send a friend request or join a convoy" is the one step whose
   * completion depends on somebody *else* existing — a driver opening this
   * app in a city where nobody else has it yet cannot finish it at all, and
   * a chain that dead-ends on an empty map is worse than one that admits the
   * step is conditional. It still pays out when it does happen; it is simply
   * not part of what the capstone waits for (see `REQUIRED_STEP_IDS`).
   */
  optional?: boolean;
}

export const MAIN_QUEST_STEPS: MainQuestStep[] = [
  {
    id: "first_drive",
    order: 1,
    title: "First Ignition",
    description: "Record your first drive.",
    teaches: "Free — this one doesn't count against your 5 monthly drives.",
    xp: 100,
    icon: "Flame",
    verifiedBy: "trigger",
  },
  {
    id: "inspect_trip",
    order: 2,
    title: "Check the Damage",
    description: "Open your finished trip and look at the stats.",
    teaches: "Distance, average speed, top speed and your drive score.",
    xp: 50,
    icon: "Gauge",
    verifiedBy: "client",
  },
  {
    id: "mark_territory",
    order: 3,
    title: "Mark Your Territory",
    description: "Save your first place — a cafe, fuel stop, workshop or hangout.",
    teaches: "The places layer, and the pins only you can see.",
    xp: 75,
    icon: "MapPin",
    verifiedBy: "trigger",
  },
  {
    id: "know_rank",
    order: 4,
    title: "Know Your Rank",
    description: "Open your rank screen and see how close Level 2 is.",
    teaches: "Where XP goes and what it is worth.",
    xp: 50,
    icon: "Trophy",
    verifiedBy: "client",
  },
  {
    id: "share_trip",
    order: 5,
    title: "Prove It",
    description: "Share your first trip card.",
    teaches: "The card is built from your own route — nobody else's.",
    xp: 100,
    icon: "Share2",
    verifiedBy: "client",
  },
  {
    id: "not_alone",
    order: 6,
    title: "Not Alone Anymore",
    description: "Send a friend request, or join a convoy.",
    teaches: "Needs another driver around — it'll wait for you.",
    xp: 150,
    icon: "Users",
    verifiedBy: "trigger",
    optional: true,
  },
  {
    id: "first_daily_quest",
    order: 7,
    title: "Pick a Fight",
    description: "Complete your first daily quest.",
    teaches: "Daily quests track themselves while you drive.",
    xp: 100,
    icon: "Swords",
    verifiedBy: "trigger",
  },
  {
    id: "reach_level_2",
    order: 8,
    title: "Level Up",
    description: "Reach Level 2 and finish the First Mile.",
    teaches: "Unlocks the First Mile Complete badge.",
    xp: 250,
    icon: "Award",
    verifiedBy: "trigger",
  },
];

/** The badge the capstone grants. Mirrored as a `badges` row by the migration. */
export const FIRST_MILE_BADGE_ID = "first_mile_complete";

/** The capstone — the step that closes the chain out. */
export const CAPSTONE_STEP_ID: MainQuestStepId = "reach_level_2";

/**
 * The steps the capstone waits for: everything except itself and the
 * optional one.
 *
 * WHY THE CAPSTONE IS GATED ON THE CHAIN AND NOT ONLY ON THE LEVEL
 *   `xpForLevel(1)` is 100 (`lib/xpMath.ts`), and step 1 pays exactly 100 —
 *   so "reach Level 2" is satisfied the instant the driver records their
 *   first drive, several steps before they have seen a trip detail screen, a
 *   saved place or a daily quest. Left as a pure level check the payoff step
 *   would fire first and the six steps it is supposed to reward would each
 *   land *after* their own reward. So Level 2 is a floor, not the whole
 *   condition: the capstone completes when the level is reached AND every
 *   required step is done. By that point the driver is well past Level 2,
 *   which is the honest reading of "the payoff step" anyway.
 */
export const REQUIRED_STEP_IDS: MainQuestStepId[] = MAIN_QUEST_STEPS.filter(
  (s) => !s.optional && s.id !== CAPSTONE_STEP_ID
).map((s) => s.id);

/** The three steps the client is allowed to report. Mirrored in SQL as a whitelist. */
export const CLIENT_REPORTABLE_STEP_IDS: MainQuestStepId[] = MAIN_QUEST_STEPS.filter(
  (s) => s.verifiedBy === "client"
).map((s) => s.id);

export function mainQuestStep(id: MainQuestStepId): MainQuestStep | undefined {
  return MAIN_QUEST_STEPS.find((s) => s.id === id);
}
