"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PILLARS, PILLAR_LABELS, PLATFORMS, type Pillar, type Platform, type Post, type PostStatus } from "@/lib/content/types";

interface Props {
  /** Omit to open the "Add Post" form; pass an existing post to edit it. */
  post?: Post;
  onClose: () => void;
}

const METRIC_FIELDS: { key: keyof MetricsState; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "reach", label: "Reach" },
  { key: "likes", label: "Likes" },
  { key: "comments_total", label: "Comments" },
  { key: "comments_seeded", label: "Comments — seeded" },
  { key: "comments_organic_pickup", label: "Comments — organic pickup" },
  { key: "saves", label: "Saves" },
  { key: "shares", label: "Shares" },
  { key: "engagements", label: "Engagements (total)" },
  { key: "avg_watch_time", label: "Avg watch time (s)" },
  { key: "duration_seconds", label: "Duration (s)" },
  { key: "new_follows", label: "New follows" },
];

interface MetricsState {
  views: string;
  reach: string;
  likes: string;
  comments_total: string;
  comments_seeded: string;
  comments_organic_pickup: string;
  saves: string;
  shares: string;
  engagements: string;
  avg_watch_time: string;
  duration_seconds: string;
  new_follows: string;
}

function emptyMetrics(): MetricsState {
  return {
    views: "",
    reach: "",
    likes: "",
    comments_total: "",
    comments_seeded: "",
    comments_organic_pickup: "",
    saves: "",
    shares: "",
    engagements: "",
    avg_watch_time: "",
    duration_seconds: "",
    new_follows: "",
  };
}

export function PostFormModal({ post, onClose }: Props) {
  const router = useRouter();
  const fm = post?.frontmatter;
  const isEdit = !!post;

  const [status, setStatus] = useState<PostStatus>(fm?.status ?? "scheduled");
  const [date, setDate] = useState(fm?.date ?? "");
  const [time, setTime] = useState(fm?.time ?? "");
  const [pillar, setPillar] = useState<Pillar | "">(fm?.pillar ?? "");
  const [platform, setPlatform] = useState<Platform>(fm?.platform ?? "instagram");
  const [title, setTitle] = useState(fm?.title ?? "");
  const [format, setFormat] = useState(fm?.format ?? "");
  const [featureShown, setFeatureShown] = useState(fm?.feature_shown ?? "");
  const [caption, setCaption] = useState(post?.body.caption ?? "");
  const [hashtags, setHashtags] = useState(fm?.hashtags ?? "");
  const [linkInstagram, setLinkInstagram] = useState(fm?.link_instagram ?? "");
  const [linkTiktok, setLinkTiktok] = useState(fm?.link_tiktok ?? "");
  const [metrics, setMetrics] = useState<MetricsState>(() => {
    if (!fm || fm.status !== "published") return emptyMetrics();
    return {
      views: String(fm.views || ""),
      reach: String(fm.reach || ""),
      likes: String(fm.likes || ""),
      engagements: String(fm.engagements || ""),
      comments_total: String(fm.comments_total || ""),
      comments_seeded: String(fm.comments_seeded || ""),
      comments_organic_pickup: String(fm.comments_organic_pickup || ""),
      saves: String(fm.saves || ""),
      shares: String(fm.shares || ""),
      avg_watch_time: String(fm.avg_watch_time || ""),
      duration_seconds: String(fm.duration_seconds || ""),
      new_follows: String(fm.new_follows || ""),
    };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        status,
        date,
        time,
        pillar,
        platform,
        title,
        format,
        feature_shown: featureShown,
        caption,
        hashtags,
        link_instagram: linkInstagram,
        link_tiktok: linkTiktok,
      };
      if (status === "published") {
        for (const { key } of METRIC_FIELDS) {
          payload[key] = metrics[key];
        }
      }
      const url = isEdit ? `/api/content/posts/${post!.slug}` : "/api/content/posts";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Save failed.");
      router.refresh();
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-hairline bg-surface-1 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEdit ? "Edit post" : "Add post"}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-ink-muted hover:text-ink-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PostStatus)}
                className={inputClass}
              >
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field label="Platform">
              <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={inputClass}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p === "instagram" ? "Instagram" : "TikTok"}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={status === "scheduled" ? "Scheduled date" : "Date published"}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
            </Field>
            <Field label="Time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={inputClass} />
            </Field>
          </div>

          <Field label="Judul Content / title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pokédex showcase — Civic FD2"
              className={inputClass}
            />
          </Field>

          <Field label="Pillar">
            <select value={pillar} onChange={(e) => setPillar(e.target.value as Pillar)} required className={inputClass}>
              <option value="" disabled>
                Select a pillar…
              </option>
              {PILLARS.map((p) => (
                <option key={p} value={p}>
                  {PILLAR_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis Konten / format">
              <input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="e.g. car showcase, reels"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Feature shown">
              <input
                value={featureShown}
                onChange={(e) => setFeatureShown(e.target.value)}
                placeholder="e.g. live map, none"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Caption / notes (optional)">
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className={inputClass} />
          </Field>

          <Field label="Hashtag (optional)">
            <textarea
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              rows={2}
              placeholder="#driverse #mobil #otomotif"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Link Post Instagram">
              <input
                value={linkInstagram}
                onChange={(e) => setLinkInstagram(e.target.value)}
                placeholder="https://instagram.com/reel/…"
                className={inputClass}
              />
            </Field>
            <Field label="Link Post TikTok">
              <input
                value={linkTiktok}
                onChange={(e) => setLinkTiktok(e.target.value)}
                placeholder="https://tiktok.com/@…"
                className={inputClass}
              />
            </Field>
          </div>

          {status === "published" && (
            <div className="rounded-lg border border-hairline bg-surface-2 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Metrics (optional — also editable per cell in the content plan table)
              </div>
              <p className="mb-2 text-[11px] leading-snug text-ink-muted">
                Engagements is the platform&apos;s own interactions total. Leave it blank to
                have the engagement rate sum likes + comments + saves + shares instead.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {METRIC_FIELDS.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <input
                      type="number"
                      value={metrics[key]}
                      onChange={(e) => setMetrics((m) => ({ ...m, [key]: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          {err && <div className="text-xs text-status-critical">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink-secondary hover:text-ink-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-series-1 px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-60"
            >
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-ink-muted">{label}</div>
      {children}
    </label>
  );
}
