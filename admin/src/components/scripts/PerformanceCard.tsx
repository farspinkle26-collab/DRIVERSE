"use client";

// 10. "How this performed" — the linked post's real numbers, back on the script
// that produced them. Save rate against the pillar median and organic pickup
// (the number that actually matters), so browsing old scripts shows which
// approaches worked rather than only what was written.
//
// It never fabricates: a linked post still sitting at Scheduled reports that,
// and an unresolvable `linked_post` says so instead of showing zeros.

import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { STATUS } from "@/components/chartTheme";
import { fmtInt } from "@/lib/format";
import type { ScriptPerformance } from "@/lib/content/scriptPerformance";

const pct = (r: number, d = 2) => `${(r * 100).toFixed(d)}%`;

export function PerformanceCard({
  performance,
  linkedPost,
}: {
  performance: ScriptPerformance | null;
  /** The raw frontmatter value, so an unresolved reference can be shown. */
  linkedPost: string | null;
}) {
  if (!linkedPost) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold tracking-tight">How this performed</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Not linked to a post yet. Set <span className="font-mono">linked_post</span> once it goes
          live — a post slug, or its permalink — and this becomes the script&apos;s own performance
          card.
        </p>
      </Card>
    );
  }

  if (!performance) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold tracking-tight">How this performed</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          <span className="font-mono text-ink-secondary">{linkedPost}</span> doesn&apos;t match any
          post in the store. Check the slug or permalink.
        </p>
      </Card>
    );
  }

  const { post, hasMetrics, vsMedian } = performance;
  const better = vsMedian != null && vsMedian >= 0;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight">How this performed</div>
        <Link
          href={`/content/posts/${post.slug}`}
          className="truncate font-mono text-[11px] text-ink-muted transition hover:text-ink-primary"
        >
          {post.slug} →
        </Link>
      </div>

      {!hasMetrics ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Linked post is still{" "}
          <span className="text-ink-secondary">
            {post.frontmatter.status === "scheduled" ? "Scheduled" : "without views"}
          </span>{" "}
          — no metrics to report yet. Nothing is estimated here.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Views" value={fmtInt(post.frontmatter.views)} />
            <Metric label="Save rate" value={pct(performance.saveRate)} />
            <Metric
              label={`vs ${performance.pillarLabel} median`}
              value={
                vsMedian == null
                  ? "—"
                  : `${better ? "▲" : "▼"} ${Math.abs(vsMedian * 100).toFixed(0)}%`
              }
              color={vsMedian == null ? undefined : better ? STATUS.good : STATUS.critical}
              hint={
                performance.pillarMedianSaveRate != null
                  ? `median ${pct(performance.pillarMedianSaveRate)} · n=${performance.pillarN}`
                  : "no cohort yet"
              }
            />
            <Metric
              label="Organic pickup"
              value={fmtInt(performance.organicPickup)}
              hint={
                performance.organicPickupRate != null
                  ? `${(performance.organicPickupRate * 100).toFixed(0)}% of ${fmtInt(
                      performance.organicPickup + performance.seededComments,
                    )} asks`
                  : "no asks recorded"
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge label={performance.pillarLabel} color={STATUS.warning} />
            <span className="text-[11px] text-ink-muted">
              Judged against its own pillar — {performance.pillarLabel} is compared to{" "}
              {performance.pillarLabel}, never to the reach-only pillar.
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular tracking-tight" style={{ color }}>
        {value}
      </div>
      {hint && <div className="font-mono text-[10px] text-ink-muted">{hint}</div>}
    </div>
  );
}
