"use client";

// 4 + 5. Copy-prompt / paste-back.
//
// There is no API key in this dashboard, so "generate" means: format a prompt
// grounded in our own data, hand it to you to paste into a Claude chat, and take
// the reply back apart into the script's sections. The formatting itself lives in
// lib/content/scriptPrompts.ts (one builder per feature) and the parsing in the
// same module — this file is only the surface. If a key is ever wired up, the
// copy step becomes an llmText() call and nothing here needs restructuring.

import { useMemo, useState } from "react";
import { Card, Banner } from "@/components/ui";
import { useScriptPatch } from "./useScriptPatch";
import {
  SCRIPT_FEATURES,
  SCRIPT_FEATURE_LABELS,
  type PovScript,
  type ScriptFeature,
} from "@/lib/content/scriptTypes";
import {
  buildGenerationPrompt,
  buildRefinePrompt,
  parseScriptResponse,
  type ParsedScriptResponse,
} from "@/lib/content/scriptPrompts";
import {
  parseHookOptions,
  serializeHookOptions,
  type FeatureRotation,
} from "@/lib/content/scriptRules";

// ── Bits ────────────────────────────────────────────────────────────────────
export function CopyButton({
  text,
  label = "Copy prompt",
  primary = false,
}: {
  text: string;
  label?: string;
  primary?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — the block is selectable as a fallback */
        }
      }}
      className={
        primary
          ? "rounded-lg bg-series-1 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          : "rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
      }
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function PromptBlock({ prompt }: { prompt: string }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-ink-secondary">
      {prompt}
    </pre>
  );
}

const inputClass =
  "w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1";

// ── Paste-back ──────────────────────────────────────────────────────────────
/**
 * Takes the reply, shows what it parsed out of it, lets you pick which hook
 * becomes the primary `hook` field, and writes the sections into the script.
 * Discarded hook variants are kept in "Hook Options" — that's the point of the
 * section — and anything the parser couldn't place is appended to Notes rather
 * than dropped.
 */
function PasteBack({
  script,
  featureUsed,
  onDone,
}: {
  script: PovScript;
  /** The feature the prompt targeted; saved onto the script with the response. */
  featureUsed: ScriptFeature;
  onDone?: () => void;
}) {
  const { patch, busy, error } = useScriptPatch(script.id);
  const [raw, setRaw] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const parsed: ParsedScriptResponse | null = useMemo(
    () => (raw.trim() ? parseScriptResponse(raw) : null),
    [raw],
  );

  const hookOptions = parsed?.hookOptions ?? [];
  const primary = chosen ?? hookOptions[0] ?? script.frontmatter.hook;

  async function save() {
    if (!parsed) return;
    const notesParts = [script.body.notes.trim()];
    if (parsed.why) notesParts.push(`**Why this should work:** ${parsed.why}`);
    if (parsed.unmatched) notesParts.push(`**From the reply (unplaced):**\n${parsed.unmatched}`);
    const fields: Record<string, unknown> = {
      hookOptions: serializeHookOptions(
        // New variants first, then the ones already on file — a refine adds to
        // the record of what was considered, it doesn't erase it (duplicates are
        // dropped by serializeHookOptions).
        [...hookOptions, ...parseHookOptions(script.body.hookOptions)],
        primary,
      ),
      notes: notesParts.filter(Boolean).join("\n\n"),
      feature_shown: featureUsed,
    };
    if (parsed.script) fields.script = parsed.script;
    if (parsed.onScreenText) fields.onScreenText = parsed.onScreenText;
    if (parsed.visualDirection) fields.visualDirection = parsed.visualDirection;
    if (primary) fields.hook = primary;
    if (hookOptions.length) fields.hook_variants_considered = hookOptions.length;
    // A script that has words in it is no longer just an idea.
    if (script.frontmatter.status === "idea" && parsed.script) fields.status = "drafted";

    const ok = await patch(fields);
    if (ok) {
      setRaw("");
      setChosen(null);
      onDone?.();
    }
  }

  return (
    <div className="space-y-2 border-t border-hairline/60 pt-3">
      <label className="block text-xs font-medium text-ink-muted">
        Paste the reply back here
      </label>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={raw ? 8 : 3}
        placeholder="Paste Claude's response — hook options, script, on-screen text, visual direction…"
        className={`${inputClass} resize-y font-mono text-[11px] leading-relaxed`}
      />

      {parsed && !parsed.matched && (
        <Banner tone="warning">
          Couldn&apos;t find any of the expected sections in that reply. Saving would put all of it
          in Notes — check you pasted the whole answer.
        </Banner>
      )}

      {parsed && parsed.matched && (
        <div className="space-y-2 rounded-lg border border-hairline/60 bg-surface-2/40 p-3">
          <div className="text-xs font-medium text-ink-secondary">Parsed from the reply</div>
          {hookOptions.length > 0 ? (
            <fieldset className="space-y-1">
              <legend className="text-[11px] text-ink-muted">
                Pick the primary hook ({hookOptions.length} variant
                {hookOptions.length === 1 ? "" : "s"} — all are kept in Hook Options)
              </legend>
              {hookOptions.map((option, i) => (
                <label
                  key={`${i}-${option}`}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs text-ink-secondary hover:bg-surface-1"
                >
                  <input
                    type="radio"
                    name="primary-hook"
                    checked={primary === option}
                    onChange={() => setChosen(option)}
                    className="mt-0.5 accent-series-1"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="text-[11px] text-ink-muted">No hook options found in the reply.</div>
          )}
          <ul className="space-y-0.5 text-[11px] text-ink-muted">
            <li>Script: {parsed.script ? `${parsed.script.length} chars` : "— not found"}</li>
            <li>
              On-screen text: {parsed.onScreenText ? `${parsed.onScreenText.length} chars` : "— not found"}
            </li>
            <li>
              Visual direction:{" "}
              {parsed.visualDirection ? `${parsed.visualDirection.length} chars` : "— not found"}
            </li>
            <li>Why this should work: {parsed.why ? "captured → Notes" : "— not found"}</li>
            {parsed.unmatched && <li>Unplaced text: kept in Notes verbatim</li>}
          </ul>
        </div>
      )}

      {error && <Banner tone="gap">Save failed: {error}</Banner>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !parsed}
          className="rounded-lg bg-series-1 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save into script"}
        </button>
        <span className="text-[11px] text-ink-muted">
          Replaces the sections it found; the previous version is kept in history.
        </span>
      </div>
    </div>
  );
}

// ── 4. Generation ───────────────────────────────────────────────────────────
export function GeneratePromptCard({
  script,
  rotation,
  recentHooks,
  whatWorks,
}: {
  script: PovScript;
  rotation: FeatureRotation;
  recentHooks: string[];
  whatWorks: string;
}) {
  // Pre-filled with the rotation recommendation, falling back to whatever the
  // script already says it shows.
  const [feature, setFeature] = useState<ScriptFeature>(
    rotation.recommended ?? script.frontmatter.feature_shown,
  );
  const [topic, setTopic] = useState("");
  const [includeWhatWorks, setIncludeWhatWorks] = useState(true);

  const prompt = useMemo(
    () =>
      buildGenerationPrompt({
        povType: script.frontmatter.pov_type,
        feature,
        topic,
        recentHooks,
        whatWorks: includeWhatWorks ? whatWorks : "",
      }),
    [script.frontmatter.pov_type, feature, topic, recentHooks, includeWhatWorks, whatWorks],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Generate a script</div>
          <p className="mt-0.5 text-xs text-ink-muted">
            Copy this into a Claude chat, then paste the reply back — it lands in the sections
            below.
          </p>
        </div>
        <CopyButton text={prompt} primary />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Feature to showcase</label>
          <select
            value={feature}
            onChange={(e) => setFeature(e.target.value as ScriptFeature)}
            className={`${inputClass} cursor-pointer`}
          >
            {SCRIPT_FEATURES.map((f) => (
              <option key={f} value={f}>
                {SCRIPT_FEATURE_LABELS[f]}
                {f === rotation.recommended ? " ★ recommended" : ""}
                {f === rotation.previous ? " ⚠ previous script" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Topic / scenario notes (optional)
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. late-night run to the coffee stop, empty roads"
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={includeWhatWorks}
          onChange={(e) => setIncludeWhatWorks(e.target.checked)}
          className="accent-series-1"
        />
        Include the what-works.md numbers ({whatWorks ? `${whatWorks.length} chars` : "empty"})
      </label>

      <PromptBlock prompt={prompt} />
      <PasteBack script={script} featureUsed={feature} />
    </Card>
  );
}

// ── 5. Refine ───────────────────────────────────────────────────────────────
export function RefinePromptCard({
  script,
  pillarLabel,
  recentHooks,
  whatWorks,
}: {
  script: PovScript;
  pillarLabel: string;
  recentHooks: string[];
  whatWorks: string;
}) {
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false);

  const prompt = useMemo(
    () => buildRefinePrompt({ script, pillarLabel, feedback, recentHooks, whatWorks }),
    [script, pillarLabel, feedback, recentHooks, whatWorks],
  );

  const hasDraft = script.body.script.trim().length > 0;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Refine this script</div>
          <p className="mt-0.5 text-xs text-ink-muted">
            For a draft that isn&apos;t landing. Sends the current script plus your feedback; the
            paste-back replaces it and the old version stays in history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
        >
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {open && (
        <>
          {!hasDraft && (
            <Banner tone="info">
              There&apos;s no script written yet — generate one first, then refine it.
            </Banner>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              What isn&apos;t working?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="hook feels slow · want a different feature shown · the app moment lands too late"
              className={`${inputClass} resize-y`}
            />
          </div>
          <div className="flex justify-end">
            <CopyButton text={prompt} label="Copy refine prompt" primary />
          </div>
          <PromptBlock prompt={prompt} />
          <PasteBack script={script} featureUsed={script.frontmatter.feature_shown} />
        </>
      )}
    </Card>
  );
}
