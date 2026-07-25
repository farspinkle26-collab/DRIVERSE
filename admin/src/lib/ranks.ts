// Driveverse rank ladder — mirrors expo/constants/ranks.ts (art/emoji stripped).
// NOTE: the ladder has 12 tiers (the original brief said 11); all 12 are shown.

export interface Rank {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number | null;
  color: string;
}

export const RANKS: Rank[] = [
  { id: "rookie", name: "Rookie Driver", minLevel: 1, maxLevel: 9, color: "#C9954E" },
  { id: "explorer", name: "Street Explorer", minLevel: 10, maxLevel: 19, color: "#4F9E5A" },
  { id: "street-driver", name: "Street Driver", minLevel: 20, maxLevel: 39, color: "#3B82F6" },
  { id: "skilled", name: "Skilled Driver", minLevel: 40, maxLevel: 59, color: "#B0894E" },
  { id: "elite", name: "Elite Driver", minLevel: 60, maxLevel: 99, color: "#8B5CF6" },
  { id: "racer", name: "Racer", minLevel: 100, maxLevel: 149, color: "#B8BDC4" },
  { id: "pro-racer", name: "Pro Racer", minLevel: 150, maxLevel: 249, color: "#C6CBD2" },
  { id: "master-racer", name: "Master Racer", minLevel: 250, maxLevel: 399, color: "#D9B25A" },
  { id: "apex-racer", name: "Apex Racer", minLevel: 400, maxLevel: 599, color: "#5FA8E0" },
  { id: "street-legend", name: "Street Legend", minLevel: 600, maxLevel: 799, color: "#FBBF24" },
  { id: "mythic-driver", name: "Mythic Driver", minLevel: 800, maxLevel: 999, color: "#A855F7" },
  { id: "king", name: "King of the Road", minLevel: 1000, maxLevel: null, color: "#FFD700" },
];

export function rankForLevel(level: number): Rank {
  const lvl = Math.max(1, Math.floor(level || 1));
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (lvl >= RANKS[i].minLevel) return RANKS[i];
  }
  return RANKS[0];
}

export function rankLevelLabel(rank: Rank): string {
  if (rank.maxLevel == null) return `Lv ${rank.minLevel}+`;
  return `Lv ${rank.minLevel}–${rank.maxLevel}`;
}
