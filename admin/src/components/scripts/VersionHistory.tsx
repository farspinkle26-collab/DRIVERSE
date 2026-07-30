"use client";

// 7. Version history — every previous body of this script, newest first.
//
// Snapshots are whole files under content/scripts/_history/{id}/ (written by the
// store whenever a patch moves a body section), so "what changed" is a diff of
// two documents and "revert" is a copy. Fetched on demand: the panel opens
// closed, so a script with a long history costs the editor nothing.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Banner } from "@/components/ui";
import { fmtAbsoluteWIB, fmtRelative } from "@/lib/dates";
import type { ScriptBody } from "@/lib/content/scriptTypes";

interface VersionRow {
  version: string;
  savedAt: string | null;
  hook: string;
  body: ScriptBody;
}

const SECTION_LABELS: [keyof ScriptBody, string][] = [
  ["hookOptions", "Hook Options"],
  ["script", "Script"],
  ["onScreenText", "On-Screen Text"],
  ["visualDirection", "Visual Direction"],
  ["filmingChecklist", "Filming Checklist"],
  ["notes", "Notes"],
];

export function VersionHistory({ id, current }: { id: string; current: ScriptBody }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/scripts/${encodeURIComponent(id)}/history`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load history.");
      setRows(json.versions as VersionRow[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [id]);

  async function restore(version: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/scripts/${encodeURIComponent(id)}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Restore failed.");
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Version history</div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Every body edit — refine, paste-back or manual — keeps the version before it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            if (!open && rows === null) void load();
          }}
          className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {busy && !rows && <div className="text-xs text-ink-muted">Loading…</div>}
          {error && <Banner tone="gap">{error}</Banner>}
          {rows && rows.length === 0 && (
            <div className="text-xs text-ink-muted">
              No earlier versions yet — nothing has overwritten this script&apos;s body.
            </div>
          )}
          {rows?.map((row) => {
            const isOpen = expanded === row.version;
            const changedSections = SECTION_LABELS.filter(
              ([key]) => (row.body[key] ?? "").trim() !== (current[key] ?? "").trim(),
            ).map(([, label]) => label);
            return (
              <div
                key={row.version}
                className="rounded-lg border border-hairline/60 bg-surface-2/40 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ink-secondary" title={fmtAbsoluteWIB(row.savedAt)}>
                    {row.savedAt ? fmtRelative(row.savedAt) : row.version}
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">{row.version}</span>
                  <span className="text-[11px] text-ink-muted">
                    {changedSections.length === 0
                      ? "identical to current"
                      : `differs in ${changedSections.join(", ")}`}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : row.version)}
                      className="rounded border border-hairline px-2 py-0.5 text-[11px] text-ink-secondary transition hover:text-ink-primary"
                    >
                      {isOpen ? "Close" : "View"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void restore(row.version)}
                      className="rounded border border-hairline px-2 py-0.5 text-[11px] text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
                      title="Replace the current body with this version (the current one is snapshotted first)"
                    >
                      Restore
                    </button>
                  </div>
                </div>
                {row.hook && (
                  <div className="mt-1 text-[11px] text-ink-muted">Hook then: “{row.hook}”</div>
                )}
                {isOpen && (
                  <div className="mt-2 space-y-2 border-t border-hairline/60 pt-2">
                    {SECTION_LABELS.map(([key, label]) => {
                      const then = (row.body[key] ?? "").trim();
                      if (!then) return null;
                      const same = then === (current[key] ?? "").trim();
                      return (
                        <div key={key}>
                          <div className="text-[11px] font-medium text-ink-muted">
                            {label}
                            {same && <span className="ml-1 opacity-70">(unchanged)</span>}
                          </div>
                          <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-hairline/60 bg-surface-1 px-2 py-1.5 text-[11px] leading-relaxed text-ink-secondary">
                            {then}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
