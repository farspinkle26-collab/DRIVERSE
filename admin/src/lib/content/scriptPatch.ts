// Single-field patching for POV scripts — the same shape the posts table uses
// (see patchPost.ts), for the same reason: a Kanban drag knows `status` and
// nothing else, a checklist tick knows one section, and neither should be able
// to clobber a field it never read.
//
// Pure: the API route reads the script, applies the patch, and writes the
// result (snapshotting the previous body when this says the body changed).

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
  type ScriptFrontmatter,
  type ScriptStatus,
} from "./scriptTypes";

/** Body sections a patch may write. `extra` is round-trip-only. */
const BODY_FIELDS = [
  "hookOptions",
  "script",
  "onScreenText",
  "visualDirection",
  "filmingChecklist",
  "notes",
] as const;

/**
 * The prose sections — the writing. A change to one of these is what earns a
 * version snapshot; ticking a box in the Filming Checklist is execution state,
 * not a rewrite, and one snapshot per checkbox click would bury the versions
 * that actually matter.
 */
const PROSE_FIELDS: ReadonlySet<string> = new Set([
  "hookOptions",
  "script",
  "onScreenText",
  "visualDirection",
  "notes",
]);

const TEXT_FIELDS = ["title", "hook"] as const;

export type PatchableScriptField =
  | (typeof BODY_FIELDS)[number]
  | (typeof TEXT_FIELDS)[number]
  | "pov_type"
  | "status"
  | "feature_shown"
  | "hook_variants_considered"
  | "created_date"
  | "filmed_date"
  | "linked_post"
  | "platform_target";

export const PATCHABLE_SCRIPT_FIELDS: readonly PatchableScriptField[] = [
  ...TEXT_FIELDS,
  "pov_type",
  "status",
  "feature_shown",
  "hook_variants_considered",
  "created_date",
  "filmed_date",
  "linked_post",
  "platform_target",
  ...BODY_FIELDS,
];

const BODY_SET: ReadonlySet<string> = new Set(BODY_FIELDS);
const TEXT_SET: ReadonlySet<string> = new Set(TEXT_FIELDS);

function asText(field: string, v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string" && typeof v !== "number") {
    throw new Error(`${field} must be text.`);
  }
  return String(v).trim();
}

/** Prose keeps its internal newlines; only the edges are trimmed. */
function asProse(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string") throw new Error("Section content must be text.");
  return v.replace(/\r\n/g, "\n").trim();
}

function asDateOrNull(field: string, v: unknown): string | null {
  const s = asText(field, v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${field} must be YYYY-MM-DD.`);
  return s;
}

/**
 * Apply a sparse `{ field: value }` patch to a script.
 *
 * `today` is passed in (never read from the clock here) so the module stays
 * pure: it's used for the one derivation this layer owns — reaching Filmed or
 * Posted back-fills `filmed_date` when it's still empty, because a script that
 * has been filmed but claims no filming date is just a lie the board tells you.
 *
 * Returns the field names that changed (for the commit message) and whether any
 * prose section moved, which is what triggers a version snapshot (see
 * PROSE_FIELDS — a checklist tick doesn't count).
 */
export function applyScriptPatch(
  script: PovScript,
  patch: unknown,
  opts: { today: string },
): { script: PovScript; changed: PatchableScriptField[]; bodyChanged: boolean } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new Error("Patch body must be a JSON object of fields to update.");
  }
  const entries = Object.entries(patch as Record<string, unknown>);
  if (entries.length === 0) throw new Error("Patch body is empty — nothing to update.");

  const fm: ScriptFrontmatter = { ...script.frontmatter };
  const body: ScriptBody = { ...script.body };
  const changed: PatchableScriptField[] = [];
  let bodyChanged = false;

  for (const [key, raw] of entries) {
    if (BODY_SET.has(key)) {
      const next = asProse(raw);
      const field = key as (typeof BODY_FIELDS)[number];
      if (body[field] !== next && PROSE_FIELDS.has(field)) bodyChanged = true;
      body[field] = next;
      changed.push(field);
      continue;
    }

    if (TEXT_SET.has(key)) {
      (fm as unknown as Record<string, string>)[key] = asText(key, raw);
      changed.push(key as PatchableScriptField);
      continue;
    }

    switch (key) {
      case "pov_type": {
        const v = asText(key, raw);
        if (!POV_TYPES.includes(v as PovType)) {
          throw new Error(`pov_type must be one of: ${POV_TYPES.join(", ")}.`);
        }
        fm.pov_type = v as PovType;
        break;
      }
      case "status": {
        const v = asText(key, raw);
        if (!SCRIPT_STATUSES.includes(v as ScriptStatus)) {
          throw new Error(`status must be one of: ${SCRIPT_STATUSES.join(", ")}.`);
        }
        fm.status = v as ScriptStatus;
        break;
      }
      case "feature_shown": {
        const v = asText(key, raw);
        if (!SCRIPT_FEATURES.includes(v as ScriptFeature)) {
          throw new Error(`feature_shown must be one of: ${SCRIPT_FEATURES.join(", ")}.`);
        }
        fm.feature_shown = v as ScriptFeature;
        break;
      }
      case "platform_target": {
        const v = asText(key, raw);
        if (!PLATFORM_TARGETS.includes(v as PlatformTarget)) {
          throw new Error(`platform_target must be one of: ${PLATFORM_TARGETS.join(", ")}.`);
        }
        fm.platform_target = v as PlatformTarget;
        break;
      }
      case "hook_variants_considered": {
        const n = raw === "" || raw == null ? 0 : Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error("hook_variants_considered must be a non-negative number.");
        }
        fm.hook_variants_considered = Math.round(n);
        break;
      }
      case "created_date": {
        const v = asDateOrNull(key, raw);
        if (!v) throw new Error("created_date can't be cleared.");
        fm.created_date = v;
        break;
      }
      case "filmed_date": {
        fm.filmed_date = asDateOrNull(key, raw);
        break;
      }
      case "linked_post": {
        const v = asText(key, raw);
        fm.linked_post = v || null;
        break;
      }
      default:
        throw new Error(`"${key}" is not an editable field.`);
    }
    changed.push(key as PatchableScriptField);
  }

  // Reaching the camera implies a filming date. Only ever back-filled, never
  // overwritten — and never cleared by moving backwards, because the script
  // really was filmed on that day even if it's back in Drafted for a rewrite.
  if (
    (fm.status === "filmed" || fm.status === "posted") &&
    !fm.filmed_date &&
    !changed.includes("filmed_date")
  ) {
    fm.filmed_date = opts.today;
    changed.push("filmed_date");
  }

  return { script: { id: script.id, frontmatter: fm, body }, changed, bodyChanged };
}
