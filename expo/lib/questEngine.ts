// Driveverse — Quest Engine (client-side, presentation + shared model)
// =====================================================================
// The authoritative quest *generation* runs server-side in Postgres
// (see database_migration_daily_quests.sql). This module is the modular
// TypeScript layer that owns the shared vocabulary the UI needs:
//   • quest domain types (rows returned by the RPCs)
//   • the difficulty tiers and reward model (mirror of the SQL)
//   • an objective-type registry so new quest kinds slot in cleanly
//   • presentation helpers (labels, colours, progress formatting)
//
// The quests are **universal**: distance (km or m) and speed goals, plus
// social goals — make a friend, meet another driver through a convoy — that
// make sense for a driver anywhere on Earth — not tied to any one country.
// There are deliberately no place-based quests ("visit a café", etc.) — that
// needs a places API this app doesn't have a reliable one for yet. See
// EVENT_FOR_OBJECTIVE for the full list.
//
// Quests are **auto-completed**. Progress is never set by the user; it is
// driven only by real indicators (distance driven, top speed reached, a
// friend made, a convoy joined) via the `record_quest_event` RPC and
// database triggers. When an indicator reaches the target the server grants
// the rewards. See EVENT_FOR_OBJECTIVE for the objective → indicator routing.
//
// Adding a future quest type is a two-step, additive change:
//   1. add a row (or rows) to quest_templates with a new objective_type
//   2. register that objective_type here so the UI knows how to render it
// No generation code has to change.
// =====================================================================

// ─── Core enums ──────────────────────────────────────────────────────
export type QuestDifficulty = "easy" | "medium" | "hard";
export type QuestStatus = "active" | "completed" | "expired";

export type QuestCategory =
  | "driving"
  | "exploration"
  | "scenic"
  | "social"
  | "photo"
  | "fuel"
  | "eco"
  | "streak";

// How a quest's progress is measured. Extend this union (and OBJECTIVES
// below) to introduce new quest mechanics. Every objective maps to a
// real-world indicator via EVENT_FOR_OBJECTIVE.
export type ObjectiveType =
  | "drive_distance"
  | "night_drive"
  | "reach_speed"
  | "make_friend"
  | "attend_meetup"
  | "photo_capture";

// The indicator/event that drives each objective's progress. The client
// (and DB triggers) emit these via record_quest_event.
export type QuestEventType =
  | "drive_distance"
  | "reach_speed"
  | "make_friend"
  | "attend_meetup"
  | "photo_capture";

export const EVENT_FOR_OBJECTIVE: Record<ObjectiveType, QuestEventType> = {
  drive_distance: "drive_distance",
  night_drive: "drive_distance",
  reach_speed: "reach_speed",
  make_friend: "make_friend",
  attend_meetup: "attend_meetup",
  photo_capture: "photo_capture",
};

export type TimeWindow =
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";

// ─── Domain rows (shape of the SQL tables / RPC results) ─────────────
export interface DailyQuest {
  id: string;
  user_id: string;
  quest_date: string; // YYYY-MM-DD
  difficulty: QuestDifficulty;
  template_id: string | null;
  poi_id: string | null;
  title: string;
  description: string;
  icon: string;
  accent_color: string;
  category: QuestCategory;
  objective_type: ObjectiveType;
  objective_category: string | null; // reserved for future objective sub-typing; unused today
  target: number;
  progress: number;
  unit: string;
  xp_reward: number;
  coin_reward: number;
  badge_id: string | null;
  status: QuestStatus;
  generation_context: Record<string, unknown> | null;
  completed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface QuestStats {
  user_id: string;
  coins: number;
  total_completed: number;
  total_xp_from_quests: number;
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  counters: {
    difficulty?: Record<string, number>;
    category?: Record<string, number>;
  };
  updated_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent_color: string;
  criteria_type: string;
  criteria_value: number;
  criteria_key: string | null;
  sort_order: number;
}

export interface UserBadge {
  user_id: string;
  badge_id: string;
  unlocked_at: string;
}

// One row per quest touched by an indicator event (record_quest_event).
export interface QuestEventResult {
  quest_id: string;
  title: string;
  completed: boolean;
  xp_reward: number;
  coin_reward: number;
  new_badges: string[];
}

// ─── Difficulty tiers ────────────────────────────────────────────────
export interface DifficultyTier {
  id: QuestDifficulty;
  label: string;
  color: string;
  order: number;
  baseXp: number;
  baseCoins: number;
}

// Base XP sits in the 10k-20k band, not the hundreds — a driver clearing a
// handful of quests should feel it move the level bar, not read as a
// rounding error next to `xpForLevel`'s 1.6×-per-level curve
// (`lib/xpMath.ts`; L10 alone costs ~6.9k, L20 ~1.2M). Coins stay on their
// original, smaller scale — only XP was asked to jump. Mirrored in
// `quest_base_reward()` in `database_migration_daily_quests.sql`; keep both
// in sync.
export const DIFFICULTY_TIERS: Record<QuestDifficulty, DifficultyTier> = {
  easy: { id: "easy", label: "Easy", color: "#22C55E", order: 1, baseXp: 10000, baseCoins: 25 },
  medium: { id: "medium", label: "Medium", color: "#F59E0B", order: 2, baseXp: 15000, baseCoins: 60 },
  hard: { id: "hard", label: "Hard", color: "#EF4444", order: 3, baseXp: 20000, baseCoins: 130 },
};

export const DIFFICULTY_ORDER: QuestDifficulty[] = ["easy", "medium", "hard"];

// ─── Reward model (mirror of quest_base_reward + generator in SQL) ───
// Kept in sync so the client can preview / optimistically show rewards.
// Server remains the source of truth on completion.
export function levelBonus(level: number): number {
  return 1 + Math.min(Math.max(level, 1), 100) * 0.01;
}

export function computeReward(
  difficulty: QuestDifficulty,
  level: number,
  rewardMultiplier = 1
): { xp: number; coins: number } {
  const tier = DIFFICULTY_TIERS[difficulty];
  const bonus = levelBonus(level);
  return {
    xp: Math.round(tier.baseXp * rewardMultiplier * bonus),
    coins: Math.round(tier.baseCoins * rewardMultiplier * bonus),
  };
}

// ─── Objective-type registry ─────────────────────────────────────────
// Presentation + light behaviour metadata for each objective type. New
// quest mechanics register here; the generator/DB is unaffected.
export interface ObjectiveMeta {
  type: ObjectiveType;
  label: string;
  // Verb used to describe progress increments in the UI.
  progressNoun: string;
  // Whether this objective is naturally tracked as a running count
  // (true) vs. a single boolean "done" check-in (false).
  incremental: boolean;
}

export const OBJECTIVES: Record<ObjectiveType, ObjectiveMeta> = {
  drive_distance: { type: "drive_distance", label: "Drive distance", progressNoun: "driven", incremental: true },
  night_drive: { type: "night_drive", label: "Night drive", progressNoun: "driven", incremental: true },
  reach_speed: { type: "reach_speed", label: "Reach a speed", progressNoun: "km/h reached", incremental: false },
  make_friend: { type: "make_friend", label: "Make friends", progressNoun: "friends made", incremental: true },
  attend_meetup: { type: "attend_meetup", label: "Meet drivers", progressNoun: "drivers met", incremental: true },
  photo_capture: { type: "photo_capture", label: "Capture photos", progressNoun: "photos taken", incremental: true },
};

// ─── Presentation helpers ────────────────────────────────────────────
export function progressRatio(quest: Pick<DailyQuest, "progress" | "target">): number {
  if (!quest.target || quest.target <= 0) return quest.progress > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, quest.progress / quest.target));
}

export function progressPercent(quest: Pick<DailyQuest, "progress" | "target">): number {
  return Math.round(progressRatio(quest) * 100);
}

export function isComplete(quest: Pick<DailyQuest, "progress" | "target" | "status">): boolean {
  return quest.status === "completed" || progressRatio(quest) >= 1;
}

export function rewardLabel(quest: Pick<DailyQuest, "xp_reward" | "coin_reward">): string {
  return `${quest.xp_reward} XP · ${quest.coin_reward} coins`;
}

// Human "1 / 3 places visited" style label for a quest's progress.
export function progressLabel(quest: Pick<DailyQuest, "progress" | "target" | "unit">): string {
  const target = quest.target ?? 1;
  const prog = Math.min(quest.progress ?? 0, target);
  const unit = quest.unit ? ` ${quest.unit}` : "";
  // Show whole numbers cleanly; keep 1 decimal for fractional distances.
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(prog)} / ${fmt(target)}${unit}`;
}

// Order a set of quests easy → medium → hard for display.
export function sortByDifficulty<T extends { difficulty: QuestDifficulty }>(quests: T[]): T[] {
  return [...quests].sort(
    (a, b) => DIFFICULTY_TIERS[a.difficulty].order - DIFFICULTY_TIERS[b.difficulty].order
  );
}

// Total rewards still claimable from a set of quests.
export function pendingRewards(quests: DailyQuest[]): { xp: number; coins: number } {
  return quests
    .filter((q) => q.status === "active")
    .reduce(
      (acc, q) => ({ xp: acc.xp + q.xp_reward, coins: acc.coins + q.coin_reward }),
      { xp: 0, coins: 0 }
    );
}

// The universal "quest day" in UTC (YYYY-MM-DD). Every user on Earth rolls
// over at the same instant, matching the SQL generator's day boundary.
export function questDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// The current UTC time-of-day bucket, matching the SQL generator. Useful
// for client-side previews and messaging.
export function currentTimeWindow(now: Date = new Date()): TimeWindow {
  const hour = now.getUTCHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}
