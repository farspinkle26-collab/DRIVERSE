"use client";

import { useEffect, useMemo, useState } from "react";
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
import { SectionHeader, ChartCard, StatCard, Banner, EmptyState } from "@/components/ui";
import { RefreshButton } from "@/components/RefreshButton";
import { SERIES, AXIS, GRID, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "@/components/chartTheme";
import { PILLARS, PILLAR_LABELS, type Pillar } from "@/lib/content/types";
import type {
  MarketingSchedule,
  MarketingSection,
  ProductTask,
  CalendarSlot,
  RolloutWeek,
  ResultsEntry,
} from "@/lib/marketing/types";

const PILLAR_COLOR: Record<Pillar, string> = {
  garagey: SERIES[0],
  pov_daily: SERIES[2],
  fake_scripted_pov: SERIES[4],
  ai_supercars: SERIES[1],
  tips_tricks: SERIES[3],
};

async function patchItem(section: MarketingSection, id: string, patch: Record<string, unknown>) {
  const res = await fetch("/api/marketing/schedule", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section, id, patch }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Save failed.");
  return json.item;
}

async function addItem(section: MarketingSection, item: Record<string, unknown>) {
  const res = await fetch("/api/marketing/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section, item }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Save failed.");
  return json.item;
}

async function removeItem(section: MarketingSection, id: string) {
  const res = await fetch("/api/marketing/schedule", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section, id }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Delete failed.");
}

export function MarketingClient({ schedule }: { schedule: MarketingSchedule }) {
  const [productTasks, setProductTasks] = useState<ProductTask[]>(schedule.productTasks);
  const [contentCalendar, setContentCalendar] = useState<CalendarSlot[]>(schedule.contentCalendar);
  const [rolloutPlan, setRolloutPlan] = useState<RolloutWeek[]>(schedule.rolloutPlan);
  const [resultsLog, setResultsLog] = useState<ResultsEntry[]>(schedule.resultsLog);
  const [err, setErr] = useState<string | null>(null);

  function report(e: unknown) {
    setErr((e as Error).message);
    setTimeout(() => setErr(null), 4000);
  }

  const productDone = productTasks.filter((t) => t.done).length;
  const calendarDone = contentCalendar.filter((t) => t.done).length;
  const rolloutDone = rolloutPlan.filter((t) => t.done).length;

  const viewsByPillar = useMemo(() => {
    const totals = new Map<string, { pillar: string; key: string; views: number; posts: number }>();
    for (const r of resultsLog) {
      const key = r.pillar ?? "(none)";
      const label = r.pillar ? PILLAR_LABELS[r.pillar] : "Unassigned";
      const cur = totals.get(key) ?? { pillar: label, key, views: 0, posts: 0 };
      cur.views += r.views || 0;
      cur.posts += 1;
      totals.set(key, cur);
    }
    return [...totals.values()].sort((a, b) => b.views - a.views);
  }, [resultsLog]);

  const totalViews = resultsLog.reduce((s, r) => s + (r.views || 0), 0);
  const totalDownloads = resultsLog.reduce((s, r) => s + (r.downloads || 0), 0);
  const organicCount = resultsLog.filter((r) => r.organicPickup).length;
  const organicRate = resultsLog.length ? (organicCount / resultsLog.length) * 100 : 0;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Marketing schedule"
        description="Product build order (Track 1) and the weekly content calendar (Track 2), from the organic marketing plan. Mark rows done, edit any field inline, and log real results as posts go out."
        right={<RefreshButton />}
      />

      {err && <Banner tone="gap">{err}</Banner>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Product tasks done" value={`${productDone}/${productTasks.length}`} />
        <StatCard label="Calendar slots done" value={`${calendarDone}/${contentCalendar.length}`} />
        <StatCard label="Rollout weeks done" value={`${rolloutDone}/${rolloutPlan.length}`} />
        <StatCard label="Posts logged" value={String(resultsLog.length)} hint={`${organicRate.toFixed(0)}% organic pickup`} />
      </div>

      <ChartCard
        title="Track 1 — Product build order"
        subtitle="One-time build work. Should start immediately, in parallel with content — every week without Share Trip is organic reach left on the table."
      >
        <ProductTable
          rows={productTasks}
          onChange={(id, patch) => {
            setProductTasks((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
            patchItem("productTasks", id, patch).catch(report);
          }}
        />
      </ChartCard>

      <ChartCard
        title="Track 2 — Weekly content calendar"
        subtitle="Cadence: 5 posts/week, weighted toward Garagey (proven pillar, 2x/week). Adjust weighting after 2–3 weeks based on which pillar earns real organic pickup."
      >
        <CalendarTable
          rows={contentCalendar}
          onChange={(id, patch) => {
            setContentCalendar((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
            patchItem("contentCalendar", id, patch).catch(report);
          }}
        />
      </ChartCard>

      <Banner tone="info">
        Best-performing posting windows: early morning commute (6:30–8:00 AM) and evening wind-down (7:00–9:00 PM). Post
        consistently at the same 1–2 times daily, then test against your own audience data and adjust.
      </Banner>

      <ChartCard title="4-week rollout plan" subtitle="Product + content milestones by week.">
        <RolloutTable
          rows={rolloutPlan}
          onChange={(id, patch) => {
            setRolloutPlan((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
            patchItem("rolloutPlan", id, patch).catch(report);
          }}
        />
      </ChartCard>

      <ChecklistCard />

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Results log"
          subtitle="Log each post as it goes out — views, downloads, and whether pickup was organic. This is where “effective” becomes measurable."
          right={
            <button
              onClick={async () => {
                try {
                  const item = await addItem("resultsLog", {
                    date: new Date().toISOString().slice(0, 10),
                    day: "",
                    pillar: null,
                    featureShown: "",
                    views: 0,
                    downloads: 0,
                    organicPickup: false,
                    seeded: true,
                    notes: "",
                    done: false,
                  });
                  setResultsLog((rows) => [...rows, item as unknown as ResultsEntry]);
                } catch (e) {
                  report(e);
                }
              }}
              className="rounded-lg bg-series-1 px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
            >
              + Log a post
            </button>
          }
        >
          <ResultsTable
            rows={resultsLog}
            onChange={(id, patch) => {
              setResultsLog((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
              patchItem("resultsLog", id, patch).catch(report);
            }}
            onDelete={(id) => {
              setResultsLog((rows) => rows.filter((r) => r.id !== id));
              removeItem("resultsLog", id).catch(report);
            }}
          />
        </ChartCard>

        <ChartCard
          title="Views by pillar"
          subtitle="Totals from the results log — the real signal is organic pickup, not raw views, but this shows where reach is landing."
        >
          {viewsByPillar.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={viewsByPillar} margin={{ top: 8, right: 12, bottom: 30, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="pillar" tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} width={48} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(v, _n, p) => [`${v} views (${(p.payload as { posts: number }).posts} posts)`, "Views"]}
                />
                <Bar dataKey="views" radius={[4, 4, 0, 0]}>
                  {viewsByPillar.map((d) => (
                    <Cell key={d.key} fill={PILLAR_COLOR[d.key as Pillar] ?? SERIES[7]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Log your first post to see views by pillar." />
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-ink-muted">
            <div>
              Total views: <span className="tabular text-ink-secondary">{totalViews.toLocaleString()}</span>
            </div>
            <div>
              Total downloads logged: <span className="tabular text-ink-secondary">{totalDownloads.toLocaleString()}</span>
            </div>
          </div>
        </ChartCard>
      </div>

      <Banner tone="gap">
        Still open: Garagey's exact format/hook isn't locked down yet. Since it's getting 2x/week here and is the proven
        pillar, it's worth nailing down precisely what made the 4-day/thousands-of-views version work before relying on it
        twice weekly.
      </Banner>
    </div>
  );
}

// ── Track 1: Product build order ────────────────────────────────────────────
function ProductTable({
  rows,
  onChange,
}: {
  rows: ProductTask[];
  onChange: (id: string, patch: Partial<ProductTask>) => void;
}) {
  return (
    <Table
      head={["Done", "Week", "Build", "Why first", "Notes"]}
      widths={["w-10", "w-20", "w-64", "w-64", "w-auto"]}
    >
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-hairline/60">
          <Td>
            <DoneCheckbox checked={r.done} onToggle={(v) => onChange(r.id, { done: v })} />
          </Td>
          <Td>
            <EditableField value={r.week} onCommit={(v) => onChange(r.id, { week: v })} className="w-16" />
          </Td>
          <Td>
            <EditableField value={r.build} onCommit={(v) => onChange(r.id, { build: v })} type="textarea" />
          </Td>
          <Td>
            <EditableField value={r.why} onCommit={(v) => onChange(r.id, { why: v })} type="textarea" />
          </Td>
          <Td>
            <EditableField
              value={r.notes}
              onCommit={(v) => onChange(r.id, { notes: v })}
              placeholder="Add a note…"
              type="textarea"
            />
          </Td>
        </tr>
      ))}
    </Table>
  );
}

// ── Track 2: Weekly content calendar ────────────────────────────────────────
function CalendarTable({
  rows,
  onChange,
}: {
  rows: CalendarSlot[];
  onChange: (id: string, patch: Partial<CalendarSlot>) => void;
}) {
  return (
    <Table
      head={["Done", "Day", "Pillar", "Format", "Comment-seed?", "Notes"]}
      widths={["w-10", "w-24", "w-40", "w-64", "w-24", "w-auto"]}
    >
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-hairline/60">
          <Td>
            <DoneCheckbox checked={r.done} onToggle={(v) => onChange(r.id, { done: v })} />
          </Td>
          <Td className="font-medium text-ink-primary">{r.day}</Td>
          <Td>
            <PillarSelect value={r.pillar} onChange={(v) => onChange(r.id, { pillar: v })} />
          </Td>
          <Td>
            <EditableField value={r.format} onCommit={(v) => onChange(r.id, { format: v })} type="textarea" />
          </Td>
          <Td>
            <DoneCheckbox checked={r.commentSeed} onToggle={(v) => onChange(r.id, { commentSeed: v })} label={r.commentSeed ? "Yes" : "No"} />
          </Td>
          <Td>
            <EditableField
              value={r.notes}
              onCommit={(v) => onChange(r.id, { notes: v })}
              placeholder="Add a note…"
              type="textarea"
            />
          </Td>
        </tr>
      ))}
    </Table>
  );
}

// ── 4-week rollout plan ──────────────────────────────────────────────────────
function RolloutTable({
  rows,
  onChange,
}: {
  rows: RolloutWeek[];
  onChange: (id: string, patch: Partial<RolloutWeek>) => void;
}) {
  return (
    <Table head={["Done", "Week", "Title", "Description"]} widths={["w-10", "w-16", "w-40", "w-auto"]}>
      {rows.map((r) => (
        <tr key={r.id} className="border-t border-hairline/60">
          <Td>
            <DoneCheckbox checked={r.done} onToggle={(v) => onChange(r.id, { done: v })} />
          </Td>
          <Td className="font-medium text-ink-primary">Week {r.week}</Td>
          <Td>
            <EditableField value={r.title} onCommit={(v) => onChange(r.id, { title: v })} />
          </Td>
          <Td>
            <EditableField value={r.description} onCommit={(v) => onChange(r.id, { description: v })} type="textarea" />
          </Td>
        </tr>
      ))}
    </Table>
  );
}

// ── Results log ──────────────────────────────────────────────────────────────
function ResultsTable({
  rows,
  onChange,
  onDelete,
}: {
  rows: ResultsEntry[];
  onChange: (id: string, patch: Partial<ResultsEntry>) => void;
  onDelete: (id: string) => void;
}) {
  if (!rows.length) {
    return <EmptyState message='Nothing logged yet — click "+ Log a post" above after your next post goes out.' />;
  }
  return (
    <div className="max-h-[420px] overflow-auto">
      <Table
        head={["Done", "Date", "Pillar", "Feature shown", "Views", "Downloads", "Organic?", "Seeded?", "Notes", ""]}
        widths={["w-10", "w-32", "w-36", "w-40", "w-20", "w-20", "w-16", "w-16", "w-auto", "w-8"]}
      >
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-hairline/60">
            <Td>
              <DoneCheckbox checked={r.done} onToggle={(v) => onChange(r.id, { done: v })} />
            </Td>
            <Td>
              <input
                type="date"
                value={r.date}
                onChange={(e) => onChange(r.id, { date: e.target.value })}
                className={inputClass}
              />
            </Td>
            <Td>
              <PillarSelect value={r.pillar} onChange={(v) => onChange(r.id, { pillar: v })} />
            </Td>
            <Td>
              <EditableField value={r.featureShown} onCommit={(v) => onChange(r.id, { featureShown: v })} placeholder="e.g. live map" />
            </Td>
            <Td align="right">
              <EditableField
                value={String(r.views ?? 0)}
                onCommit={(v) => onChange(r.id, { views: Number(v) || 0 })}
                type="number"
                className="text-right"
              />
            </Td>
            <Td align="right">
              <EditableField
                value={String(r.downloads ?? 0)}
                onCommit={(v) => onChange(r.id, { downloads: Number(v) || 0 })}
                type="number"
                className="text-right"
              />
            </Td>
            <Td>
              <DoneCheckbox checked={r.organicPickup} onToggle={(v) => onChange(r.id, { organicPickup: v })} />
            </Td>
            <Td>
              <DoneCheckbox checked={r.seeded} onToggle={(v) => onChange(r.id, { seeded: v })} />
            </Td>
            <Td>
              <EditableField value={r.notes} onCommit={(v) => onChange(r.id, { notes: v })} type="textarea" placeholder="Notes…" />
            </Td>
            <Td>
              <button
                onClick={() => onDelete(r.id)}
                className="text-ink-muted transition hover:text-status-critical"
                aria-label="Delete entry"
                title="Delete entry"
              >
                ✕
              </button>
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ── Daily execution checklist (static reference) ────────────────────────────
function ChecklistCard() {
  const steps = [
    { title: "T+0 (post time) — Publish", desc: "No app name in caption, on-screen text, or voiceover. App-screen moment 3–5s, mid-action, most-viral-feature-first." },
    { title: "T+30–60 min — Seed comments", desc: "From 3–4 burner accounts, comment \"Driveverse?\" — stagger by 5–15 min so it doesn't look scripted." },
    { title: "T+45–90 min — Confirm", desc: "Reply from the main content account to each burner comment, confirming the name." },
    { title: "T+2–4 hrs — Check organic pickup", desc: "If real accounts start asking organically, stop seeding — it's self-sustaining. If not by hour 4, note it and move on." },
    { title: "End of day — Log", desc: "Log the post (pillar, feature shown, seed timing, organic pickup) in the results log above." },
  ];
  return (
    <ChartCard
      title="Daily execution checklist"
      subtitle="Run this sequence every time a post is comment-seeded (4 of the 5 weekly posts)."
    >
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-lg border border-hairline bg-surface-2 p-3 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-series-1 text-[11px] font-semibold text-white">
              {i + 1}
            </span>
            <div>
              <div className="font-medium text-ink-primary">{s.title}</div>
              <div className="mt-0.5 text-xs text-ink-secondary">{s.desc}</div>
            </div>
          </li>
        ))}
      </ol>
    </ChartCard>
  );
}

// ── Shared building blocks ──────────────────────────────────────────────────
function Table({
  head,
  widths,
  children,
}: {
  head: string[];
  widths?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline/60">
      <table className="w-full text-sm">
        <thead className="bg-surface-2">
          <tr>
            {head.map((h, i) => (
              <th
                key={h + i}
                className={`whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted ${widths?.[i] ?? ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({
  children,
  className = "",
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return <td className={`px-3 py-2 align-top ${align === "right" ? "text-right" : ""} ${className}`}>{children}</td>;
}

function DoneCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.checked;
          setBusy(true);
          try {
            onToggle(next);
          } finally {
            setBusy(false);
          }
        }}
        className="accent-series-1 disabled:opacity-50"
      />
      {label && <span className="text-xs text-ink-muted">{label}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-primary hover:border-hairline focus:border-series-1 focus:bg-surface-1 focus:outline-none";

function EditableField({
  value,
  onCommit,
  type = "text",
  className = "",
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  type?: "text" | "textarea" | "number";
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  function commit() {
    if (local !== value) onCommit(local);
  }

  if (type === "textarea") {
    return (
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        rows={2}
        placeholder={placeholder}
        className={`${inputClass} resize-y ${className}`}
      />
    );
  }
  return (
    <input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
    />
  );
}

function PillarSelect({
  value,
  onChange,
}: {
  value: Pillar | null;
  onChange: (v: Pillar | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as Pillar | null)}
      className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-primary hover:border-hairline focus:border-series-1 focus:bg-surface-1 focus:outline-none"
    >
      <option value="">—</option>
      {PILLARS.map((p) => (
        <option key={p} value={p}>
          {PILLAR_LABELS[p]}
        </option>
      ))}
    </select>
  );
}
