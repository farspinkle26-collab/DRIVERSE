// Domain types for the POV Script system (`content/scripts/*.md`).
//
// POV is the flagship pillar and gets its own pipeline: one file per script,
// its own statuses, and constraints the general post store doesn't model (the
// 3–5s app moment, feature rotation, Solo vs Social). Client-safe — no
// server-only imports — so the editor, the Kanban board and the store all
// share one set of shapes.

/** Solo = one driver, the app glanced at mid-drive. Social = meeting another
 *  real driver via the live map (needs genuine density — see the gate). */
export const POV_TYPES = ["solo", "social"] as const;
export type PovType = (typeof POV_TYPES)[number];

export const POV_TYPE_LABELS: Record<PovType, string> = {
  solo: "Solo",
  social: "Social",
};

/** The pipeline, in order. The Kanban board's columns are exactly this. */
export const SCRIPT_STATUSES = [
  "idea",
  "drafted",
  "ready_to_film",
  "filmed",
  "posted",
] as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

export const SCRIPT_STATUS_LABELS: Record<ScriptStatus, string> = {
  idea: "Idea",
  drafted: "Drafted",
  ready_to_film: "Ready to Film",
  filmed: "Filmed",
  posted: "Posted",
};

/**
 * The app screens a POV script can show. Closed vocabulary on purpose: the
 * rotation rule ("never the same screen twice running") can only be computed
 * over a fixed set, and free text would quietly split `live_map` from
 * `live map`. The post store's `feature_shown` stays free text — see
 * POST_FEATURE_ALIASES for the bridge.
 */
export const SCRIPT_FEATURES = [
  "live_map",
  "trip_card",
  "quest_notification",
  "garage",
  "none",
] as const;
export type ScriptFeature = (typeof SCRIPT_FEATURES)[number];

export const SCRIPT_FEATURE_LABELS: Record<ScriptFeature, string> = {
  live_map: "Live map",
  trip_card: "Trip card",
  quest_notification: "Quest notification",
  garage: "Garage",
  none: "No feature",
};

/** Single-glyph marks for the Kanban cards — the palette is already doing the
 *  categorical work, so these stay monochrome and quiet. */
export const SCRIPT_FEATURE_GLYPHS: Record<ScriptFeature, string> = {
  live_map: "◎",
  trip_card: "▤",
  quest_notification: "◆",
  garage: "▣",
  none: "○",
};

/** Features that are a real app moment — what the rotation recommends between.
 *  `none` is selectable (and warned about) but never recommended. */
export const ROTATABLE_FEATURES: readonly ScriptFeature[] = SCRIPT_FEATURES.filter(
  (f) => f !== "none",
);

/** How a script feature reads in a post file's free-text `feature_shown`, so a
 *  linked post can be matched back to the feature the script planned. */
export const POST_FEATURE_ALIASES: Record<ScriptFeature, string[]> = {
  live_map: ["live map", "map"],
  trip_card: ["trip card", "trip summary"],
  quest_notification: ["quest notification", "quest/xp notification", "quest", "xp notification"],
  garage: ["garage", "garage card"],
  none: ["none", ""],
};

export const PLATFORM_TARGETS = ["instagram", "tiktok", "both"] as const;
export type PlatformTarget = (typeof PLATFORM_TARGETS)[number];

export const PLATFORM_TARGET_LABELS: Record<PlatformTarget, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  both: "Both",
};

/** Frontmatter of a `content/scripts/*.md` file. Flat scalars only, so the
 *  dependency-free frontmatter reader/writer round-trips it cleanly. */
export interface ScriptFrontmatter {
  id: string;
  /** Working title — not the video's on-screen text. */
  title: string;
  pov_type: PovType;
  status: ScriptStatus;
  feature_shown: ScriptFeature;
  /** The chosen hook line, short. */
  hook: string;
  /** How many alternates were generated before this one was picked. */
  hook_variants_considered: number;
  created_date: string; // YYYY-MM-DD
  filmed_date: string | null; // YYYY-MM-DD
  /** Permalink, or a `content/posts/<slug>` reference, once posted. */
  linked_post: string | null;
  platform_target: PlatformTarget;
  [key: string]: unknown; // tolerate unknown keys round-tripping through
}

/** Named body sections. Anything else in the file round-trips verbatim. */
export interface ScriptBody {
  /** Every variant generated, chosen and discarded — kept for reference. */
  hookOptions: string;
  /** The full spoken/visual script. Teleprompter mode reads this. */
  script: string;
  onScreenText: string;
  /** Camera angle, phone mount position, when the app moment happens. */
  visualDirection: string;
  /** Checkable `- [ ]` items, auto-generated from pov_type + feature_shown. */
  filmingChecklist: string;
  notes: string;
  /** Trailing content we didn't recognize. */
  extra: string;
}

export interface PovScript {
  /** Stable id = the markdown filename without extension (mirrors frontmatter `id`). */
  id: string;
  frontmatter: ScriptFrontmatter;
  body: ScriptBody;
}

/** Shape submitted by the New Script form. */
export interface ScriptFormInput {
  title: string;
  pov_type: PovType;
  feature_shown: ScriptFeature;
  hook?: string;
  hook_variants_considered?: number;
  platform_target?: PlatformTarget;
  status?: ScriptStatus;
  notes?: string;
}

/** How many scripts back the rotation and hook-repetition checks look. */
export const ROTATION_WINDOW = 5;

/**
 * POV scripts are judged against the POV pillar unless their linked post says
 * otherwise. Both Solo and Social are everyday-POV in pillar terms; a scripted
 * skit posted as `fake_scripted_pov` carries that on the post, and the
 * performance card follows the post's own pillar when one is linked.
 */
export const DEFAULT_SCRIPT_PILLAR = "pov_daily" as const;
