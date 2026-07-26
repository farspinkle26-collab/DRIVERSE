/**
 * Driveverse — early-access feature flags.
 *
 * The infrastructure behind the "Early Access" Platinum benefit. This is
 * deliberately a PATTERN, not a feature: nothing ships gated right now, and
 * the point is that the next thing which does needs a one-line entry here
 * rather than its own bespoke check.
 *
 * HOW A FEATURE OPTS IN
 *   1. Add an entry to `EARLY_ACCESS_FEATURES` below with a stage.
 *   2. Wrap the entry point in `useEarlyAccess("your-flag")`.
 *   That's it. No per-feature Platinum logic, no new store, no new column.
 *
 * STAGES
 *   "platinum"  — Platinum drivers only. The benefit.
 *   "everyone"  — the flag is on for all drivers. This is how a feature
 *                 GRADUATES: flip the stage in the next release and every
 *                 gate opens without touching the feature's own code.
 *   "off"       — nobody. Useful for merging an unfinished feature behind a
 *                 flag, and for turning something off without a rollback.
 *
 * WHY HARDCODED (FOR NOW)
 *   The list is a build-time constant, updated per release. That is honest
 *   about what it is — this app already ships a release to change a cap, so
 *   a remote config would be infrastructure without a current customer.
 *   `useEarlyAccess` reads through a single resolver, so swapping the source
 *   for a remote config later is a change to `resolveStage()` and nothing else.
 */

export type EarlyAccessStage = "platinum" | "everyone" | "off";

export interface EarlyAccessFeature {
  /** Stable id. Used in code; never rename, retire instead. */
  id: string;
  /** What it is, for whoever reads this file in six months. */
  label: string;
  stage: EarlyAccessStage;
  /** Release the flag was added, so stale entries are obvious. */
  since: string;
}

/**
 * The live list. Keep it short — a flag that has been "everyone" for two
 * releases should be deleted along with its `useEarlyAccess` call, not left
 * here accumulating.
 *
 * The two entries below are the ones this build actually has: the AI showcase
 * (Platinum-only by product design, listed so it goes through the same
 * resolver as everything else) and a placeholder-free example of a graduated
 * flag is deliberately absent — an invented flag would be dead code.
 */
export const EARLY_ACCESS_FEATURES: EarlyAccessFeature[] = [
  {
    id: "ai-showcase",
    label: "AI Car Showcase — studio render from a phone photo",
    stage: "platinum",
    since: "1.1.0",
  },
  {
    id: "premium-cosmetics",
    label: "Premium vehicle icons and profile frames",
    stage: "platinum",
    since: "1.1.0",
  },
];

/** Feature ids, so a typo in a gate is a type error rather than a silent off. */
export type EarlyAccessFeatureId = (typeof EARLY_ACCESS_FEATURES)[number]["id"];

const BY_ID = new Map(EARLY_ACCESS_FEATURES.map((f) => [f.id, f]));

/**
 * The stage a flag is in. An unknown id resolves to "off" — a feature gated
 * on a flag that no longer exists should disappear, not fall open.
 *
 * This is the seam a remote config would replace.
 */
export function resolveStage(featureId: string): EarlyAccessStage {
  return BY_ID.get(featureId)?.stage ?? "off";
}

/** Whether a driver at this tier can see the feature. */
export function isFeatureEnabled(featureId: string, isPlatinum: boolean): boolean {
  const stage = resolveStage(featureId);
  if (stage === "off") return false;
  if (stage === "everyone") return true;
  return isPlatinum;
}

/**
 * True when the feature exists and is Platinum-gated — i.e. showing a Regular
 * driver an "early access" upsell would be honest. False for "off" (nothing
 * to sell) and "everyone" (already theirs).
 */
export function isEarlyAccessUpsell(featureId: string, isPlatinum: boolean): boolean {
  return resolveStage(featureId) === "platinum" && !isPlatinum;
}
