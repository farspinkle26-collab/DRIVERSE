import "server-only";

// The learning loop. Aggregates the settled post set (reposts excluded, a
// min-views floor on any ranking) and writes ONLY the auto-fenced section of
// what-works.md. Hand-written prose outside the fence is never touched.

import { PILLAR_LABELS, PILLAR_JOB, type Post } from "./types";
import {
  allPillarStats,
  groupBy,
  topBySaveRate,
  daypartOf,
  platformLabel,
  type PillarStats,
} from "./metrics";
import { writeWhatWorksAuto } from "./store";
import { llmAvailable, llmText } from "./llm";

export interface Aggregates {
  generatedAt: string;
  pillars: PillarStats[];
  byFormat: ReturnType<typeof groupBy>;
  byFeature: ReturnType<typeof groupBy>;
  byWeekday: ReturnType<typeof groupBy>;
  byPlatform: ReturnType<typeof groupBy>;
  byDaypart: ReturnType<typeof groupBy>;
  topPosts: { slug: string; pillar: string; saveRate: number; views: number }[];
}

export function buildAggregates(posts: Post[]): Aggregates {
  return {
    generatedAt: new Date().toISOString(),
    pillars: allPillarStats(posts),
    byFormat: groupBy(posts, (p) => p.frontmatter.format),
    byFeature: groupBy(posts, (p) => p.frontmatter.feature_shown),
    byWeekday: groupBy(posts, (p) => p.frontmatter.weekday),
    byPlatform: groupBy(posts, (p) => platformLabel(p.frontmatter.platform)),
    byDaypart: groupBy(posts, (p) => daypartOf(p.frontmatter.time)),
    topPosts: topBySaveRate(posts, { limit: 5 }).map((p) => ({
      slug: p.slug,
      pillar: p.frontmatter.pillar ? PILLAR_LABELS[p.frontmatter.pillar] : "—",
      saveRate: p.frontmatter.save_rate,
      views: p.frontmatter.views,
    })),
  };
}

const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

/** A compact, numbers-only facts block — the grounding for the model (and the
 *  literal fallback when no model is configured). */
export function aggregatesFacts(a: Aggregates): string {
  const lines: string[] = [];
  lines.push("SEEDED vs ORGANIC PICKUP by pillar (the key strategic number):");
  for (const s of a.pillars) {
    lines.push(
      `  ${PILLAR_LABELS[s.pillar]} [${PILLAR_JOB[s.pillar]}]: organic-pickup rate ${pct(s.organicPickupRate)} (${s.organic} organic / ${s.seeded + s.organic} total asks), n=${s.n}, save-rate median ${pct(s.saveRateMedian, 2)}, views median ${Math.round(s.viewsMedian).toLocaleString()}.`,
    );
  }
  const grp = (title: string, g: ReturnType<typeof groupBy>) => {
    lines.push(`${title} (by save-rate median):`);
    for (const r of g.slice(0, 6)) {
      lines.push(`  ${r.key}: save ${pct(r.saveRateMedian, 2)}, views ${Math.round(r.viewsMedian).toLocaleString()}, n=${r.n}, organic ${pct(r.organicPickupRate)}`);
    }
  };
  grp("BY FORMAT", a.byFormat);
  grp("BY FEATURE SHOWN", a.byFeature);
  grp("BY WEEKDAY", a.byWeekday);
  grp("BY PLATFORM", a.byPlatform);
  grp("BY DAYPART", a.byDaypart);
  lines.push("TOP POSTS (save rate, min-views floor, reposts excluded):");
  for (const t of a.topPosts) {
    lines.push(`  ${t.slug} — ${t.pillar} — save ${pct(t.saveRate, 2)}, ${t.views.toLocaleString()} views`);
  }
  return lines.join("\n");
}

/** Deterministic auto-section content (numbers + mechanical rules). */
function deterministicAuto(a: Aggregates): string {
  const facts = aggregatesFacts(a);
  // Rank growth pillars by organic pickup; reach pillars judged on views.
  const growth = a.pillars.filter((p) => PILLAR_JOB[p.pillar] === "growth");
  const bestOrganic = [...growth].sort((x, y) => y.organicPickupRate - x.organicPickupRate)[0];
  const worstOrganic = [...growth].sort((x, y) => x.organicPickupRate - y.organicPickupRate)[0];
  const bestFormat = a.byFormat[0];
  const bestDay = a.byWeekday[0];
  const bestFeature = a.byFeature.find((f) => f.key !== "none") ?? a.byFeature[0];

  const rules: string[] = [];
  if (bestOrganic) rules.push(`Lean into **${PILLAR_LABELS[bestOrganic.pillar]}** — it earns the highest organic pickup (${pct(bestOrganic.organicPickupRate)}), i.e. real unprompted "what app?" asks, not just seeding.`);
  if (bestFormat) rules.push(`Prioritise the **${bestFormat.key}** format (top save-rate median at ${pct(bestFormat.saveRateMedian, 2)}).`);
  if (bestFeature && bestFeature.key !== "none") rules.push(`Posts showing **${bestFeature.key}** save at ${pct(bestFeature.saveRateMedian, 2)} — keep surfacing a concrete feature over pure reach bait.`);
  if (bestDay) rules.push(`**${bestDay.key}** is the strongest posting day so far (save ${pct(bestDay.saveRateMedian, 2)}); protect that slot.`);
  if (worstOrganic && worstOrganic.pillar !== bestOrganic?.pillar) rules.push(`Watch **${PILLAR_LABELS[worstOrganic.pillar]}** — lowest organic pickup among growth pillars (${pct(worstOrganic.organicPickupRate)}); it may be working on seeding alone.`);

  return (
    `_Auto-generated ${a.generatedAt.slice(0, 10)} by the learning loop. Numbers exact; regenerated each run. (No model configured — mechanical rules from the aggregates below.)_\n\n` +
    `### Numbers\n\n\`\`\`\n${facts}\n\`\`\`\n\n` +
    `### Rules\n\n` +
    rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
  );
}

export async function buildAutoSection(posts: Post[]): Promise<string> {
  const a = buildAggregates(posts);
  if (a.pillars.length === 0) {
    return `_No settled, non-repost posts to analyse yet (run after posts have metrics)._`;
  }
  if (!llmAvailable()) return deterministicAuto(a);

  const system =
    "You are a growth analyst for Driveverse's organic short-form marketing. " +
    "Write a tight, numbers-grounded analysis of what is working, then 3-5 " +
    "concrete, actionable RULES. Anchor every claim to the supplied aggregates. " +
    "The single most important signal is SEEDED vs ORGANIC pickup by pillar: " +
    "which pillars earn real unprompted curiosity vs only working because of " +
    "seeding. Remember AI Supercars is reach-only (no app shown) — judge it on " +
    "reach/follows, never saves/organic. Output GitHub-flavoured Markdown with a " +
    "short prose section then a numbered '### Rules' list. Do not invent numbers.";
  const prompt = `Aggregates:\n${aggregatesFacts(buildAggregates(posts))}\n\nWrite the analysis + rules.`;
  try {
    const body = await llmText(system, prompt, 1500);
    return `_Auto-generated ${a.generatedAt.slice(0, 10)} by the learning loop._\n\n${body.trim()}`;
  } catch (e) {
    return deterministicAuto(a) + `\n\n_(model unavailable: ${(e as Error).message})_`;
  }
}

/** Regenerate + persist the auto-fenced section of what-works.md. */
export async function regenerateWhatWorks(posts: Post[]): Promise<string> {
  const auto = await buildAutoSection(posts);
  await writeWhatWorksAuto(auto);
  return auto;
}
