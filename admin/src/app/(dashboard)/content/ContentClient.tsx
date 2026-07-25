"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { SectionHeader, StatCard, ChartCard, Card, EmptyState, Banner } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { RefreshButton } from "@/components/RefreshButton";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { fmtInt, fmtDate } from "@/lib/format";
import {
  PILLARS,
  PILLAR_LABELS,
  type AccountData,
  type Pillar,
  type Post,
} from "@/lib/content/types";
import {
  allPillarStats,
  weekdayDaypartHeat,
  platformLabel,
  periodTotals,
  inLastDays,
  inPrevDays,
  DAYPARTS,
  WEEKDAYS,
} from "@/lib/content/metrics";
import { renderMarkdown } from "@/lib/content/markdown";

// StrategyCard shape mirrors lib/content/strategy (imported as a type only so
// the server-only module is never pulled into the client bundle).
interface PillarRec {
  pillar: Pillar;
  label: string;
  job: "growth" | "reach";
  n: number;
  organicThis: number;
  organicPrev: number;
  organicTrend: string;
  saveRateMedian: number;
  viewsMedian: number;
  verdict: string;
  reason: string;
}
interface StrategyCard {
  generatedAt: string;
  pillars: PillarRec[];
  testSlot: { weekday: string; note: string } | null;
  headline: string;
  narrative: string;
}

interface Props {
  posts: Post[];
  account: AccountData | null;
  whatWorks: string;
  strategy: StrategyCard;
  generatedAt: string;
}

const pct = (r: number, d = 1) => `${(r * 100).toFixed(d)}%`;
const PERIODS = [7, 14, 30] as const;
type PeriodDays = (typeof PERIODS)[number];

const PILLAR_COLOR: Record<Pillar, string> = {
  garagey: SERIES[0],
  pov_daily: SERIES[2],
  fake_scripted_pov: SERIES[4],
  ai_supercars: SERIES[1],
  tips_tricks: SERIES[3],
};

type TabKey = "overview" | "analytics" | "insights";

export function ContentClient(props: Props) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Content performance"
        description="Organic short-form (Instagram + TikTok). Tracks post performance, learns what's working, and generates forward recommendations."
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/content/ingest"
              className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
            >
              + Ingest metrics
            </Link>
            <Link
              href="/content/scriptor"
              className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
            >
              Scriptor
            </Link>
            <RefreshButton />
          </div>
        }
      />

      <div className="flex gap-1 border-b border-hairline">
        {([
          ["overview", "Overview"],
          ["analytics", "Analytics"],
          ["insights", "Insights & Strategy"],
        ] as [TabKey, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === k
                ? "border-series-1 text-ink-primary"
                : "border-transparent text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {props.posts.length === 0 && (
        <Banner tone="warning">
          No posts in the content store yet. Add one via <strong>Ingest metrics</strong>, or drop a
          Markdown file into <code>content/posts/</code>.
        </Banner>
      )}

      {tab === "overview" && <OverviewTab {...props} />}
      {tab === "analytics" && <AnalyticsTab {...props} />}
      {tab === "insights" && <InsightsTab {...props} />}

      <p className="text-xs text-ink-muted">
        Store read {fmtDate(props.generatedAt)} · {props.posts.length} posts · use Refresh to re-read the files.
      </p>
    </div>
  );
}

// ── Tab 1: Overview ─────────────────────────────────────────────────────────
function OverviewTab({ posts }: Props) {
  const [days, setDays] = useState<PeriodDays>(14);
  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const now = useMemo(() => new Date(), []);

  const stats = useMemo(() => {
    const cur = periodTotals(posts.filter((p) => inLastDays(p.frontmatter.date, days, now)));
    const prev = periodTotals(posts.filter((p) => inPrevDays(p.frontmatter.date, days, now)));
    return { cur, prev };
  }, [posts, days, now]);

  const series = useMemo(() => buildDaySeries(posts, days, now), [posts, days, now]);

  const gridRows = useMemo(() => {
    return posts
      .filter((p) => pillarFilter === "all" || p.frontmatter.pillar === pillarFilter)
      .filter((p) => platformFilter === "all" || p.frontmatter.platform === platformFilter);
  }, [posts, pillarFilter, platformFilter]);

  const columns = usePostColumns();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
          {PERIODS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                days === d ? "bg-series-1 text-white" : "text-ink-muted hover:text-ink-secondary"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Views (${days}d)`} value={fmtInt(stats.cur.views)} current={stats.cur.views} previous={stats.prev.views} />
        <StatCard label={`Saves (${days}d)`} value={fmtInt(stats.cur.saves)} current={stats.cur.saves} previous={stats.prev.saves} />
        <StatCard label={`New follows (${days}d)`} value={fmtInt(stats.cur.follows)} current={stats.cur.follows} previous={stats.prev.follows} />
        <StatCard
          label={`Organic pickup rate (${days}d)`}
          value={pct(stats.cur.organicPickupRate)}
          current={stats.cur.organicPickupRate}
          previous={stats.prev.organicPickupRate}
          hint={`${stats.cur.organic} organic / ${stats.cur.seeded + stats.cur.organic} asks`}
        />
      </div>

      <ChartCard
        title="Views & saves over time"
        subtitle={`Daily totals across the last ${days} days (posted date). Bars = views, line = saves.`}
      >
        {series.some((s) => s.views > 0 || s.saves > 0) ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={20} stroke={GRID} />
              <YAxis yAxisId="l" tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={48} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={44} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} labelFormatter={(d) => fmtDate(d as string)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" dataKey="views" name="Views" fill={SERIES[0]} radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="saves" name="Saves" stroke={SERIES[2]} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No posts in this window." />
        )}
      </ChartCard>

      <ChartCard
        title="All posts"
        subtitle="Every metric as a sortable column. Filter by pillar / platform."
        right={
          <div className="flex gap-2">
            <Select value={pillarFilter} onChange={setPillarFilter} options={[["all", "All pillars"], ...PILLARS.map((p) => [p, PILLAR_LABELS[p]] as [string, string])]} />
            <Select value={platformFilter} onChange={setPlatformFilter} options={[["all", "All platforms"], ["instagram", "Instagram"], ["tiktok", "TikTok"]]} />
          </div>
        }
      >
        <DataTable columns={columns} rows={gridRows} pageSize={12} initialSort={{ key: "date", dir: "desc" }} emptyMessage="No matching posts." />
      </ChartCard>
    </div>
  );
}

// ── Tab 2: Analytics ────────────────────────────────────────────────────────
function AnalyticsTab({ posts, account }: Props) {
  const pillarStats = useMemo(() => allPillarStats(posts), [posts]);
  const heat = useMemo(() => weekdayDaypartHeat(posts), [posts]);

  const saveRateData = pillarStats.map((s) => ({
    pillar: PILLAR_LABELS[s.pillar],
    key: s.pillar,
    saveRate: +(s.saveRateMedian * 100).toFixed(2),
  }));

  const seedOrganicData = pillarStats.map((s) => ({
    pillar: PILLAR_LABELS[s.pillar],
    seeded: s.seeded,
    organic: s.organic,
    rate: +(s.organicPickupRate * 100).toFixed(0),
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="Save rate by pillar"
          subtitle="Median saves ÷ views. The main 'which pillar is actually working' view."
          note="Reposts excluded. AI Supercars is reach-only (no app shown) — expect it low here; judge it on reach instead."
        >
          {saveRateData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={saveRateData} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="pillar" tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={40} unit="%" />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}%`, "Save rate"]} />
                <Bar dataKey="saveRate" radius={[3, 3, 0, 0]}>
                  {saveRateData.map((d) => (
                    <Cell key={d.key} fill={PILLAR_COLOR[d.key as Pillar]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard
          title="Seeded vs organic pickup by pillar"
          subtitle="The core strategic signal: which pillars earn real, unprompted 'what app is this?' asks."
          note="Organic = real users asking with no seeding. A pillar that only works because of seeded comments isn't earning genuine curiosity."
        >
          {seedOrganicData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={seedOrganicData} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="pillar" tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} interval={0} angle={-12} textAnchor="end" height={50} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={36} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="seeded" name="Seeded" fill={AXIS} radius={[3, 3, 0, 0]} />
                <Bar dataKey="organic" name="Organic" fill={SERIES[2]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      </div>

      <FunnelCard account={account} />

      <ChartCard
        title="Best day / time"
        subtitle="Median save rate by weekday × daypart. Darker = higher. Empty = not tested yet."
      >
        {heat.length ? <Heatmap heat={heat} /> : <EmptyState message="No posts to build a heatmap yet." />}
      </ChartCard>

      <DemographicsCard account={account} />
    </div>
  );
}

// ── Tab 3: Insights & Strategy ──────────────────────────────────────────────
function InsightsTab({ posts, whatWorks, strategy: initial }: Props) {
  const [strategy, setStrategy] = useState<StrategyCard>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const takeaways = useMemo(
    () =>
      posts
        .filter((p) => p.body.takeaway.trim())
        .sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1)),
    [posts],
  );

  async function refreshStrategy() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/content/strategy", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "failed");
      setStrategy(json.card);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <ChartCard
        title="Next 2 weeks — strategy"
        subtitle="Scheduling-level recommendation, regenerated from the latest data. Separate from the tactical rules in what-works.md."
        right={
          <button
            onClick={refreshStrategy}
            disabled={busy}
            className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary disabled:opacity-60"
          >
            {busy ? "Generating…" : "Regenerate (AI)"}
          </button>
        }
      >
        {err && <div className="mb-2 text-xs text-status-critical">Regenerate failed: {err}</div>}
        <div className="text-sm font-semibold text-ink-primary">{strategy.headline}</div>
        <div className="prose-content mt-3 text-sm text-ink-secondary" dangerouslySetInnerHTML={{ __html: renderMarkdown(strategy.narrative) }} />
        {strategy.pillars.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {strategy.pillars.map((r) => (
              <div key={r.pillar} className="rounded-lg border border-hairline bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.label}</span>
                  <VerdictBadge verdict={r.verdict} />
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {r.job} · n={r.n} · organic {pct(r.organicThis, 0)}
                  {r.organicTrend !== "n/a" && ` (${r.organicTrend} vs prev)`}
                </div>
                <div className="mt-1 text-xs text-ink-secondary">{r.reason}</div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Takeaway feed" subtitle="Auto-generated per-post reads, newest first.">
        {takeaways.length ? (
          <div className="space-y-3">
            {takeaways.map((p) => (
              <div key={p.slug} className="rounded-lg border border-hairline bg-surface-2 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Link href={`/content/posts/${p.slug}`} className="text-sm font-medium text-ink-primary hover:underline">
                    {p.frontmatter.pillar ? PILLAR_LABELS[p.frontmatter.pillar] : "—"} · {p.frontmatter.post_id}
                  </Link>
                  <span className="text-xs text-ink-muted">{fmtDate(p.frontmatter.date)}</span>
                </div>
                <div className="prose-content text-sm text-ink-secondary" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body.takeaway) }} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No Takeaways yet. Run the pipeline (POST /api/content/run) once posts have settled metrics." />
        )}
      </ChartCard>

      <ChartCard title="what-works.md" subtitle="Machine-managed section is fenced; hand-written prose outside the fence is never auto-edited.">
        {whatWorks.trim() ? (
          <div className="prose-content text-sm text-ink-secondary" dangerouslySetInnerHTML={{ __html: renderMarkdown(whatWorks) }} />
        ) : (
          <EmptyState message="content/what-works.md is empty." />
        )}
      </ChartCard>
    </div>
  );
}

// ── Shared building blocks ──────────────────────────────────────────────────
function usePostColumns(): Column<Post>[] {
  return useMemo(
    () => [
      {
        key: "date",
        header: "Date",
        sortValue: (p) => p.frontmatter.date,
        render: (p) => (
          <Link href={`/content/posts/${p.slug}`} className="text-series-1 hover:underline">
            {p.frontmatter.date}
          </Link>
        ),
      },
      { key: "pillar", header: "Pillar", sortValue: (p) => p.frontmatter.pillar ?? "", render: (p) => (p.frontmatter.pillar ? PILLAR_LABELS[p.frontmatter.pillar] : "—") },
      { key: "platform", header: "Platform", sortValue: (p) => p.frontmatter.platform, render: (p) => platformLabel(p.frontmatter.platform) },
      { key: "format", header: "Format", sortValue: (p) => p.frontmatter.format, render: (p) => p.frontmatter.format || "—" },
      { key: "feature", header: "Feature", sortValue: (p) => p.frontmatter.feature_shown, render: (p) => p.frontmatter.feature_shown },
      { key: "views", header: "Views", align: "right", sortValue: (p) => p.frontmatter.views, render: (p) => fmtInt(p.frontmatter.views) },
      { key: "reach", header: "Reach", align: "right", sortValue: (p) => p.frontmatter.reach, render: (p) => fmtInt(p.frontmatter.reach) },
      { key: "saves", header: "Saves", align: "right", sortValue: (p) => p.frontmatter.saves, render: (p) => fmtInt(p.frontmatter.saves) },
      { key: "save_rate", header: "Save %", align: "right", sortValue: (p) => p.frontmatter.save_rate, render: (p) => pct(p.frontmatter.save_rate, 2) },
      { key: "eng", header: "Eng %", align: "right", sortValue: (p) => p.frontmatter.engagement_rate, render: (p) => pct(p.frontmatter.engagement_rate, 1) },
      { key: "hold", header: "Hold %", align: "right", sortValue: (p) => p.frontmatter.hold_rate, render: (p) => pct(p.frontmatter.hold_rate, 0) },
      { key: "organic", header: "Org/Seed", align: "right", sortValue: (p) => p.frontmatter.comments_organic_pickup, render: (p) => `${p.frontmatter.comments_organic_pickup}/${p.frontmatter.comments_seeded}` },
      { key: "shares", header: "Shares", align: "right", sortValue: (p) => p.frontmatter.shares, render: (p) => fmtInt(p.frontmatter.shares) },
      { key: "follows", header: "Follows", align: "right", sortValue: (p) => p.frontmatter.new_follows, render: (p) => fmtInt(p.frontmatter.new_follows) },
    ],
    [],
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-xs text-ink-secondary"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const tone =
    verdict === "core" || verdict === "weight up"
      ? "text-status-good border-status-good/40 bg-status-good/10"
      : verdict === "consider dropping" || verdict === "weight down"
        ? "text-status-serious border-status-serious/40 bg-status-serious/10"
        : "text-ink-muted border-hairline bg-surface-1";
  return <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}>{verdict}</span>;
}

function FunnelCard({ account }: { account: AccountData | null }) {
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");
  const data = account?.[platform];
  const stages: [string, number][] = data
    ? [
        ["Reach", data.funnel_30d.reach],
        ["Accounts engaged", data.funnel_30d.accounts_engaged],
        ["Profile visits", data.funnel_30d.profile_visits],
        ["Link taps", data.funnel_30d.link_taps],
        ["New follows", data.funnel_30d.new_follows],
      ]
    : [];
  const max = stages.length ? stages[0][1] : 1;
  return (
    <ChartCard
      title="30-day funnel"
      subtitle="Reach → accounts engaged → profile visits → link taps → new follows."
      right={<Select value={platform} onChange={(v) => setPlatform(v as "instagram" | "tiktok")} options={[["instagram", "Instagram"], ["tiktok", "TikTok"]]} />}
    >
      {stages.length ? (
        <div className="space-y-2">
          {stages.map(([label, value], i) => {
            const prev = i > 0 ? stages[i - 1][1] : value;
            const conv = i > 0 && prev > 0 ? (value / prev) * 100 : null;
            return (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-secondary">{label}</span>
                  <span className="tabular text-ink-muted">
                    {fmtInt(value)}
                    {conv != null && <span className="ml-2 text-ink-muted">({conv.toFixed(1)}% of prev)</span>}
                  </span>
                </div>
                <div className="h-6 overflow-hidden rounded-md bg-surface-2">
                  <div className="h-full rounded-md bg-series-1" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No account.json funnel data for this platform." />
      )}
    </ChartCard>
  );
}

function Heatmap({ heat }: { heat: ReturnType<typeof weekdayDaypartHeat> }) {
  const map = new Map(heat.map((c) => [`${c.weekday}|${c.daypart}`, c]));
  const maxRate = Math.max(...heat.map((c) => c.saveRateMedian), 0.0001);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr>
            <th className="w-20" />
            {DAYPARTS.map((d) => (
              <th key={d} className="p-1 font-medium text-ink-muted">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((wd) => (
            <tr key={wd}>
              <td className="p-1 text-right font-medium text-ink-muted">{wd.slice(0, 3)}</td>
              {DAYPARTS.map((dp) => {
                const cell = map.get(`${wd}|${dp}`);
                const intensity = cell ? cell.saveRateMedian / maxRate : 0;
                const bg = cell ? `rgba(57,135,229,${0.15 + intensity * 0.75})` : "transparent";
                return (
                  <td
                    key={dp}
                    className="rounded-md p-1"
                    style={{ background: bg, border: "1px solid var(--hairline)" }}
                    title={cell ? `${wd} ${dp}: save ${pct(cell.saveRateMedian, 2)} (n=${cell.n})` : `${wd} ${dp}: no posts`}
                  >
                    {cell ? <span className="tabular text-[11px] text-ink-primary">{pct(cell.saveRateMedian, 1)}</span> : <span className="text-ink-muted">·</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemographicsCard({ account }: { account: AccountData | null }) {
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");
  const demo = account?.[platform]?.demographics;
  if (!demo || (!demo.country && !demo.age && !demo.gender)) {
    return (
      <ChartCard title="Demographics" subtitle="Country / age / gender from account.json (if available).">
        <EmptyState message="No demographics in account.json." />
      </ChartCard>
    );
  }
  const groups: [string, { label: string; pct: number }[] | undefined][] = [
    ["Country", demo.country],
    ["Age", demo.age],
    ["Gender", demo.gender],
  ];
  return (
    <ChartCard
      title="Demographics"
      subtitle="Audience split (share of followers)."
      right={<Select value={platform} onChange={(v) => setPlatform(v as "instagram" | "tiktok")} options={[["instagram", "Instagram"], ["tiktok", "TikTok"]]} />}
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {groups.map(([title, rows]) =>
          rows?.length ? (
            <div key={title}>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</div>
              <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 30)}>
                <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide domain={[0, "dataMax"]} />
                  <YAxis type="category" dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} width={90} stroke={GRID} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [`${v}%`, "Share"]} />
                  <Bar dataKey="pct" fill={SERIES[0]} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null,
        )}
      </div>
    </ChartCard>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
function buildDaySeries(posts: Post[], days: number, now: Date): { day: string; views: number; saves: number }[] {
  const out: { day: string; views: number; saves: number }[] = [];
  const byDay = new Map<string, { views: number; saves: number }>();
  for (const p of posts) {
    if (!inLastDays(p.frontmatter.date, days, now)) continue;
    const cur = byDay.get(p.frontmatter.date) ?? { views: 0, saves: 0 };
    cur.views += p.frontmatter.views;
    cur.saves += p.frontmatter.saves;
    byDay.set(p.frontmatter.date, cur);
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    const v = byDay.get(d) ?? { views: 0, saves: 0 };
    out.push({ day: d, ...v });
  }
  return out;
}
