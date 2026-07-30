// Prompt formatting for the POV Script system, and the parser for what comes
// back.
//
// The dashboard has no Anthropic API key in the loop: every generative step is
// a formatted block you copy into a Claude chat, plus a paste-back field that
// saves the reply. So the prompt text is the product here — each feature gets
// its own builder function (never inlined into a component) so that if a key is
// ever added, `llmText(system, buildGenerationPrompt(input))` is the whole
// change and no UI has to be restructured.
//
// Pure and client-safe: the editor builds the prompt in the browser from data it
// already has.

import {
  POV_TYPE_LABELS,
  SCRIPT_FEATURE_LABELS,
  type PovScript,
  type PovType,
  type ScriptFeature,
} from "./scriptTypes";

// ── 4. Script generation ────────────────────────────────────────────────────
export interface GenerationPromptInput {
  povType: PovType;
  /** Pre-filled with the rotation recommendation. */
  feature: ScriptFeature;
  /** Optional topic / scenario notes. */
  topic?: string;
  /** The last 5 hooks, newest first. */
  recentHooks: string[];
  /** The machine-generated section of what-works.md (numbers, then rules). */
  whatWorks?: string;
}

const NO_DATA = "(nothing on record yet — do not invent any)";

function hookList(hooks: string[]): string {
  const clean = hooks.map((h) => h.trim()).filter(Boolean);
  if (clean.length === 0) return NO_DATA;
  return clean.map((h) => `- ${h}`).join("\n");
}

/** The Social-only authenticity clause. Kept separate because it is the whole
 *  reason Social scripts are gated differently everywhere else too. */
function socialClause(povType: PovType): string {
  if (povType !== "social") return "";
  return (
    "\nThis shows meeting another driver via the live map. Only\n" +
    "write this if it would read as authentic, not staged — flag if the\n" +
    "premise requires staging to work.\n"
  );
}

export function buildGenerationPrompt(input: GenerationPromptInput): string {
  const type = POV_TYPE_LABELS[input.povType];
  const feature = SCRIPT_FEATURE_LABELS[input.feature];
  const topic = input.topic?.trim();
  return [
    `Write a Driveverse POV script. Type: ${type}`,
    `Feature to showcase: ${feature} (shown naturally, 3-5 seconds, mid-action —`,
    `never a demo, phone stays in scene)`,
    topic ? `\nTopic / scenario notes:\n${topic}` : "",
    ``,
    `Recent hooks used (do not repeat these or anything structurally similar):`,
    hookList(input.recentHooks),
    socialClause(input.povType),
    ``,
    `What works so far (from what-works.md):`,
    input.whatWorks?.trim() || NO_DATA,
    ``,
    `Return: 3 hook options (each under 2 sentences, first-2-seconds-decide-`,
    `everything), full script, on-screen text, visual direction (camera/mount`,
    `position, exact timing of the app moment), and a one-line "why this`,
    `should work" citing our data. Use [FILL: ...] for anything without`,
    `real data backing it — never invent specifics.`,
  ]
    .filter((l) => l !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// ── 5. Refine an existing draft ─────────────────────────────────────────────
export interface RefinePromptInput {
  script: PovScript;
  /** Pillar the script is judged against (the linked post's, or POV Daily). */
  pillarLabel: string;
  /** What isn't landing: "hook feels slow", "want a different feature shown". */
  feedback: string;
  recentHooks: string[];
  whatWorks?: string;
}

export function buildRefinePrompt(input: RefinePromptInput): string {
  const fm = input.script.frontmatter;
  const body = input.script.body;
  const section = (title: string, content: string) =>
    `--- ${title} ---\n${content.trim() || NO_DATA}`;
  return [
    `Refine this Driveverse POV script. Keep what works; change what I flag.`,
    ``,
    `Type: ${POV_TYPE_LABELS[fm.pov_type]}`,
    `Pillar: ${input.pillarLabel}`,
    `Feature shown: ${SCRIPT_FEATURE_LABELS[fm.feature_shown]} (3-5 seconds,`,
    `mid-action, never a demo, phone stays in scene)`,
    `Current hook: ${fm.hook.trim() || NO_DATA}`,
    ``,
    `My feedback:`,
    input.feedback.trim() || "(none given — tighten it)",
    ``,
    section("Current script", body.script),
    ``,
    section("Current on-screen text", body.onScreenText),
    ``,
    section("Current visual direction", body.visualDirection),
    ``,
    `Recent hooks used (do not repeat these or anything structurally similar):`,
    hookList(input.recentHooks),
    socialClause(fm.pov_type),
    ``,
    `What works so far (from what-works.md):`,
    input.whatWorks?.trim() || NO_DATA,
    ``,
    `Return the same sections as a fresh script — 3 hook options, full script,`,
    `on-screen text, visual direction (camera/mount position, exact timing of`,
    `the app moment), and a one-line "why this should work" citing our data —`,
    `so it can replace the draft wholesale. Use [FILL: ...] for anything`,
    `without real data backing it — never invent specifics.`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// ── Paste-back parsing ──────────────────────────────────────────────────────
export interface ParsedScriptResponse {
  /** Hook options as written, in order. */
  hookOptions: string[];
  script: string;
  onScreenText: string;
  visualDirection: string;
  /** The "why this should work" line, folded into Notes on save. */
  why: string;
  /** Anything we couldn't place, kept verbatim so nothing is silently dropped. */
  unmatched: string;
  /** True when at least one section was recognized. */
  matched: boolean;
}

type SectionKey = "hookOptions" | "script" | "onScreenText" | "visualDirection" | "why";

/** Map a heading line to one of our sections. Tolerant on purpose: the reply is
 *  a chat message, not an API payload — headings vary. */
function sectionForHeading(heading: string): SectionKey | null {
  const h = heading.toLowerCase().replace(/[^a-z ]/g, " ");
  if (h.includes("hook")) return "hookOptions";
  if (h.includes("on screen") || h.includes("onscreen") || h.includes("overlay")) {
    return "onScreenText";
  }
  if (h.includes("visual") || h.includes("direction") || h.includes("camera")) {
    return "visualDirection";
  }
  if (h.includes("why") || h.includes("should work")) return "why";
  if (h.includes("script") || h.includes("beat") || h.includes("spoken")) return "script";
  return null;
}

/** A heading, in any of the shapes a chat reply uses. */
function headingText(line: string): string | null {
  const trimmed = line.trim();
  const md = trimmed.match(/^#{1,6}\s+(.*)$/);
  if (md) return md[1].trim();
  const bold = trimmed.match(/^\*\*(.+?)\*\*:?$/);
  if (bold) return bold[1].trim();
  // "On-screen text:" on its own line.
  const bare = trimmed.match(/^([A-Za-z][A-Za-z0-9 '\-/]{2,40}):$/);
  if (bare) return bare[1].trim();
  return null;
}

/**
 * Split a pasted reply into our body sections. Anything before the first
 * recognized heading, or under a heading we don't know, lands in `unmatched` —
 * never dropped, so a reply that didn't follow the format is still recoverable.
 */
export function parseScriptResponse(markdown: string): ParsedScriptResponse {
  const buckets: Record<SectionKey, string[]> = {
    hookOptions: [],
    script: [],
    onScreenText: [],
    visualDirection: [],
    why: [],
  };
  const unmatched: string[] = [];
  let current: SectionKey | null = null;
  let matched = false;

  for (const line of (markdown || "").replace(/\r\n/g, "\n").split("\n")) {
    const heading = headingText(line);
    if (heading) {
      const key = sectionForHeading(heading);
      if (key) {
        current = key;
        matched = true;
        continue;
      }
      // Unknown heading — keep it with its content so context survives.
      current = null;
      unmatched.push(line);
      continue;
    }
    (current ? buckets[current] : unmatched).push(line);
  }

  const join = (xs: string[]) => xs.join("\n").trim();
  const hookBlock = join(buckets.hookOptions);
  return {
    hookOptions: hookOptionsFromBlock(hookBlock),
    script: join(buckets.script),
    onScreenText: join(buckets.onScreenText),
    visualDirection: join(buckets.visualDirection),
    why: join(buckets.why),
    unmatched: join(unmatched),
    matched,
  };
}

/** Hook options out of a "Hook options" block: list items if it has any,
 *  otherwise each non-empty line. */
function hookOptionsFromBlock(block: string): string[] {
  if (!block) return [];
  const lines = block.split("\n");
  const listItems = lines
    .map((l) => l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)?.[1]?.trim())
    .filter((x): x is string => !!x);
  if (listItems.length > 0) return listItems.map(stripHookDecoration);
  return lines.map((l) => l.trim()).filter(Boolean).map(stripHookDecoration);
}

function stripHookDecoration(text: string): string {
  return text
    .replace(/^\*\*(.+?)\*\*:?\s*/, "$1 ")
    .replace(/^"(.*)"$/, "$1")
    .replace(/^Option\s*\d+[:.\s-]*/i, "")
    .trim();
}
