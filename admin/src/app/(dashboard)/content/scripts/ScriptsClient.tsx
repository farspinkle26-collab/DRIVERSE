"use client";

// The POV Script section's home: the Kanban pipeline (primary), a flat table
// view over the same filtered set, and the filters/search shared by both (#11).
//
// POV gets its own space because it's the flagship pillar: everything here knows
// about the 3–5s app moment, feature rotation, hook repetition and the Solo vs
// Social density gate. The general Scriptor at /content/scriptor stays what it
// is — one-off generation for any pillar.

import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionHeader, Card, Banner, EmptyState } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { DateRangePicker } from "@/components/DateRangePicker";
import { RefreshButton } from "@/components/RefreshButton";
import { DateCell } from "@/components/DateCell";
import { ScriptKanban, type KanbanRow } from "@/components/scripts/ScriptKanban";
import {
  FeatureTag,
  PovTypeBadge,
  ScriptStatusBadge,
} from "@/components/scripts/scriptBadges";
import { resolveDateRange, type DateRangeValue } from "@/lib/dates";
import {
  PLATFORM_TARGETS,
  PLATFORM_TARGET_LABELS,
  POV_TYPES,
  POV_TYPE_LABELS,
  SCRIPT_FEATURES,
  SCRIPT_FEATURE_LABELS,
  SCRIPT_STATUSES,
  SCRIPT_STATUS_LABELS,
  type PlatformTarget,
  type PovScript,
  type PovType,
  type ScriptFeature,
  type ScriptStatus,
} from "@/lib/content/scriptTypes";
import {
  byRecency,
  checklistProgress,
  densityGate,
  featureRotation,
  type DensitySnapshot,
} from "@/lib/content/scriptRules";
import { scriptPerformance } from "@/lib/content/scriptPerformance";
import type { Post } from "@/lib/content/types";

interface Props {
  scripts: PovScript[];
  posts: Post[];
  density: DensitySnapshot;
}

type ViewKey = "board" | "list";

const pct = (r: number, d = 2) => `${(r * 100).toFixed(d)}%`;

const filterButton = (active: boolean) =>
  `rounded-md px-2 py-1 text-[11px] font-medium transition ${
    active ? "bg-series-1 text-white" : "text-ink-muted hover:text-ink-secondary"
  }`;

export function ScriptsClient({ scripts, posts, density }: Props) {
  const [view, setView] = useState<ViewKey>("board");
  const [povType, setPovType] = useState<PovType | "all">("all");
  const [status, setStatus] = useState<ScriptStatus | "all">("all");
  const [feature, setFeature] = useState<ScriptFeature | "all">("all");
  const [platform, setPlatform] = useState<PlatformTarget | "all">("all");
  const [range, setRange] = useState<DateRangeValue>({ preset: "all" });
  const [query, setQuery] = useState("");

  const rows = useMemo<KanbanRow[]>(
    () =>
      byRecency(scripts).map((script) => ({
        script,
        performance: scriptPerformance(script, posts),
      })),
    [scripts, posts],
  );

  const filtered = useMemo(() => {
    const window = resolveDateRange(range);
    const q = query.trim().toLowerCase();
    return rows.filter(({ script }) => {
      const fm = script.frontmatter;
      if (povType !== "all" && fm.pov_type !== povType) return false;
      if (status !== "all" && fm.status !== status) return false;
      if (feature !== "all" && fm.feature_shown !== feature) return false;
      if (platform !== "all" && fm.platform_target !== platform) return false;
      if (range.preset !== "all") {
        const created = new Date(`${fm.created_date}T12:00:00Z`);
        if (Number.isNaN(created.getTime())) return false;
        if (created < window.start || created > window.end) return false;
      }
      if (q) {
        const haystack = [fm.title, fm.hook, script.body.script, script.body.onScreenText]
          .join("\n")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, povType, status, feature, platform, range, query]);

  // Board-wide context: the rotation over the whole set (what the next script
  // should show) and the Social gate, which is a property of right now, not of
  // any one script.
  const rotation = useMemo(() => featureRotation(scripts), [scripts]);
  const socialGate = densityGate("social", density);
  const socialCount = scripts.filter((s) => s.frontmatter.pov_type === "social").length;

  const columns: Column<KanbanRow>[] = [
    {
      key: "title",
      header: "Title",
      render: ({ script }) => (
        <Link
          href={`/content/scripts/${script.id}`}
          className="font-medium text-ink-primary transition hover:text-series-1"
        >
          {script.frontmatter.title || script.id}
        </Link>
      ),
      sortValue: ({ script }) => script.frontmatter.title || script.id,
    },
    {
      key: "pov_type",
      header: "POV",
      render: ({ script }) => <PovTypeBadge type={script.frontmatter.pov_type} />,
      sortValue: ({ script }) => script.frontmatter.pov_type,
    },
    {
      key: "status",
      header: "Status",
      render: ({ script }) => <ScriptStatusBadge status={script.frontmatter.status} />,
      sortValue: ({ script }) => SCRIPT_STATUSES.indexOf(script.frontmatter.status),
      csvValue: ({ script }) => script.frontmatter.status,
    },
    {
      key: "feature_shown",
      header: "Feature",
      render: ({ script }) => <FeatureTag feature={script.frontmatter.feature_shown} />,
      sortValue: ({ script }) => script.frontmatter.feature_shown,
    },
    {
      key: "hook",
      header: "Hook",
      render: ({ script }) => (
        <span className="block max-w-[22rem] truncate text-ink-secondary" title={script.frontmatter.hook}>
          {script.frontmatter.hook || "—"}
        </span>
      ),
      sortValue: ({ script }) => script.frontmatter.hook,
    },
    {
      key: "platform_target",
      header: "Platform",
      render: ({ script }) => (
        <span className="text-ink-secondary">
          {PLATFORM_TARGET_LABELS[script.frontmatter.platform_target]}
        </span>
      ),
      sortValue: ({ script }) => script.frontmatter.platform_target,
    },
    {
      key: "created_date",
      header: "Created",
      render: ({ script }) => <DateCell value={`${script.frontmatter.created_date}T12:00:00Z`} />,
      sortValue: ({ script }) => script.frontmatter.created_date,
      csvValue: ({ script }) => script.frontmatter.created_date,
    },
    {
      key: "filmed_date",
      header: "Filmed",
      render: ({ script }) =>
        script.frontmatter.filmed_date ? (
          <DateCell value={`${script.frontmatter.filmed_date}T12:00:00Z`} />
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      sortValue: ({ script }) => script.frontmatter.filmed_date ?? "",
      csvValue: ({ script }) => script.frontmatter.filmed_date ?? "",
      defaultHidden: true,
    },
    {
      key: "checklist",
      header: "Checklist",
      align: "right",
      render: ({ script }) => {
        const p = checklistProgress(script.body.filmingChecklist);
        if (p.total === 0) return <span className="text-ink-muted">—</span>;
        return (
          <span className={p.done === p.total ? "text-status-good" : "text-ink-secondary"}>
            {p.done}/{p.total}
          </span>
        );
      },
      sortValue: ({ script }) => {
        const p = checklistProgress(script.body.filmingChecklist);
        return p.total === 0 ? -1 : p.done / p.total;
      },
      defaultHidden: true,
    },
    {
      key: "save_rate",
      header: "Save rate",
      align: "right",
      render: ({ performance }) =>
        performance?.hasMetrics ? (
          <span className="text-ink-secondary">{pct(performance.saveRate)}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
      sortValue: ({ performance }) => (performance?.hasMetrics ? performance.saveRate : -1),
      csvValue: ({ performance }) => (performance?.hasMetrics ? performance.saveRate : ""),
    },
    {
      key: "linked_post",
      header: "Linked post",
      render: ({ script, performance }) => {
        const raw = script.frontmatter.linked_post;
        if (!raw) return <span className="text-ink-muted">—</span>;
        if (!performance) {
          return (
            <span className="text-status-warning" title={raw}>
              unresolved
            </span>
          );
        }
        return (
          <Link
            href={`/content/posts/${performance.post.slug}`}
            className="font-mono text-[11px] text-ink-secondary transition hover:text-ink-primary"
          >
            {performance.post.slug}
          </Link>
        );
      },
      sortValue: ({ script }) => script.frontmatter.linked_post ?? "",
      defaultHidden: true,
    },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="POV Scripts"
        description="The POV pipeline: draft, refine and film Solo and Social POV scripts. One file per script in content/scripts/, with feature rotation, hook repetition and the Social density gate enforced where the writing happens."
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/content/scripts/new"
              className="rounded-lg bg-series-1 px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
            >
              + New script
            </Link>
            <Link
              href="/content"
              className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
            >
              ← Content
            </Link>
            <RefreshButton />
          </div>
        }
      />

      {socialCount > 0 && socialGate && (
        <Banner tone={socialGate.tone}>{socialGate.message}</Banner>
      )}

      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, hook, script…"
            className="w-56 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
          />
          <div className="inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
            <button onClick={() => setPovType("all")} className={filterButton(povType === "all")}>
              All POV
            </button>
            {POV_TYPES.map((t) => (
              <button key={t} onClick={() => setPovType(t)} className={filterButton(povType === t)}>
                {POV_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ScriptStatus | "all")}
            className="rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink-secondary"
          >
            <option value="all">All statuses</option>
            {SCRIPT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SCRIPT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={feature}
            onChange={(e) => setFeature(e.target.value as ScriptFeature | "all")}
            className="rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink-secondary"
          >
            <option value="all">All features</option>
            {SCRIPT_FEATURES.map((f) => (
              <option key={f} value={f}>
                {SCRIPT_FEATURE_LABELS[f]}
              </option>
            ))}
          </select>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PlatformTarget | "all")}
            className="rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink-secondary"
          >
            <option value="all">All platforms</option>
            {PLATFORM_TARGETS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_TARGET_LABELS[p]}
              </option>
            ))}
          </select>
          <div className="ml-auto inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
            <button onClick={() => setView("board")} className={filterButton(view === "board")}>
              Board
            </button>
            <button onClick={() => setView("list")} className={filterButton(view === "list")}>
              List
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <span className="font-mono text-[11px] text-ink-muted">
            {filtered.length} of {rows.length} scripts
            {rotation.recommended && (
              <>
                {" · next feature: "}
                <span className="text-status-good">
                  {SCRIPT_FEATURE_LABELS[rotation.recommended]}
                </span>
              </>
            )}
          </span>
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="No POV scripts yet — start one with + New script." />
      ) : view === "board" ? (
        <ScriptKanban rows={filtered} />
      ) : (
        <Card className="p-4">
          <DataTable
            columns={columns}
            rows={filtered}
            initialSort={{ key: "created_date", dir: "desc" }}
            csvFilename="pov-scripts"
            emptyMessage="No scripts match these filters."
            getRowHref={({ script }) => `/content/scripts/${script.id}`}
          />
        </Card>
      )}
    </div>
  );
}
