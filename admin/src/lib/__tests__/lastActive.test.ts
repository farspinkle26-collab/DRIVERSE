/**
 * The measured-activity half of `metrics.ts` — the numbers that come off
 * `profiles.last_active_at` rather than off the trip/message/quest proxy.
 *
 * Worth testing because the failure mode is silent: a NULL treated as "old"
 * rather than "unknown" turns every pre-migration account into a churned user
 * and quietly halves the reported DAU.
 */
import {
  activeUsersMeasured,
  byLastActive,
  hasLastActive,
  lastActiveCoverage,
} from "@/lib/metrics";
import type { ProfileRow } from "@/lib/types";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function profile(id: string, lastActive: string | null): ProfileRow {
  return {
    id,
    name: id,
    role: "customer",
    verification_status: "verified",
    driver_verification_status: null,
    company_verification_status: null,
    country: null,
    created_at: ago(90 * DAY),
    verified_at: null,
    last_active_at: lastActive,
  };
}

describe("activeUsersMeasured", () => {
  const roster = [
    profile("just-now", ago(30_000)),
    profile("this-morning", ago(6 * HOUR)),
    profile("three-days", ago(3 * DAY)),
    profile("three-weeks", ago(21 * DAY)),
    profile("last-year", ago(400 * DAY)),
    profile("never", null),
  ];

  it("counts the rolling 24h / 7d / 30d windows", () => {
    expect(activeUsersMeasured(roster, 1, NOW)).toBe(2);
    expect(activeUsersMeasured(roster, 7, NOW)).toBe(3);
    expect(activeUsersMeasured(roster, 30, NOW)).toBe(4);
  });

  it("excludes never-seen users rather than counting them as inactive", () => {
    // The distinction that matters: NULL is "no measurement", which is not
    // evidence of anything. It must not land in any window...
    expect(activeUsersMeasured([profile("never", null)], 30, NOW)).toBe(0);
    // ...and must not be read as an epoch-old timestamp either.
    expect(activeUsersMeasured([profile("never", null)], 100_000, NOW)).toBe(0);
  });

  it("ignores an unparseable timestamp", () => {
    expect(activeUsersMeasured([profile("junk", "not a date")], 30, NOW)).toBe(0);
  });

  it("drops timestamps from the future", () => {
    // A device with a wrong clock would otherwise sit in every window at once.
    const future = profile("time-traveller", new Date(NOW.getTime() + DAY).toISOString());
    expect(activeUsersMeasured([future], 1, NOW)).toBe(0);
    expect(activeUsersMeasured([future], 30, NOW)).toBe(0);
  });

  it("includes the boundary exactly", () => {
    expect(activeUsersMeasured([profile("edge", ago(DAY))], 1, NOW)).toBe(1);
    expect(activeUsersMeasured([profile("edge", ago(DAY + 1))], 1, NOW)).toBe(0);
  });
});

describe("lastActiveCoverage / hasLastActive", () => {
  it("reports how much of the roster has ever been measured", () => {
    const rows = [profile("a", ago(HOUR)), profile("b", null), profile("c", ago(60 * DAY))];
    expect(lastActiveCoverage(rows)).toEqual({ measured: 2, total: 3 });
    expect(hasLastActive(rows)).toBe(true);
  });

  it("is empty before the ping has ever run", () => {
    const rows = [profile("a", null), profile("b", null)];
    expect(lastActiveCoverage(rows)).toEqual({ measured: 0, total: 2 });
    // This is the switch that keeps the dashboard on the approximation
    // instead of reporting a confident zero.
    expect(hasLastActive(rows)).toBe(false);
    expect(hasLastActive([])).toBe(false);
  });
});

describe("byLastActive", () => {
  it("sorts most-recent first and never-seen last", () => {
    const rows = [
      profile("old", ago(30 * DAY)),
      profile("never", null),
      profile("recent", ago(HOUR)),
    ];
    expect(byLastActive(rows).map((r) => r.id)).toEqual(["recent", "old", "never"]);
  });

  it("does not mutate its input", () => {
    const rows = [profile("old", ago(30 * DAY)), profile("recent", ago(HOUR))];
    byLastActive(rows);
    expect(rows.map((r) => r.id)).toEqual(["old", "recent"]);
  });
});
