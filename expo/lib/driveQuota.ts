/**
 * Driveverse — the Regular tier's monthly drive allowance.
 *
 * Regular drivers record 5 drives per calendar month; Platinum is unlimited.
 * The numbers live in `constants/platinum.ts` (`TIER_LIMITS.*.drivesPerMonth`)
 * and are mirrored in SQL by `platinum_limit('drives_per_month', …)`.
 *
 * WHY THE CHECK IS AT *START* AND THE COUNT IS AT *END*
 *   A `trips` row is written when a drive ENDS (`app/(tabs)/map.tsx`), so
 *   that is what there is to count. But the cap cannot be enforced at that
 *   moment: refusing the insert after a 40-minute drive would throw away the
 *   drive, the XP and the quest progress the driver just earned, which is a
 *   worse outcome than letting one extra drive through. So the gate is at
 *   the point the driver presses DRIVE, before anything is invested.
 *
 *   The database trigger (`database_migration_drive_limit.sql`) still refuses
 *   the insert, because a cap that only exists in the client is not a cap.
 *   That path is the backstop against a modified client, not the path a real
 *   driver is ever meant to reach — which is exactly the split
 *   `database_migration_platinum.sql` already documents for every other cap
 *   ("the client check is what produces a good experience; the trigger is
 *   what makes the cap real").
 *
 * WHY A CALENDAR MONTH, NOT A ROLLING 30 DAYS
 *   "5 a month" is what the paywall says, and a driver can reason about the
 *   1st of the month. A rolling window means the allowance comes back a
 *   drive at a time on dates they would have to track. Both the SQL
 *   (`date_trunc('month', now())`) and {@link monthResetLabel} agree on this.
 */

import { supabase } from "@/lib/supabase";

export interface DriveQuota {
  /** Drives recorded so far this calendar month. */
  used: number;
  /** The cap. `null` means unlimited (Platinum). */
  allowance: number | null;
  /** `allowance - used`, floored at 0. `null` when unlimited. */
  remaining: number | null;
}

/** Unlimited, i.e. what a Platinum driver's quota always looks like. */
export const UNLIMITED_DRIVES: DriveQuota = {
  used: 0,
  allowance: null,
  remaining: null,
};

/**
 * Whether one more drive would exceed the allowance.
 *
 * `null` allowance is unlimited. A `null` quota — the RPC failed, the
 * migration has not been run, the device is offline — deliberately returns
 * `false`: an unreachable server must not lock a paying-or-not driver out of
 * the app's core action. The database trigger is what stops that being a
 * loophole worth exploiting.
 */
export function isOutOfDrives(quota: DriveQuota | null): boolean {
  if (!quota) return false;
  if (quota.allowance === null) return false;
  return quota.used >= quota.allowance;
}

/**
 * "3 of 5 drives left this month" — the line shown next to DRIVE while a
 * Regular driver still has some. Returns `null` when there is nothing worth
 * saying: unlimited, or unknown.
 */
export function driveQuotaLabel(quota: DriveQuota | null): string | null {
  if (!quota || quota.allowance === null) return null;
  const remaining = Math.max(quota.allowance - quota.used, 0);
  if (remaining === 1) return `1 of ${quota.allowance} drives left this month`;
  return `${remaining} of ${quota.allowance} drives left this month`;
}

/**
 * When the allowance comes back, as a short date ("1 Sep"). Used in the
 * out-of-drives copy so the driver is told when rather than just no.
 */
export function monthResetLabel(now: Date = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * This driver's drive quota for the current calendar month.
 *
 * Returns `null` on any failure — no session, RPC error, or a database that
 * has not run `database_migration_drive_limit.sql` yet. Callers treat `null`
 * as "don't block" (see {@link isOutOfDrives}), so a half-migrated database
 * degrades to the behaviour that existed before this feature rather than to
 * an app whose main button stops working.
 */
export async function fetchDriveQuota(): Promise<DriveQuota | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase.rpc("drive_quota", {
    uid: session.user.id,
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  // `allowance` comes back NULL for Platinum — unlimited, not zero.
  const allowance =
    row.allowance === null || row.allowance === undefined
      ? null
      : Number(row.allowance);

  return {
    used: Number(row.used ?? 0),
    allowance,
    remaining:
      allowance === null
        ? null
        : Math.max(allowance - Number(row.used ?? 0), 0),
  };
}
