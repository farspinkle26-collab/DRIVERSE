import "server-only";

// Scriptor: topic + notes -> structured Markdown script. It injects our own
// learned data (what-works.md, the top posts by save rate for the target
// pillar, and the last few hooks so we don't repeat ourselves). The model is
// told NEVER to fabricate specific numbers/claims — real data goes in via the
// injected context, and anything it doesn't have becomes a [FILL: ...]
// placeholder. Without an API key it returns a grounded scaffold so the page
// still produces something useful.

import { PILLAR_LABELS, type Pillar, type Post } from "./types";
import { topBySaveRate } from "./metrics";
import { readWhatWorks } from "./store";
import { llmAvailable, llmText } from "./llm";

export interface ScriptRequest {
  topic: string;
  notes?: string;
  pillar?: Pillar;
}

export interface ScriptResult {
  markdown: string;
  usedModel: boolean;
  exemplars: { slug: string; saveRate: number }[];
  recentHooks: string[];
}

function firstLine(s: string): string {
  return (s || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}

/** The last 5 hooks we used, newest first, to avoid repetition. */
export function recentHooks(posts: Post[]): string[] {
  return [...posts]
    .filter((p) => !p.frontmatter.is_repost)
    .sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1))
    .slice(0, 5)
    .map((p) => firstLine(p.body.onScreenText) || firstLine(p.body.script) || firstLine(p.body.caption))
    .filter(Boolean);
}

function scaffold(req: ScriptRequest, exemplars: Post[], hooks: string[]): string {
  const pillar = req.pillar ? PILLAR_LABELS[req.pillar] : "(pick a pillar)";
  const ex = exemplars.length
    ? exemplars.map((e) => `- ${e.slug} (save rate ${(e.frontmatter.save_rate * 100).toFixed(2)}%)`).join("\n")
    : "- (no qualifying exemplars yet)";
  return `# Script draft — ${req.topic}

**Pillar:** ${pillar}${req.notes ? `\n**Notes:** ${req.notes}` : ""}

> Generated without a model (no ANTHROPIC_API_KEY). This is a grounded scaffold —
> fill each \`[FILL: …]\` with a real line. Never invent metrics.

## Hook options
1. [FILL: hook option 1 — avoid the recent hooks below]
2. [FILL: hook option 2]
3. [FILL: hook option 3]

## Script
[FILL: 3–4 beat script for ${pillar}. Open on the hook, one idea per beat.]

## On-screen text
[FILL: overlay per beat]

## Visual direction
[FILL: shots, pacing, the "add to garage"/feature beat if relevant]

## Caption
[FILL: caption + one question to drive comments]

## Why this should work (our data)
Exemplars to echo (top save rate for this pillar):
${ex}

Recent hooks to NOT repeat:
${hooks.map((h) => `- ${h}`).join("\n") || "- (none on record)"}
`;
}

export async function generateScript(req: ScriptRequest, posts: Post[]): Promise<ScriptResult> {
  const exemplars = topBySaveRate(posts, { pillar: req.pillar, limit: 3 });
  const hooks = recentHooks(posts);
  const exemplarMeta = exemplars.map((e) => ({ slug: e.slug, saveRate: e.frontmatter.save_rate }));

  if (!llmAvailable()) {
    return {
      markdown: scaffold(req, exemplars, hooks),
      usedModel: false,
      exemplars: exemplarMeta,
      recentHooks: hooks,
    };
  }

  const whatWorks = await readWhatWorks();
  const exemplarBlock = exemplars
    .map(
      (e) =>
        `- ${e.slug} (save rate ${(e.frontmatter.save_rate * 100).toFixed(2)}%)\n  hook: ${firstLine(e.body.onScreenText) || firstLine(e.body.script)}\n  caption: ${firstLine(e.body.caption)}`,
    )
    .join("\n");

  const system =
    "You are Driveverse's short-form scriptwriter. Produce a structured Markdown " +
    "script with these sections: '## Hook options' (3), '## Script', " +
    "'## On-screen text', '## Visual direction', '## Caption', and " +
    "'## Why this should work' (cite OUR data from the injected context). " +
    "CRITICAL: never fabricate specific metrics, follower counts, or claims — " +
    "where a real number/claim would go and you don't have it, write a " +
    "'[FILL: …]' placeholder. Do not reuse any of the recent hooks. Match the " +
    "brand's punchy, car-culture voice.";
  const prompt =
    `Topic: ${req.topic}\n` +
    `Pillar: ${req.pillar ? PILLAR_LABELS[req.pillar] : "unspecified"}\n` +
    `Notes: ${req.notes || "(none)"}\n\n` +
    `--- what-works.md ---\n${whatWorks.slice(0, 4000) || "(empty)"}\n\n` +
    `--- Top posts by save rate for this pillar (exemplars) ---\n${exemplarBlock || "(none)"}\n\n` +
    `--- Last 5 hooks used (do NOT repeat) ---\n${hooks.map((h) => `- ${h}`).join("\n") || "(none)"}\n\n` +
    `Write the script now.`;

  try {
    const markdown = await llmText(system, prompt, 2000);
    return { markdown: markdown.trim(), usedModel: true, exemplars: exemplarMeta, recentHooks: hooks };
  } catch (e) {
    return {
      markdown: scaffold(req, exemplars, hooks) + `\n\n> Model call failed: ${(e as Error).message}`,
      usedModel: false,
      exemplars: exemplarMeta,
      recentHooks: hooks,
    };
  }
}
