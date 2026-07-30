"use client";

// 6. Script Kanban — the primary view for this section. Script writing as a
// visible pipeline instead of a pile of documents.
//
// Drag a card between columns to set `status` (one PATCH of one field). Native
// HTML5 drag-and-drop: no dependency, and the same gesture works with a mouse
// or trackpad. Keyboard users get the ‹ › buttons on each card, which do exactly
// the same thing — a board you can only operate by dragging is a board half the
// team can't use.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeatureTag, PovTypeBadge, SCRIPT_STATUS_COLOR } from "./scriptBadges";
import {
  SCRIPT_STATUSES,
  SCRIPT_STATUS_LABELS,
  type PovScript,
  type ScriptStatus,
} from "@/lib/content/scriptTypes";
import { checklistProgress } from "@/lib/content/scriptRules";
import type { ScriptPerformance } from "@/lib/content/scriptPerformance";

export interface KanbanRow {
  script: PovScript;
  performance: ScriptPerformance | null;
}

const pct = (r: number, d = 2) => `${(r * 100).toFixed(d)}%`;

export function ScriptKanban({ rows }: { rows: KanbanRow[] }) {
  const router = useRouter();
  // Optimistic status while the PATCH is in flight, so the card doesn't snap
  // back to its old column for the length of a round trip.
  const [pending, setPending] = useState<Record<string, ScriptStatus>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<ScriptStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusOf = (row: KanbanRow): ScriptStatus =>
    pending[row.script.id] ?? row.script.frontmatter.status;

  async function move(id: string, status: ScriptStatus) {
    const row = rows.find((r) => r.script.id === id);
    if (!row || statusOf(row) === status) return;
    setPending((p) => ({ ...p, [id]: status }));
    setError(null);
    try {
      const res = await fetch(`/api/content/scripts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!json.ok) throw new Error(json.error || "Move failed.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-2 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-xs text-ink-secondary">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {SCRIPT_STATUSES.map((status) => {
          const columnRows = rows.filter((r) => statusOf(r) === status);
          const isOver = over === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = dragging ?? e.dataTransfer.getData("text/plain");
                if (id) void move(id, status);
                setDragging(null);
              }}
              className={`flex min-h-[180px] flex-col rounded-xl border bg-surface-1 transition ${
                isOver ? "border-series-1 bg-surface-2/60" : "border-hairline"
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-hairline/60 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: SCRIPT_STATUS_COLOR[status] }}
                  />
                  <span className="text-xs font-medium tracking-tight text-ink-secondary">
                    {SCRIPT_STATUS_LABELS[status]}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-ink-muted">{columnRows.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {columnRows.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-hairline/70 px-2 py-6 text-center text-[11px] text-ink-muted">
                    Drop a script here
                  </div>
                )}
                {columnRows.map((row) => (
                  <KanbanCard
                    key={row.script.id}
                    row={row}
                    status={status}
                    dragging={dragging === row.script.id}
                    onDragStart={(e) => {
                      setDragging(row.script.id);
                      e.dataTransfer.setData("text/plain", row.script.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragging(null)}
                    onMove={(next) => void move(row.script.id, next)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  row,
  status,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  row: KanbanRow;
  status: ScriptStatus;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (status: ScriptStatus) => void;
}) {
  const fm = row.script.frontmatter;
  const progress = checklistProgress(row.script.body.filmingChecklist);
  const index = SCRIPT_STATUSES.indexOf(status);
  const prev = SCRIPT_STATUSES[index - 1];
  const next = SCRIPT_STATUSES[index + 1];
  const perf = row.performance;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-lg border border-hairline/70 bg-surface-2/60 p-2.5 transition ${
        dragging ? "opacity-40" : "hover:border-baseline hover:bg-surface-2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/content/scripts/${row.script.id}`}
          className="text-xs font-medium leading-snug text-ink-primary transition hover:text-series-1"
        >
          {fm.title || row.script.id}
        </Link>
        <span
          aria-hidden
          className="cursor-grab select-none text-[11px] text-ink-muted opacity-0 transition group-hover:opacity-100"
          title="Drag to another column"
        >
          ⠿
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <PovTypeBadge type={fm.pov_type} />
        <FeatureTag feature={fm.feature_shown} />
      </div>

      {fm.hook && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-ink-secondary">
          “{fm.hook}”
        </p>
      )}

      {status === "ready_to_film" && progress.total > 0 && (
        <div className="mt-1.5 font-mono text-[10px] text-ink-muted">
          checklist {progress.done}/{progress.total}
          {progress.done < progress.total && (
            <span className="ml-1 text-status-warning">· {progress.total - progress.done} left</span>
          )}
        </div>
      )}

      {status === "posted" && (
        <div className="mt-1.5 border-t border-hairline/60 pt-1.5 text-[10px] leading-snug">
          {perf?.hasMetrics ? (
            <Link
              href={`/content/posts/${perf.post.slug}`}
              className="font-mono text-ink-muted transition hover:text-ink-primary"
            >
              save {pct(perf.saveRate)}
              {perf.vsMedian != null && (
                <span className={perf.vsMedian >= 0 ? "text-status-good" : "text-status-critical"}>
                  {" "}
                  {perf.vsMedian >= 0 ? "▲" : "▼"}
                  {Math.abs(perf.vsMedian * 100).toFixed(0)}%
                </span>
              )}
              {" · organic "}
              {perf.organicPickup}
            </Link>
          ) : perf ? (
            <span className="text-ink-muted">linked post has no metrics yet</span>
          ) : (
            <span className="text-ink-muted">
              {fm.linked_post ? "linked post not found" : "no linked post yet"}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && onMove(prev)}
          title={prev ? `Move to ${SCRIPT_STATUS_LABELS[prev]}` : "First column"}
          className="rounded border border-hairline px-1.5 text-[11px] text-ink-muted transition hover:text-ink-primary disabled:opacity-30"
        >
          ‹
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && onMove(next)}
          title={next ? `Move to ${SCRIPT_STATUS_LABELS[next]}` : "Last column"}
          className="rounded border border-hairline px-1.5 text-[11px] text-ink-muted transition hover:text-ink-primary disabled:opacity-30"
        >
          ›
        </button>
        <span className="ml-auto font-mono text-[10px] text-ink-muted">{fm.created_date}</span>
      </div>
    </div>
  );
}
