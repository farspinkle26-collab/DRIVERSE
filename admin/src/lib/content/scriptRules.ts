// Pure, computed intelligence for the POV Script system. Nothing here calls a
// model and nothing here touches the filesystem: these are the checks the
// editor shows while you draft (feature rotation, hook repetition), the
// auto-generated filming checklist, and the teleprompter's reading text.
//
// Client-safe by design — the editor recomputes them instantly as you change a
// dropdown, and the store/API reuse exactly the same implementation.

import {
  ROTATABLE_FEATURES,
  ROTATION_WINDOW,
  SCRIPT_FEATURES,
  SCRIPT_FEATURE_LABELS,
  type PovScript,
  type PovType,
  type ScriptFeature,
} from "./scriptTypes";

// ── Recency ordering ────────────────────────────────────────────────────────
/**
 * Newest first. `created_date` is the ordering key (every script has one,
 * including ideas that were never filmed); the id breaks ties so the order is
 * stable and identical on server and client.
 */
export function byRecency(scripts: PovScript[]): PovScript[] {
  return [...scripts].sort((a, b) => {
    const da = a.frontmatter.created_date || "";
    const db = b.frontmatter.created_date || "";
    if (da !== db) return da < db ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

/** The window both computed checks read: the last N scripts, newest first,
 *  optionally excluding the one being edited (a script never checks itself). */
export function recentWindow(
  scripts: PovScript[],
  window = ROTATION_WINDOW,
  excludeId?: string,
): PovScript[] {
  const rows = excludeId ? scripts.filter((s) => s.id !== excludeId) : scripts;
  return byRecency(rows).slice(0, window);
}

// ── 1. Feature rotation ─────────────────────────────────────────────────────
export interface RotationEntry {
  id: string;
  title: string;
  feature: ScriptFeature;
  povType: PovType;
  createdDate: string;
}

export interface FeatureRotation {
  /** The window that was examined, newest first. */
  recent: RotationEntry[];
  /** Appearances inside the window, per feature. */
  counts: Record<ScriptFeature, number>;
  /** Rotatable features that don't appear in the window at all. */
  unused: ScriptFeature[];
  /** The pick to nudge toward: an unused feature, else the least recent one. */
  recommended: ScriptFeature | null;
  /** The feature of the immediately preceding script — the one to avoid. */
  previous: ScriptFeature | null;
  /** Size of the window actually available (fewer than N early on). */
  n: number;
}

/**
 * Which `feature_shown` values the last N scripts used, across both POV types,
 * and which one to reach for next. "Never the same screen twice running" is the
 * rule this enforces — softly: `previous` is what the editor warns about, and
 * `recommended` is what it flags as the good pick.
 */
export function featureRotation(
  scripts: PovScript[],
  window = ROTATION_WINDOW,
  excludeId?: string,
): FeatureRotation {
  const recent = recentWindow(scripts, window, excludeId).map<RotationEntry>((s) => ({
    id: s.id,
    title: s.frontmatter.title,
    feature: s.frontmatter.feature_shown,
    povType: s.frontmatter.pov_type,
    createdDate: s.frontmatter.created_date,
  }));

  const counts = Object.fromEntries(SCRIPT_FEATURES.map((f) => [f, 0])) as Record<
    ScriptFeature,
    number
  >;
  // Index of the most recent appearance (0 = the immediately preceding script).
  const lastSeen = new Map<ScriptFeature, number>();
  recent.forEach((entry, i) => {
    counts[entry.feature] += 1;
    if (!lastSeen.has(entry.feature)) lastSeen.set(entry.feature, i);
  });

  const unused = ROTATABLE_FEATURES.filter((f) => counts[f] === 0);
  // An unused feature wins outright; otherwise the least recently used one.
  // Canonical order breaks ties so the recommendation never flickers.
  const recommended =
    unused[0] ??
    [...ROTATABLE_FEATURES].sort(
      (a, b) => (lastSeen.get(b) ?? Infinity) - (lastSeen.get(a) ?? Infinity),
    )[0] ??
    null;

  return {
    recent,
    counts,
    unused: [...unused],
    recommended,
    previous: recent[0]?.feature ?? null,
    n: recent.length,
  };
}

/**
 * The warning shown next to the feature picker. Never blocks — it just makes
 * the repeat visible at the moment the choice is made.
 */
export function rotationWarning(
  selected: ScriptFeature,
  rotation: FeatureRotation,
): string | null {
  if (selected === "none") {
    return "No feature shown — a POV with no app moment can't do POV's job. Only ship this if the point of the piece is something else entirely.";
  }
  if (rotation.previous && selected === rotation.previous) {
    const prev = rotation.recent[0];
    return `${SCRIPT_FEATURE_LABELS[selected]} was the screen in the previous script (${prev.title || prev.id}) — never the same screen twice running.`;
  }
  if (rotation.counts[selected] >= 2) {
    return `${SCRIPT_FEATURE_LABELS[selected]} already appears ${rotation.counts[selected]}× in the last ${rotation.n} scripts.`;
  }
  return null;
}

// ── 2. Hook repetition ──────────────────────────────────────────────────────
export interface RecentHook {
  id: string;
  title: string;
  hook: string;
  povType: PovType;
  createdDate: string;
}

/**
 * The last N hooks, regardless of status — an idea's hook is just as spent as a
 * posted one once you've written it. Shown permanently at the top of the editor
 * while drafting, not just injected into a prompt.
 */
export function recentPovHooks(
  scripts: PovScript[],
  window = ROTATION_WINDOW,
  excludeId?: string,
): RecentHook[] {
  return recentWindow(scripts, window, excludeId)
    .filter((s) => s.frontmatter.hook.trim().length > 0)
    .map((s) => ({
      id: s.id,
      title: s.frontmatter.title,
      hook: s.frontmatter.hook.trim(),
      povType: s.frontmatter.pov_type,
      createdDate: s.frontmatter.created_date,
    }));
}

/** Cheap structural similarity: shared meaningful words / shortest length.
 *  Deliberately crude — it flags "you're circling the same line", nothing more. */
export function hookSimilarity(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

/** Recent hooks the draft hook is too close to (>= 0.5 shared words). */
export function similarHooks(draft: string, hooks: RecentHook[]): RecentHook[] {
  if (draft.trim().length < 4) return [];
  return hooks.filter((h) => hookSimilarity(draft, h.hook) >= 0.5);
}

// ── 9. Filming checklist ────────────────────────────────────────────────────
export interface ChecklistItem {
  text: string;
  done: boolean;
}

const FEATURE_CHECKS: Record<ScriptFeature, string[]> = {
  live_map: [
    "Open Driveverse before starting the recording, not on camera",
    "Confirm the map shows nearby activity, not an empty map",
  ],
  trip_card: [
    "Start the drive in-app so a real trip is being recorded",
    "End the drive before filming the card — the card is the payoff, not a menu",
  ],
  quest_notification: [
    "Have a quest actually in progress so the notification is real",
    "Know roughly when the notification fires — don't wait for it on camera",
  ],
  garage: [
    "Garage has a real car in it, not the starter Civic on a fresh account",
    "Open to the card you want seen — no scrolling to find it",
  ],
  none: [],
};

/**
 * The per-script checklist, derived from POV type + feature. Generated at
 * creation and re-derivable at any time; ticks are persisted in the file's
 * "Filming Checklist" section (see mergeChecklist for how they survive a
 * regenerate).
 */
export function checklistFor(povType: PovType, feature: ScriptFeature): string[] {
  const items = [
    "Mount phone dash-visible — screen readable, not blown out",
    "Clean the windscreen and the phone lens",
  ];
  if (povType === "solo") {
    items.push("Drive the route once before filming so the driving looks ordinary");
  } else {
    items.push("Confirm real drivers are on the map right now — a staged meet-up reads as staged");
    items.push("Agree the meet point with the other driver off-camera, not in the shot");
  }
  items.push(...FEATURE_CHECKS[feature]);
  items.push(
    "Film the app moment in 3–5 seconds, mid-action — never a demo",
    "Don't narrate the app: no \"and here you can see…\"",
    "Shoot one clean take of the hook on its own as a spare",
  );
  return items;
}

/** Parse a markdown task list. Lines that aren't `- [ ]` items are ignored. */
export function parseChecklist(raw: string): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const line of (raw || "").split("\n")) {
    const m = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/);
    if (!m) continue;
    const text = m[2].trim();
    if (!text) continue;
    out.push({ text, done: m[1].toLowerCase() === "x" });
  }
  return out;
}

export function serializeChecklist(items: ChecklistItem[]): string {
  return items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n");
}

/**
 * Regenerate the checklist without losing work: generated items keep whatever
 * tick they already had, and anything the user added by hand is preserved at
 * the end rather than being wiped by a feature change.
 */
export function mergeChecklist(
  existing: ChecklistItem[],
  generated: string[],
): ChecklistItem[] {
  const doneByText = new Map(existing.map((i) => [i.text, i.done]));
  const generatedSet = new Set(generated);
  const merged: ChecklistItem[] = generated.map((text) => ({
    text,
    done: doneByText.get(text) ?? false,
  }));
  for (const item of existing) {
    if (!generatedSet.has(item.text)) merged.push(item);
  }
  return merged;
}

/** Outstanding items — what a "Ready to Film" card still owes you. */
export function checklistProgress(raw: string): { done: number; total: number } {
  const items = parseChecklist(raw);
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// ── 8. Teleprompter reading text ────────────────────────────────────────────
const QUOTED_RE = /[“"]([^”"]+)[”"]/g;

/**
 * The spoken lines only — what you actually say on camera, with the direction
 * left behind.
 *
 * Two modes, because a POV script is a shooting document, not a monologue.
 * When the script quotes its dialogue (the house format — `[0:03–0:08] Glance
 * at the map. "Somebody's out here too."`), only the quoted spans are read: a
 * beat line whose timestamp happens to be bracketed is still direction, and
 * stripping just the brackets would put "Glance at the map" on the prompter.
 * When nothing is quoted at all, every line is treated as spoken and only the
 * obvious direction is stripped.
 *
 * Blank strings are kept as beat breaks so the scroll has rhythm.
 */
export function spokenLines(script: string): string[] {
  const raw = (script || "").replace(/\r\n/g, "\n").split("\n");
  const quoted = quotedSpokenLines(raw);
  return quoted.length > 0 ? quoted : strippedSpokenLines(raw);
}

/** Push a beat break, never two in a row and never a leading one. */
function pushBreak(out: string[]): void {
  if (out.length > 0 && out[out.length - 1] !== "") out.push("");
}

function quotedSpokenLines(raw: string[]): string[] {
  const out: string[] = [];
  for (const line of raw) {
    const matches = [...line.matchAll(QUOTED_RE)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    // A line with no dialogue in it is direction — worth a break, not a read.
    if (matches.length === 0) {
      pushBreak(out);
      continue;
    }
    out.push(...matches);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function strippedSpokenLines(raw: string[]): string[] {
  const out: string[] = [];
  for (const rawLine of raw) {
    let line = rawLine.trim();
    if (!line) {
      pushBreak(out);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) continue; // section heading
    if (/^[-*_]{3,}$/.test(line)) continue; // rule
    // A line that is nothing but direction.
    if (/^[[(].*[\])]$/.test(line)) continue;
    line = line.replace(/\[[^\]]*\]/g, " "); // inline direction
    line = line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, ""); // list marker
    line = line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
    line = line.replace(/`([^`]+)`/g, "$1");
    line = line.replace(/\s{2,}/g, " ").trim();
    if (!line) continue;
    // A bold label on its own ("Beat 1:") is direction, not a line to read.
    if (/^[A-Z][A-Za-z0-9 /]{0,24}:$/.test(line)) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

// ── Hook options list ───────────────────────────────────────────────────────
/** The "Hook Options" section as a pickable list. Keeps discarded variants —
 *  the point of the section — and marks which one is the primary hook. */
export function parseHookOptions(raw: string): string[] {
  const out: string[] = [];
  for (const line of (raw || "").split("\n")) {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (!m) continue;
    const text = m[1]
      .replace(/^\*\*(chosen|primary)\*\*[:\s—-]*/i, "")
      .replace(/^\[(chosen|primary)\][:\s—-]*/i, "")
      .replace(/\s*(?:—|--)?\s*\((chosen|primary)\)\s*$/i, "")
      .trim();
    if (text) out.push(text);
  }
  return out;
}

/** Render hook options back to markdown, marking the chosen one. */
export function serializeHookOptions(options: string[], chosen: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const opt of options) {
    const text = opt.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    lines.push(`- ${text}${text === chosen.trim() ? " **(chosen)**" : ""}`);
  }
  return lines.join("\n");
}

// ── 3. Solo vs Social density gate ──────────────────────────────────────────
export interface DensitySnapshot {
  /** Drivers currently on the map (fresh `user_locations` rows). */
  count: number;
  /** False when the table is missing / blocked — count is then meaningless. */
  available: boolean;
  checkedAt: string;
}

export interface DensityGate {
  tone: "info" | "warning" | "gap";
  message: string;
}

/**
 * The banner every Social POV script carries. It never blocks — Social scripts
 * are allowed to exist before the density does; the gate just puts the
 * authenticity risk in front of you every single time.
 */
export function densityGate(
  povType: PovType,
  density: DensitySnapshot | null,
): DensityGate | null {
  if (povType !== "social") return null;
  const base =
    "Social POV requires real density — confirm this isn't staged before filming.";
  if (!density || !density.available) {
    return {
      tone: "warning",
      message: `${base} Live driver count unavailable (presence table unreadable), so this one is on your own eyes.`,
    };
  }
  if (density.count <= 0) {
    return {
      tone: "gap",
      message: `${base} Right now there are no drivers on the map at all — filming this today means staging it.`,
    };
  }
  if (density.count < 3) {
    return {
      tone: "gap",
      message: `${base} Only ${density.count} driver${density.count === 1 ? "" : "s"} on the map right now — thin enough that a "chance" meeting would have to be arranged.`,
    };
  }
  return {
    tone: "warning",
    message: `${base} ${density.count} drivers on the map right now.`,
  };
}
