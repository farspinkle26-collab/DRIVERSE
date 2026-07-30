"use client";

// The single-script view: everything about one POV script in one place.
//
// There is no Save button. Every control writes the one field it owns through
// PATCH /api/content/scripts/[id] on blur or change, exactly like the content
// plan grid's cells — so two people editing different parts of the same script
// can't overwrite each other, and a body edit always leaves a version behind.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionHeader, Card, Banner } from "@/components/ui";
import { RotationPanel } from "@/components/scripts/RotationPanel";
import { HookPanel } from "@/components/scripts/HookPanel";
import { ChecklistCard } from "@/components/scripts/ChecklistCard";
import { VersionHistory } from "@/components/scripts/VersionHistory";
import { PerformanceCard } from "@/components/scripts/PerformanceCard";
import { GeneratePromptCard, RefinePromptCard } from "@/components/scripts/PromptCards";
import { PovTypeBadge, ScriptStatusBadge } from "@/components/scripts/scriptBadges";
import { useScriptPatch } from "@/components/scripts/useScriptPatch";
import {
  PLATFORM_TARGETS,
  PLATFORM_TARGET_LABELS,
  POV_TYPES,
  POV_TYPE_LABELS,
  SCRIPT_FEATURES,
  SCRIPT_FEATURE_LABELS,
  SCRIPT_STATUSES,
  SCRIPT_STATUS_LABELS,
  type PovScript,
  type ScriptBody,
} from "@/lib/content/scriptTypes";
import {
  densityGate,
  parseHookOptions,
  type DensitySnapshot,
  type FeatureRotation,
  type RecentHook,
} from "@/lib/content/scriptRules";
import type { ScriptPerformance } from "@/lib/content/scriptPerformance";

interface Props {
  script: PovScript;
  rotation: FeatureRotation;
  recentHooks: RecentHook[];
  performance: ScriptPerformance | null;
  pillarLabel: string;
  whatWorks: string;
  density: DensitySnapshot;
  postSlugs: string[];
}

const inputClass =
  "w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1";
const labelClass = "mb-1 block text-xs font-medium text-ink-muted";

export function ScriptEditorClient({
  script,
  rotation,
  recentHooks,
  performance,
  pillarLabel,
  whatWorks,
  density,
  postSlugs,
}: Props) {
  const fm = script.frontmatter;
  const { patch, busy, error, saved } = useScriptPatch(script.id);
  const gate = densityGate(fm.pov_type, density);
  const hookOptions = useMemo(() => parseHookOptions(script.body.hookOptions), [script.body.hookOptions]);
  const hookStrings = useMemo(() => recentHooks.map((h) => h.hook), [recentHooks]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title={fm.title || script.id}
        description={`POV script · ${POV_TYPE_LABELS[fm.pov_type]} · ${SCRIPT_FEATURE_LABELS[fm.feature_shown]} · created ${fm.created_date}`}
        right={
          <div className="flex items-center gap-2">
            {(fm.status === "ready_to_film" || fm.status === "filmed") && (
              <Link
                href={`/content/scripts/${script.id}/teleprompter`}
                className="rounded-lg bg-series-1 px-2.5 py-1 text-xs font-medium text-white transition hover:opacity-90"
              >
                Filming mode
              </Link>
            )}
            <Link
              href="/content/scripts"
              className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
            >
              ← Board
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PovTypeBadge type={fm.pov_type} />
        <ScriptStatusBadge status={fm.status} />
        <span className="font-mono text-[11px] text-ink-muted">{script.id}</span>
        <span className="ml-auto text-[11px] text-ink-muted">
          {busy ? "Saving…" : saved ? "Saved" : "Every field saves on change"}
        </span>
      </div>

      {error && <Banner tone="gap">Save failed: {error}</Banner>}
      {gate && <Banner tone={gate.tone}>{gate.message}</Banner>}

      {/* Both computed checks, visible the whole time you're drafting. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HookPanel hooks={recentHooks} draft={fm.hook} />
        <RotationPanel
          rotation={rotation}
          selected={fm.feature_shown}
          onSelect={(feature) => void patch({ feature_shown: feature })}
        />
      </div>

      {/* ── Pipeline + identity ── */}
      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>Status</label>
          <select
            value={fm.status}
            disabled={busy}
            onChange={(e) => void patch({ status: e.target.value })}
            className={`${inputClass} cursor-pointer`}
          >
            {SCRIPT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SCRIPT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>POV type</label>
          <select
            value={fm.pov_type}
            disabled={busy}
            onChange={(e) => void patch({ pov_type: e.target.value })}
            className={`${inputClass} cursor-pointer`}
          >
            {POV_TYPES.map((t) => (
              <option key={t} value={t}>
                {POV_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Feature shown</label>
          <select
            value={fm.feature_shown}
            disabled={busy}
            onChange={(e) => void patch({ feature_shown: e.target.value })}
            className={`${inputClass} cursor-pointer`}
          >
            {SCRIPT_FEATURES.map((f) => (
              <option key={f} value={f}>
                {SCRIPT_FEATURE_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Platform target</label>
          <select
            value={fm.platform_target}
            disabled={busy}
            onChange={(e) => void patch({ platform_target: e.target.value })}
            className={`${inputClass} cursor-pointer`}
          >
            {PLATFORM_TARGETS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_TARGET_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Working title</label>
          <TextField value={fm.title} onCommit={(v) => patch({ title: v })} placeholder="Working title" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>
            Hook (chosen) · {fm.hook_variants_considered} variant
            {fm.hook_variants_considered === 1 ? "" : "s"} considered
          </label>
          <TextField
            value={fm.hook}
            onCommit={(v) => patch({ hook: v })}
            placeholder="The line the first two seconds live on"
          />
        </div>
        <div>
          <label className={labelClass}>Created</label>
          <TextField value={fm.created_date} onCommit={(v) => patch({ created_date: v })} type="date" />
        </div>
        <div>
          <label className={labelClass}>Filmed</label>
          <TextField
            value={fm.filmed_date ?? ""}
            onCommit={(v) => patch({ filmed_date: v })}
            type="date"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Linked post (slug or permalink)</label>
          <TextField
            value={fm.linked_post ?? ""}
            onCommit={(v) => patch({ linked_post: v })}
            placeholder="2026-07-28-pov_daily-instagram"
            list="script-post-slugs"
          />
          <datalist id="script-post-slugs">
            {postSlugs.map((slug) => (
              <option key={slug} value={slug} />
            ))}
          </datalist>
        </div>
      </Card>

      <PerformanceCard performance={performance} linkedPost={fm.linked_post} />

      <GeneratePromptCard
        script={script}
        rotation={rotation}
        recentHooks={hookStrings}
        whatWorks={whatWorks}
      />

      <RefinePromptCard
        script={script}
        pillarLabel={pillarLabel}
        recentHooks={hookStrings}
        whatWorks={whatWorks}
      />

      {/* ── The document itself ── */}
      <Card className="space-y-4 p-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold tracking-tight">Hook Options</div>
            <span className="text-[11px] text-ink-muted">
              Discarded variants stay here on purpose
            </span>
          </div>
          <SectionField
            value={script.body.hookOptions}
            rows={4}
            placeholder="- variant one&#10;- variant two"
            onCommit={(v) => patch({ hookOptions: v })}
          />
          {hookOptions.length > 0 && (
            <div className="mt-2 space-y-1">
              {hookOptions.map((option, i) => {
                const isPrimary = option === fm.hook.trim();
                return (
                  <div key={`${i}-${option}`} className="flex items-start gap-2 text-xs">
                    <button
                      type="button"
                      disabled={busy || isPrimary}
                      onClick={() =>
                        void patch({
                          hook: option,
                          hook_variants_considered: Math.max(
                            hookOptions.length,
                            fm.hook_variants_considered,
                          ),
                        })
                      }
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium transition ${
                        isPrimary
                          ? "border-status-good/50 bg-status-good/10 text-status-good"
                          : "border-hairline text-ink-muted hover:text-ink-primary"
                      }`}
                    >
                      {isPrimary ? "primary" : "use as primary"}
                    </button>
                    <span className="text-ink-secondary">{option}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <BodySection
          title="Script"
          hint="The spoken/visual script. Filming mode scrolls the spoken lines from here."
          value={script.body.script}
          field="script"
          rows={12}
          onCommit={patch}
        />
        <BodySection
          title="On-Screen Text"
          hint="Overlay per beat."
          value={script.body.onScreenText}
          field="onScreenText"
          rows={5}
          onCommit={patch}
        />
        <BodySection
          title="Visual Direction"
          hint="Camera angle, phone mount position, and exactly when the 3–5s app moment lands."
          value={script.body.visualDirection}
          field="visualDirection"
          rows={6}
          onCommit={patch}
        />
        <BodySection
          title="Notes"
          hint="Anything else — including the “why this should work” line from a generation."
          value={script.body.notes}
          field="notes"
          rows={4}
          onCommit={patch}
        />
      </Card>

      <ChecklistCard script={script} />

      <VersionHistory id={script.id} current={script.body} />
    </div>
  );
}

// ── Field primitives ────────────────────────────────────────────────────────
/** One-line field: commits on Enter or blur, reverts on Escape, and only calls
 *  the API when the value actually changed. */
function TextField({
  value,
  onCommit,
  placeholder,
  type = "text",
  list,
}: {
  value: string;
  onCommit: (v: string) => Promise<boolean> | void;
  placeholder?: string;
  type?: "text" | "date";
  list?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  // Follow the server after a refresh, but never yank text out from under
  // someone mid-edit.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <input
      type={type}
      value={draft}
      list={list}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) void onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          setFocused(false);
          e.currentTarget.blur();
        }
      }}
      className={inputClass}
    />
  );
}

function SectionField({
  value,
  onCommit,
  rows,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => Promise<boolean> | void;
  rows: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <textarea
      value={draft}
      rows={rows}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) void onCommit(draft);
      }}
      className={`${inputClass} resize-y font-mono text-[12px] leading-relaxed`}
    />
  );
}

function BodySection({
  title,
  hint,
  value,
  field,
  rows,
  onCommit,
}: {
  title: string;
  hint: string;
  value: string;
  field: keyof ScriptBody;
  rows: number;
  onCommit: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        <span className="text-[11px] text-ink-muted">{hint}</span>
      </div>
      <SectionField value={value} rows={rows} onCommit={(v) => onCommit({ [field]: v })} />
    </div>
  );
}
