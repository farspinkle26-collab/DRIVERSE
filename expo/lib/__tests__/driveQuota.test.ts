/**
 * The Regular tier's monthly drive allowance — the pure half.
 *
 * This gates the app's CORE action, so the two directions matter equally: a
 * wrong `true` locks a paying driver out of driving, a wrong `false` gives
 * the tier away. The `null` cases are the ones worth being explicit about —
 * unlimited and unknown are both "don't block", but for different reasons.
 */

// The module under test also exports `fetchDriveQuota`, which pulls in the
// Supabase client (and through it AsyncStorage) at import time. Only the pure
// rules are exercised here, so the client is stubbed rather than the rules
// being moved somewhere they'd be further from what they guard.
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  driveQuotaLabel,
  isOutOfDrives,
  monthResetLabel,
  UNLIMITED_DRIVES,
  type DriveQuota,
} from "@/lib/driveQuota";

const regular = (used: number, allowance = 5): DriveQuota => ({
  used,
  allowance,
  remaining: Math.max(allowance - used, 0),
});

describe("isOutOfDrives", () => {
  it("blocks a Regular driver only once all 5 are used", () => {
    expect(isOutOfDrives(regular(0))).toBe(false);
    expect(isOutOfDrives(regular(4))).toBe(false);
    expect(isOutOfDrives(regular(5))).toBe(true);
    // Over the cap (a drive that slipped through a race) still blocks.
    expect(isOutOfDrives(regular(6))).toBe(true);
  });

  it("never blocks an unlimited (Platinum) allowance", () => {
    expect(isOutOfDrives(UNLIMITED_DRIVES)).toBe(false);
    expect(isOutOfDrives({ used: 900, allowance: null, remaining: null })).toBe(false);
  });

  it("does not block on an UNKNOWN quota — offline, or no migration yet", () => {
    // The most important case in this file. A failed RPC must not take the
    // DRIVE button away; the database trigger is what stops that being a
    // loophole worth exploiting.
    expect(isOutOfDrives(null)).toBe(false);
  });

  it("blocks immediately on a zero allowance, without a special case", () => {
    expect(isOutOfDrives({ used: 0, allowance: 0, remaining: 0 })).toBe(true);
  });
});

describe("driveQuotaLabel", () => {
  it("counts down what is left, not what is used", () => {
    expect(driveQuotaLabel(regular(0))).toBe("5 of 5 drives left this month");
    expect(driveQuotaLabel(regular(3))).toBe("2 of 5 drives left this month");
  });

  it("says nothing for an unlimited or unknown quota", () => {
    // Platinum drivers must not see a cap counter at all.
    expect(driveQuotaLabel(UNLIMITED_DRIVES)).toBeNull();
    expect(driveQuotaLabel(null)).toBeNull();
  });

  it("floors at zero rather than showing a negative count", () => {
    expect(driveQuotaLabel(regular(5))).toBe("0 of 5 drives left this month");
    expect(driveQuotaLabel(regular(7))).toBe("0 of 5 drives left this month");
  });
});

describe("monthResetLabel", () => {
  it("names the 1st of the following month", () => {
    const label = monthResetLabel(new Date(2026, 7, 11)); // 11 Aug 2026
    expect(label).toContain("1");
    expect(label).toContain("Sep");
  });

  it("rolls the year over from December", () => {
    const label = monthResetLabel(new Date(2026, 11, 31)); // 31 Dec 2026
    expect(label).toContain("1");
    expect(label).toContain("Jan");
  });
});
