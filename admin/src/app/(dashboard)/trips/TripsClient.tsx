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
} from "recharts";
import { SectionHeader, StatCard, ChartCard, EmptyState } from "@/components/ui";
import { RangeToggle } from "@/components/RangeToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { DataTable, Column } from "@/components/DataTable";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { RangeKey, rangeDays } from "@/lib/dates";
import { fmtInt, fmtKm, fmtNum, fmtDuration, fmtDate } from "@/lib/format";
import { tripsInRange, tripAggregates, tripsPerDay, topDestinations, countInPrev } from "@/lib/metrics";
import type { TripRow } from "@/lib/types";

export function TripsClient({ trips, available }: { trips: TripRow[]; available: boolean }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const now = useMemo(() => new Date(), []);

  const all = useMemo(() => tripAggregates(trips), [trips]);
  const inRange = useMemo(() => tripsInRange(trips, range, now), [trips, range, now]);
  const period = useMemo(() => tripAggregates(inRange), [inRange]);
  const prevCount = countInPrev(trips, (t) => t.created_at, range, now);

  const perDayDays = Math.min(rangeDays(range) ?? 30, 90);
  const perDay = useMemo(() => tripsPerDay(trips, perDayDays === 0 ? 30 : perDayDays, now), [trips, perDayDays, now]);
  const dests = useMemo(() => topDestinations(inRange, 10), [inRange]);

  const cols: Column<{ name: string; count: number }>[] = [
    { key: "name", header: "Destination", render: (r) => r.name, sortValue: (r) => r.name.toLowerCase() },
    { key: "count", header: "Trips", align: "right", render: (r) => fmtInt(r.count), sortValue: (r) => r.count },
  ];

  if (!available) {
    return (
      <div className="space-y-5">
        <SectionHeader title="Trip Analytics" right={<RefreshButton />} />
        <EmptyState message="The trips table is not reachable with the current key." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Trip Analytics"
        description="Distance, duration, speed and where drivers are going."
        right={
          <div className="flex items-center gap-2">
            <RangeToggle value={range} onChange={setRange} />
            <RefreshButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total distance" value={fmtKm(all.totalDistance)} hint="all time" />
        <StatCard label={`Distance (${range})`} value={fmtKm(period.totalDistance)} hint={`${fmtInt(period.count)} trips`} />
        <StatCard label={`Trips (${range})`} value={fmtInt(period.count)} current={period.count} previous={prevCount} />
        <StatCard label="Total trips" value={fmtInt(all.count)} hint="all time" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={`Avg distance (${range})`} value={fmtKm(period.avgDistance)} />
        <StatCard label={`Avg duration (${range})`} value={fmtDuration(period.avgDuration)} />
        <StatCard label={`Avg speed (${range})`} value={`${fmtNum(period.avgSpeed, 1)} km/h`} />
        <StatCard label="Avg distance (all)" value={fmtKm(all.avgDistance)} />
      </div>

      <ChartCard title="Trips per day" subtitle={`Last ${perDayDays === 0 ? 30 : perDayDays} days`}>
        {trips.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={perDay} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} minTickGap={20} stroke={GRID} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} labelFormatter={(d) => fmtDate(d as string)} formatter={(v) => [fmtInt(v as number), "Trips"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="trips" fill={SERIES[0]} radius={[3, 3, 0, 0]} name="Trips" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </ChartCard>

      <ChartCard
        title="Top destinations by volume"
        subtitle={`Clustered by destination name · ${range}`}
        note="Best-effort clustering on the free-text destination name. Precise start/end hot-spot clustering would need a follow-up geospatial query (grid/DBSCAN over origin_lat/lng, destination_lat/lng)."
      >
        <DataTable columns={cols} rows={dests} pageSize={10} initialSort={{ key: "count", dir: "desc" }} emptyMessage="No named destinations in range." />
      </ChartCard>
    </div>
  );
}
