"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
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
import { SectionHeader, StatCard, ChartCard, Banner, Badge } from "@/components/ui";
import { RangeToggle } from "@/components/RangeToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { DataTable, Column } from "@/components/DataTable";
import { DateCell } from "@/components/DateCell";
import { SERIES, STATUS, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { RangeKey } from "@/lib/dates";
import { fmtInt, fmtDate } from "@/lib/format";
import {
  cumulativeUsers,
  roleDistribution,
  verificationBreakdown,
  countInRange,
  countInPrev,
} from "@/lib/metrics";
import type { ProfileRow } from "@/lib/types";

const ROLE_COLOR: Record<string, string> = {
  customer: SERIES[0],
  driver: SERIES[1],
  company: SERIES[2],
};

export function UsersClient({ profiles }: { profiles: ProfileRow[] }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const now = useMemo(() => new Date(), []);

  const growth = useMemo(() => cumulativeUsers(profiles), [profiles]);
  const roles = useMemo(() => roleDistribution(profiles), [profiles]);
  const verif = useMemo(() => verificationBreakdown(profiles), [profiles]);

  const newUsers = countInRange(profiles, (p) => p.created_at, range, now);
  const newUsersPrev = countInPrev(profiles, (p) => p.created_at, range, now);
  const verifiedTotal = profiles.filter((p) => p.verification_status === "verified").length;
  const registered = profiles.length;

  const recent = useMemo(
    () =>
      [...profiles].sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      ),
    [profiles],
  );

  const columns: Column<ProfileRow>[] = [
    { key: "name", header: "Name / handle", render: (r) => r.name || <span className="text-ink-muted">—</span>, sortValue: (r) => (r.name || "").toLowerCase() },
    { key: "role", header: "Role", render: (r) => <RolePill role={r.role} />, sortValue: (r) => r.role || "" },
    { key: "verif", header: "Verification", render: (r) => <VerifPill status={r.verification_status} />, sortValue: (r) => r.verification_status || "" },
    { key: "joined", header: "Joined", sortValue: (r) => new Date(r.created_at ?? 0).getTime(), csvValue: (r) => fmtDate(r.created_at), render: (r) => <DateCell value={r.created_at} /> },
    { key: "id", header: "ID", className: "font-mono text-ink-muted", render: (r) => r.id.slice(0, 8) },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="User Analytics"
        description="Growth, roles, verification, and the newest signups."
        right={
          <div className="flex items-center gap-2">
            <RangeToggle value={range} onChange={setRange} />
            <RefreshButton />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Registered users" value={fmtInt(registered)} hint="all time" />
        <StatCard label={`New (${range})`} value={fmtInt(newUsers)} current={newUsers} previous={newUsersPrev} />
        <StatCard label="Verified" value={fmtInt(verifiedTotal)} hint={`${registered ? Math.round((verifiedTotal / registered) * 100) : 0}% of users`} />
        <StatCard label="Drivers" value={fmtInt(roles.find((r) => r.role === "driver")?.count ?? 0)} hint="role = driver" />
      </div>

      <ChartCard title="Cumulative users" subtitle="Total registered accounts over time (all-time)">
        {growth.length > 1 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={growth} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <defs>
                <linearGradient id="uGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(d) => d.slice(2)} minTickGap={28} stroke={GRID} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} labelFormatter={(d) => fmtDate(d as string)} formatter={(v) => [fmtInt(v as number), "Total users"]} />
              <Area type="monotone" dataKey="total" stroke={SERIES[0]} strokeWidth={2} fill="url(#uGrad)" name="Total users" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[280px] items-center justify-center text-sm text-ink-muted">Not enough data yet.</div>
        )}
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Role distribution" subtitle="customer / driver / company">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={roles} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="role" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} formatter={(v) => [fmtInt(v as number), "Users"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Users">
                {roles.map((r) => (
                  <Cell key={r.role} fill={ROLE_COLOR[r.role] ?? SERIES[0]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Verification status by role"
          subtitle="verified / pending / other"
          note="Signup funnel: guest → registered → verified. Guests are not tracked (they never create an account row), so the funnel starts at registered."
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={verif} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="role" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
              <Bar dataKey="verified" stackId="v" fill={SERIES[2]} name="Verified" radius={[0, 0, 0, 0]} />
              <Bar dataKey="pending" stackId="v" fill={SERIES[3]} name="Pending" />
              <Bar dataKey="other" stackId="v" fill={GRID} name="Other" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Recently joined users" subtitle="Sortable · paginated · searchable">
        <DataTable
          columns={columns}
          rows={recent}
          pageSize={25}
          initialSort={{ key: "joined", dir: "desc" }}
          searchValue={(r) => `${r.name ?? ""} ${r.id}`}
          searchPlaceholder="Search name or ID…"
          csvFilename="users"
        />
      </ChartCard>
    </div>
  );
}

function RolePill({ role }: { role: string | null }) {
  if (!role) return <span className="text-ink-muted">—</span>;
  return <Badge label={role} color={ROLE_COLOR[role] ?? SERIES[0]} dot />;
}

const VERIF_COLOR: Record<string, string> = {
  verified: STATUS.good,
  rejected: STATUS.critical,
  pending: STATUS.warning,
};

function VerifPill({ status }: { status: string | null }) {
  const s = status || "unknown";
  return <Badge label={s} color={VERIF_COLOR[s] ?? AXIS} />;
}
