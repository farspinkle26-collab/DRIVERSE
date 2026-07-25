import "server-only";

// The "Next 2 Weeks" strategy card. This is the SCHEDULING-level recommendation
// (which pillar to weight up/down, what day/time to test, what to graduate or
// drop) — deliberately separate from what-works.md's tactical rules. The
// structured recommendation is computed deterministically so the UI always has
// something real; an optional model pass adds a short narrative on top.

import {
  PILLARS,
  PILLAR_LABELS,
  PILLAR_JOB,
  type Pillar,
  type Post,
} from "./types";
import {
  analysisPosts,
  pillarStats,
  groupBy,
  daypartOf,
  inLastDays,
  inPrevDays,
} from "./metrics";
import { llmAvailable, llmText } from "./llm";

const GRADUATE_MIN_N = 4; // posts needed before a testing pillar can graduate

export type PillarVerdict = "core" | "keep testing" | "weight up" | "weight down" | "consider dropping" | "insufficient data";

export interface PillarRecommendation {
  pillar: Pillar;
  label: string;
  job: "growth" | "reach";
  n: number;
  organicThis: number;
  organicPrev: number;
  organicTrend: "up" | "down" | "flat" | "n/a";
  saveRateMedian: number;
  viewsMedian: number;
  verdict: PillarVerdict;
  reason: string;
}

export interface StrategyCard {
  generatedAt: string;
  pillars: PillarRecommendation[];
  testSlot: { weekday: string; note: string } | null;
  headline: string;
  narrative: string; // model prose or deterministic summary
}

function organicRate(posts: Post[]): number {
  const seeded = posts.reduce((s, p) => s + p.frontmatter.comments_seeded, 0);
  const organic = posts.reduce((s, p) => s + p.frontmatter.comments_organic_pickup, 0);
  return seeded + organic > 0 ? organic / (seeded + organic) : 0;
}

export function computeStrategy(posts: Post[], now = new Date()): Omit<StrategyCard, "narrative"> {
  const pool = analysisPosts(posts);
  const recs: PillarRecommendation[] = [];

  for (const pillar of PILLARS) {
    const rows = pool.filter((p) => p.frontmatter.pillar === pillar);
    if (rows.length === 0) continue;
    const s = pillarStats(posts, pillar);
    const thisWin = rows.filter((p) => inLastDays(p.frontmatter.date, 14, now));
    const prevWin = rows.filter((p) => inPrevDays(p.frontmatter.date, 14, now));
    const organicThis = organicRate(thisWin);
    const organicPrev = organicRate(prevWin);
    let trend: PillarRecommendation["organicTrend"] = "n/a";
    if (thisWin.length && prevWin.length) {
      const d = organicThis - organicPrev;
      trend = Math.abs(d) < 0.03 ? "flat" : d > 0 ? "up" : "down";
    }
    const job = PILLAR_JOB[pillar];

    let verdict: PillarVerdict;
    let reason: string;
    if (s.n < 2) {
      verdict = "insufficient data";
      reason = `Only ${s.n} post(s) — need ≥${GRADUATE_MIN_N} to judge.`;
    } else if (job === "reach") {
      // Reach pillar: judge on views, never organic/saves.
      verdict = s.viewsMedian > 0 && s.n >= GRADUATE_MIN_N ? "core" : "keep testing";
      reason = `Reach-only: median ${Math.round(s.viewsMedian).toLocaleString()} views. Keep for top-of-funnel; ignore its low save/organic by design.`;
    } else if (s.organicPickupRate >= 0.6 && s.n >= GRADUATE_MIN_N) {
      verdict = "core";
      reason = `Earning real organic curiosity (${(s.organicPickupRate * 100).toFixed(0)}% of asks unprompted) with enough volume — graduate to core rotation.`;
    } else if (trend === "up" || s.organicPickupRate >= 0.55) {
      verdict = "weight up";
      reason = `Organic pickup ${trend === "up" ? "rising" : "healthy"} (${(s.organicPickupRate * 100).toFixed(0)}%). Give it more slots to reach graduation volume.`;
    } else if (s.organicPickupRate < 0.35 && (trend === "down" || trend === "flat")) {
      verdict = s.n >= GRADUATE_MIN_N ? "consider dropping" : "weight down";
      reason = `Low organic pickup (${(s.organicPickupRate * 100).toFixed(0)}%)${trend === "down" ? " and falling" : ""} — may be working on seeding alone.`;
    } else {
      verdict = "keep testing";
      reason = `Middle of the pack (organic ${(s.organicPickupRate * 100).toFixed(0)}%); not enough signal to graduate or drop.`;
    }

    recs.push({
      pillar,
      label: PILLAR_LABELS[pillar],
      job,
      n: s.n,
      organicThis,
      organicPrev,
      organicTrend: trend,
      saveRateMedian: s.saveRateMedian,
      viewsMedian: s.viewsMedian,
      verdict,
      reason,
    });
  }

  // Next day/time to TEST = best weekday×daypart we have the least coverage of,
  // biased toward the strongest observed day. Simple heuristic: take the best
  // weekday by save rate and suggest a daypart we've under-used there.
  const byWeekday = groupBy(posts, (p) => p.frontmatter.weekday);
  let testSlot: { weekday: string; note: string } | null = null;
  if (byWeekday.length) {
    const bestDay = byWeekday[0].key;
    const dpartsUsed = new Set<string>(
      pool
        .filter((p) => p.frontmatter.weekday === bestDay)
        .map((p) => daypartOf(p.frontmatter.time)),
    );
    const candidate =
      ["Evening", "Midday", "Morning", "Afternoon", "Night"].find((d) => !dpartsUsed.has(d)) ??
      "a second daypart";
    testSlot = {
      weekday: bestDay,
      note: `${bestDay} is the strongest day (save ${(byWeekday[0].saveRateMedian * 100).toFixed(1)}%). You haven't tested the ${candidate} slot there — try it next.`,
    };
  }

  const weightUp = recs.filter((r) => r.verdict === "weight up" || r.verdict === "core");
  const drop = recs.filter((r) => r.verdict === "consider dropping");
  const headline =
    (weightUp[0] ? `Weight up ${weightUp[0].label}` : "Hold the current mix") +
    (drop[0] ? `; reassess ${drop[0].label}` : "") +
    (testSlot ? `; test the ${testSlot.weekday} ${/Evening|Midday|Morning|Afternoon|Night/.exec(testSlot.note)?.[0] ?? ""} slot` : "");

  return { generatedAt: new Date().toISOString(), pillars: recs, testSlot, headline };
}

function deterministicNarrative(s: Omit<StrategyCard, "narrative">): string {
  const lines = [s.headline + "."];
  for (const r of s.pillars) {
    lines.push(`• ${r.label} — ${r.verdict}: ${r.reason}`);
  }
  if (s.testSlot) lines.push(`• Scheduling test: ${s.testSlot.note}`);
  return lines.join("\n");
}

export async function generateStrategy(posts: Post[], now = new Date()): Promise<StrategyCard> {
  const core = computeStrategy(posts, now);
  if (!llmAvailable() || core.pillars.length === 0) {
    return { ...core, narrative: deterministicNarrative(core) };
  }
  const facts = core.pillars
    .map(
      (r) =>
        `${r.label} [${r.job}]: n=${r.n}, organic-pickup this-14d ${(r.organicThis * 100).toFixed(0)}% vs prev ${(r.organicPrev * 100).toFixed(0)}% (${r.organicTrend}), save-median ${(r.saveRateMedian * 100).toFixed(2)}%, views-median ${Math.round(r.viewsMedian).toLocaleString()}, computed verdict: ${r.verdict}.`,
    )
    .join("\n");
  const system =
    "You are Driveverse's content strategist writing a 'Next 2 Weeks' scheduling " +
    "recommendation (NOT tactical post rules). Using the per-pillar verdicts and " +
    "organic-pickup trend, say in 4-6 sentences: which pillar to weight up and " +
    "which to weight down/drop, which day+time to test next, and whether any " +
    "pillar has enough data to graduate from testing to core rotation (or be " +
    "dropped). Organic pickup trend is the primary signal. AI Supercars is " +
    "reach-only — never penalise its saves. Ground every call in the numbers.";
  const prompt = `Per-pillar (computed):\n${facts}\n\nTest slot: ${core.testSlot?.note ?? "n/a"}\n\nWrite the recommendation.`;
  try {
    const narrative = await llmText(system, prompt, 900);
    return { ...core, narrative: narrative.trim() };
  } catch {
    return { ...core, narrative: deterministicNarrative(core) };
  }
}
