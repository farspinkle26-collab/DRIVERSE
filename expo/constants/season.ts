// ─── Driveverse Season Ranking ─────────────────────────────
// A competitive, XP-driven season ladder that sits alongside the
// permanent driver rank. Each season tier is a fixed XP band; tiers
// are grouped into metal divisions (Bronze → Apex). This powers the
// "Current Rank" and "Season" cards on the profile.

export const SEASON_NUMBER = 1;
export const XP_PER_TIER = 300;

const GROUPS = [
  "Rookie",
  "Amateur",
  "Semi-Pro",
  "Pro",
  "Elite",
  "Master",
  "Champion",
  "Legend",
] as const;

const DIVISIONS = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "APEX",
] as const;

// Metal accent colors per division, used to tint the rank hexagon.
const DIVISION_COLORS: Record<string, { color: string; colorDark: string }> = {
  BRONZE: { color: "#C9954E", colorDark: "#7A5A2E" },
  SILVER: { color: "#B8BDC4", colorDark: "#5A5F66" },
  GOLD: { color: "#FFD700", colorDark: "#8A6A00" },
  PLATINUM: { color: "#5FA8E0", colorDark: "#255A82" },
  DIAMOND: { color: "#4FD9E8", colorDark: "#1E7A85" },
  MASTER: { color: "#8B5CF6", colorDark: "#4A2E7A" },
  GRANDMASTER: { color: "#FF3B6F", colorDark: "#8A1E3A" },
  APEX: { color: "#FF6B35", colorDark: "#8A3A16" },
};

const ROMAN = ["I", "II", "III"] as const;

export interface SeasonRank {
  tierIndex: number; // global tier index (0-based)
  name: string; // e.g. "Rookie I"
  division: string; // e.g. "BRONZE"
  color: string;
  colorDark: string;
  xpIntoTier: number; // XP earned inside the current tier
  xpForTier: number; // XP needed to clear the tier (== XP_PER_TIER)
  next: {
    name: string;
    requiredTotalXp: number; // total XP at which the next tier unlocks
  } | null;
}

function tierName(globalIndex: number): { name: string; division: string } {
  const group = Math.min(Math.floor(globalIndex / ROMAN.length), GROUPS.length - 1);
  const step = globalIndex - group * ROMAN.length;
  const roman = ROMAN[Math.min(step, ROMAN.length - 1)] ?? ROMAN[ROMAN.length - 1];
  return { name: `${GROUPS[group]} ${roman}`, division: DIVISIONS[group] };
}

/** Resolve the season rank for a running total-XP value. */
export function seasonRankForXp(totalXp: number): SeasonRank {
  const xp = Math.max(0, Math.floor(totalXp || 0));
  const tierIndex = Math.floor(xp / XP_PER_TIER);
  const { name, division } = tierName(tierIndex);
  const colors = DIVISION_COLORS[division] ?? DIVISION_COLORS.BRONZE;
  const xpIntoTier = xp - tierIndex * XP_PER_TIER;

  const nextInfo = tierName(tierIndex + 1);
  return {
    tierIndex,
    name,
    division,
    color: colors.color,
    colorDark: colors.colorDark,
    xpIntoTier,
    xpForTier: XP_PER_TIER,
    next: {
      name: nextInfo.name,
      requiredTotalXp: (tierIndex + 1) * XP_PER_TIER,
    },
  };
}
