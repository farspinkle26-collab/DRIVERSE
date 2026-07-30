// Shared request-body validation for the Add/Edit Post API routes.
import { PILLARS, PLATFORMS, POST_STATUSES, type PostFormInput } from "./types";

export function parsePostFormInput(body: unknown): PostFormInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown) => {
    if (v === "" || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const status = str(b.status);
  if (!POST_STATUSES.includes(status as (typeof POST_STATUSES)[number])) {
    throw new Error("status must be 'scheduled' or 'published'.");
  }
  const platform = str(b.platform);
  if (!PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) {
    throw new Error("platform must be 'instagram' or 'tiktok'.");
  }
  const pillarRaw = str(b.pillar);
  const pillar = PILLARS.includes(pillarRaw as (typeof PILLARS)[number])
    ? (pillarRaw as (typeof PILLARS)[number])
    : null;
  if (!pillar) throw new Error("pillar is required.");
  const date = str(b.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date is required (YYYY-MM-DD).");
  const time = str(b.time);
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("time is required (HH:MM).");
  const format = str(b.format);
  if (!format) throw new Error("format is required.");
  const feature_shown = str(b.feature_shown) || "none";

  return {
    status: status as PostFormInput["status"],
    date,
    time,
    pillar,
    platform: platform as PostFormInput["platform"],
    title: str(b.title),
    format,
    feature_shown,
    caption: str(b.caption),
    hashtags: str(b.hashtags),
    permalink: str(b.permalink),
    link_instagram: str(b.link_instagram),
    link_tiktok: str(b.link_tiktok),
    views: num(b.views),
    reach: num(b.reach),
    likes: num(b.likes),
    comments_total: num(b.comments_total),
    comments_seeded: num(b.comments_seeded),
    comments_organic_pickup: num(b.comments_organic_pickup),
    saves: num(b.saves),
    shares: num(b.shares),
    engagements: num(b.engagements),
    avg_watch_time: num(b.avg_watch_time),
    duration_seconds: num(b.duration_seconds),
    new_follows: num(b.new_follows),
  };
}
