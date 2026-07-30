import Link from "next/link";
import { notFound } from "next/navigation";
import { readPost } from "@/lib/content/store";
import { PILLAR_LABELS, POST_STATUS_LABELS } from "@/lib/content/types";
import { renderMarkdown } from "@/lib/content/markdown";
import { fmtInt, fmtDate } from "@/lib/format";
import { fmtAbsoluteWIB } from "@/lib/dates";
import { Card, SectionHeader, Badge } from "@/components/ui";
import { STATUS, AXIS } from "@/components/chartTheme";
import { EditPostButton } from "@/components/EditPostButton";

export const dynamic = "force-dynamic";

const pct = (r: number, d = 1) => `${(r * 100).toFixed(d)}%`;

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  const post = await readPost(params.id);
  if (!post) notFound();
  const fm = post.frontmatter;

  const rows: [string, string][] = [
    ["Status", POST_STATUS_LABELS[fm.status]],
    ["Platform", fm.platform],
    ["Post ID", fm.post_id],
    ["Judul Content", fm.title || "—"],
    ["Date / time", `${fmtDate(fm.date)} ${fm.time} (${fm.weekday})`],
    ["Pillar", fm.pillar ? PILLAR_LABELS[fm.pillar] : "— unclassified"],
    ["Jenis Konten / format", fm.format || "—"],
    ["Feature shown", fm.feature_shown],
    ["Duration", `${fm.duration_seconds}s`],
    ["Views", fmtInt(fm.views)],
    ["Reach", fmtInt(fm.reach)],
    ["Likes", fmtInt(fm.likes)],
    ["Comments (total)", fmtInt(fm.comments_total)],
    ["Comments — seeded", fmtInt(fm.comments_seeded)],
    ["Comments — organic pickup", fmtInt(fm.comments_organic_pickup)],
    ["Saves", fmtInt(fm.saves)],
    ["Shares", fmtInt(fm.shares)],
    ["Engagements (reported)", fm.engagements ? fmtInt(fm.engagements) : "— (summed)"],
    ["Avg watch time", `${fm.avg_watch_time}s`],
    ["New follows", fmtInt(fm.new_follows)],
    ["Save rate", pct(fm.save_rate, 2)],
    ["Engagement rate", pct(fm.engagement_rate, 2)],
    ["Hold rate", pct(fm.hold_rate, 1)],
  ];
  if (fm.hashtags) rows.push(["Hashtag", fm.hashtags]);
  if (fm.source) rows.push(["Source", fm.source]);
  if (fm.is_repost) rows.push(["Repost", "yes (excluded from aggregates)"]);
  if (fm.pillar_fit_flag) rows.push(["Pillar-fit flag", fm.pillar_fit_flag]);

  const sections: [string, string][] = [
    ["Script", post.body.script],
    ["Delivered Transcript", post.body.transcript],
    ["On-Screen Text", post.body.onScreenText],
    ["Caption", post.body.caption],
    ["Takeaway", post.body.takeaway],
    ["Retention", post.body.retention],
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`${fm.pillar ? PILLAR_LABELS[fm.pillar] : "Post"} · ${fm.post_id}`}
        description={fm.permalink || undefined}
        right={
          <div className="flex items-center gap-2">
            <EditPostButton post={post} />
            <Link href="/content" className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary">
              ← Back
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge label={POST_STATUS_LABELS[fm.status]} color={fm.status === "published" ? STATUS.good : AXIS} />
        <span
          className="text-lg font-semibold tabular tracking-tight"
          title={fmtAbsoluteWIB(`${fm.date}T${fm.time || "00:00"}:00Z`)}
        >
          {fmtDate(fm.date)} · {fm.time} · {fm.weekday}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {(
          [
            ["Instagram", fm.link_instagram],
            ["TikTok", fm.link_tiktok],
          ] as [string, string][]
        )
          .filter(([, url]) => url)
          .map(([label, url]) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-series-1 hover:underline"
            >
              Open on {label} ↗
            </a>
          ))}
      </div>

      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Frontmatter</div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-hairline/50 py-1 text-sm">
              <span className="text-ink-muted">{k}</span>
              <span className="tabular text-right text-ink-secondary">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      {sections.map(([title, content]) => (
        <Card key={title} className="p-4">
          <div className="mb-2 text-sm font-semibold">
            {title}
            {title === "Takeaway" && <span className="ml-2 text-xs font-normal text-ink-muted">(auto-generated)</span>}
          </div>
          {content.trim() ? (
            <div className="prose-content text-sm text-ink-secondary" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          ) : (
            <div className="text-sm text-ink-muted">
              {title === "Takeaway"
                ? "Not generated yet — needs settled metrics (views + ≥2 days), then run enrichment."
                : title === "Retention"
                  ? "No retention read. Drop a retention-graph screenshot into enrichment to summarize the drop-off."
                  : "—"}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
