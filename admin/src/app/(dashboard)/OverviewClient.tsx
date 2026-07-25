"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SectionHeader, StatCard, ChartCard, Banner } from "@/components/ui";
import { RangeToggle } from "@/components/RangeToggle";
import { RefreshButton } from "@/components/RefreshButton";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { RangeKey } from "@/lib/dates";
import { fmtInt, fmtNum, fmtDate } from "@/lib/format";
import {
  countInRange,
  countInPrev,
  activityByDay,
  activityByUser,
  activeUsers,
  dauSeries,
  retention,
  ActivityEvent,
} from "@/lib/metrics";
import type { ProfileRow } from "@/lib/types";

interface Props {
  profiles: ProfileRow[];
  trips: { created_at: string | null; distance_km: number | null; xp_earned: number | null }[];
  quests: { created_at: string | null; status: string | null; xp_reward: number | null }[];
  events: { created_at: string | null }[];
  parties: { created_at: string | null }[];
  xp: { total_xp: number | null }[];
  activity: ActivityEvent[];
  generatedAt: string;
}

export function OverviewClient(props: Props) {
  const { profiles, trips, quests, events, parties, xp, activity, generatedAt } = props;
  const [range, setRange] = useState<RangeKey>("30d");
  const [dauDays, setDauDays] = useState<30 | 90>(30);
  const now = useMemo(() => new Date(), []);

  const byDay = useMemo(() => activityByDay(activity), [activity]);
  const byUser = useMemo(() => activityByUser(activity), [activity]);

  const m = useMemo(() => {
    const newUsers = countInRange(profiles, (p) => p.created_at, range, now);
    const newUsersPrev = countInPrev(profiles, (p) => p.created_at, range, now);

    const tripsThis = countInRange(trips, (t) => t.created_at, range, now);
    const tripsPrev = countInPrev(trips, (t) => t.created_at, range, now);

    // XP awarded this period (approx): trip xp_earned + completed-quest xp_reward.
    const xpThis =
      trips.reduce(
        (s, t) => (inRange(t.created_at, range, now) ? s + (t.xp_earned ?? 0) : s),
        0,
      ) +
      quests.reduce(
        (s, q) =>
          q.status === "completed" && inRange(q.created_at, range, now)
            ? s + (q.xp_reward ?? 0)
            : s,
        0,
      );

    const eventsThis = countInRange(events, (e) => e.created_at, range, now);
    const eventsPrev = countInPrev(events, (e) => e.created_at, range, now);
    const partiesThis = countInRange(parties, (p) => p.created_at, range, now);
    const partiesPrev = countInPrev(parties, (p) => p.created_at, range, now);

    const totalXp = xp.reduce((s, u) => s + (u.total_xp ?? 0), 0);

    const dau = activeUsers(byDay, 1, now);
    const dauPrev = activeUsers(byDay, 1, new Date(now.getTime() - 86400000));
    const wau = activeUsers(byDay, 7, now);
    const wauPrev = activeUsers(byDay, 7, new Date(now.getTime() - 7 * 86400000));
    const mau = activeUsers(byDay, 30, now);
    const mauPrev = activeUsers(byDay, 30, new Date(now.getTime() - 30 * 86400000));

    const avgXpPerActive = mau > 0 ? totalXp / mau : 0;

    return {
      totalUsers: profiles.length,
      newUsers,
      newUsersPrev,
      totalTrips: trips.length,
      tripsThis,
      tripsPrev,
      xpThis,
      totalXp,
      avgXpPerActive,
      eventsThis,
      eventsPrev,
      partiesThis,
      partiesPrev,
      dau,
      dauPrev,
      wau,
      wauPrev,
      mau,
      mauPrev,
      d1: retention(profiles, byUser, 1, now),
      d7: retention(profiles, byUser, 7, now),
      d30: retention(profiles, byUser, 30, now),
    };
  }, [profiles, trips, quests, events, parties, xp, byDay, byUser, range, now]);

  const dau = useMemo(() => dauSeries(byDay, dauDays, now), [byDay, dauDays, now]);
  const hasActivity = activity.length > 0;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Overview"
        description="Top-line health of Driveverse. Period cards compare against the immediately preceding window."
        right={
          <div className="flex items-center gap-2">
            <RangeToggle value={range} onChange={setRange} options={["7d", "30d"]} />
            <RefreshButton />
          </div>
        }
      />

      <Banner tone="gap">
        <strong>DAU / WAU / MAU and retention are approximations.</strong> Driveverse
        does not track true app-opens or last-active per user, so "active" is
        inferred from users who recorded a trip, sent a message, or were served a
        quest that day. Add <code>profiles.last_active_at</code> + an activity ping
        to make these exact.
      </Banner>

      {/* Fixed headline cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total users" value={fmtInt(m.totalUsers)} hint="all time" />
        <StatCard
          label={`New users (${range})`}
          value={fmtInt(m.newUsers)}
          current={m.newUsers}
          previous={m.newUsersPrev}
        />
        <StatCard label="Total trips" value={fmtInt(m.totalTrips)} hint="all time" />
        <StatCard
          label={`Trips (${range})`}
          value={fmtInt(m.tripsThis)}
          current={m.tripsThis}
          previous={m.tripsPrev}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="DAU" value={fmtInt(m.dau)} current={m.dau} previous={m.dauPrev} hint="≈ 1d" />
        <StatCard label="WAU" value={fmtInt(m.wau)} current={m.wau} previous={m.wauPrev} hint="≈ 7d" />
        <StatCard label="MAU" value={fmtInt(m.mau)} current={m.mau} previous={m.mauPrev} hint="≈ 30d" />
        <StatCard
          label={`Active events + convoys (${range})`}
          value={fmtInt(m.eventsThis + m.partiesThis)}
          current={m.eventsThis + m.partiesThis}
          previous={m.eventsPrev != null && m.partiesPrev != null ? m.eventsPrev + m.partiesPrev : null}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total XP awarded" value={fmtInt(m.totalXp)} hint="all time" />
        <StatCard
          label={`XP awarded (${range})`}
          value={fmtInt(m.xpThis)}
          hint="approx"
        />
        <StatCard label="Avg XP / active user" value={fmtInt(m.avgXpPerActive)} hint="÷ MAU" />
        <StatCard
          label="Total XP (running)"
          value={fmtInt(m.totalXp)}
          hint="sum of user_xp.total_xp"
        />
      </div>

      {/* Retention */}
      <ChartCard
        title="Retention (approx)"
        subtitle="Share of a signup cohort active on their Nth day. Activity-based, not app-opens."
        note="No per-user rank-up or session log exists, so these use the same activity proxy as DAU. Treat as directional until last-active tracking ships."
      >
        <div className="grid grid-cols-3 gap-3">
          <RetentionCell label="D1" value={m.d1} />
          <RetentionCell label="D7" value={m.d7} />
          <RetentionCell label="D30" value={m.d30} />
        </div>
      </ChartCard>

      {/* DAU time series */}
      <ChartCard
        title="Daily active users"
        subtitle={`Approximate DAU over the last ${dauDays} days`}
        right={
          <div className="inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
            {[30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDauDays(d as 30 | 90)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  dauDays === d ? "bg-series-1 text-white" : "text-ink-muted hover:text-ink-secondary"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      >
        {hasActivity ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dau} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: AXIS, fontSize: 11 }}
                tickFormatter={(d) => d.slice(5)}
                minTickGap={24}
                stroke={GRID}
              />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} allowDecimals={false} width={44} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                labelFormatter={(d) => fmtDate(d as string)}
                formatter={(v) => [fmtInt(v as number), "DAU"]}
              />
              <Line
                type="monotone"
                dataKey="dau"
                stroke={SERIES[0]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                name="DAU"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[280px] items-center justify-center text-sm text-ink-muted">
            Not enough activity data yet.
          </div>
        )}
      </ChartCard>

      <p className="text-xs text-ink-muted">Data fetched {fmtDate(generatedAt)} · use Refresh to re-pull.</p>
    </div>
  );
}

function RetentionCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-4 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular">
        {value == null ? "—" : `${fmtNum(value, 1)}%`}
      </div>
    </div>
  );
}

// local helper mirrors metrics.inWindow but for the range key
function inRange(ts: string | null, key: RangeKey, now: Date): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return false;
  const days = key === "7d" ? 7 : key === "30d" ? 30 : key === "90d" ? 90 : null;
  if (days == null) return true;
  return d >= new Date(now.getTime() - days * 86400000) && d <= now;
}
