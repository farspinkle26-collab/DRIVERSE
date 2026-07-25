"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { SectionHeader, StatCard, ChartCard, Banner, EmptyState, Badge } from "@/components/ui";
import { RangeToggle } from "@/components/RangeToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { DataTable, Column } from "@/components/DataTable";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { RangeKey, rangeWindow, parseDate } from "@/lib/dates";
import { fmtInt, fmtPct } from "@/lib/format";
import {
  questCompletionByDifficulty,
  questCompletionByCategory,
  questsByTemplate,
  rankDistribution,
} from "@/lib/metrics";
import type { DailyQuestRow } from "@/lib/types";

const DIFF_COLOR: Record<string, string> = { easy: SERIES[2], medium: SERIES[3], hard: SERIES[7] };

export function QuestsClient({
  quests,
  templateTitles,
  xp,
}: {
  quests: DailyQuestRow[];
  templateTitles: Record<string, string>;
  xp: { level: number | null }[];
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const now = useMemo(() => new Date(), []);

  const inRange = useMemo(() => {
    const w = rangeWindow(range, now);
    return quests.filter((q) => {
      const d = parseDate(q.created_at);
      return d && d >= w.start && d <= w.end;
    });
  }, [quests, range, now]);

  const byDiff = useMemo(() => questCompletionByDifficulty(inRange), [inRange]);
  const byCat = useMemo(() => questCompletionByCategory(inRange), [inRange]);
  const byTpl = useMemo(
    () => questsByTemplate(inRange, (id) => templateTitles[id] || (id === "(none)" ? "(no template)" : id)),
    [inRange, templateTitles],
  );
  const ranks = useMemo(() => rankDistribution(xp), [xp]);

  const assigned = inRange.length;
  const completed = inRange.filter((q) => q.status === "completed").length;
  const active = inRange.filter((q) => q.status === "active").length;
  const rate = assigned ? (completed / assigned) * 100 : 0;

  const mostCompleted = useMemo(
    () => [...byTpl].sort((a, b) => b.completed - a.completed).slice(0, 12),
    [byTpl],
  );
  const leastCompleted = useMemo(
    () => [...byTpl].filter((t) => t.assigned >= 3).sort((a, b) => a.rate - b.rate).slice(0, 12),
    [byTpl],
  );

  const tplCols: Column<(typeof byTpl)[number]>[] = [
    { key: "title", header: "Quest", render: (r) => r.title, sortValue: (r) => r.title.toLowerCase() },
    { key: "difficulty", header: "Diff", render: (r) => <DiffPill d={r.difficulty} />, sortValue: (r) => r.difficulty },
    { key: "assigned", header: "Assigned", align: "right", render: (r) => fmtInt(r.assigned), sortValue: (r) => r.assigned },
    { key: "completed", header: "Completed", align: "right", render: (r) => fmtInt(r.completed), sortValue: (r) => r.completed },
    { key: "rate", header: "Rate", align: "right", render: (r) => fmtPct(r.rate, 0), sortValue: (r) => r.rate },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Quest & XP Analytics"
        description="Completion by difficulty and category, best/worst quests, and rank distribution."
        right={
          <div className="flex items-center gap-2">
            <RangeToggle value={range} onChange={setRange} />
            <RefreshButton />
          </div>
        }
      />

      <Banner tone="warning">
        The brief expected quest types <em>daily / weekly / seasonal / community / location</em>,
        but the live system generates <strong>daily quests only</strong>, differentiated by{" "}
        <strong>difficulty</strong> (easy/medium/hard) and <strong>category</strong>{" "}
        (driving/exploration/social/scenic/photo). Completion metrics below use those real dimensions.
      </Banner>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Assigned (${range})`} value={fmtInt(assigned)} />
        <StatCard label={`Completed (${range})`} value={fmtInt(completed)} />
        <StatCard label="Completion rate" value={fmtPct(rate, 1)} hint={`${fmtInt(active)} still active`} />
        <StatCard label="Rank tiers populated" value={fmtInt(ranks.filter((r) => r.count > 0).length)} hint="of 12" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Completion rate by difficulty" subtitle="completed ÷ assigned">
          {assigned > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byDiff} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="difficulty" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} unit="%" width={44} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v, _n, p) => [`${fmtPct(v as number, 1)} (${fmtInt((p.payload as any).completed)}/${fmtInt((p.payload as any).assigned)})`, "Rate"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} name="Rate">
                  {byDiff.map((d) => (
                    <Cell key={d.difficulty} fill={DIFF_COLOR[d.difficulty]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard title="Completion rate by category" subtitle="driving / exploration / social / scenic / photo">
          {byCat.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byCat} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="category" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} width={84} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v, _n, p) => [`${fmtPct(v as number, 1)} (${fmtInt((p.payload as any).completed)}/${fmtInt((p.payload as any).assigned)})`, "Rate"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="rate" fill={SERIES[0]} radius={[0, 4, 4, 0]} name="Rate" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="XP distribution by rank tier"
        subtitle="Users bucketed into the 12-tier rank ladder by current level"
        note="Time-to-rank-up is not computable: user_xp stores only the current level with no rank-up event log. Add a level-change history table to unlock it."
      >
        {xp.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ranks} margin={{ top: 8, right: 12, bottom: 40, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} angle={-35} textAnchor="end" interval={0} height={60} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [fmtInt(v as number), "Users"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Users">
                {ranks.map((r) => (
                  <Cell key={r.id} fill={r.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Most-completed quests" subtitle={`By completion count · ${range}`}>
          <DataTable columns={tplCols} rows={mostCompleted} pageSize={25} initialSort={{ key: "completed", dir: "desc" }} emptyMessage="No quests in range." csvFilename="most-completed-quests" />
        </ChartCard>
        <ChartCard
          title="Least-completed quests"
          subtitle="Lowest completion rate (≥3 assigned)"
          note="Low rates can flag quests that are too hard or badly targeted."
        >
          <DataTable columns={tplCols} rows={leastCompleted} pageSize={25} initialSort={{ key: "rate", dir: "asc" }} emptyMessage="Not enough quest history yet." csvFilename="least-completed-quests" />
        </ChartCard>
      </div>
    </div>
  );
}

function DiffPill({ d }: { d: string }) {
  if (!d) return <span className="text-ink-muted">—</span>;
  return <Badge label={d} color={DIFF_COLOR[d] ?? SERIES[0]} dot />;
}
