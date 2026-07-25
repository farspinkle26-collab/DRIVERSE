// Ingestion module — deliberately isolated behind one interface so the rest of
// the pipeline (enrichment, dashboard, strategy) never knows or cares where the
// numbers came from. Today the only working source is MANUAL paste/vision,
// because no Instagram/TikTok or Supermetrics MCP connector is available in
// this environment. When a real connector is wired up, implement IngestSource
// against it and nothing downstream changes.
//
// See content/README.md → "Ingestion" for the current limitation.

import {
  PILLARS,
  PLATFORMS,
  WEEKDAY_NAMES,
  type Pillar,
  type Platform,
  type Post,
  type PostFrontmatter,
} from "./types";
import { computeDerived } from "./store";

/** Normalized, source-independent metrics for one post. */
export interface IngestedMetrics {
  platform: Platform;
  post_id: string;
  permalink?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  pillar?: Pillar | null;
  format?: string;
  feature_shown?: string;
  duration_seconds?: number;
  views?: number;
  reach?: number;
  likes?: number;
  comments_total?: number;
  comments_seeded?: number;
  comments_organic_pickup?: number;
  saves?: number;
  shares?: number;
  avg_watch_time?: number;
  new_follows?: number;
  source?: "posted" | "trip_card_share";
  is_repost?: boolean;
}

export interface IngestSource {
  readonly id: string;
  readonly label: string;
  available(): boolean;
  /** Human-readable note on how this source works / why it's limited. */
  note(): string;
  /** Parse a source-specific payload into normalized metrics. */
  parse(input: unknown): IngestedMetrics;
}

// ── Manual source (paste JSON or Insights text) ─────────────────────────────
const NUMBER_LABELS: { field: keyof IngestedMetrics; aliases: string[] }[] = [
  { field: "views", aliases: ["views", "plays", "video views"] },
  { field: "reach", aliases: ["reach", "accounts reached"] },
  { field: "likes", aliases: ["likes"] },
  { field: "comments_total", aliases: ["comments", "comments total", "comment count"] },
  { field: "comments_seeded", aliases: ["seeded", "seeded comments"] },
  {
    field: "comments_organic_pickup",
    aliases: ["organic", "organic pickup", "organic comments", "unprompted asks"],
  },
  { field: "saves", aliases: ["saves", "saved", "bookmarks"] },
  { field: "shares", aliases: ["shares", "shared"] },
  { field: "new_follows", aliases: ["follows", "new follows", "new followers", "follows from post"] },
  { field: "duration_seconds", aliases: ["duration", "length", "duration seconds"] },
  { field: "avg_watch_time", aliases: ["avg watch time", "average watch time", "avg watch"] },
];

function toNumber(s: string): number | undefined {
  // Handle "1.2k", "3,400", "12.4s", "88%".
  const m = s.trim().match(/(-?[\d.,]+)\s*([kmKM%]?)/);
  if (!m) return undefined;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (Number.isNaN(n)) return undefined;
  const suffix = m[2].toLowerCase();
  if (suffix === "k") n *= 1000;
  else if (suffix === "m") n *= 1000000;
  return n;
}

export class ManualIngestSource implements IngestSource {
  readonly id = "manual";
  readonly label = "Manual paste / screenshot";

  available(): boolean {
    return true;
  }

  note(): string {
    return (
      "No native Instagram/TikTok or Supermetrics connector is available in " +
      "this environment, so metrics are entered by hand: paste a JSON object, " +
      "or paste the raw text copied from an Insights screen (label: value per " +
      "line). A screenshot can be read with the vision model and pasted here " +
      "as text. Swap in a real API by implementing IngestSource."
    );
  }

  parse(input: unknown): IngestedMetrics {
    if (typeof input === "object" && input !== null) {
      return this.fromObject(input as Record<string, unknown>);
    }
    if (typeof input === "string") {
      const trimmed = input.trim();
      if (trimmed.startsWith("{")) {
        try {
          return this.fromObject(JSON.parse(trimmed));
        } catch {
          // fall through to line parsing
        }
      }
      return this.fromText(trimmed);
    }
    throw new Error("Unsupported manual ingest input.");
  }

  private fromObject(o: Record<string, unknown>): IngestedMetrics {
    const platform = PLATFORMS.includes(o.platform as Platform)
      ? (o.platform as Platform)
      : "instagram";
    const pillar =
      o.pillar == null
        ? undefined
        : PILLARS.includes(o.pillar as Pillar)
          ? (o.pillar as Pillar)
          : null;
    const numeric = (v: unknown) =>
      v == null ? undefined : typeof v === "number" ? v : toNumber(String(v));
    return {
      platform,
      post_id: String(o.post_id ?? "").trim(),
      permalink: o.permalink != null ? String(o.permalink) : undefined,
      date: o.date != null ? String(o.date) : undefined,
      time: o.time != null ? String(o.time) : undefined,
      pillar,
      format: o.format != null ? String(o.format) : undefined,
      feature_shown: o.feature_shown != null ? String(o.feature_shown) : undefined,
      duration_seconds: numeric(o.duration_seconds),
      views: numeric(o.views),
      reach: numeric(o.reach),
      likes: numeric(o.likes),
      comments_total: numeric(o.comments_total),
      comments_seeded: numeric(o.comments_seeded),
      comments_organic_pickup: numeric(o.comments_organic_pickup),
      saves: numeric(o.saves),
      shares: numeric(o.shares),
      avg_watch_time: numeric(o.avg_watch_time),
      new_follows: numeric(o.new_follows),
      source:
        o.source === "trip_card_share" ? "trip_card_share" : o.source === "posted" ? "posted" : undefined,
      is_repost: typeof o.is_repost === "boolean" ? o.is_repost : undefined,
    };
  }

  private fromText(text: string): IngestedMetrics {
    const out: IngestedMetrics = { platform: "instagram", post_id: "" };
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const sep = line.includes(":") ? ":" : /\s{2,}|\t/.exec(line) ? "\t" : null;
      let label = "";
      let value = "";
      if (line.includes(":")) {
        const i = line.indexOf(":");
        label = line.slice(0, i);
        value = line.slice(i + 1);
      } else if (sep) {
        const parts = line.split(/\s{2,}|\t/);
        label = parts[0];
        value = parts.slice(1).join(" ");
      } else {
        continue;
      }
      const key = label.trim().toLowerCase();
      const valTrim = value.trim();

      if (key === "platform") {
        const p = valTrim.toLowerCase();
        if (PLATFORMS.includes(p as Platform)) out.platform = p as Platform;
        continue;
      }
      if (key === "post_id" || key === "post id" || key === "id") {
        out.post_id = valTrim;
        continue;
      }
      if (key === "permalink" || key === "link" || key === "url") {
        out.permalink = valTrim;
        continue;
      }
      if (key === "date") { out.date = valTrim; continue; }
      if (key === "time") { out.time = valTrim; continue; }
      if (key === "pillar") {
        out.pillar = PILLARS.includes(valTrim as Pillar) ? (valTrim as Pillar) : null;
        continue;
      }
      if (key === "format") { out.format = valTrim; continue; }
      if (key === "feature_shown" || key === "feature shown" || key === "feature") {
        out.feature_shown = valTrim;
        continue;
      }
      const match = NUMBER_LABELS.find((n) => n.aliases.includes(key));
      if (match) {
        const n = toNumber(valTrim);
        if (n != null) (out as unknown as Record<string, unknown>)[match.field] = n;
      }
    }
    return out;
  }
}

// ── Supermetrics placeholder (not connected here) ───────────────────────────
// Kept as a typed stub, not dead code: it advertises itself as unavailable and
// tells the operator exactly what to do. Replace parse() with the real mapping
// once the connector is wired.
export class SupermetricsIngestSource implements IngestSource {
  readonly id = "supermetrics";
  readonly label = "Supermetrics MCP (Instagram)";
  available(): boolean {
    return false; // no connector in this environment
  }
  note(): string {
    return (
      "Supermetrics exists in the connector registry but is NOT connected to " +
      "this workspace. Connect it in claude.ai settings, then implement " +
      "parse() to map its data_query rows onto IngestedMetrics."
    );
  }
  parse(): IngestedMetrics {
    throw new Error("Supermetrics is not connected in this environment.");
  }
}

/** The active ingestion source. Manual until a real connector is available. */
export function activeIngestSource(): IngestSource {
  const supermetrics = new SupermetricsIngestSource();
  if (supermetrics.available()) return supermetrics;
  return new ManualIngestSource();
}

// ── Apply ingested metrics onto a Post (create or merge) ─────────────────────
function weekdayFromDate(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAY_NAMES[d.getUTCDay()];
}

function slugFor(m: IngestedMetrics): string {
  const date = m.date || new Date().toISOString().slice(0, 10);
  const idPart = (m.post_id || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${date}-${idPart}`;
}

/**
 * Merge ingested metrics into an existing post (or build a new one). Only
 * provided fields overwrite; identity/body are preserved. Derived rates and
 * weekday are always recomputed. Returns the Post plus whether it's new.
 */
export function applyIngest(
  metrics: IngestedMetrics,
  existing: Post | null,
): { post: Post; created: boolean } {
  const base: PostFrontmatter =
    existing?.frontmatter ??
    ({
      status: "published",
      platform: metrics.platform,
      post_id: metrics.post_id,
      permalink: "",
      date: metrics.date || new Date().toISOString().slice(0, 10),
      time: metrics.time || "12:00",
      weekday: "",
      pillar: metrics.pillar ?? null,
      format: "",
      feature_shown: "none",
      duration_seconds: 0,
      views: 0,
      reach: 0,
      likes: 0,
      comments_total: 0,
      comments_seeded: 0,
      comments_organic_pickup: 0,
      saves: 0,
      shares: 0,
      avg_watch_time: 0,
      new_follows: 0,
      save_rate: 0,
      engagement_rate: 0,
      hold_rate: 0,
    } as PostFrontmatter);

  const fm: PostFrontmatter = { ...base, status: "published" };
  const set = <K extends keyof IngestedMetrics>(k: K, target: keyof PostFrontmatter) => {
    const v = metrics[k];
    if (v !== undefined && v !== null) (fm as Record<string, unknown>)[target] = v;
  };
  fm.platform = metrics.platform ?? fm.platform;
  fm.post_id = metrics.post_id || fm.post_id;
  set("permalink", "permalink");
  set("date", "date");
  set("time", "time");
  if (metrics.pillar !== undefined) fm.pillar = metrics.pillar;
  set("format", "format");
  set("feature_shown", "feature_shown");
  set("duration_seconds", "duration_seconds");
  set("views", "views");
  set("reach", "reach");
  set("likes", "likes");
  set("comments_total", "comments_total");
  set("comments_seeded", "comments_seeded");
  set("comments_organic_pickup", "comments_organic_pickup");
  set("saves", "saves");
  set("shares", "shares");
  set("avg_watch_time", "avg_watch_time");
  set("new_follows", "new_follows");
  if (metrics.source !== undefined) fm.source = metrics.source;
  if (metrics.is_repost !== undefined) fm.is_repost = metrics.is_repost;

  fm.weekday = fm.date ? weekdayFromDate(fm.date) : fm.weekday;
  Object.assign(fm, computeDerived(fm));

  const post: Post = {
    slug: existing?.slug ?? slugFor(metrics),
    frontmatter: fm,
    body:
      existing?.body ??
      {
        script: "",
        transcript: "",
        onScreenText: "",
        caption: "",
        takeaway: "",
        retention: "",
        extra: "",
      },
  };
  return { post, created: !existing };
}
