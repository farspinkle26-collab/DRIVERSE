/**
 * Driveverse — rank auras.
 *
 * The glow that sits *behind* a driver's avatar. Free, earned by rank, and
 * deliberately a separate layer from the frame in `rankFrames.ts`: the frame
 * decorates the avatar's edge, the aura is the light coming off it.
 *
 * ONE SOURCE OF COLOUR
 *   This file authors no colours. It reads `frameForRankId()` from
 *   `rankFrames.ts`, which in turn reads `RANKS` — so a driver's frame and
 *   their aura are guaranteed to agree on the tier colour, because they are
 *   literally reading the same record. Changing a tier's colour in `ranks.ts`
 *   moves both, and there is no third place to forget to update.
 *
 * FRAME vs AURA — WHY THEY ESCALATE DIFFERENTLY
 *   The frame escalates by *shape*, because the rank palette has three
 *   near-collisions and colour alone cannot separate the ladder (see the note
 *   in `rankFrames.ts`). The aura has no shape to escalate — a glow is a
 *   glow — so it escalates by *layer count and motion* instead: nothing, then
 *   a static ring, then a breath, then several breaths out of phase, then a
 *   sweep. That keeps the two systems from competing: one is doing geometry,
 *   the other is doing light.
 *
 * THE BANDS
 *   1      none        no aura at all. A brand-new driver's avatar is just an
 *                      avatar; the ladder has to start from zero somewhere.
 *   2–3    static      one barely-there ring, no motion. Reads as a faint
 *                      edge light rather than as an effect.
 *   4–7    pulse       one ring on a slow breath, low-to-medium opacity.
 *   8–11   phased      two then three concentric rings breathing slightly out
 *                      of phase, tier colour plus accent at the top of the
 *                      band, and a soft wash behind the header section.
 *   12     sweep       King only. The phased rings *plus* an infrequent
 *                      streak that expands outward and fades — the one motion
 *                      in the set that is not a breath.
 *
 * RESTRAINT IS A HARD CONSTRAINT, NOT A PREFERENCE
 *   Peak opacity across the entire ladder tops out at 0.26, and King's sweep
 *   is visible for under two seconds in every eleven. This is a precision
 *   app: the tier name and badge on the page carry the prestige signal, and
 *   the aura is only there to quietly confirm it. If a number in this table
 *   ever needs to go up to make the effect "land", the effect is wrong.
 */

import { frameForRankId, frameForLevel, type FrameConfig } from "@/constants/rankFrames";
import { RANKS } from "@/constants/ranks";

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/**
 * `pulse` breathes one ring. `phased` breathes several with a phase offset
 * between them, so the glow never reads as a single flat object changing
 * brightness. `sweep` adds King's expanding streak on top of `phased`.
 */
export type AuraMotion = "none" | "pulse" | "phased" | "sweep";

export interface AuraConfig {
  /** Matches `Rank.id`. */
  rankId: string;
  rankName: string;
  /** 1-based position in the ladder, same numbering as `FrameConfig.tier`. */
  tier: number;

  /** Concentric glow rings. 0 draws no aura whatsoever. */
  rings: number;
  /**
   * Peak opacity of the innermost ring at the top of its breath. Outer rings
   * are stepped down from this — see `RING_FALLOFF` in `ProfileAura`.
   */
  opacity: number;
  /** How far the outermost ring reaches past the avatar, as a fraction of size. */
  spread: number;

  motion: AuraMotion;
  /** Seconds for one full breath. Slow on purpose; see the header note. */
  pulsePeriod: number;
  /**
   * Phase separation between adjacent rings, in cycles. 0.18 means ring 2
   * trails ring 1 by about a fifth of a breath — enough to read as depth,
   * not enough to read as two unrelated animations.
   */
  phaseOffset: number;

  /** Background wash intensity behind the header, 0–1. 0 draws no wash. */
  wash: number;
  /** Alternate rings use `accent` instead of `color`. */
  twoTone: boolean;
  /** Seconds between King's sweeps. 0 when the tier has no sweep. */
  sweepPeriod: number;

  /** Primary tone. Always `Rank.color`, via the frame config. */
  color: string;
  /** Secondary tone. Always `Rank.colorDark`, via the frame config. */
  accent: string;
}

/** Everything except the parts derived from the rank itself. */
type BandSpec = Omit<AuraConfig, "rankId" | "rankName" | "tier" | "color" | "accent">;

/* ------------------------------------------------------------------ *
 * Bands
 * ------------------------------------------------------------------ */

/** Applied by tier position, first matching `upToTier` wins. */
const BANDS: { upToTier: number; spec: BandSpec }[] = [
  {
    // 1 · nothing. Deliberately empty rather than "very faint": the step from
    // no aura to *any* aura is the most legible one in the whole system, and
    // spending it on tier 1→2 means every driver gets to feel it early.
    upToTier: 1,
    spec: {
      rings: 0,
      opacity: 0,
      spread: 0,
      motion: "none",
      pulsePeriod: 0,
      phaseOffset: 0,
      wash: 0,
      twoTone: false,
      sweepPeriod: 0,
    },
  },
  {
    // 2–3 · static. One ring, no motion, opacity low enough that a driver
    // notices it on their own profile and never notices it on someone else's.
    upToTier: 3,
    spec: {
      rings: 1,
      opacity: 0.05,
      spread: 0.14,
      motion: "none",
      pulsePeriod: 0,
      phaseOffset: 0,
      wash: 0,
      twoTone: false,
      sweepPeriod: 0,
    },
  },
  {
    // 4–7 · pulse. The aura starts moving. A ~6s breath is slow enough to sit
    // below conscious notice while the page is being read — the test is
    // whether you can look at the avatar for five seconds without the motion
    // pulling your eye, and anything under about 4s fails it.
    upToTier: 7,
    spec: {
      rings: 1,
      opacity: 0.09,
      spread: 0.18,
      motion: "pulse",
      pulsePeriod: 6,
      phaseOffset: 0,
      wash: 0,
      twoTone: false,
      sweepPeriod: 0,
    },
  },
  {
    // 8–11 · phased. Layers arrive, and with them the first background wash.
    // The wash is what makes a high tier feel like it affects the *page*
    // rather than just the avatar, which is the point of the band.
    upToTier: 11,
    spec: {
      rings: 2,
      opacity: 0.17,
      spread: 0.28,
      motion: "phased",
      pulsePeriod: 5.4,
      phaseOffset: 0.18,
      wash: 0.1,
      twoTone: false,
      sweepPeriod: 0,
    },
  },
  {
    // 12 · King of the Road. Not "tier 11 with another ring" — the sweep is a
    // motion nothing else in the set does, the way the octagon is a silhouette
    // nothing else in the frame set uses. An 11s gap between sweeps is the
    // restraint: it has to feel like something you catch, not something that
    // is always happening.
    upToTier: Number.POSITIVE_INFINITY,
    spec: {
      rings: 3,
      opacity: 0.26,
      spread: 0.38,
      motion: "sweep",
      pulsePeriod: 4.6,
      phaseOffset: 0.22,
      wash: 0.26,
      twoTone: true,
      sweepPeriod: 11,
    },
  },
];

/**
 * Per-tier deviations, so complexity climbs *inside* a band. Keyed by rank id.
 * Every value here moves in the same direction as the tier, never against it —
 * `rankAuras.test.ts` enforces that.
 */
const OVERRIDES: Record<string, Partial<BandSpec>> = {
  // 2–3: the only thing available at this weight is the ring itself.
  "street-driver": { opacity: 0.07, spread: 0.16 },

  // 4–7: opacity and reach creep up, the breath tightens slightly.
  elite: { opacity: 0.11, spread: 0.2, pulsePeriod: 5.8 },
  racer: { opacity: 0.13, spread: 0.22, pulsePeriod: 5.6 },
  "pro-racer": { opacity: 0.15, spread: 0.24, pulsePeriod: 5.4 },

  // 8–11: the third ring and the two-tone pairing arrive at tier 10, so the
  // top of the band already shares vocabulary with King rather than jumping
  // to it from nothing.
  "apex-racer": { opacity: 0.19, spread: 0.3, pulsePeriod: 5.2, wash: 0.13 },
  "street-legend": {
    rings: 3,
    opacity: 0.21,
    spread: 0.32,
    pulsePeriod: 5,
    wash: 0.16,
    twoTone: true,
  },
  "mythic-driver": {
    rings: 3,
    opacity: 0.23,
    spread: 0.34,
    pulsePeriod: 4.8,
    phaseOffset: 0.2,
    wash: 0.19,
    twoTone: true,
  },
};

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

function specForTier(tier: number): BandSpec {
  const band = BANDS.find((b) => tier <= b.upToTier) ?? BANDS[BANDS.length - 1];
  return band.spec;
}

function configForFrame(frame: FrameConfig): AuraConfig {
  return {
    rankId: frame.rankId,
    rankName: frame.rankName,
    tier: frame.tier,
    ...specForTier(frame.tier),
    ...(OVERRIDES[frame.rankId] ?? {}),
    // Taken from the frame config rather than from `ranks.ts` directly. Same
    // values either way, but routing through the frame makes it structurally
    // impossible for the two systems to drift apart on colour.
    color: frame.color,
    accent: frame.accent,
  };
}

/** One config per rank, in ladder order. Built from the frame table, so a
 *  tier added to the ladder gets an aura automatically from its band. */
export const RANK_AURAS: AuraConfig[] = RANKS.map((rank) =>
  configForFrame(frameForRankId(rank.id))
);

const BY_RANK_ID: Record<string, AuraConfig> = Object.fromEntries(
  RANK_AURAS.map((a) => [a.rankId, a])
);

/** The aura config for a rank id, falling back to tier 1. */
export function auraForRankId(rankId: string | null | undefined): AuraConfig {
  return (rankId && BY_RANK_ID[rankId]) || RANK_AURAS[0];
}

/** The aura config a given XP level has earned. */
export function auraForLevel(level: number): AuraConfig {
  return auraForRankId(frameForLevel(level).rankId);
}

/* ------------------------------------------------------------------ *
 * Detail levels
 * ------------------------------------------------------------------ */

/**
 * How much of a config a surface may draw.
 *
 *   full  Profile page. One aura on screen, at the largest the avatar gets.
 *   list  Convoy rosters and chat rows. Static, no wash, and only from
 *         `LIST_MIN_TIER` up — see `LIST_MIN_TIER` for why.
 *
 * There is deliberately no `marker` level. The map already signals rank
 * through the frame, and stacking a soft glow on 30 small markers would cost
 * both frame budget and map readability for a signal that is already there.
 * `map.tsx` should keep using `AvatarFrame` alone.
 */
export type AuraDetail = "full" | "list";

/**
 * The lowest tier that gets an aura in a list.
 *
 * The point of the list aura is to make top-ranked drivers findable in a
 * social context. A roster where every row glows communicates nothing — the
 * signal is carried by the *contrast* between rows, so most rows have to have
 * no aura at all for the few that do to mean anything. Tier 8 is where the
 * phased band starts, which is also where the frame gains its travelling
 * trail, so the two systems step up on the same row.
 */
export const LIST_MIN_TIER = 8;

export interface ResolvedAura extends AuraConfig {
  /** What to actually draw, after detail level and reduced motion. */
  effectiveMotion: AuraMotion;
  effectiveRings: number;
  effectiveWash: number;
  /** False when this surface draws nothing at all. */
  visible: boolean;
  /** True when the driver's aura is the Platinum one, not their rank's. */
  fromPlatinum: boolean;
}

/**
 * Reduced motion keeps the colour, drops the movement.
 *
 * The house rule (`hooks/useReducedMotion.ts`) is that an animation renders
 * its end state rather than a faster version of itself. For a breath there is
 * no "end state", so the aura renders at the *midpoint* of its breath — the
 * same thing `PlatinumAura` does. The driver keeps their full colour identity
 * and ring count; only the motion goes.
 */
function degradeMotion(
  motion: AuraMotion,
  detail: AuraDetail,
  reducedMotion: boolean
): AuraMotion {
  if (reducedMotion) return "none";
  // A scrolling list of independently breathing glows is noise before it is a
  // cost, and unlike the frame's trail there is no cheaper motion to fall back
  // to — a glow with its breath removed is just a glow. So: static.
  if (detail === "list") return "none";
  return motion;
}

/* ------------------------------------------------------------------ *
 * Resolution — the one place rank and Platinum meet
 * ------------------------------------------------------------------ */

export interface AuraResolutionInput {
  /** The driver's XP level. Used when `rankId` is absent. */
  level?: number | null;
  /** Pre-resolved rank id, if the caller already has one. Wins over `level`. */
  rankId?: string | null;
  /** Whether this driver currently holds the Platinum entitlement. */
  isPlatinum?: boolean;
  detail?: AuraDetail;
  reducedMotion?: boolean;
}

/**
 * The aura a driver should actually be drawn with.
 *
 *   holds Platinum  →  the Platinum aura (`components/platinum/PlatinumAura`)
 *   otherwise       →  their rank-tier aura
 *
 * WHY THIS IS SIMPLER THAN THE FRAME'S RESOLUTION
 *   A Platinum *frame* is a selection — four chrome silhouettes a subscriber
 *   picks between, stored in `profiles.profile_frame` — so `resolveAvatarFrame`
 *   has to check both entitlement and choice. The Platinum *aura* is not a
 *   selection; it comes with the tier and there is nothing to pick. So the
 *   only question here is entitlement, and `isPlatinum` answers it.
 *
 * WHY PLATINUM SUPPRESSES THE RANK AURA ENTIRELY
 *   Not for precedence reasons — because they would physically overlap. Both
 *   occupy the same ring of space around the same avatar. A Platinum King
 *   would otherwise get a chrome bezel, three gold rings and a sweep in one
 *   72pt circle, which is exactly the "fantasy-game explosion" this system is
 *   supposed to avoid. One aura per avatar, always.
 *
 *   The rank fields stay populated even when `fromPlatinum` is true, so a
 *   caller can still tint something by rank underneath a Platinum aura, and a
 *   lapsed subscriber silently falls back to the aura they earned.
 */
export function resolveAura({
  level,
  rankId,
  isPlatinum = false,
  detail = "full",
  reducedMotion = false,
}: AuraResolutionInput): ResolvedAura {
  const base = rankId ? auraForRankId(rankId) : auraForLevel(level ?? 1);

  const hiddenByList = detail === "list" && base.tier < LIST_MIN_TIER;
  const visible = !isPlatinum && base.rings > 0 && !hiddenByList;

  return {
    ...base,
    fromPlatinum: isPlatinum,
    visible,
    effectiveMotion: visible
      ? degradeMotion(base.motion, detail, reducedMotion)
      : "none",
    effectiveRings: visible ? base.rings : 0,
    // The wash is a Profile-page effect by definition — it paints the header
    // section behind the avatar, and a list row has no header to paint.
    effectiveWash: visible && detail === "full" ? base.wash : 0,
  };
}
