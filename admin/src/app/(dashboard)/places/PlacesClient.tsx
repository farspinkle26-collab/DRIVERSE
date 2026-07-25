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
  Legend,
} from "recharts";
import { SectionHeader, StatCard, ChartCard, Banner, EmptyState } from "@/components/ui";
import { RangeToggle } from "@/components/RangeToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { RangeKey } from "@/lib/dates";
import { fmtInt, fmtPct } from "@/lib/format";
import { placesByCategory, countInRange, countInPrev } from "@/lib/metrics";
import type { PlaceRow } from "@/lib/types";

const CAT_LABEL: Record<string, string> = {
  cafe: "Café",
  gas_station: "Gas",
  workshop: "Workshop",
  hangout: "Hangout",
};

export function PlacesClient({
  places,
  placesAvailable,
  osmCounts,
  osmAvailable,
}: {
  places: PlaceRow[];
  placesAvailable: boolean;
  osmCounts: { category: string; count: number }[];
  osmAvailable: boolean;
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const now = useMemo(() => new Date(), []);

  const byCat = useMemo(() => placesByCategory(places), [places]);

  // Merge OSM vs user-submitted per category for a side-by-side view.
  const merged = useMemo(() => {
    const cats = new Set<string>();
    byCat.forEach((c) => cats.add(c.category));
    osmCounts.forEach((c) => cats.add(c.category));
    const osmMap = new Map(osmCounts.map((c) => [c.category, c.count]));
    const userMap = new Map(byCat.map((c) => [c.category, c.approved + c.pending + c.rejected]));
    return Array.from(cats).map((cat) => ({
      category: CAT_LABEL[cat] || cat,
      osm: osmMap.get(cat) ?? 0,
      user: userMap.get(cat) ?? 0,
    }));
  }, [byCat, osmCounts]);

  const submissionsThis = countInRange(places, (p) => p.created_at, range, now);
  const submissionsPrev = countInPrev(places, (p) => p.created_at, range, now);
  const approved = places.filter((p) => p.status === "approved").length;
  const pending = places.filter((p) => p.status === "pending").length;
  const rejected = places.filter((p) => p.status === "rejected").length;
  const decided = approved + rejected;
  const approvalRate = decided > 0 ? (approved / decided) * 100 : null;
  const osmTotal = osmCounts.reduce((s, c) => s + c.count, 0);

  const sparse = places.length < 5 && osmTotal < 5;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Places Analytics"
        description="OpenStreetMap cache + community-submitted places."
        right={
          <div className="flex items-center gap-2">
            <RangeToggle value={range} onChange={setRange} />
            <RefreshButton />
          </div>
        }
      />

      <Banner tone="warning">
        <strong>Two caveats.</strong> (1) OSM counts are derived from cached Overpass
        query payloads (deduped by name+coords) — an <em>approximation</em>, since
        overlapping map areas repeat places; there is no normalized per-place OSM
        table. (2) Community submissions default to <code>status = &apos;approved&apos;</code> — there is
        no real moderation queue yet, so approval rate reads near 100%.
        Most-viewed/most-navigated places are <strong>not instrumented</strong> (no view tracking on places).
      </Banner>

      {sparse && <Banner tone="info">Places is a new category with little data so far — charts will fill in as submissions and OSM caching grow.</Banner>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="User-submitted places" value={fmtInt(places.length)} hint="all time" />
        <StatCard label="OSM places (approx)" value={osmAvailable ? fmtInt(osmTotal) : "—"} hint={osmAvailable ? "deduped from cache" : "cache unavailable"} />
        <StatCard label={`Submissions (${range})`} value={fmtInt(submissionsThis)} current={submissionsThis} previous={submissionsPrev} />
        <StatCard label="Approval rate" value={approvalRate == null ? "—" : fmtPct(approvalRate, 0)} hint={`${fmtInt(pending)} pending`} />
      </div>

      <ChartCard
        title="Places by category — OSM vs user-submitted"
        subtitle="cafe / gas / workshop / hangout"
      >
        {placesAvailable && merged.some((m) => m.osm + m.user > 0) ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={merged} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="category" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
              <Bar dataKey="osm" fill={SERIES[0]} radius={[4, 4, 0, 0]} name="OSM (approx)" />
              <Bar dataKey="user" fill={SERIES[1]} radius={[4, 4, 0, 0]} name="User-submitted" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="Not enough places data yet." />
        )}
      </ChartCard>

      <ChartCard title="Submission moderation status" subtitle="Community-submitted places by status">
        {places.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            <StatusCell label="Approved" value={approved} tone="text-status-good" />
            <StatusCell label="Pending" value={pending} tone="text-status-warning" />
            <StatusCell label="Rejected" value={rejected} tone="text-status-critical" />
          </div>
        ) : (
          <EmptyState message="No community submissions yet." />
        )}
      </ChartCard>
    </div>
  );
}

function StatusCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-4 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular ${tone}`}>{fmtInt(value)}</div>
    </div>
  );
}
