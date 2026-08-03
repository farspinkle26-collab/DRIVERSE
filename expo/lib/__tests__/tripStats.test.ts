/**
 * Priority #3 — trip readouts, drive score, and drive XP.
 *
 * These turn a recorded trip's stored numbers into what the Drive Hub shows
 * and the XP a drive awards (lib/tripStats.ts). Covers formatting boundaries,
 * the score penalty bands, and the XP scaling with distance / pace / ETA.
 */
import {
  calculateDriveXP,
  driveScore,
  driveScoreBreakdown,
  formatDistance,
  formatDuration,
  formatShareStamp,
  formatSpeed,
  type TripLike,
} from "@/lib/tripStats";

describe("formatDistance", () => {
  it("shows one decimal below 100 km", () => {
    expect(formatDistance(42.63)).toEqual({ value: "42.6", unit: "km" });
    expect(formatDistance(0)).toEqual({ value: "0.0", unit: "km" });
  });

  it("drops the decimal at/above 100 km", () => {
    expect(formatDistance(100).value).toBe("100");
    expect(formatDistance(153.9).value).toBe("154");
  });

  it("clamps negatives and non-finite input to 0", () => {
    expect(formatDistance(-5).value).toBe("0.0");
    expect(formatDistance(NaN).value).toBe("0.0");
    expect(formatDistance(Infinity).value).toBe("0.0");
  });
});

describe("formatDuration", () => {
  it("formats sub-hour as m:s", () => {
    expect(formatDuration(461)).toEqual({ value: "07:41", unit: "m:s" });
  });

  it("formats hour-plus as h:m:s", () => {
    expect(formatDuration(3862)).toEqual({ value: "1:04:22", unit: "h:m:s" });
  });

  it("rounds seconds and floors negatives to zero", () => {
    expect(formatDuration(0).value).toBe("00:00");
    expect(formatDuration(-10).value).toBe("00:00");
    expect(formatDuration(NaN).value).toBe("00:00");
  });
});

describe("formatSpeed", () => {
  it("rounds to a whole km/h", () => {
    expect(formatSpeed(72.6)).toEqual({ value: "73", unit: "km/h" });
  });

  it("clamps negatives / non-finite to 0", () => {
    expect(formatSpeed(-3).value).toBe("0");
    expect(formatSpeed(Infinity).value).toBe("0");
  });
});

describe("driveScoreBreakdown", () => {
  it("scores a clean, steady commute in the 90s", () => {
    const trip: TripLike = {
      distance_km: 20,
      duration_seconds: 1800,
      avg_speed_kmh: 40,
      top_speed_kmh: 55, // spread 1.375× — under the 1.6 free band
    };
    const s = driveScoreBreakdown(trip);
    expect(s.score).toBeGreaterThanOrEqual(90);
    expect(s.penalties).toEqual({ smoothness: 0, pace: 0, speed: 0 });
  });

  it("penalises a big speed spread (hard accel/braking)", () => {
    const trip: TripLike = {
      distance_km: 30,
      duration_seconds: 1800,
      avg_speed_kmh: 40,
      top_speed_kmh: 100, // spread 2.5× → (2.5-1.6)*50 = 45 → clamped to 30
    };
    const s = driveScoreBreakdown(trip);
    expect(s.penalties.smoothness).toBe(30);
  });

  it("penalises top speed above 120 km/h", () => {
    const trip: TripLike = {
      distance_km: 50,
      duration_seconds: 1800,
      avg_speed_kmh: 100,
      top_speed_kmh: 140, // (140-120)*0.5 = 10 points
    };
    expect(driveScoreBreakdown(trip).penalties.speed).toBe(10);
  });

  it("penalises pace only when an estimate was recorded", () => {
    const base: TripLike = {
      distance_km: 20,
      duration_seconds: 2200, // 10% over a 2000s estimate → 5 pts
      avg_speed_kmh: 40,
      top_speed_kmh: 55,
      estimated_duration_seconds: 2000,
    };
    expect(driveScoreBreakdown(base).penalties.pace).toBe(5);
    // No estimate → no pace penalty even if slow.
    const noEstimate = { ...base, estimated_duration_seconds: null };
    expect(driveScoreBreakdown(noEstimate).penalties.pace).toBe(0);
  });

  it("never leaves the 0..100 range and handles empty/garbage telemetry", () => {
    const empty: TripLike = {
      distance_km: 0,
      duration_seconds: 0,
      avg_speed_kmh: 0,
      top_speed_kmh: null,
    };
    const s = driveScore(empty);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBe(100); // no penalties derivable → top score
  });
});

describe("calculateDriveXP", () => {
  it("scales primarily with distance (~2000 XP/km at moderate pace)", () => {
    // 10 km in 15 min → 40 km/h. distance 20000 + time 450, ×(40/45≈0.889).
    const xp = calculateDriveXP({
      distanceMeters: 10_000,
      durationSeconds: 900,
    });
    expect(xp).toBeGreaterThan(15_000);
    expect(xp).toBeLessThan(22_000);
  });

  it("awards a longer drive strictly more than a short one", () => {
    const short = calculateDriveXP({ distanceMeters: 2_000, durationSeconds: 300 });
    const long = calculateDriveXP({ distanceMeters: 40_000, durationSeconds: 2_400 });
    expect(long).toBeGreaterThan(short);
  });

  it("returns 0 for a non-drive (no distance or no time)", () => {
    expect(calculateDriveXP({ distanceMeters: 0, durationSeconds: 600 })).toBe(0);
    expect(calculateDriveXP({ distanceMeters: 5_000, durationSeconds: 0 })).toBe(0);
  });

  it("floors any real drive at 5 XP", () => {
    // A tiny crawl still earns the floor, never 0.
    const xp = calculateDriveXP({ distanceMeters: 1, durationSeconds: 1 });
    expect(xp).toBeGreaterThanOrEqual(5);
  });

  it("clamps pace so a GPS blip can't produce absurd XP", () => {
    // 100 km in 60 s implies 6000 km/h; pace multiplier is capped at 2.2.
    const blip = calculateDriveXP({ distanceMeters: 100_000, durationSeconds: 60 });
    const distanceXp = 100 * 2000;
    const timeXp = 1 * 30;
    expect(blip).toBeLessThanOrEqual(Math.round((distanceXp + timeXp) * 2.2) + 1);
  });

  it("adds an ETA bonus when a routed destination is beaten", () => {
    const beaten = calculateDriveXP({
      distanceMeters: 10_000,
      durationSeconds: 900,
      estimatedDurationSeconds: 1_800, // arrived in half the ETA
    });
    const noBonus = calculateDriveXP({
      distanceMeters: 10_000,
      durationSeconds: 900,
    });
    expect(beaten).toBeGreaterThan(noBonus);
  });

  it("gives no ETA bonus when the drive was slower than the estimate", () => {
    const withEstimate = calculateDriveXP({
      distanceMeters: 10_000,
      durationSeconds: 1_800,
      estimatedDurationSeconds: 900, // took longer than ETA
    });
    const withoutEstimate = calculateDriveXP({
      distanceMeters: 10_000,
      durationSeconds: 1_800,
    });
    expect(withEstimate).toBe(withoutEstimate);
  });
});

describe("formatShareStamp", () => {
  it("stamps an absolute date and 24-hour time", () => {
    // Constructed from local parts so the assertion does not depend on the
    // machine's timezone — the stamp is deliberately local, like the clock the
    // driver read when they finished.
    const d = new Date(2026, 7, 3, 16, 17, 42);
    expect(formatShareStamp(d.toISOString())).toBe("03 AUG 2026 · 16:17");
  });

  it("zero-pads the day and the clock", () => {
    const d = new Date(2026, 0, 9, 7, 5, 0);
    expect(formatShareStamp(d.toISOString())).toBe("09 JAN 2026 · 07:05");
  });

  it("returns nothing for a date it cannot read, rather than 'Invalid Date'", () => {
    expect(formatShareStamp("not a date")).toBe("");
    expect(formatShareStamp("")).toBe("");
  });
});
