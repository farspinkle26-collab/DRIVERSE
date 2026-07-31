/**
 * Priority #5 — Save / Engagement / Hold rate formulas.
 *
 * `computeDerived` recomputes the three rates from raw counters on every read
 * and write (the file's stored rates are never trusted). These are the numbers
 * every content narrative and ranking is anchored to, so they are checked for
 * exact values, the engagement-rate fallback rule, and the divide-by-zero and
 * looping-watch-time edge cases.
 */
import { computeDerived } from "@/lib/content/store";

type Counters = Parameters<typeof computeDerived>[0];

const base: Counters = {
  views: 0,
  likes: 0,
  comments_total: 0,
  saves: 0,
  shares: 0,
  avg_watch_time: 0,
  duration_seconds: 0,
};

describe("computeDerived — save_rate", () => {
  it("is saves / views", () => {
    expect(computeDerived({ ...base, views: 1000, saves: 50 }).save_rate).toBe(
      0.05
    );
  });

  it("rounds to 4 decimal places", () => {
    // 1 / 3 = 0.3333… → 0.3333
    expect(computeDerived({ ...base, views: 3, saves: 1 }).save_rate).toBe(
      0.3333
    );
  });

  it("is 0 when there are no views (no divide-by-zero)", () => {
    expect(computeDerived({ ...base, views: 0, saves: 10 }).save_rate).toBe(0);
  });
});

describe("computeDerived — engagement_rate", () => {
  it("uses the platform's own `engagements` total when it was entered", () => {
    // 300 interactions / 1000 views = 0.30, ignoring the component sum.
    const d = computeDerived({
      ...base,
      views: 1000,
      engagements: 300,
      likes: 1,
      comments_total: 1,
      saves: 1,
      shares: 1,
    });
    expect(d.engagement_rate).toBe(0.3);
  });

  it("falls back to summing likes+comments+saves+shares when engagements is 0", () => {
    // (40 + 10 + 20 + 5) / 1000 = 0.075
    const d = computeDerived({
      ...base,
      views: 1000,
      engagements: 0,
      likes: 40,
      comments_total: 10,
      saves: 20,
      shares: 5,
    });
    expect(d.engagement_rate).toBe(0.075);
  });

  it("also falls back when engagements is missing entirely", () => {
    const d = computeDerived({
      ...base,
      views: 200,
      likes: 10,
      comments_total: 0,
      saves: 0,
      shares: 0,
    });
    expect(d.engagement_rate).toBe(0.05); // 10 / 200
  });

  it("is 0 when there are no views", () => {
    expect(
      computeDerived({ ...base, views: 0, engagements: 500 }).engagement_rate
    ).toBe(0);
  });
});

describe("computeDerived — hold_rate", () => {
  it("is avg_watch_time / duration_seconds", () => {
    expect(
      computeDerived({ ...base, avg_watch_time: 9, duration_seconds: 30 })
        .hold_rate
    ).toBe(0.3);
  });

  it("can exceed 1 for looping watch time (rewatches)", () => {
    // 45s average watch on a 30s clip → 1.5 hold rate, and that's expected.
    expect(
      computeDerived({ ...base, avg_watch_time: 45, duration_seconds: 30 })
        .hold_rate
    ).toBe(1.5);
  });

  it("is 0 when duration is 0 (no divide-by-zero)", () => {
    expect(
      computeDerived({ ...base, avg_watch_time: 10, duration_seconds: 0 })
        .hold_rate
    ).toBe(0);
  });
});

describe("computeDerived — all three together on a realistic post", () => {
  it("returns the correct trio", () => {
    const d = computeDerived({
      views: 12_500,
      likes: 800,
      comments_total: 120,
      saves: 640,
      shares: 90,
      engagements: 0,
      avg_watch_time: 7.5,
      duration_seconds: 15,
    });
    expect(d.save_rate).toBe(0.0512); // 640 / 12500
    expect(d.engagement_rate).toBe(0.132); // (800+120+640+90) / 12500 = 0.132
    expect(d.hold_rate).toBe(0.5); // 7.5 / 15
  });
});
