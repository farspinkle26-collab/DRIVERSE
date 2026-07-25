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
import { SectionHeader, StatCard, ChartCard, EmptyState } from "@/components/ui";
import { RangeToggle } from "@/components/RangeToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { DataTable, Column } from "@/components/DataTable";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { RangeKey, rangeWindow, parseDate } from "@/lib/dates";
import { fmtInt, fmtNum } from "@/lib/format";
import { eventsByType, avgAttendance, convoySizeDistribution, topOrganizers, countInPrev } from "@/lib/metrics";
import type { EventRow, EventParticipantRow, PartyRow, PartyMemberRow } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = {
  meetup: SERIES[0],
  convoy: SERIES[1],
  cruise: SERIES[2],
  race: SERIES[7],
};

export function EventsClient({
  events,
  participants,
  parties,
  members,
  names,
}: {
  events: EventRow[];
  participants: EventParticipantRow[];
  parties: PartyRow[];
  members: PartyMemberRow[];
  names: Record<string, string>;
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const now = useMemo(() => new Date(), []);

  const eventsInRange = useMemo(() => {
    const w = rangeWindow(range, now);
    return events.filter((e) => {
      const d = parseDate(e.created_at);
      return d && d >= w.start && d <= w.end;
    });
  }, [events, range, now]);

  const byType = useMemo(() => eventsByType(eventsInRange), [eventsInRange]);
  const attendance = useMemo(() => avgAttendance(eventsInRange, participants), [eventsInRange, participants]);
  const sizes = useMemo(() => convoySizeDistribution(parties, members), [parties, members]);
  const organizers = useMemo(() => topOrganizers(events, (id) => names[id] || id.slice(0, 8), 10), [events, names]);

  const eventsPrev = countInPrev(events, (e) => e.created_at, range, now);

  const orgCols: Column<(typeof organizers)[number]>[] = [
    { key: "name", header: "Organizer", render: (r) => r.name, sortValue: (r) => r.name.toLowerCase() },
    { key: "count", header: "Events created", align: "right", render: (r) => fmtInt(r.count), sortValue: (r) => r.count },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Events & Convoy Analytics"
        description="Events by type, attendance, and convoy (party) sizes. Convoys are the parties table."
        right={
          <div className="flex items-center gap-2">
            <RangeToggle value={range} onChange={setRange} />
            <RefreshButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Events (${range})`} value={fmtInt(eventsInRange.length)} current={eventsInRange.length} previous={eventsPrev} />
        <StatCard label="Total events" value={fmtInt(events.length)} hint="all time" />
        <StatCard label="Avg attendance" value={fmtNum(attendance, 1)} hint={`per event · ${range}`} />
        <StatCard label="Total convoys" value={fmtInt(parties.length)} hint="parties, all time" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Events created by type" subtitle={`meetup / convoy / cruise / race · ${range}`}>
          {eventsInRange.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byType} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="type" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={40} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [fmtInt(v as number), "Events"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Events">
                  {byType.map((t) => (
                    <Cell key={t.type} fill={TYPE_COLOR[t.type]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard title="Convoy party-size distribution" subtitle="Accepted members per convoy (all time)">
          {parties.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sizes} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="size" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={40} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [fmtInt(v as number), "Convoys"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" fill={SERIES[1]} radius={[4, 4, 0, 0]} name="Convoys" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Most active event organizers" subtitle="By events created (all time)">
        <DataTable columns={orgCols} rows={organizers} pageSize={10} initialSort={{ key: "count", dir: "desc" }} emptyMessage="No events yet." />
      </ChartCard>
    </div>
  );
}
