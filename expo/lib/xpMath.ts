/**
 * Driveverse — XP leveling math (pure).
 *
 * The per-level XP curve and the "apply a gain, carry over into new levels"
 * reducer, lifted out of `hooks/useXPStore.ts` so the exact algorithm the app
 * ships can be unit-tested without rendering the hook or mocking Supabase.
 * The hook imports `applyXpGain` and owns only persistence and the React
 * state — the arithmetic that decides a driver's level lives here.
 *
 * The curve is geometric: each level costs 1.6× the previous, starting at 100.
 *   L1 → 100, L2 → 160, L3 → 256, L4 → 410, L5 → 655 …
 * `xp` is progress *within* the current level; `totalXp` is the lifetime sum,
 * never spent. A gain can cross several levels at once (the carry-over loop),
 * which is why a single long drive can jump a low-level driver two ranks.
 */

export interface XPState {
  level: number;
  xp: number;
  totalXp: number;
}

/** XP needed to clear a given level. L1=100, L2=160, L3=256, … */
export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.6, level - 1));
}

/** Cumulative XP required to *reach* a level (sum of all prior levels). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

/**
 * Apply an XP gain, carrying overflow into as many new levels as it funds.
 *
 * Returns a fresh state — never mutates the input, so it is safe to fold a
 * burst of awards through it (`awards.reduce(applyXpGain, state)`) and get the
 * same answer as applying them one render at a time. A gain that lands exactly
 * on a level threshold levels up (progress resets to 0), matching the `>=`
 * boundary the app has always used.
 */
export function applyXpGain(state: XPState, amount: number): XPState {
  let level = state.level;
  let xp = state.xp + amount;
  const totalXp = state.totalXp + amount;

  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
  }

  return { level, xp, totalXp };
}
