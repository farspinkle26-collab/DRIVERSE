"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { SectionHeader, StatCard, ChartCard, EmptyState } from "@/components/ui";
import { RefreshButton } from "@/components/RefreshButton";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { parseDate, dayKey, lastNDays } from "@/lib/dates";
import { fmtInt, fmtPct, fmtDate } from "@/lib/format";

type Msg = { sender_id: string; created_at: string | null };
type GroupMsg = Msg & { kind: string };

export function CommunityClient({
  direct,
  group,
  totalUsers,
}: {
  direct: Msg[];
  group: GroupMsg[];
  totalUsers: number;
}) {
  const [days, setDays] = useState<30 | 90>(30);
  const now = useMemo(() => new Date(), []);

  const perDay = useMemo(() => {
    const d = new Map<string, number>();
    const g = new Map<string, number>();
    for (const m of direct) {
      const dt = parseDate(m.created_at);
      if (dt) d.set(dayKey(dt), (d.get(dayKey(dt)) ?? 0) + 1);
    }
    for (const m of group) {
      const dt = parseDate(m.created_at);
      if (dt) g.set(dayKey(dt), (g.get(dayKey(dt)) ?? 0) + 1);
    }
    return lastNDays(days, now).map((k) => ({ day: k, direct: d.get(k) ?? 0, group: g.get(k) ?? 0 }));
  }, [direct, group, days, now]);

  const activeParticipants = useMemo(() => {
    const set = new Set<string>();
    for (const m of direct) if (m.sender_id) set.add(m.sender_id);
    for (const m of group) if (m.sender_id) set.add(m.sender_id);
    return set.size;
  }, [direct, group]);

  const groupByKind = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of group) map.set(m.kind, (map.get(m.kind) ?? 0) + 1);
    return [
      { kind: "event", label: "Event chats", count: map.get("event") ?? 0, color: SERIES[0] },
      { kind: "convoy", label: "Convoy chats", count: map.get("convoy") ?? 0, color: SERIES[1] },
      { kind: "unknown", label: "Other", count: map.get("unknown") ?? 0, color: GRID },
    ].filter((r) => r.count > 0 || r.kind !== "unknown");
  }, [group]);

  const engagement = totalUsers > 0 ? (activeParticipants / totalUsers) * 100 : 0;
  const totalMessages = direct.length + group.length;
  const hasMessages = totalMessages > 0;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Community & Chat Analytics"
        description="Direct vs group messaging, engagement, and chat tied to events/convoys."
        right={<RefreshButton />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total messages" value={fmtInt(totalMessages)} hint="direct + group, all time" />
        <StatCard label="Direct messages" value={fmtInt(direct.length)} />
        <StatCard label="Group messages" value={fmtInt(group.length)} />
        <StatCard label="Chat engagement" value={fmtPct(engagement, 1)} hint={`${fmtInt(activeParticipants)} of ${fmtInt(totalUsers)} users`} />
      </div>

      <ChartCard
        title="Messages sent per day"
        subtitle={`Direct vs group · last ${days} days`}
        right={
          <div className="inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
            {[30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d as 30 | 90)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  days === d ? "bg-series-1 text-white" : "text-ink-muted hover:text-ink-secondary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      >
        {hasMessages ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={perDay} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={24} stroke={GRID} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} labelFormatter={(d) => fmtDate(d as string)} />
              <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
              <Line type="monotone" dataKey="direct" stroke={SERIES[0]} strokeWidth={2} dot={false} name="Direct" />
              <Line type="monotone" dataKey="group" stroke={SERIES[1]} strokeWidth={2} dot={false} name="Group" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No messages recorded yet." />
        )}
      </ChartCard>

      <ChartCard
        title="Group chat activity by context"
        subtitle="Group messages in event vs convoy conversations"
        note="Every event and convoy auto-creates a group conversation; this splits group messages by that conversation kind."
      >
        {group.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={groupByKind} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [fmtInt(v as number), "Messages"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Messages">
                {groupByKind.map((r) => (
                  <Cell key={r.kind} fill={r.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No group messages yet." />
        )}
      </ChartCard>
    </div>
  );
}
