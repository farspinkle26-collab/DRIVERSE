/**
 * Driveverse — rank profile frames.
 *
 * The frame drawn around every driver's avatar. Free, earned by rank, and
 * separate from the Platinum cosmetic frames in `platinumCosmetics.ts` —
 * the two stack via `resolveAvatarFrame()` at the bottom of this file.
 *
 * DESIGN RULE
 *   Higher rank is not a recolour. Each band changes the *silhouette* and
 *   the amount of machinery on the ring, so a tier reads as higher even in
 *   greyscale. That matters here specifically: the rank palette has three
 *   near-collisions (tiers 1/4 are both bronze, 6/7 are both silver, 10/12
 *   are both gold — see `ranks.ts`), so colour alone genuinely cannot
 *   separate the ladder. Shape does the work; colour confirms it.
 *
 * THE BANDS
 *   1–3   simple      hairline ring, flat tier colour, static
 *   4–7   mid         angular CutCorner silhouette, thicker ring, inner
 *                     glow, corner ticks, slow pulse at the top of the band
 *   8–11  high        multi-segment ring with a slow travelling light trail,
 *                     tier colour + accent, double-cut / notched corners
 *   12    King        octagon — a silhouette nothing else in the set uses —
 *                     two-tone travelling edge, spark detail at one corner
 *
 * ADDING OR RETUNING A TIER
 *   Edit `BANDS` (to change a whole band) or `OVERRIDES` (to change one
 *   tier). Nothing in `components/AvatarFrame.tsx` needs to change — it
 *   reads this config and draws whatever it says. Colours are never written
 *   here: they are pulled from `RANKS` so `ranks.ts` stays the single source
 *   of truth for the palette.
 */

import { RANKS, rankForLevel, type Rank } from "@/constants/ranks";
import {
  resolveProfileFrame,
  type ProfileFrameId,
} from "@/constants/platinumCosmetics";

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/**
 * The avatar silhouette. `cut*` are the brand's 45° corner cut applied to
 * an increasing number of corners; `octagon` cuts all four *and* the four
 * edges, which is why it is reserved for the top tier alone.
 */
export type FrameShape = "circle" | "cut1" | "cut2" | "cut4" | "octagon";

/**
 * `pulse` breathes the inner glow. `trail` runs a short bright arc around
 * the silhouette's own outline. `dualTrail` runs two, in the tier colour
 * and its accent, on opposite sides.
 */
export type FrameAnimation = "none" | "pulse" | "trail" | "dualTrail";

/** Extra machinery where the ring turns a corner. */
export type CornerTreatment = "none" | "ticks" | "double" | "notch" | "emblem";

export interface FrameConfig {
  /** Matches `Rank.id`. */
  rankId: string;
  rankName: string;
  /** 1-based position in the ladder — what the frame is actually signalling. */
  tier: number;
  shape: FrameShape;
  /** Ring stroke as a fraction of the frame box, so it scales with size. */
  thickness: number;
  /** Primary stroke. Always `Rank.color`. */
  color: string;
  /** Secondary tone for two-tone treatments. Always `Rank.colorDark`. */
  accent: string;
  /** Inner glow strength, 0–1. 0 draws no glow layer at all. */
  glow: number;
  animation: FrameAnimation;
  corner: CornerTreatment;
  /** Ring subdivisions. 1 is a continuous ring. */
  segments: number;
  /** Spark micro-detail at one corner. Top tier only. */
  sparks: boolean;
  /** Seconds for one full trail lap. Slow on purpose — decorative, not busy. */
  trailPeriod: number;
}

/** Everything in a config except the parts that come from the rank itself. */
type BandSpec = Omit<FrameConfig, "rankId" | "rankName" | "tier" | "color" | "accent">;

/* ------------------------------------------------------------------ *
 * Bands
 * ------------------------------------------------------------------ */

/**
 * Applied by tier position, first matching `upToTier` wins. Retuning a whole
 * band — say, making every mid-tier ring thicker — is a one-line edit here.
 */
const BANDS: { upToTier: number; spec: BandSpec }[] = [
  {
    // 1–3 · simple. A hairline in the tier colour and nothing else. These
    // are the frames most drivers see most of the time, so they have to sit
    // quietly behind the avatar rather than competing with it.
    upToTier: 3,
    spec: {
      shape: "circle",
      thickness: 0.022,
      glow: 0,
      animation: "none",
      corner: "none",
      segments: 1,
      sparks: false,
      trailPeriod: 0,
    },
  },
  {
    // 4–7 · mid. The silhouette turns angular — this is where the avatar
    // stops being a circle, which is the single most legible step in the
    // whole ladder. Thicker ring, inner glow, ticks at the cuts.
    upToTier: 7,
    spec: {
      shape: "cut4",
      thickness: 0.032,
      glow: 0.3,
      animation: "none",
      corner: "ticks",
      segments: 1,
      sparks: false,
      trailPeriod: 0,
    },
  },
  {
    // 8–11 · high. The ring breaks into segments and a light trail starts
    // travelling it. Slow — a 7–9s lap reads as "alive", a 2s lap reads as
    // a loading spinner and makes the avatar look stuck.
    upToTier: 11,
    spec: {
      shape: "cut4",
      thickness: 0.038,
      // Must stay above the top of the mid band (Pro Racer, 0.46) — glow and
      // thickness both climb monotonically across the whole ladder, so a
      // driver never sees a promotion make their frame quieter.
      glow: 0.5,
      animation: "trail",
      corner: "double",
      segments: 4,
      sparks: false,
      trailPeriod: 9,
    },
  },
  {
    // 12 · King of the Road. Octagonal, two-tone, sparked. Deliberately not
    // "the tier-11 frame but more" — a different silhouette, so it is
    // recognisable as max rank by someone who has never seen the ladder.
    upToTier: Number.POSITIVE_INFINITY,
    spec: {
      shape: "octagon",
      thickness: 0.05,
      glow: 0.6,
      animation: "dualTrail",
      corner: "emblem",
      segments: 8,
      sparks: true,
      trailPeriod: 7,
    },
  },
];

/**
 * Per-tier deviations from the band default, so complexity still climbs
 * *inside* a band instead of four tiers looking identical. Keyed by rank id.
 */
const OVERRIDES: Record<string, Partial<BandSpec>> = {
  // 1–3: the only escalation available at this weight is the ring itself,
  // plus the first appearance of a single cut at the top of the band.
  explorer: { thickness: 0.026 },
  "street-driver": { shape: "cut1", thickness: 0.03 },

  // 4–7: ease into the full four-cut silhouette, then start the glow moving.
  skilled: { shape: "cut2", thickness: 0.03, glow: 0.22 },
  elite: { glow: 0.34 },
  racer: { thickness: 0.034, glow: 0.4, animation: "pulse" },
  "pro-racer": { thickness: 0.036, glow: 0.46, animation: "pulse", segments: 2 },

  // 8–11: more segments and a faster lap as the band climbs; Mythic picks up
  // the notched corner that hands off to King's emblem.
  "apex-racer": { segments: 6, thickness: 0.039, glow: 0.52, trailPeriod: 8.5 },
  "street-legend": { segments: 8, thickness: 0.041, glow: 0.54, trailPeriod: 8 },
  "mythic-driver": {
    segments: 8,
    thickness: 0.044,
    glow: 0.56,
    corner: "notch",
    trailPeriod: 7.5,
  },
};

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

function specForTier(tier: number): BandSpec {
  const band = BANDS.find((b) => tier <= b.upToTier) ?? BANDS[BANDS.length - 1];
  return band.spec;
}

function configForRank(rank: Rank, index: number): FrameConfig {
  const tier = index + 1;
  return {
    rankId: rank.id,
    rankName: rank.name,
    tier,
    ...specForTier(tier),
    ...(OVERRIDES[rank.id] ?? {}),
    // Colour is never authored in this file — `ranks.ts` owns the palette,
    // and the badge art it was derived from is the reason it owns it.
    color: rank.color,
    accent: rank.colorDark,
  };
}

/** One config per rank, in ladder order. Built from `RANKS`, so a new tier
 *  added to the ladder gets a frame automatically from its band. */
export const RANK_FRAMES: FrameConfig[] = RANKS.map(configForRank);

const BY_RANK_ID: Record<string, FrameConfig> = Object.fromEntries(
  RANK_FRAMES.map((f) => [f.rankId, f])
);

/** The frame config for a rank id, falling back to tier 1. */
export function frameForRankId(rankId: string | null | undefined): FrameConfig {
  return (rankId && BY_RANK_ID[rankId]) || RANK_FRAMES[0];
}

/** The frame config a given XP level has earned. */
export function frameForLevel(level: number): FrameConfig {
  return frameForRankId(rankForLevel(level).id);
}

/* ------------------------------------------------------------------ *
 * Detail levels
 * ------------------------------------------------------------------ */

/**
 * How much of a config a given surface is allowed to draw.
 *
 *   full    Profile page. One frame on screen, as large as it ever gets.
 *   list    Convoy rosters, chat, leaderboard. Shape and colour always
 *           survive; motion is kept but simplified, and all frames on a
 *           screen share one animation clock (see `useFrameClock`).
 *   marker  Map. Colour and silhouette only — a map with 30 live drivers
 *           cannot afford 30 animated rings, and a 28px marker cannot show
 *           the detail anyway.
 */
export type FrameDetail = "full" | "list" | "marker";

export interface ResolvedFrame extends FrameConfig {
  /** What to actually draw, after detail level and reduced-motion. */
  effectiveAnimation: FrameAnimation;
  effectiveCorner: CornerTreatment;
  effectiveGlow: number;
  effectiveSparks: boolean;
  /** True when this frame came from a Platinum selection, not from rank. */
  fromPlatinum: boolean;
  platinumFrameId: ProfileFrameId | null;
}

/**
 * Marker frames never animate.
 *
 * The first reason is correctness, not performance: `react-native-maps`
 * snapshots each marker to a bitmap on Android, so an animated frame does
 * not animate — it freezes on whatever moment the snapshot caught. `map.tsx`
 * already keeps its "live" event ring and its distress ring static for
 * exactly this reason, and rank frames follow that established rule.
 *
 * The performance argument points the same way (a JS-driven stroke
 * interpolation per marker, on markers the map re-lays-out on every region
 * change), but it has not been measured on device — see the open item in
 * `RANK_FRAME_REFERENCE.md`.
 */
function degradeAnimation(
  animation: FrameAnimation,
  detail: FrameDetail,
  reducedMotion: boolean
): FrameAnimation {
  if (reducedMotion) return "none";
  if (detail === "marker") return "none";
  if (detail === "list") {
    // A scrolling list of independently sparkling two-tone rings is noise
    // before it is a cost. Both trail variants collapse to the single trail.
    return animation === "dualTrail" ? "trail" : animation;
  }
  return animation;
}

function degradeCorner(corner: CornerTreatment, detail: FrameDetail): CornerTreatment {
  if (detail !== "marker") return corner;
  // Ticks and notches are sub-pixel at marker size; the cut silhouette
  // already carries the tier.
  return "none";
}

/* ------------------------------------------------------------------ *
 * Resolution — the one place rank and Platinum meet
 * ------------------------------------------------------------------ */

export interface FrameResolutionInput {
  /** The driver's XP level. Used when no Platinum frame is equipped. */
  level?: number | null;
  /** Pre-resolved rank id, if the caller already has one. Wins over `level`. */
  rankId?: string | null;
  /** Raw `profiles.profile_frame` value — a *selection*, not an entitlement. */
  platinumFrame?: string | null;
  isPlatinum?: boolean;
  detail?: FrameDetail;
  reducedMotion?: boolean;
}

/**
 * The frame a driver should actually be drawn with.
 *
 *   equipped Platinum frame (and entitled)  →  that frame
 *   otherwise                               →  their rank-tier frame
 *
 * Every render site goes through here rather than checking `isPlatinum`
 * itself, so the precedence rule exists once. The Platinum branch keeps
 * `platinumFrameId` set and hands the *rank* config back alongside it —
 * `AvatarFrame` draws the Platinum silhouette but can still tint level
 * badges and glows by rank, and a lapsed subscriber falls back to their
 * earned rank frame with the stored selection untouched.
 */
export function resolveAvatarFrame({
  level,
  rankId,
  platinumFrame,
  isPlatinum = false,
  detail = "full",
  reducedMotion = false,
}: FrameResolutionInput): ResolvedFrame {
  const base = rankId
    ? frameForRankId(rankId)
    : frameForLevel(level ?? 1);

  // `resolveProfileFrame` already drops a Platinum-only selection held by a
  // lapsed subscriber back to "default", so an equipped frame here is always
  // one the driver is currently entitled to.
  const platinumId = resolveProfileFrame(platinumFrame, isPlatinum);
  const fromPlatinum = platinumId !== "default";

  return {
    ...base,
    fromPlatinum,
    platinumFrameId: fromPlatinum ? platinumId : null,
    // A Platinum frame is chrome and static by design (see
    // `platinumCosmetics.ts`) — it brings no trail of its own, so the
    // animation fields go quiet rather than animating a shape that has no
    // matching outline.
    effectiveAnimation: fromPlatinum
      ? "none"
      : degradeAnimation(base.animation, detail, reducedMotion),
    effectiveCorner: fromPlatinum ? "none" : degradeCorner(base.corner, detail),
    effectiveGlow: fromPlatinum ? 0 : detail === "marker" ? 0 : base.glow,
    effectiveSparks:
      !fromPlatinum && base.sparks && detail === "full" && !reducedMotion,
  };
}
