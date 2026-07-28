/**
 * Driveverse — validating and sanitising a recorded drive before it is
 * written to `saved_routes`.
 *
 * This exists because a save that fails is worse than a save that is
 * refused. Every column on `saved_routes` is `NOT NULL` and most are
 * `DOUBLE PRECISION` / `INTEGER`, and PostgREST serialises the insert body
 * as JSON — where `NaN` and `Infinity` are not representable. A single
 * non-finite metric (an average speed computed over a zero-length window, a
 * top speed that never got a second GPS fix) therefore does not produce a
 * bad row, it produces a rejected request, and the driver just sees the
 * Save button do nothing.
 *
 * The rules live here, free of React and Supabase, so they can be tested
 * directly — see `lib/__tests__/routeDraft.test.ts`.
 */

/** Longest title `saved_routes.title` accepts (CHECK 1..100). */
export const TITLE_MAX = 100;
/** Longest description `saved_routes.description` accepts (CHECK <= 1000). */
export const DESCRIPTION_MAX = 1000;

/**
 * Coerces a metric to something the database will accept: a finite,
 * non-negative number. `NaN`, `Infinity` and `undefined` all become 0,
 * because "we did not measure this" and "this measured zero" are the same
 * row as far as a distance or a speed is concerned.
 */
export function sanitizeMetric(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Same, for the integer columns (`duration_seconds`, `xp_earned`). */
export function sanitizeCount(value: unknown): number {
  return Math.round(sanitizeMetric(value));
}

export interface RouteDraft {
  title: string;
  description?: string;
  /** How many GPS fixes the recorder actually kept. */
  pathLength: number;
}

/**
 * The driver-facing reason this drive cannot be saved, or `null` when it
 * can. Each string is written to be read on the sheet, not logged — it says
 * what to do, not what went wrong internally.
 */
export function validateRouteDraft(draft: RouteDraft): string | null {
  const title = draft.title.trim();
  if (!title) return "Give your route a name before saving.";
  if (title.length > TITLE_MAX) {
    return `Route names are up to ${TITLE_MAX} characters.`;
  }
  if ((draft.description ?? "").trim().length > DESCRIPTION_MAX) {
    return `Descriptions are up to ${DESCRIPTION_MAX} characters.`;
  }
  // Two points is the minimum that describes a line. A single fix is a
  // position, not a drive, and would encode to a polyline no map can draw.
  if (draft.pathLength < 2) {
    return "This drive didn't record enough GPS points to save. Try a longer drive.";
  }
  return null;
}

/**
 * Turns whatever a failed write threw into one sentence a driver can act
 * on. Supabase hands back `{ message }`, a network failure throws an
 * `Error`, and a misconfigured project can throw a bare string — all three
 * reach the same catch, and all three used to reach the driver as silence.
 */
export function describeSaveFailure(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : (err as { message?: string } | null)?.message ?? "";

  if (!raw) return "Couldn't save this route. Please try again.";

  // The two failures a driver can actually do something about.
  if (/network|fetch failed|timeout|offline/i.test(raw)) {
    return "Couldn't reach Driveverse. Check your connection and try again.";
  }
  if (/jwt|not authenticated|sign(ed)? in/i.test(raw)) {
    return "Your session expired. Sign in again to save this route.";
  }
  return raw;
}
