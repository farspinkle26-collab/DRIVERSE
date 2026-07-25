import "server-only";

// Per-post enrichment. Every step is idempotent — safe to rerun. Model calls go
// through llm.ts; when no API key is configured each step falls back to a
// deterministic, numbers-grounded result so the pipeline never produces dead
// output. Nothing here fabricates a category or a number.

import {
  PILLARS,
  PILLAR_LABELS,
  PILLAR_JOB,
  type Pillar,
  type Post,
} from "./types";
import { pillarStats } from "./metrics";
import { llmAvailable, llmJSON, llmText, llmVision, type LlmImage } from "./llm";

const SETTLE_DAYS = 2;

/** A post's metrics have "settled" enough to write a Takeaway. */
export function isSettled(post: Post, now = new Date()): boolean {
  if (!(post.frontmatter.views > 0)) return false;
  const d = new Date(post.frontmatter.date + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const ageDays = (now.getTime() - d.getTime()) / 86400000;
  return ageDays >= SETTLE_DAYS;
}

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}
function ratio(a: number, b: number): string {
  if (b === 0) return a > 0 ? "∞×" : "—";
  return `${(a / b).toFixed(2)}×`;
}

// ── Classification (constrained to the 5 known pillars) ─────────────────────
export interface Classification {
  pillar: Pillar | null;
  format: string;
  fits_cleanly: boolean;
  note?: string;
}

export async function classify(post: Post): Promise<Classification> {
  const fm = post.frontmatter;
  if (!llmAvailable()) {
    // Deterministic: keep whatever is already set; never invent a pillar.
    return {
      pillar: fm.pillar,
      format: fm.format || "",
      fits_cleanly: fm.pillar != null,
      note: fm.pillar == null ? "No API key — left unclassified (manual set required)." : undefined,
    };
  }
  const system =
    "You classify a Driveverse short-form video into exactly one of five FIXED " +
    "content pillars. Never invent a new pillar. If it doesn't fit one cleanly, " +
    "set fits_cleanly=false and pick the closest.\n\n" +
    "Pillars:\n" +
    "- garagey: Pokédex/index-card style car showcase (our proven format)\n" +
    "- pov_daily: everyday first-person driving/ownership POV\n" +
    "- fake_scripted_pov: scripted/acted comedic skit in POV form\n" +
    "- ai_supercars: AI/deepfake supercar renders, reach-only, no app shown\n" +
    "- tips_tricks: how-to / listicle / feature explainer\n\n" +
    'Respond as JSON: {"pillar": <one of the five ids>, "format": <short label e.g. "car showcase"|"narrative"|"listicle"|"ai render">, "fits_cleanly": <bool>, "note": <short reason if it does not fit cleanly>}';
  const prompt =
    `Caption: ${fm.caption || post.body.caption || "(none)"}\n` +
    `On-screen text: ${post.body.onScreenText || "(none)"}\n` +
    `Transcript: ${post.body.transcript || "(none)"}\n` +
    `Script: ${post.body.script || "(none)"}\n` +
    `Feature shown: ${fm.feature_shown}`;
  try {
    const j = await llmJSON<Classification>(system, prompt);
    const pillar = PILLARS.includes(j.pillar as Pillar) ? (j.pillar as Pillar) : null;
    return {
      pillar,
      format: (j.format || fm.format || "").toString().slice(0, 40),
      fits_cleanly: !!j.fits_cleanly && pillar != null,
      note: j.note ? String(j.note).slice(0, 240) : undefined,
    };
  } catch (e) {
    return {
      pillar: fm.pillar,
      format: fm.format,
      fits_cleanly: fm.pillar != null,
      note: `Classification failed: ${(e as Error).message}`,
    };
  }
}

// ── Takeaway (grounded in this pillar's distribution) ───────────────────────
function groundingFacts(post: Post, posts: Post[]): { facts: string; pillar: Pillar | null } {
  const fm = post.frontmatter;
  const pillar = fm.pillar;
  if (!pillar) return { facts: "Post is unclassified — cannot compare against a pillar baseline.", pillar: null };
  const s = pillarStats(posts, pillar);
  const job = PILLAR_JOB[pillar];
  const lines = [
    `Pillar: ${PILLAR_LABELS[pillar]} (job = ${job === "reach" ? "reach-only, no app shown; judge on reach/follows, not saves/organic" : "growth: saves + organic curiosity matter"}).`,
    `Baseline is this pillar only, n=${s.n} posts (reposts excluded).`,
    `This post: views ${fm.views.toLocaleString()}, save rate ${pct(fm.save_rate, 2)}, hold rate ${pct(fm.hold_rate)}, engagement ${pct(fm.engagement_rate)}, new follows ${fm.new_follows}.`,
    `This post comments: ${fm.comments_organic_pickup} organic pickups vs ${fm.comments_seeded} seeded.`,
    `Pillar save-rate: median ${pct(s.saveRateMedian, 2)} (Q1 ${pct(s.saveRateQ1, 2)}, Q3 ${pct(s.saveRateQ3, 2)}). This post is ${ratio(fm.save_rate, s.saveRateMedian)} the pillar median and ${fm.save_rate >= s.saveRateQ3 ? "at/above Q3" : fm.save_rate <= s.saveRateQ1 ? "at/below Q1" : "mid-pack"}.`,
    `Pillar views median ${Math.round(s.viewsMedian).toLocaleString()} (this post ${ratio(fm.views, s.viewsMedian)}). Pillar hold-rate median ${pct(s.holdRateMedian)}.`,
    `Pillar organic-pickup rate ${pct(s.organicPickupRate)} (organic ${s.organic} / seeded+organic ${s.seeded + s.organic}).`,
  ];
  return { facts: lines.join("\n"), pillar };
}

export async function generateTakeaway(post: Post, posts: Post[]): Promise<string> {
  const { facts, pillar } = groundingFacts(post, posts);
  if (!pillar) return "";
  if (!llmAvailable()) return deterministicTakeaway(post, posts);
  const system =
    "You write a blunt, honest performance Takeaway for one Driveverse post. " +
    "3-6 sentences. EVERY claim must be anchored to the supplied numbers " +
    "(this post vs THIS pillar's medians/quartiles — never account-wide). No " +
    "hype, no hedging. A reach-only pillar (AI Supercars) must be judged on " +
    "reach/follows, not saves. End with exactly one concrete, testable next step.";
  const prompt = `Numbers:\n${facts}\n\nWrite the Takeaway.`;
  try {
    return (await llmText(system, prompt, 700)).trim();
  } catch (e) {
    return deterministicTakeaway(post, posts) + `\n\n_(model unavailable: ${(e as Error).message})_`;
  }
}

/** Numbers-only Takeaway used when no model is configured. */
export function deterministicTakeaway(post: Post, posts: Post[]): string {
  const fm = post.frontmatter;
  if (!fm.pillar) return "";
  const s = pillarStats(posts, fm.pillar);
  const job = PILLAR_JOB[fm.pillar];
  const vsMed = ratio(fm.save_rate, s.saveRateMedian);
  const tier = fm.save_rate >= s.saveRateQ3 ? "top-quartile" : fm.save_rate <= s.saveRateQ1 ? "bottom-quartile" : "mid-pack";
  const sentences: string[] = [];
  if (job === "reach") {
    sentences.push(
      `Reach-only pillar: ${fm.views.toLocaleString()} views (${ratio(fm.views, s.viewsMedian)} the ${PILLAR_LABELS[fm.pillar]} median) with ${fm.new_follows} follows — judge this on reach, not the ${pct(fm.save_rate, 2)} save rate.`,
    );
    sentences.push(
      `Organic pickup is ${fm.comments_organic_pickup} vs ${fm.comments_seeded} seeded, expected for a post that never shows the app.`,
    );
  } else {
    sentences.push(
      `Save rate ${pct(fm.save_rate, 2)} is ${vsMed} the ${PILLAR_LABELS[fm.pillar]} median (${pct(s.saveRateMedian, 2)}), placing it ${tier} for this pillar.`,
    );
    sentences.push(
      `Organic pickup ${fm.comments_organic_pickup} vs ${fm.comments_seeded} seeded (${fm.comments_organic_pickup > fm.comments_seeded ? "earning unprompted curiosity" : "still leaning on seeding"}).`,
    );
    sentences.push(
      `Hold rate ${pct(fm.hold_rate)} against a pillar median of ${pct(s.holdRateMedian)}.`,
    );
  }
  sentences.push(
    `Next step: ${fm.save_rate >= s.saveRateQ3 ? "rerun this exact format/slot with one variable changed to confirm what's driving it" : "test a stronger hook or the proven Sunday-evening Garagey slot for the next post in this pillar"}.`,
  );
  return sentences.join(" ") + "\n\n_(Deterministic Takeaway — no model configured; numbers are exact.)_";
}

// ── Vision reads (on-screen text, transcript assist, retention) ─────────────
export async function readOnScreenText(images: LlmImage[]): Promise<string> {
  if (!llmAvailable()) throw new Error("Vision read requires ANTHROPIC_API_KEY.");
  return llmVision(
    "Transcribe ONLY the on-screen text overlays in these video frames, in reading order. No commentary.",
    "List the on-screen text, one overlay per line.",
    images,
  );
}

export async function readRetention(images: LlmImage[]): Promise<string> {
  if (!llmAvailable()) throw new Error("Vision read requires ANTHROPIC_API_KEY.");
  return llmVision(
    "You read a short-form video retention/audience-retention graph screenshot and summarize the drop-off pattern in plain language for a marketer.",
    "In 2-3 sentences: where does retention hold, where is the biggest drop-off (as a % of the video), and is there a rewatch/loop bump at the end?",
    images,
  );
}

// ── Whole-post enrichment (idempotent) ──────────────────────────────────────
export interface EnrichResult {
  post: Post;
  changed: boolean;
  actions: string[];
}

export async function enrichPost(
  post: Post,
  posts: Post[],
  opts: { forceTakeaway?: boolean; now?: Date } = {},
): Promise<EnrichResult> {
  const now = opts.now ?? new Date();
  const actions: string[] = [];
  const fm = { ...post.frontmatter };
  const body = { ...post.body };
  let changed = false;

  // 1. Classify pillar/format only when unset (don't override human choices).
  if (fm.pillar == null || !fm.format) {
    const c = await classify(post);
    if (c.pillar && c.pillar !== fm.pillar) {
      fm.pillar = c.pillar;
      changed = true;
      actions.push(`classified pillar=${c.pillar}`);
    }
    if (c.format && c.format !== fm.format) {
      fm.format = c.format;
      changed = true;
      actions.push(`set format=${c.format}`);
    }
    if (c.pillar && !c.fits_cleanly && c.note) {
      fm.pillar_fit_flag = c.note;
      changed = true;
      actions.push("flagged: does not fit a pillar cleanly");
    } else if (fm.pillar_fit_flag && c.fits_cleanly) {
      delete fm.pillar_fit_flag;
      changed = true;
    }
  }

  // 2. Takeaway only after metrics settle; regenerate if forced.
  const needTakeaway = (!body.takeaway || opts.forceTakeaway) && isSettled({ ...post, frontmatter: fm }, now);
  if (needTakeaway) {
    const t = await generateTakeaway({ ...post, frontmatter: fm }, posts);
    if (t && t !== body.takeaway) {
      body.takeaway = t;
      fm.enriched_at = now.toISOString();
      changed = true;
      actions.push("generated Takeaway");
    }
  } else if (!body.takeaway && !isSettled(post, now)) {
    actions.push("Takeaway deferred (metrics not settled: needs views + ≥2 days)");
  }

  return { post: { ...post, frontmatter: fm, body }, changed, actions };
}
