/**
 * Driveverse — the first-launch map tutorial's content and layout maths.
 *
 * Split from `components/MapTutorial.tsx` for the same reason
 * `lib/cutCornerGeometry.ts` is split from `components/CutCorner.tsx`: the
 * geometry is the part worth unit-testing, and a test runner should not have
 * to load React Native to check that a tooltip lands on screen.
 */

/** A measured on-screen rectangle, in window coordinates (from `measureInWindow`). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TutorialTargetId = "drive" | "chrome" | "social" | "tabs";

export interface TutorialStep {
  id: "welcome" | "drive" | "chrome" | "social" | "tabs" | "done";
  title: string;
  body: string;
  /** `null` means no spotlight — a centred card over a full dim (welcome, done). */
  target: TutorialTargetId | null;
}

/**
 * The tour, in order. One tooltip per *cluster* of controls, not one per
 * icon — this is a tour, not an inspection. Six steps: two framing (welcome,
 * done) and four that spotlight something real.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Driverse",
    body: "A quick look at the map before you head out.",
    target: null,
  },
  {
    id: "drive",
    title: "Start a drive",
    body: "Tap this to start recording — distance, speed and XP, tracked automatically.",
    target: "drive",
  },
  {
    id: "chrome",
    title: "Find your way",
    body: "Search for a place, jump to your location, filter what's shown, or drop an event.",
    target: "chrome",
  },
  {
    id: "social",
    title: "Drive together",
    body: "Start or join a convoy, or open your messages.",
    target: "social",
  },
  {
    id: "tabs",
    title: "Your Drive Hub",
    body: "The steering wheel opens your drive log, quests and more — not a new drive. DRIVE on the map does that.",
    target: "tabs",
  },
  {
    id: "done",
    title: "You're set",
    body: "Go see what's out there.",
    target: null,
  },
];

/**
 * Rewarded once, on genuine completion only — not on skip.
 *
 * Kept below `xpForLevel(1)` (100, see `lib/xpMath.ts`) on purpose: that
 * threshold is what a brand-new account needs to clear Level 1, and the
 * tutorial is the very first thing almost every account does. A reward at
 * or above it would level every new driver up to Level 2 with 0 XP before
 * they had driven anywhere — which is what shipped originally, and reads as
 * a bug ("why is my new account on Lv. 2?") rather than a reward.
 */
export const TUTORIAL_COMPLETION_XP = 40;

/** A measured rect, padded outward — the spotlight sits slightly proud of the button it's cut around. */
export function paddedRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/**
 * Where the tooltip card's top edge should land: below the spotlight if it
 * fits, above it if that doesn't, and clamped inside the safe area as a last
 * resort rather than allowed to run under the status bar or the home
 * indicator. `null` (welcome/done, or a target whose rect hasn't measured in
 * yet) centres it — the same fallback either way, so a not-yet-measured
 * target never flashes at (0,0) instead of just reading as "the intro card,
 * one extra beat."
 */
export function tooltipTop(
  rect: Rect | null,
  screenHeight: number,
  tooltipHeight: number,
  safeTop: number,
  safeBottom: number,
  gap: number = 12
): number {
  if (!rect) {
    return Math.max(safeTop, (screenHeight - tooltipHeight) / 2);
  }
  const below = rect.y + rect.height + gap;
  if (below + tooltipHeight <= screenHeight - safeBottom) {
    return below;
  }
  const above = rect.y - gap - tooltipHeight;
  if (above >= safeTop) {
    return above;
  }
  return Math.max(safeTop, Math.min(above, screenHeight - safeBottom - tooltipHeight));
}
