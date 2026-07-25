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
import { SectionHeader, StatCard, ChartCard, Banner, EmptyState } from "@/components/ui";
import { RefreshButton } from "@/components/RefreshButton";
import { DataTable, Column } from "@/components/DataTable";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { fmtInt, fmtNum } from "@/lib/format";
import { carsAggregate, topMakes, topModels } from "@/lib/metrics";
import type { CarRow } from "@/lib/types";

export function GarageClient({
  cars,
  available,
  userCount,
}: {
  cars: CarRow[];
  available: boolean;
  userCount: number;
}) {
  const [excludeStarter, setExcludeStarter] = useState(true);

  const agg = useMemo(() => carsAggregate(cars, userCount), [cars, userCount]);
  const makes = useMemo(() => topMakes(cars, excludeStarter, 12), [cars, excludeStarter]);
  const models = useMemo(() => topModels(cars, excludeStarter, 12), [cars, excludeStarter]);

  const modelCols: Column<(typeof models)[number]>[] = [
    { key: "model", header: "Make & model", render: (r) => r.model, sortValue: (r) => r.model.toLowerCase() },
    { key: "count", header: "Cars", align: "right", render: (r) => fmtInt(r.count), sortValue: (r) => r.count },
  ];

  if (!available) {
    return (
      <div className="space-y-5">
        <SectionHeader title="Garage Analytics" right={<RefreshButton />} />
        <EmptyState message="The car_collections table is not reachable with the current key." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Garage Analytics"
        description="Registered cars and the most common makes & models."
        right={<RefreshButton />}
      />

      <Banner tone="warning">
        <code>make</code> and <code>model</code> are <strong>free-text columns</strong>, so counts
        below normalise case/spacing but can still split on typos — treat as directional until
        the fields are constrained to a picker. Also, every new user is seeded a{" "}
        <strong>&quot;Honda Civic Type R&quot; starter car</strong>, which otherwise dominates the
        distribution — the toggle below excludes it.
      </Banner>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total cars" value={fmtInt(agg.total)} hint="all garages" />
        <StatCard label="Avg cars / user" value={fmtNum(agg.avgPerUser, 2)} hint={`${fmtInt(userCount)} users`} />
        <StatCard label="Distinct makes" value={fmtInt(makes.length)} hint={excludeStarter ? "excl. starter" : "all"} />
        <StatCard label="Distinct models" value={fmtInt(models.length)} hint={excludeStarter ? "excl. starter" : "all"} />
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-secondary">
        <input
          type="checkbox"
          checked={excludeStarter}
          onChange={(e) => setExcludeStarter(e.target.checked)}
          className="accent-series-1"
        />
        Exclude the seeded &quot;Honda Civic Type R&quot; starter car
      </label>

      <ChartCard title="Most common makes" subtitle={excludeStarter ? "Starter car excluded" : "All cars"}>
        {makes.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(240, makes.length * 28)}>
            <BarChart data={makes} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 8 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} />
              <YAxis type="category" dataKey="make" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} width={100} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [fmtInt(v as number), "Cars"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="count" fill={SERIES[0]} radius={[0, 4, 4, 0]} name="Cars" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No car makes recorded yet." />
        )}
      </ChartCard>

      <ChartCard title="Most common models" subtitle="Make + model (free text, normalised)">
        <DataTable columns={modelCols} rows={models} pageSize={12} initialSort={{ key: "count", dir: "desc" }} emptyMessage="No models recorded yet." />
      </ChartCard>
    </div>
  );
}
