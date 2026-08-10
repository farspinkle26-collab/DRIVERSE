/**
 * Driveverse — the quest card's progress ring and symbol resolution.
 *
 * Split out of `app/(tabs)/drive.tsx` for the same reason
 * `lib/cutCornerGeometry.ts` is split from `components/CutCorner.tsx`: the
 * arithmetic is the part worth unit-testing, and a test runner should not
 * have to load React Native — or `react-native-svg` — to check that a ring
 * at 0% draws nothing and a ring at 100% closes.
 */

import type { DailyQuest, ObjectiveType } from "@/lib/questEngine";

/** Stroke dash values for one progress arc. */
export interface RingGeometry {
  /** Circle radius, inset by half the stroke so the ring is not clipped. */
  radius: number;
  circumference: number;
  /** Length of the drawn (progress) portion. */
  dash: number;
  /** Length of the undrawn remainder. */
  gap: number;
}

/**
 * An arc of `pct` percent around a `size`-wide medallion.
 *
 * The radius is inset by half the stroke width because SVG centres a stroke
 * on the path: a circle of r = size/2 with a 3pt stroke paints 1.5pt outside
 * the viewBox and gets clipped on every platform.
 *
 * `pct` is clamped rather than trusted — `progressPercent()` already clamps,
 * but a ring is the one place a negative dash silently inverts into a full
 * circle instead of failing visibly.
 */
export function ringGeometry(
  size: number,
  strokeWidth: number,
  pct: number
): RingGeometry {
  const radius = Math.max(0, (size - strokeWidth) / 2);
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (circumference * clamped) / 100;
  return { radius, circumference, dash, gap: circumference - dash };
}

/**
 * Lucide icon names this card knows how to draw. A quest's `icon` column is
 * free text written by whoever seeded the template, so it is checked against
 * this set rather than trusted — an unknown name would otherwise render as
 * `undefined` and crash the row it is in.
 */
export const QUEST_SYMBOLS = [
  "Car",
  "Gauge",
  "Route",
  "Flame",
  "Users",
  "Handshake",
  "Flag",
] as const;

export type QuestSymbol = (typeof QUEST_SYMBOLS)[number];

/** What each objective falls back to when the template's `icon` is unusable. */
const SYMBOL_FOR_OBJECTIVE: Record<ObjectiveType, QuestSymbol> = {
  drive_distance: "Route",
  night_drive: "Route",
  reach_speed: "Gauge",
  make_friend: "Users",
  attend_meetup: "Handshake",
  photo_capture: "Flag",
};

/**
 * The symbol to draw for a quest: the template's own `icon` when it names
 * one this card can draw, and the objective's fallback otherwise.
 *
 * Data first, because the templates already pick sensibly per quest (a
 * `Flame` for Long Haul, a `Handshake` for a meetup) and that variety is the
 * point of putting a symbol on the card at all. The objective fallback only
 * catches rows seeded outside this repo — the same class of row §10 of
 * DAILY_QUEST_SYSTEM.md is about.
 */
export function questSymbolName(
  quest: Pick<DailyQuest, "icon" | "objective_type">
): QuestSymbol {
  const named = (quest.icon ?? "").trim();
  if ((QUEST_SYMBOLS as readonly string[]).includes(named)) {
    return named as QuestSymbol;
  }
  return SYMBOL_FOR_OBJECTIVE[quest.objective_type] ?? "Route";
}
