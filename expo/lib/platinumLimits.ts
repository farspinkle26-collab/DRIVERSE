/**
 * Driveverse — reading tier-cap rejections back off the database.
 *
 * Every cap is enforced twice: once in the client (so the driver gets an
 * upgrade prompt at the point of friction instead of a failed write) and once
 * as a Postgres trigger (so the cap is real even against a modified client).
 * See `database_migration_platinum.sql`.
 *
 * The triggers raise messages shaped `PLATINUM_LIMIT:<feature>:<cap> <copy>`.
 * This module turns one of those back into the feature that was capped, so a
 * store that loses the race — two devices adding a car at the same moment,
 * say — can still raise the right paywall rather than surfacing a raw
 * Postgres error to the driver.
 */

import {
  FEATURE_BENEFIT,
  type LimitedFeature,
  type PlatinumBenefitId,
} from "@/constants/platinum";

/** Postgres cap names → the app's `LimitedFeature` keys. */
const DB_FEATURE: Record<string, LimitedFeature> = {
  garage_cars: "garageCars",
  active_events: "activeEvents",
  saved_places: "savedPlaces",
  convoy_members: "convoyMembers",
  saved_routes: "savedRoutes",
  drives_per_month: "drivesPerMonth",
  ai_showcases: "aiShowcasesPerMonth",
};

export interface LimitRejection {
  feature: LimitedFeature;
  /** The cap the server applied. */
  cap: number;
  /** The benefit whose paywall row unblocks it. */
  benefit: PlatinumBenefitId;
  /** Driver-facing sentence, with the marker stripped. */
  message: string;
}

const PATTERN = /PLATINUM_LIMIT:([a-z_]+):(\d+)\s*(.*)/i;

/**
 * Parses a Supabase/Postgres error into a tier-cap rejection, or `null` when
 * the error is something else entirely.
 */
export function parseLimitRejection(error: unknown): LimitRejection | null {
  const message =
    typeof error === "string"
      ? error
      : (error as { message?: string } | null)?.message;
  if (!message) return null;

  const match = PATTERN.exec(message);
  if (!match) return null;

  const feature = DB_FEATURE[match[1].toLowerCase()];
  if (!feature) return null;

  return {
    feature,
    cap: Number(match[2]),
    benefit: FEATURE_BENEFIT[feature],
    message: match[3].trim() || "You've reached your Regular limit.",
  };
}

/** True when a failed write was rejected by a tier cap rather than by a bug. */
export function isLimitRejection(error: unknown): boolean {
  return parseLimitRejection(error) !== null;
}
