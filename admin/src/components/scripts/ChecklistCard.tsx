"use client";

// 9. Filming checklist — auto-generated from POV type + feature, checkable, and
// persisted in the script file's "Filming Checklist" section (as a plain
// markdown task list, so the file still reads as a document you can film from).
//
// Regenerating after a feature change merges rather than overwrites: existing
// ticks survive and anything you added by hand is kept.

import { useMemo, useState } from "react";
import { Card, Banner } from "@/components/ui";
import { useScriptPatch } from "./useScriptPatch";
import type { PovScript } from "@/lib/content/scriptTypes";
import {
  checklistFor,
  mergeChecklist,
  parseChecklist,
  serializeChecklist,
  type ChecklistItem,
} from "@/lib/content/scriptRules";

export function ChecklistCard({ script }: { script: PovScript }) {
  const { patch, busy, error } = useScriptPatch(script.id);
  const [adding, setAdding] = useState("");

  const items = useMemo(
    () => parseChecklist(script.body.filmingChecklist),
    [script.body.filmingChecklist],
  );
  const generated = useMemo(
    () => checklistFor(script.frontmatter.pov_type, script.frontmatter.feature_shown),
    [script.frontmatter.pov_type, script.frontmatter.feature_shown],
  );
  // The generated set can drift from the file after a POV-type or feature change.
  const drifted = generated.some((text) => !items.some((i) => i.text === text));

  const done = items.filter((i) => i.done).length;
  const outstanding = items.length - done;

  async function write(next: ChecklistItem[]) {
    await patch({ filmingChecklist: serializeChecklist(next) });
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight">Filming checklist</div>
        <div className="font-mono text-[11px] text-ink-muted">
          {done}/{items.length} done
        </div>
      </div>

      {script.frontmatter.status === "ready_to_film" && outstanding > 0 && (
        <div className="mb-3">
          <Banner tone="warning">
            Marked Ready to Film with {outstanding} item{outstanding === 1 ? "" : "s"} still
            outstanding.
          </Banner>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No checklist yet — generate one from the POV type and feature.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={`${i}-${item.text}`}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 text-xs leading-relaxed text-ink-secondary transition hover:bg-surface-2/60">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={busy}
                  onChange={(e) => {
                    const next = items.map((it, j) =>
                      j === i ? { ...it, done: e.target.checked } : it,
                    );
                    void write(next);
                  }}
                  className="mt-0.5 accent-series-1 disabled:opacity-50"
                />
                <span className={item.done ? "text-ink-muted line-through" : ""}>{item.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline/60 pt-3">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && adding.trim()) {
              e.preventDefault();
              void write([...items, { text: adding.trim(), done: false }]);
              setAdding("");
            }
          }}
          placeholder="Add an item…"
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || !drifted}
          onClick={() => void write(mergeChecklist(items, generated))}
          title={
            drifted
              ? "The POV type / feature changed — pull in the items that now apply"
              : "Checklist already matches this POV type + feature"
          }
          className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
        >
          {drifted ? "Sync from POV type + feature" : "In sync"}
        </button>
      </div>

      {error && (
        <div className="mt-2">
          <Banner tone="gap">Save failed: {error}</Banner>
        </div>
      )}
    </Card>
  );
}
