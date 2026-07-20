import type { ImageSourcePropType } from "react-native";

// ─── Driveverse Rank Ladder ────────────────────────────────
// Level ranges map to a rank tier. Badge art is dropped in as it's
// produced — tiers without a `badge` fall back to a generated emblem.

export interface Rank {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number | null; // null = no upper bound (King of the Road)
  color: string; // tier accent
  colorDark: string; // gradient partner
  badge: ImageSourcePropType | null; // provided art, or null → generated emblem
  emoji?: string;
}

export const RANKS: Rank[] = [
  {
    id: "rookie",
    name: "Rookie Driver",
    minLevel: 1,
    maxLevel: 9,
    color: "#C9954E",
    colorDark: "#7A5A2E",
    badge: require("../assets/images/ranks/rank-01-rookie.png"),
  },
  {
    id: "explorer",
    name: "Street Explorer",
    minLevel: 10,
    maxLevel: 19,
    color: "#4F9E5A",
    colorDark: "#2E5E36",
    badge: require("../assets/images/ranks/rank-02-explorer.png"),
  },
  {
    id: "street-driver",
    name: "Street Driver",
    minLevel: 20,
    maxLevel: 39,
    color: "#3B82F6",
    colorDark: "#1E3A6E",
    badge: require("../assets/images/ranks/rank-03-street-driver.png"),
  },
  {
    id: "skilled",
    name: "Skilled Driver",
    minLevel: 40,
    maxLevel: 59,
    color: "#B0894E",
    colorDark: "#4A3A22",
    badge: require("../assets/images/ranks/rank-04-skilled.png"),
  },
  {
    id: "elite",
    name: "Elite Driver",
    minLevel: 60,
    maxLevel: 99,
    color: "#8B5CF6",
    colorDark: "#4A2E7A",
    badge: require("../assets/images/ranks/rank-05-elite.png"),
  },
  {
    id: "racer",
    name: "Racer",
    minLevel: 100,
    maxLevel: 149,
    color: "#B8BDC4",
    colorDark: "#5A5F66",
    badge: require("../assets/images/ranks/rank-06-racer.png"),
  },
  {
    id: "pro-racer",
    name: "Pro Racer",
    minLevel: 150,
    maxLevel: 249,
    color: "#C6CBD2",
    colorDark: "#606670",
    badge: require("../assets/images/ranks/rank-07-pro-racer.png"),
  },
  {
    id: "master-racer",
    name: "Master Racer",
    minLevel: 250,
    maxLevel: 399,
    color: "#D9B25A",
    colorDark: "#6E5528",
    badge: require("../assets/images/ranks/rank-08-master-racer.png"),
  },
  {
    id: "apex-racer",
    name: "Apex Racer",
    minLevel: 400,
    maxLevel: 599,
    color: "#5FA8E0",
    colorDark: "#255A82",
    badge: require("../assets/images/ranks/rank-09-apex-racer.png"),
  },
  {
    id: "street-legend",
    name: "Street Legend",
    minLevel: 600,
    maxLevel: 799,
    color: "#FBBF24",
    colorDark: "#7A5A0E",
    badge: require("../assets/images/ranks/rank-10-street-legend.png"),
  },
  {
    id: "mythic-driver",
    name: "Mythic Driver",
    minLevel: 800,
    maxLevel: 999,
    color: "#A855F7",
    colorDark: "#5A2E8A",
    badge: require("../assets/images/ranks/rank-11-mythic-driver.png"),
  },
  {
    id: "king",
    name: "King of the Road",
    minLevel: 1000,
    maxLevel: null,
    color: "#FFD700",
    colorDark: "#8A6A00",
    badge: require("../assets/images/ranks/rank-12-king.png"),
    emoji: "👑",
  },
];

/** The rank a given level belongs to. */
export function rankForLevel(level: number): Rank {
  const lvl = Math.max(1, Math.floor(level || 1));
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (lvl >= RANKS[i].minLevel) return RANKS[i];
  }
  return RANKS[0];
}

/** The next rank up from a given level, or null if already at the top. */
export function nextRankForLevel(level: number): Rank | null {
  const current = rankForLevel(level);
  const idx = RANKS.findIndex((r) => r.id === current.id);
  return idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

/** Index of a rank in the ladder (0-based). */
export function rankIndex(rank: Rank): number {
  return RANKS.findIndex((r) => r.id === rank.id);
}

/** Human label for a rank's level span, e.g. "Lv 20–39" or "Lv 1000+". */
export function rankLevelLabel(rank: Rank): string {
  if (rank.maxLevel == null) return `Lv ${rank.minLevel}+`;
  return `Lv ${rank.minLevel}–${rank.maxLevel}`;
}

/**
 * Progress (0..1) through the current rank band by level, and how many
 * levels remain until the next rank. For the top rank progress is 1.
 */
export function rankProgress(level: number): { progress: number; levelsToNext: number; next: Rank | null } {
  const lvl = Math.max(1, Math.floor(level || 1));
  const current = rankForLevel(lvl);
  const next = nextRankForLevel(lvl);
  if (!next || current.maxLevel == null) {
    return { progress: 1, levelsToNext: 0, next: null };
  }
  const span = next.minLevel - current.minLevel;
  const done = lvl - current.minLevel;
  const progress = span > 0 ? Math.min(1, Math.max(0, done / span)) : 0;
  return { progress, levelsToNext: Math.max(0, next.minLevel - lvl), next };
}
