/**
 * Priority #5 — content aggregate stats over the rate fields.
 *
 * The dashboard's takeaways and rankings are grounded in these pure aggregates
 * (median/quantile of save/hold/engagement rates per pillar, the analysis
 * population rules, and the organic-pickup ratio). A wrong aggregate quietly
 * misdirects the whole "what works" learning loop, so the maths and the
 * exclusion rules are pinned down here.
 */
import {
  analysisPosts,
  median,
  pillarStats,
  periodTotals,
  quantile,
  rankablePosts,
  sum,
} from "@/lib/content/metrics";
import type { Pillar, Post, PostFrontmatter } from "@/lib/content/types";

function post(fm: Partial<PostFrontmatter>, slug = "s"): Post {
  return {
    slug,
    body: {
      script: "",
      transcript: "",
      onScreenText: "",
      caption: "",
      takeaway: "",
      retention: "",
      extra: "",
    },
    frontmatter: {
      status: "published",
      platform: "instagram",
      post_id: "",
      permalink: "",
      title: "",
      date: "2026-07-01",
      time: "18:00",
      weekday: "Wednesday",
      pillar: "garagey",
      format: "",
      feature_shown: "none",
      hashtags: "",
      link_instagram: "",
      link_tiktok: "",
      duration_seconds: 15,
      views: 1000,
      reach: 1000,
      likes: 0,
      comments_total: 0,
      comments_seeded: 0,
      comments_organic_pickup: 0,
      saves: 0,
      shares: 0,
      engagements: 0,
      avg_watch_time: 0,
      new_follows: 0,
      save_rate: 0,
      engagement_rate: 0,
      hold_rate: 0,
      ...fm,
    },
  };
}

describe("median", () => {
  it("is the middle of an odd-length set", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middles of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("is 0 for an empty set", () => {
    expect(median([])).toBe(0);
  });
  it("does not mutate its input", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("quantile (linear interpolation)", () => {
  it("returns the bounds at q=0 and q=1", () => {
    expect(quantile([10, 20, 30, 40], 0)).toBe(10);
    expect(quantile([10, 20, 30, 40], 1)).toBe(40);
  });
  it("interpolates Q1 / Q3", () => {
    // positions 0.75 and 2.25 into [10,20,30,40]
    expect(quantile([10, 20, 30, 40], 0.25)).toBeCloseTo(17.5, 6);
    expect(quantile([10, 20, 30, 40], 0.75)).toBeCloseTo(32.5, 6);
  });
  it("is 0 for an empty set", () => {
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("sum", () => {
  it("adds up (and is 0 for empty)", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
  });
});

describe("analysisPosts / rankablePosts — the population rules", () => {
  it("excludes reposts and non-published posts from analysis", () => {
    const posts = [
      post({ status: "published" }, "a"),
      post({ status: "scheduled" }, "b"),
      post({ status: "published", is_repost: true }, "c"),
    ];
    expect(analysisPosts(posts).map((p) => p.slug)).toEqual(["a"]);
  });

  it("rankable also requires clearing the min-views floor (500)", () => {
    const posts = [
      post({ views: 499 }, "low"),
      post({ views: 500 }, "at"),
      post({ views: 5000 }, "high"),
    ];
    expect(rankablePosts(posts).map((p) => p.slug).sort()).toEqual([
      "at",
      "high",
    ]);
  });
});

describe("pillarStats — rate distributions per pillar", () => {
  it("computes the median/Q1/Q3 of save_rate over a pillar's analysis posts", () => {
    const pillar: Pillar = "garagey";
    const posts = [
      post({ pillar, save_rate: 0.02, hold_rate: 0.4, engagement_rate: 0.1 }, "a"),
      post({ pillar, save_rate: 0.04, hold_rate: 0.6, engagement_rate: 0.2 }, "b"),
      post({ pillar, save_rate: 0.06, hold_rate: 0.8, engagement_rate: 0.3 }, "c"),
      // a different pillar must not leak in:
      post({ pillar: "pov_daily", save_rate: 0.99 }, "x"),
    ];
    const s = pillarStats(posts, pillar);
    expect(s.n).toBe(3);
    expect(s.saveRateMedian).toBeCloseTo(0.04, 6);
    expect(s.saveRateQ1).toBeCloseTo(0.03, 6);
    expect(s.saveRateQ3).toBeCloseTo(0.05, 6);
    expect(s.holdRateMedian).toBeCloseTo(0.6, 6);
    expect(s.engagementMedian).toBeCloseTo(0.2, 6);
  });

  it("computes organic-pickup rate = organic / (seeded + organic)", () => {
    const pillar: Pillar = "garagey";
    const posts = [
      post({ pillar, comments_seeded: 3, comments_organic_pickup: 1 }, "a"),
      post({ pillar, comments_seeded: 1, comments_organic_pickup: 5 }, "b"),
    ];
    const s = pillarStats(posts, pillar);
    // seeded 4, organic 6 → 6 / 10 = 0.6
    expect(s.seeded).toBe(4);
    expect(s.organic).toBe(6);
    expect(s.organicPickupRate).toBeCloseTo(0.6, 6);
  });

  it("reports a 0 organic-pickup rate when no comments were asked for (no NaN)", () => {
    const s = pillarStats([post({ pillar: "garagey" }, "a")], "garagey");
    expect(s.organicPickupRate).toBe(0);
  });
});

describe("periodTotals", () => {
  it("sums the raw counters across a period", () => {
    const rows = [
      post({ views: 1000, saves: 50, new_follows: 5 }, "a"),
      post({ views: 2000, saves: 30, new_follows: 8 }, "b"),
    ];
    const t = periodTotals(rows);
    expect(t.posts).toBe(2);
    expect(t.views).toBe(3000);
    expect(t.saves).toBe(80);
    expect(t.follows).toBe(13);
  });
});
