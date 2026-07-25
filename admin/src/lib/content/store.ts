import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { postsDir, accountJsonPath, whatWorksPath } from "./paths";
import {
  parseFrontmatter,
  serializeFrontmatter,
  splitFrontmatter,
  type Scalar,
} from "./frontmatter";
import {
  PILLARS,
  PLATFORMS,
  type AccountData,
  type Pillar,
  type Platform,
  type Post,
  type PostBody,
  type PostFrontmatter,
} from "./types";

// ── Derived metrics ────────────────────────────────────────────────────────
// Always recomputed from the raw counters on read/write — never trusted from
// the file. Ratios in 0..1 (hold_rate can exceed 1 for looping watch time).
export function computeDerived(fm: {
  views: number;
  likes: number;
  comments_total: number;
  saves: number;
  shares: number;
  avg_watch_time: number;
  duration_seconds: number;
}): { save_rate: number; engagement_rate: number; hold_rate: number } {
  const v = fm.views || 0;
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const save_rate = v > 0 ? round(fm.saves / v) : 0;
  const engagement_rate =
    v > 0
      ? round((fm.likes + fm.comments_total + fm.saves + fm.shares) / v)
      : 0;
  const hold_rate =
    fm.duration_seconds > 0 ? round(fm.avg_watch_time / fm.duration_seconds) : 0;
  return { save_rate, engagement_rate, hold_rate };
}

// ── Frontmatter <-> typed ──────────────────────────────────────────────────
function num(v: Scalar | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: Scalar | undefined): string {
  return v == null ? "" : String(v);
}

function coercePlatform(v: Scalar | undefined): Platform {
  return PLATFORMS.includes(v as Platform) ? (v as Platform) : "instagram";
}
function coercePillar(v: Scalar | undefined): Pillar | null {
  return PILLARS.includes(v as Pillar) ? (v as Pillar) : null;
}

function toFrontmatter(raw: Record<string, Scalar>): PostFrontmatter {
  const counters = {
    views: num(raw.views),
    likes: num(raw.likes),
    comments_total: num(raw.comments_total),
    saves: num(raw.saves),
    shares: num(raw.shares),
    avg_watch_time: num(raw.avg_watch_time),
    duration_seconds: num(raw.duration_seconds),
  };
  const derived = computeDerived(counters);
  const fm: PostFrontmatter = {
    platform: coercePlatform(raw.platform),
    post_id: str(raw.post_id),
    permalink: str(raw.permalink),
    date: str(raw.date),
    time: str(raw.time),
    weekday: str(raw.weekday),
    pillar: coercePillar(raw.pillar),
    format: str(raw.format),
    feature_shown: str(raw.feature_shown) || "none",
    duration_seconds: counters.duration_seconds,
    views: counters.views,
    reach: num(raw.reach),
    likes: counters.likes,
    comments_total: counters.comments_total,
    comments_seeded: num(raw.comments_seeded),
    comments_organic_pickup: num(raw.comments_organic_pickup),
    saves: counters.saves,
    shares: counters.shares,
    avg_watch_time: counters.avg_watch_time,
    new_follows: num(raw.new_follows),
    ...derived,
  };
  if (typeof raw.is_repost === "boolean") fm.is_repost = raw.is_repost;
  if (raw.source != null) fm.source = str(raw.source) as PostFrontmatter["source"];
  if (raw.pillar_fit_flag != null) fm.pillar_fit_flag = str(raw.pillar_fit_flag);
  if (raw.enriched_at != null) fm.enriched_at = str(raw.enriched_at);
  return fm;
}

// Canonical frontmatter key order for writes — keeps files diff-friendly.
const FM_ORDER: string[] = [
  "platform",
  "post_id",
  "permalink",
  "date",
  "time",
  "weekday",
  "pillar",
  "format",
  "feature_shown",
  "duration_seconds",
  "views",
  "reach",
  "likes",
  "comments_total",
  "comments_seeded",
  "comments_organic_pickup",
  "saves",
  "shares",
  "avg_watch_time",
  "new_follows",
  "save_rate",
  "engagement_rate",
  "hold_rate",
];

function frontmatterToEntries(
  fm: PostFrontmatter,
): [string, Scalar | undefined][] {
  const derived = computeDerived(fm);
  const merged: PostFrontmatter = { ...fm, ...derived };
  const entries: [string, Scalar | undefined][] = [];
  for (const key of FM_ORDER) {
    entries.push([key, merged[key] as Scalar | undefined]);
  }
  // Append optional/extension keys not in the canonical order.
  for (const optional of [
    "source",
    "is_repost",
    "pillar_fit_flag",
    "enriched_at",
  ] as const) {
    if (merged[optional] !== undefined) {
      entries.push([optional, merged[optional] as Scalar]);
    }
  }
  return entries;
}

// ── Body sections ──────────────────────────────────────────────────────────
const SECTION_TITLES: { key: keyof PostBody; title: string }[] = [
  { key: "script", title: "Script" },
  { key: "transcript", title: "Delivered Transcript" },
  { key: "onScreenText", title: "On-Screen Text" },
  { key: "caption", title: "Caption" },
  { key: "takeaway", title: "Takeaway" },
  { key: "retention", title: "Retention" },
];

function parseBody(body: string): PostBody {
  const out: PostBody = {
    script: "",
    transcript: "",
    onScreenText: "",
    caption: "",
    takeaway: "",
    retention: "",
    extra: "",
  };
  // Split on level-2 headings, keeping the heading text.
  const parts = body.split(/^##\s+(.+)$/m);
  // parts[0] is any preamble before the first heading.
  const preamble = parts[0]?.trim() ?? "";
  const unmatched: string[] = [];
  if (preamble) unmatched.push(preamble);
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim();
    const content = (parts[i + 1] ?? "").trim();
    const match = SECTION_TITLES.find(
      (s) => s.title.toLowerCase() === title.toLowerCase(),
    );
    if (match) {
      out[match.key] = content;
    } else {
      unmatched.push(`## ${title}\n\n${content}`.trim());
    }
  }
  out.extra = unmatched.join("\n\n").trim();
  return out;
}

function serializeBody(b: PostBody): string {
  const blocks: string[] = [];
  for (const { key, title } of SECTION_TITLES) {
    const content = (b[key] ?? "").trim();
    blocks.push(`## ${title}\n\n${content || "_—_"}`);
  }
  if (b.extra?.trim()) blocks.push(b.extra.trim());
  return blocks.join("\n\n") + "\n";
}

// ── Public API ─────────────────────────────────────────────────────────────
export function serializePost(post: Post): string {
  const fmBlock = serializeFrontmatter(frontmatterToEntries(post.frontmatter));
  return `${fmBlock}\n\n${serializeBody(post.body)}`;
}

function parsePost(slug: string, raw: string): Post {
  const { yaml, body } = splitFrontmatter(raw);
  return {
    slug,
    frontmatter: toFrontmatter(parseFrontmatter(yaml)),
    body: parseBody(body),
  };
}

export async function listPostSlugs(): Promise<string[]> {
  try {
    const files = await fs.readdir(postsDir());
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export async function readPost(slug: string): Promise<Post | null> {
  try {
    const raw = await fs.readFile(path.join(postsDir(), `${slug}.md`), "utf8");
    return parsePost(slug, raw);
  } catch {
    return null;
  }
}

export async function readAllPosts(): Promise<Post[]> {
  const slugs = await listPostSlugs();
  const posts = await Promise.all(slugs.map((s) => readPost(s)));
  return posts.filter((p): p is Post => p !== null);
}

export async function writePost(post: Post): Promise<void> {
  await fs.mkdir(postsDir(), { recursive: true });
  const file = path.join(postsDir(), `${post.slug}.md`);
  await fs.writeFile(file, serializePost(post), "utf8");
}

// ── account.json ───────────────────────────────────────────────────────────
export async function readAccount(): Promise<AccountData | null> {
  try {
    const raw = await fs.readFile(accountJsonPath(), "utf8");
    return JSON.parse(raw) as AccountData;
  } catch {
    return null;
  }
}

export async function writeAccount(data: AccountData): Promise<void> {
  await fs.mkdir(path.dirname(accountJsonPath()), { recursive: true });
  await fs.writeFile(accountJsonPath(), JSON.stringify(data, null, 2) + "\n", "utf8");
}

// ── what-works.md (fenced auto-section) ─────────────────────────────────────
export const AUTO_START = "<!-- AUTO:START -->";
export const AUTO_END = "<!-- AUTO:END -->";

export async function readWhatWorks(): Promise<string> {
  try {
    return await fs.readFile(whatWorksPath(), "utf8");
  } catch {
    return "";
  }
}

/** Extract just the machine-managed section (between the fences). */
export function extractAutoSection(doc: string): string {
  const start = doc.indexOf(AUTO_START);
  const end = doc.indexOf(AUTO_END);
  if (start === -1 || end === -1 || end < start) return "";
  return doc.slice(start + AUTO_START.length, end).trim();
}

/**
 * Replace ONLY the fenced auto section, leaving all hand-written prose outside
 * the fence untouched. If the document has no fence yet, one is appended.
 */
export async function writeWhatWorksAuto(autoBody: string): Promise<void> {
  const existing = await readWhatWorks();
  const block = `${AUTO_START}\n${autoBody.trim()}\n${AUTO_END}`;
  let next: string;
  const start = existing.indexOf(AUTO_START);
  const end = existing.indexOf(AUTO_END);
  if (existing && start !== -1 && end !== -1 && end > start) {
    next = existing.slice(0, start) + block + existing.slice(end + AUTO_END.length);
  } else if (existing.trim()) {
    next = `${existing.trimEnd()}\n\n${block}\n`;
  } else {
    next =
      `# What's working\n\n` +
      `_Hand-written notes live outside the AUTO fence and are never overwritten by the pipeline._\n\n` +
      `${block}\n`;
  }
  await fs.mkdir(path.dirname(whatWorksPath()), { recursive: true });
  await fs.writeFile(whatWorksPath(), next, "utf8");
}
