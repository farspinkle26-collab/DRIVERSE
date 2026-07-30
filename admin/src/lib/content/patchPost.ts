// Single-field patching for the content-planning table's inline editors.
//
// The Add/Edit form (parsePostForm + buildPostFromForm) rebuilds a whole post
// from a complete form payload. That's the wrong shape for a spreadsheet cell,
// which knows one field and nothing else — so this module validates and applies
// a sparse patch instead, leaving every field it wasn't given alone.
//
// Everything here is pure: the API route reads the post, applies the patch, and
// writes the result.
import {
  PILLARS,
  PLATFORMS,
  POST_STATUSES,
  WEEKDAY_NAMES,
  type Pillar,
  type Platform,
  type Post,
  type PostBody,
  type PostFrontmatter,
  type PostStatus,
} from "./types";
import { computeDerived } from "./store";

/** Frontmatter counters that only exist once a post is published. */
const METRIC_FIELDS = [
  "views",
  "reach",
  "likes",
  "comments_total",
  "comments_seeded",
  "comments_organic_pickup",
  "saves",
  "shares",
  "engagements",
  "avg_watch_time",
  "duration_seconds",
  "new_follows",
] as const;

/** Free-text frontmatter fields (planning columns + classification). */
const TEXT_FIELDS = [
  "title",
  "format",
  "feature_shown",
  "hashtags",
  "permalink",
  "link_instagram",
  "link_tiktok",
] as const;

/** Body sections editable from a table cell. */
const BODY_FIELDS = ["caption"] as const;

export type PatchableField =
  | (typeof METRIC_FIELDS)[number]
  | (typeof TEXT_FIELDS)[number]
  | (typeof BODY_FIELDS)[number]
  | "status"
  | "platform"
  | "pillar"
  | "date"
  | "time"
  | "checked";

const METRIC_SET: ReadonlySet<string> = new Set(METRIC_FIELDS);
const TEXT_SET: ReadonlySet<string> = new Set(TEXT_FIELDS);
const BODY_SET: ReadonlySet<string> = new Set(BODY_FIELDS);

export const PATCHABLE_FIELDS: readonly PatchableField[] = [
  "status",
  "platform",
  "pillar",
  "date",
  "time",
  "checked",
  ...TEXT_FIELDS,
  ...BODY_FIELDS,
  ...METRIC_FIELDS,
];

function asText(field: string, v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string" && typeof v !== "number") {
    throw new Error(`${field} must be text.`);
  }
  return String(v).trim();
}

/** Counters are non-negative; a cleared cell reads as 0, not as "unset". */
function asCount(field: string, v: unknown): number {
  if (v === "" || v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${field} must be a number.`);
  if (n < 0) throw new Error(`${field} can't be negative.`);
  return n;
}

function weekdayFromDate(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAY_NAMES[d.getUTCDay()];
}

/**
 * Apply a sparse `{ field: value }` patch to a post. Throws on an unknown
 * field, an unparseable value, or a metric written to a Scheduled post (whose
 * metrics are never persisted — see METRIC_KEYS in store.ts — so accepting one
 * would silently drop it). Derived rates and `weekday` are always recomputed.
 *
 * Returns the new post plus the field names that were touched, for the commit
 * message.
 */
export function applyPostPatch(
  post: Post,
  patch: unknown,
): { post: Post; changed: PatchableField[] } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new Error("Patch body must be a JSON object of fields to update.");
  }
  const entries = Object.entries(patch as Record<string, unknown>);
  if (entries.length === 0) throw new Error("Patch body is empty — nothing to update.");

  const fm: PostFrontmatter = { ...post.frontmatter };
  const body: PostBody = { ...post.body };
  const changed: PatchableField[] = [];

  // Status is resolved first: whether a metric in this same patch is allowed
  // depends on the status the post ends up with, not the one it had.
  const statusPatched = entries.find(([k]) => k === "status");
  if (statusPatched) {
    const v = asText("status", statusPatched[1]);
    if (!POST_STATUSES.includes(v as PostStatus)) {
      throw new Error("status must be 'scheduled' or 'published'.");
    }
    fm.status = v as PostStatus;
    changed.push("status");
  }

  for (const [key, raw] of entries) {
    if (key === "status") continue; // already applied

    if (METRIC_SET.has(key)) {
      if (fm.status !== "published") {
        throw new Error(
          `Set Status to Published before entering ${key} — a scheduled post has no metrics yet.`,
        );
      }
      (fm as unknown as Record<string, number>)[key] = asCount(key, raw);
      changed.push(key as PatchableField);
      continue;
    }

    if (TEXT_SET.has(key)) {
      (fm as unknown as Record<string, string>)[key] = asText(key, raw);
      changed.push(key as PatchableField);
      continue;
    }

    if (BODY_SET.has(key)) {
      // Body prose keeps its internal newlines; only the edges are trimmed.
      const v = raw == null ? "" : String(raw).trim();
      (body as unknown as Record<string, string>)[key] = v;
      changed.push(key as PatchableField);
      continue;
    }

    switch (key) {
      case "platform": {
        const v = asText(key, raw);
        if (!PLATFORMS.includes(v as Platform)) {
          throw new Error("platform must be 'instagram' or 'tiktok'.");
        }
        fm.platform = v as Platform;
        break;
      }
      case "pillar": {
        const v = asText(key, raw);
        // Blank is a real state: "unclassified", not an error. We never invent
        // a pillar outside the five.
        if (v && !PILLARS.includes(v as Pillar)) {
          throw new Error(`pillar must be one of: ${PILLARS.join(", ")} (or blank).`);
        }
        fm.pillar = v ? (v as Pillar) : null;
        break;
      }
      case "date": {
        const v = asText(key, raw);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("date must be YYYY-MM-DD.");
        fm.date = v;
        break;
      }
      case "time": {
        const v = asText(key, raw);
        if (!/^\d{2}:\d{2}$/.test(v)) throw new Error("time must be HH:MM.");
        fm.time = v;
        break;
      }
      case "checked": {
        if (typeof raw !== "boolean") throw new Error("checked must be a boolean.");
        fm.checked = raw;
        break;
      }
      default:
        throw new Error(`"${key}" is not an editable field.`);
    }
    changed.push(key as PatchableField);
  }

  fm.weekday = fm.date ? weekdayFromDate(fm.date) : fm.weekday;
  Object.assign(fm, computeDerived(fm));

  return { post: { slug: post.slug, frontmatter: fm, body }, changed };
}
