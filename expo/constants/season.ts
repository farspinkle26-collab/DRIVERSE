// ─── Driveverse Season Ranking ─────────────────────────────
// A competitive, XP-driven season ladder that sits alongside the
// permanent driver rank. Each season tier is a fixed XP band; tiers
// are grouped by the same names as the driver rank ladder (see
// constants/ranks.ts), each split into three sub-tiers (I/II/III).
// This powers the "Current Rank" and "Season" cards on the profile.

import { RANKS } from "./ranks";

export const SEASON_NUMBER = 1;
export const XP_PER_TIER = 300;

const ROMAN = ["I", "II", "III"] as const;

export interface SeasonRank {
  tierIndex: number; // global tier index (0-based)
  name: string; // e.g. "Racer II"
  division: string; // e.g. "II" (sub-tier within the rank group)
  color: string;
  colorDark: string;
  xpIntoTier: number; // XP earned inside the current tier
  xpForTier: number; // XP needed to clear the tier (== XP_PER_TIER)
  next: {
    name: string;
    requiredTotalXp: number; // total XP at which the next tier unlocks
  } | null;
}

function tierInfo(globalIndex: number): { name: string; division: string; color: string; colorDark: string } {
  const group = Math.min(Math.floor(globalIndex / ROMAN.length), RANKS.length - 1);
  const step = globalIndex - group * ROMAN.length;
  const roman = ROMAN[Math.min(step, ROMAN.length - 1)] ?? ROMAN[ROMAN.length - 1];
  const rank = RANKS[group];
  return { name: `${rank.name} ${roman}`, division: roman, color: rank.color, colorDark: rank.colorDark };
}

/** Resolve the season rank for a running total-XP value. */
export function seasonRankForXp(totalXp: number): SeasonRank {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  const tierIndex = Math.floor(xp / XP_PER_TIER);
  const { name, division, color, colorDark } = tierInfo(tierIndex);
  const xpIntoTier = xp - tierIndex * XP_PER_TIER;

  const nextInfo = tierInfo(tierIndex + 1);
  return {
    tierIndex,
    name,
    division,
    color,
    colorDark,
    xpIntoTier,
    xpForTier: XP_PER_TIER,
    next: {
      name: nextInfo.name,
      requiredTotalXp: (tierIndex + 1) * XP_PER_TIER,
    },
  };
}
