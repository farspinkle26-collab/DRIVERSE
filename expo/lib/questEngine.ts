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

export type PoiCategory =
  | "landmark"
  | "cafe"
  | "viewpoint"
  | "route"
  | "workshop"
  | "fuel"
  | "ev_station";

// How a quest's progress is measured. Extend this union (and OBJECTIVES
// below) to introduce new quest mechanics.
export type ObjectiveType =
  | "drive_distance"
  | "night_drive"
  | "visit_poi"
  | "explore_category"
  | "complete_route"
  | "photo_capture"
  | "social_event"
  | "eco_drive";

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

export interface CompleteQuestResult {
  awarded: boolean;
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

export const DIFFICULTY_TIERS: Record<QuestDifficulty, DifficultyTier> = {
  easy: { id: "easy", label: "Easy", color: "#22C55E", order: 1, baseXp: 120, baseCoins: 25 },
  medium: { id: "medium", label: "Medium", color: "#F59E0B", order: 2, baseXp: 280, baseCoins: 60 },
  hard: { id: "hard", label: "Hard", color: "#EF4444", order: 3, baseXp: 550, baseCoins: 130 },
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
  drive_distance: { type: "drive_distance", label: "Drive distance", progressNoun: "km driven", incremental: true },
  night_drive: { type: "night_drive", label: "Night drive", progressNoun: "km driven", incremental: true },
  visit_poi: { type: "visit_poi", label: "Visit a place", progressNoun: "visit", incremental: false },
  explore_category: { type: "explore_category", label: "Explore places", progressNoun: "places visited", incremental: true },
  complete_route: { type: "complete_route", label: "Complete a route", progressNoun: "route", incremental: false },
  photo_capture: { type: "photo_capture", label: "Capture photos", progressNoun: "photos taken", incremental: true },
  social_event: { type: "social_event", label: "Join an event", progressNoun: "km with the crew", incremental: true },
  eco_drive: { type: "eco_drive", label: "Eco drive", progressNoun: "km driven", incremental: true },
};

// ─── POI presentation ────────────────────────────────────────────────
export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  landmark: "Landmark",
  cafe: "Café",
  viewpoint: "Viewpoint",
  route: "Scenic Route",
  workshop: "Workshop",
  fuel: "Fuel Stop",
  ev_station: "EV Station",
};

// Aligns with constants/colors.ts POI palette.
export const POI_CATEGORY_COLORS: Record<PoiCategory, string> = {
  landmark: "#3B82F6",
  cafe: "#8B5CF6",
  viewpoint: "#00D4AA",
  route: "#FF6B35",
  workshop: "#FF6B35",
  fuel: "#F59E0B",
  ev_station: "#22C55E",
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

// The current Asia/Jakarta time-of-day bucket, matching the SQL generator.
// Useful for client-side previews and messaging.
export function currentTimeWindow(now: Date = new Date()): TimeWindow {
  // Convert to Asia/Jakarta (UTC+7) without pulling a tz library.
  const jakartaHour = (now.getUTCHours() + 7) % 24;
  if (jakartaHour >= 5 && jakartaHour < 11) return "morning";
  if (jakartaHour >= 11 && jakartaHour < 15) return "midday";
  if (jakartaHour >= 15 && jakartaHour < 18) return "afternoon";
  if (jakartaHour >= 18 && jakartaHour < 22) return "evening";
  return "night";
}
