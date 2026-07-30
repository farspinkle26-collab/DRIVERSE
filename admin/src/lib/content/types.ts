// Domain types for the Driveverse organic-marketing content dashboard.
// Client-safe: no server-only imports here so both server and client code can
// share these shapes.

/** The five content pillars we are testing. Do NOT invent new pillars. */
export const PILLARS = [
  "garagey",
  "pov_daily",
  "fake_scripted_pov",
  "ai_supercars",
  "tips_tricks",
] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_LABELS: Record<Pillar, string> = {
  garagey: "Garagey",
  pov_daily: "POV Daily",
  fake_scripted_pov: "Fake Scripted POV",
  ai_supercars: "AI / Deepfake Supercars",
  tips_tricks: "Tips & Tricks",
};

/**
 * The "job" each pillar is hired to do. AI Supercars is reach-only (the app is
 * never shown) so it must never be pooled with app-forward pillars when judging
 * save rate — the strategy logic uses this.
 */
export const PILLAR_JOB: Record<Pillar, "growth" | "reach"> = {
  garagey: "growth",
  pov_daily: "growth",
  fake_scripted_pov: "growth",
  ai_supercars: "reach",
  tips_tricks: "growth",
};

export const PLATFORMS = ["instagram", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Scheduled = queued for a future post date, no metrics yet. Published =
 *  actually went live; the date/time is when it posted. */
export const POST_STATUSES = ["scheduled", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  scheduled: "Scheduled",
  published: "Published",
};

/** Indexed by JS getUTCDay() (0 = Sunday). Used to derive `weekday` from date. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A parseable frontmatter object. Computed rate fields are recomputed on read
 *  from the raw counters, never trusted from the file. */
export interface PostFrontmatter {
  status: PostStatus;
  platform: Platform;
  post_id: string;
  permalink: string;
  /** Planning-sheet "Judul Content" — the working title of the piece. */
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  weekday: string;
  pillar: Pillar | null; // null when unclassified / doesn't fit cleanly
  format: string;
  feature_shown: string; // e.g. "live map", "trip card", "quest notification", "none"
  /** Planning-sheet "Hashtag" — the raw hashtag line, copy-pasted as posted. */
  hashtags: string;
  /** Per-platform post links. A single piece is usually cross-posted, so the
   *  planning sheet tracks both; `permalink` stays the generic single link. */
  link_instagram: string;
  link_tiktok: string;
  duration_seconds: number;
  views: number;
  reach: number;
  likes: number;
  comments_total: number;
  comments_seeded: number;
  comments_organic_pickup: number;
  saves: number;
  shares: number;
  /** Total interactions as the platform itself reports them. Optional: when 0
   *  the engagement rate falls back to summing likes/comments/saves/shares. */
  engagements: number;
  avg_watch_time: number;
  new_follows: number;
  // Computed (persisted for readability, recomputed on load):
  save_rate: number;
  engagement_rate: number;
  hold_rate: number;

  // Optional extensions (not in the core schema, documented in content/README):
  is_repost?: boolean; // excluded from learning aggregates + rankings
  source?: "posted" | "trip_card_share"; // Share Trip UGC vs our own posts
  pillar_fit_flag?: string; // set by the classifier when a post fits no pillar cleanly
  enriched_at?: string; // ISO timestamp of last enrichment run
  checked?: boolean; // manual "done" tick in the posts table checklist column
  [key: string]: unknown; // tolerate unknown keys round-tripping through
}

/** Named body sections we render. Anything else round-trips verbatim. */
export interface PostBody {
  script: string;
  transcript: string; // "Delivered Transcript"
  onScreenText: string; // "On-Screen Text"
  caption: string;
  takeaway: string; // auto-generated
  retention: string; // manual/vision read of the retention graph
  extra: string; // any trailing content we didn't recognize
}

export interface Post {
  /** Stable id = the markdown filename without extension. */
  slug: string;
  frontmatter: PostFrontmatter;
  body: PostBody;
}

export interface AccountFunnel {
  reach: number;
  accounts_engaged: number;
  profile_visits: number;
  link_taps: number;
  new_follows: number;
}

export interface DemographicSlice {
  label: string;
  pct: number;
}

export interface AccountPlatform {
  followers: number;
  funnel_30d: AccountFunnel;
  demographics?: {
    country?: DemographicSlice[];
    age?: DemographicSlice[];
    gender?: DemographicSlice[];
  };
}

export interface AccountData {
  updated_at?: string;
  instagram?: AccountPlatform;
  tiktok?: AccountPlatform;
}

/** Minimum views a post needs before it can appear in any "top posts" ranking. */
export const MIN_VIEWS_FLOOR = 500;

/** Shape submitted by the Add/Edit Post form. Metrics are only meaningful
 *  (and only shown in the UI) when status === "published"; for "scheduled"
 *  they're ignored on write. */
export interface PostFormInput {
  status: PostStatus;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  pillar: Pillar | null;
  platform: Platform;
  title: string;
  format: string;
  feature_shown: string;
  caption: string;
  hashtags: string;
  permalink: string;
  link_instagram: string;
  link_tiktok: string;
  views?: number;
  reach?: number;
  likes?: number;
  comments_total?: number;
  comments_seeded?: number;
  comments_organic_pickup?: number;
  saves?: number;
  shares?: number;
  engagements?: number;
  avg_watch_time?: number;
  duration_seconds?: number;
  new_follows?: number;
}
