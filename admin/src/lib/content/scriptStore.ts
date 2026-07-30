import "server-only";
import path from "node:path";
import { scriptsDir, scriptHistoryDir } from "./paths";
import { readTextFile, writeTextFile, listDir } from "./gitFs";
import {
  parseFrontmatter,
  serializeFrontmatter,
  splitFrontmatter,
  type Scalar,
} from "./frontmatter";
import {
  PLATFORM_TARGETS,
  POV_TYPES,
  SCRIPT_FEATURES,
  SCRIPT_STATUSES,
  type PlatformTarget,
  type PovScript,
  type PovType,
  type ScriptBody,
  type ScriptFeature,
  type ScriptFormInput,
  type ScriptFrontmatter,
  type ScriptStatus,
} from "./scriptTypes";
import { checklistFor, serializeChecklist } from "./scriptRules";

// ── Storage for content/scripts/*.md ────────────────────────────────────────
// Same storage contract as the post store: plain files in the git-committed
// content/ store, read and written through gitFs (local filesystem, or the
// GitHub Contents API when the app is deployed read-only). One file per script,
// plus a per-script folder of previous versions under scripts/_history/{id}/.

// ── Frontmatter <-> typed ──────────────────────────────────────────────────
function str(v: Scalar | undefined): string {
  return v == null ? "" : String(v);
}

function num(v: Scalar | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function dateOrNull(v: Scalar | undefined): string | null {
  const s = str(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function coercePovType(v: Scalar | undefined): PovType {
  return POV_TYPES.includes(v as PovType) ? (v as PovType) : "solo";
}

// An unreadable status would drop the card off the board entirely, so it lands
// in the first column rather than vanishing.
function coerceStatus(v: Scalar | undefined): ScriptStatus {
  return SCRIPT_STATUSES.includes(v as ScriptStatus) ? (v as ScriptStatus) : "idea";
}

/** Tolerates the free-text spellings a post file uses ("live map", "garage
 *  card") so a hand-written script file still lands on a known feature. */
function coerceFeature(v: Scalar | undefined): ScriptFeature {
  const raw = str(v).trim().toLowerCase();
  if (!raw) return "none";
  const normalized = raw.replace(/[\s/-]+/g, "_");
  if (SCRIPT_FEATURES.includes(normalized as ScriptFeature)) {
    return normalized as ScriptFeature;
  }
  if (normalized.includes("map")) return "live_map";
  if (normalized.includes("trip")) return "trip_card";
  if (normalized.includes("quest") || normalized.includes("xp")) return "quest_notification";
  if (normalized.includes("garage")) return "garage";
  return "none";
}

function coercePlatformTarget(v: Scalar | undefined): PlatformTarget {
  return PLATFORM_TARGETS.includes(v as PlatformTarget) ? (v as PlatformTarget) : "both";
}

function toFrontmatter(id: string, raw: Record<string, Scalar>): ScriptFrontmatter {
  const fm: ScriptFrontmatter = {
    // The filename is the identity; a frontmatter `id` that disagrees with it
    // loses, so a copied file can't shadow the script it was copied from.
    id,
    title: str(raw.title),
    pov_type: coercePovType(raw.pov_type),
    status: coerceStatus(raw.status),
    feature_shown: coerceFeature(raw.feature_shown),
    hook: str(raw.hook),
    hook_variants_considered: num(raw.hook_variants_considered),
    created_date: dateOrNull(raw.created_date) ?? "",
    filmed_date: dateOrNull(raw.filmed_date),
    linked_post: str(raw.linked_post).trim() || null,
    platform_target: coercePlatformTarget(raw.platform_target),
  };
  // Preserve any key we don't model so an added field round-trips.
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in fm)) fm[k] = v;
  }
  return fm;
}

const FM_ORDER: (keyof ScriptFrontmatter)[] = [
  "id",
  "title",
  "pov_type",
  "status",
  "feature_shown",
  "hook",
  "hook_variants_considered",
  "created_date",
  "filmed_date",
  "linked_post",
  "platform_target",
];

function frontmatterToEntries(fm: ScriptFrontmatter): [string, Scalar | undefined][] {
  const entries: [string, Scalar | undefined][] = FM_ORDER.map((key) => [
    key as string,
    (fm[key] ?? null) as Scalar,
  ]);
  const known = new Set(FM_ORDER as string[]);
  for (const [k, v] of Object.entries(fm)) {
    if (!known.has(k)) entries.push([k, v as Scalar]);
  }
  return entries;
}

// ── Body sections ──────────────────────────────────────────────────────────
const SECTION_TITLES: { key: keyof ScriptBody; title: string }[] = [
  { key: "hookOptions", title: "Hook Options" },
  { key: "script", title: "Script" },
  { key: "onScreenText", title: "On-Screen Text" },
  { key: "visualDirection", title: "Visual Direction" },
  { key: "filmingChecklist", title: "Filming Checklist" },
  { key: "notes", title: "Notes" },
];

/** Same sentinel the post store uses: an empty section has to read back as
 *  empty, not as content (see store.ts). */
const EMPTY_SECTION = "_—_";

export function emptyScriptBody(): ScriptBody {
  return {
    hookOptions: "",
    script: "",
    onScreenText: "",
    visualDirection: "",
    filmingChecklist: "",
    notes: "",
    extra: "",
  };
}

function parseBody(body: string): ScriptBody {
  const out = emptyScriptBody();
  const parts = body.split(/^##\s+(.+)$/m);
  const unmatched: string[] = [];
  const preamble = parts[0]?.trim() ?? "";
  if (preamble) unmatched.push(preamble);
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    const raw = (parts[i + 1] ?? "").trim();
    const content = raw === EMPTY_SECTION ? "" : raw;
    const match = SECTION_TITLES.find((s) => s.title.toLowerCase() === title.toLowerCase());
    if (match) {
      out[match.key] = content;
    } else {
      unmatched.push(`## ${title}\n\n${content}`.trim());
    }
  }
  out.extra = unmatched.join("\n\n").trim();
  return out;
}

function serializeBody(b: ScriptBody): string {
  const blocks: string[] = [];
  for (const { key, title } of SECTION_TITLES) {
    const content = (b[key] ?? "").trim();
    blocks.push(`## ${title}\n\n${content || EMPTY_SECTION}`);
  }
  if (b.extra?.trim()) blocks.push(b.extra.trim());
  return blocks.join("\n\n") + "\n";
}

// ── Public API ─────────────────────────────────────────────────────────────
export function serializeScript(script: PovScript): string {
  const fmBlock = serializeFrontmatter(frontmatterToEntries(script.frontmatter));
  return `${fmBlock}\n\n${serializeBody(script.body)}`;
}

export function parseScript(id: string, raw: string): PovScript {
  const { yaml, body } = splitFrontmatter(raw);
  return {
    id,
    frontmatter: toFrontmatter(id, parseFrontmatter(yaml)),
    body: parseBody(body),
  };
}

function scriptPath(id: string): string {
  return path.join(scriptsDir(), `${id}.md`);
}

/** Ids are filenames — reject anything that could climb out of the folder. */
export function assertSafeId(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    throw new Error(`Invalid script id: ${id}`);
  }
  return id;
}

export async function listScriptIds(): Promise<string[]> {
  const files = await listDir(scriptsDir());
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

export async function readScript(id: string): Promise<PovScript | null> {
  const raw = await readTextFile(scriptPath(assertSafeId(id)));
  if (raw == null) return null;
  return parseScript(id, raw);
}

export async function readAllScripts(): Promise<PovScript[]> {
  const ids = await listScriptIds();
  const scripts = await Promise.all(ids.map((id) => readScript(id)));
  return scripts.filter((s): s is PovScript => s !== null);
}

async function writeScriptFile(script: PovScript, message: string): Promise<void> {
  await writeTextFile(scriptPath(script.id), serializeScript(script), message);
}

// ── Version history ────────────────────────────────────────────────────────
// A snapshot is the whole previous file, dropped into scripts/_history/{id}/
// under a UTC timestamp. Full snapshots rather than an in-file append-only log:
// the working file stays readable (it's a document you film from), the diff of a
// refine stays a one-file diff, and "revert" is a copy rather than a parse of
// nested history inside the thing being reverted.

/**
 * `20260730T101500123Z` — sorts lexicographically, legal on every filesystem.
 *
 * Millisecond precision, because second precision isn't enough: a refine
 * followed immediately by another edit lands in the same second, and two
 * snapshots sharing a filename means the older one is silently overwritten —
 * exactly the history you'd want to look at. `snapshot()` still checks for a
 * collision before writing.
 */
export function versionStamp(now = new Date()): string {
  return now.toISOString().replace(/[-:.]/g, "");
}

const VERSION_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})?Z$/;

/** The ISO instant a version stamp stands for, for display. Also accepts the
 *  second-precision form, for any stamp written by hand. */
export function versionToIso(stamp: string): string | null {
  const m = stamp.match(VERSION_RE);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${ms ? `.${ms}` : ""}Z`;
}

export interface ScriptVersion {
  version: string;
  /** ISO instant of the snapshot, or null for a stamp we can't parse. */
  savedAt: string | null;
  script: PovScript;
}

export async function listScriptVersionStamps(id: string): Promise<string[]> {
  const files = await listDir(scriptHistoryDir(assertSafeId(id)));
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort()
    .reverse(); // newest first
}

export async function readScriptVersion(
  id: string,
  version: string,
): Promise<ScriptVersion | null> {
  if (!VERSION_RE.test(version)) throw new Error(`Invalid version: ${version}`);
  const raw = await readTextFile(
    path.join(scriptHistoryDir(assertSafeId(id)), `${version}.md`),
  );
  if (raw == null) return null;
  return { version, savedAt: versionToIso(version), script: parseScript(id, raw) };
}

export async function readScriptVersions(id: string): Promise<ScriptVersion[]> {
  const stamps = await listScriptVersionStamps(id);
  const versions = await Promise.all(stamps.map((v) => readScriptVersion(id, v)));
  return versions.filter((v): v is ScriptVersion => v !== null);
}

async function snapshot(previous: PovScript, now = new Date()): Promise<string> {
  const dir = scriptHistoryDir(previous.id);
  let version = versionStamp(now);
  // Never write over an existing snapshot: a taken filename means a second
  // edit landed in the same millisecond bucket, so step forward until it's free.
  for (let i = 1; i <= 50; i++) {
    if ((await readTextFile(path.join(dir, `${version}.md`))) == null) break;
    version = versionStamp(new Date(now.getTime() + i));
  }
  await writeTextFile(
    path.join(dir, `${version}.md`),
    serializeScript(previous),
    `content: snapshot ${previous.id} before edit (${version})`,
  );
  return version;
}

/**
 * Write a script, snapshotting the previous file first when the body changed.
 * Frontmatter-only changes (a Kanban drag, a linked post) don't snapshot —
 * history exists to answer "what did this script used to say", and a status flip
 * has never lost anyone a line of writing.
 */
export async function saveScript(
  next: PovScript,
  opts: { previous?: PovScript | null; bodyChanged?: boolean; message?: string; now?: Date } = {},
): Promise<{ version: string | null }> {
  let version: string | null = null;
  if (opts.previous && opts.bodyChanged) {
    version = await snapshot(opts.previous, opts.now ?? new Date());
  }
  await writeScriptFile(next, opts.message ?? `content: update script ${next.id}`);
  return { version };
}

/** Restore a previous version's body over the current file (snapshotting the
 *  current one first, so a revert is itself revertible). Frontmatter identity
 *  and pipeline state stay with the live file — you're reverting the writing,
 *  not moving the card backwards. */
export async function restoreScriptVersion(
  id: string,
  version: string,
  now = new Date(),
): Promise<PovScript> {
  const current = await readScript(id);
  if (!current) throw new Error(`Script not found: ${id}`);
  const old = await readScriptVersion(id, version);
  if (!old) throw new Error(`Version not found: ${version}`);
  const next: PovScript = {
    id,
    frontmatter: { ...current.frontmatter, hook: old.script.frontmatter.hook },
    body: { ...old.script.body },
  };
  await saveScript(next, {
    previous: current,
    bodyChanged: true,
    message: `content: restore script ${id} to version ${version}`,
    now,
  });
  return next;
}

// ── Creation ───────────────────────────────────────────────────────────────
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** `YYYY-MM-DD-solo-trip-card-at-the-end-of-a-drive`, deduped with -2, -3, … */
export function uniqueScriptId(
  input: { title: string; pov_type: PovType; created_date: string },
  taken: Set<string>,
): string {
  const titlePart = slugify(input.title) || "untitled";
  const base = `${input.created_date}-${input.pov_type}-${titlePart}`;
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/**
 * A brand-new script: frontmatter from the form, an empty body except for the
 * filming checklist, which is generated from POV type + feature immediately so a
 * script never sits in the pipeline without one.
 */
export function buildScriptFromForm(
  input: ScriptFormInput,
  id: string,
  today: string,
): PovScript {
  const body = emptyScriptBody();
  body.filmingChecklist = serializeChecklist(
    checklistFor(input.pov_type, input.feature_shown).map((text) => ({ text, done: false })),
  );
  if (input.notes?.trim()) body.notes = input.notes.trim();
  if (input.hook?.trim()) body.hookOptions = `- ${input.hook.trim()} **(chosen)**`;
  return {
    id,
    frontmatter: {
      id,
      title: input.title.trim(),
      pov_type: input.pov_type,
      status: input.status ?? "idea",
      feature_shown: input.feature_shown,
      hook: input.hook?.trim() ?? "",
      hook_variants_considered: Math.max(
        0,
        Math.round(input.hook_variants_considered ?? 0),
      ),
      created_date: today,
      filmed_date: null,
      linked_post: null,
      platform_target: input.platform_target ?? "both",
    },
    body,
  };
}

export async function createScript(
  input: ScriptFormInput,
  today: string,
): Promise<PovScript> {
  const taken = new Set(await listScriptIds());
  const id = uniqueScriptId(
    { title: input.title, pov_type: input.pov_type, created_date: today },
    taken,
  );
  const script = buildScriptFromForm(input, id, today);
  await writeScriptFile(script, `content: add script ${id}`);
  return script;
}
