"use client";

import { pctChange, fmtPct } from "@/lib/format";

// ── Card shell ───────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-hairline bg-surface-1 ${className}`}>
      {children}
    </div>
  );
}

// ── Stat card with trend vs previous period ──────────────────────────
export function StatCard({
  label,
  value,
  current,
  previous,
  hint,
  invertTrend = false,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number | null;
  hint?: string;
  invertTrend?: boolean;
}) {
  let trend: React.ReactNode = null;
  if (current != null && previous != null) {
    const change = pctChange(current, previous);
    if (change == null) {
      trend = <span className="text-ink-muted">new</span>;
    } else {
      const positive = invertTrend ? change < 0 : change > 0;
      const flat = Math.abs(change) < 0.05;
      const color = flat ? "text-ink-muted" : positive ? "text-status-good" : "text-status-critical";
      const arrow = flat ? "→" : change > 0 ? "▲" : "▼";
      trend = (
        <span className={color}>
          {arrow} {fmtPct(Math.abs(change), 1)}
        </span>
      );
    }
  }
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend && <span className="tabular">{trend}</span>}
        {trend && previous != null && (
          <span className="text-ink-muted">vs prev.</span>
        )}
        {hint && <span className="text-ink-muted">{hint}</span>}
      </div>
    </Card>
  );
}

// ── Chart / table container ──────────────────────────────────────────
export function ChartCard({
  title,
  subtitle,
  right,
  children,
  note,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-ink-muted">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
      {note && <div className="mt-3 text-xs leading-relaxed text-ink-muted">{note}</div>}
    </Card>
  );
}

// ── Section header ───────────────────────────────────────────────────
export function SectionHeader({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-secondary">{description}</p>}
      </div>
      {right}
    </div>
  );
}

// ── Empty / not-enough-data state ────────────────────────────────────
export function EmptyState({ message = "Not enough data yet." }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-hairline text-sm text-ink-muted">
      {message}
    </div>
  );
}

// ── Category badge/pill ───────────────────────────────────────────────
// Muted, color-by-category pill for status/category table cells (pillar,
// platform, role, verification, …). `color` should be a series/status hex
// token so the same category reads identically in badges and charts.
export function Badge({
  label,
  color,
  dot = false,
}: {
  label: string;
  color: string;
  dot?: boolean;
}) {
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap"
      style={{ borderColor: `${color}40`, background: `${color}17`, color }}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      {label}
    </span>
  );
}

// ── Info / warning banner ────────────────────────────────────────────
export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "gap";
  children: React.ReactNode;
}) {
  const map = {
    info: "border-series-1/40 bg-series-1/10 text-ink-secondary",
    warning: "border-status-warning/40 bg-status-warning/10 text-ink-secondary",
    gap: "border-status-serious/40 bg-status-serious/10 text-ink-secondary",
  };
  const icon = tone === "info" ? "ⓘ" : tone === "warning" ? "⚠" : "◐";
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${map[tone]}`}>
      <span aria-hidden>{icon}</span>
      <span>{children}</span>
    </div>
  );
}
