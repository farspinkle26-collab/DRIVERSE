/**
 * Driveverse — regional speed units.
 *
 * Every speed is stored and computed in km/h everywhere else in this app —
 * GPS math, the drive score, XP, quest targets. This file is the one place
 * that decides whether a given *display* should show it in km/h or mph, and
 * does the conversion. Nothing upstream of a render call should branch on a
 * driver's nation; that would multiply this decision across every screen
 * that shows a speed instead of deciding it once, here.
 *
 * mph is the road-speed unit in exactly three of this app's onboarding
 * nations (`constants/countries.ts`) — the United States, the United
 * Kingdom, and Myanmar — the countries most commonly cited as still posting
 * speed limits in miles rather than kilometres. Every other nation in that
 * list uses km/h, so km/h is the default for a missing or unrecognised
 * country rather than guessing at a fourth system.
 *
 * WHO THE UNIT FOLLOWS
 *   The signed-in viewer's own country, always — not whoever's trip, car or
 *   drive is on screen. A driver looking at a friend's shared trip reads it
 *   in their own regional unit, the same way Strava or Google Maps show you
 *   distances in your own locale regardless of whose data it is. That is
 *   also the only sourcing that is available everywhere a speed is shown:
 *   a share card's payload carries no driver identity to look a country up
 *   from, but the signed-in user generating it always does.
 */

import { findCountryByName } from "@/constants/countries";

export type SpeedUnit = "kmh" | "mph";

/** ISO 3166-1 alpha-2 codes, matching `constants/countries.ts`. */
const MPH_COUNTRY_CODES: ReadonlySet<string> = new Set(["US", "GB", "MM"]);

/** A driver's stored `profiles.country` (display name) → the unit their speeds render in. */
export function speedUnitForCountry(country: string | null | undefined): SpeedUnit {
  const match = findCountryByName(country);
  if (!match) return "kmh";
  return MPH_COUNTRY_CODES.has(match.code) ? "mph" : "kmh";
}

/** 1 km/h in mph. */
const KM_TO_MILES = 0.621371;

export function kmhToMph(kmh: number): number {
  return kmh * KM_TO_MILES;
}

export function mphToKmh(mph: number): number {
  return mph / KM_TO_MILES;
}

export function speedUnitLabel(unit: SpeedUnit): string {
  return unit === "mph" ? "mph" : "km/h";
}

/**
 * A km/h value converted for display (if `unit` is `"mph"`) and clamped to a
 * sane non-negative number — never negative, never `NaN`/`Infinity` from a
 * bad upstream reading. Rounding is left to the caller: a live speedometer
 * wants zero decimals, a share card readout might want the same, but this
 * function's job stops at "the right number in the right unit."
 */
export function convertSpeed(kmh: number, unit: SpeedUnit): number {
  const safe = Number.isFinite(kmh) ? Math.max(0, kmh) : 0;
  return unit === "mph" ? kmhToMph(safe) : safe;
}
