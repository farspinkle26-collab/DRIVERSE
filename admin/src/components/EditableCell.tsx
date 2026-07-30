"use client";

// Spreadsheet-style inline editors for the content-planning table. Each cell
// owns exactly one field and PATCHes just that field
// (PATCH /api/content/posts/[slug] → applyPostPatch), so two people editing
// different columns of the same row can't overwrite each other's work the way a
// whole-form PUT would.
//
// A cell reads as plain text until you hover or focus it — the grid stays
// readable, and every value in it is still one click from editable.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtInt } from "@/lib/format";

const BASE =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink-primary " +
  "transition hover:border-hairline hover:bg-surface-2 focus:border-series-1 focus:bg-surface-2 focus:outline-none " +
  "placeholder:text-ink-muted/60 disabled:opacity-50";

/** Shared save/refresh/error plumbing for one row's cells. */
function usePatchField(slug: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (field: string, value: unknown): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/content/posts/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
        if (!json.ok) throw new Error(json.error || "Save failed.");
        // Re-read the store: a saved counter changes the derived rate columns
        // and every aggregate above the table, not just this cell.
        router.refresh();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [slug, router],
  );

  return { save, busy, error };
}

function ring(error: string | null, busy: boolean): string {
  if (error) return " border-status-critical text-status-critical";
  if (busy) return " opacity-60";
  return "";
}

export type EditableKind = "text" | "url" | "date" | "time" | "number";

interface EditableCellProps {
  slug: string;
  field: string;
  value: string | number;
  kind?: EditableKind;
  placeholder?: string;
  className?: string;
  /** Renders a static dash instead of an input (e.g. metrics on a Scheduled post). */
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * One-line editable cell. Commits on Enter or blur, reverts on Escape, and only
 * calls the API when the value actually changed.
 */
export function EditableCell({
  slug,
  field,
  value,
  kind = "text",
  placeholder,
  className = "",
  disabled = false,
  disabledHint,
}: EditableCellProps) {
  const { save, busy, error } = usePatchField(slug);
  const serverValue = String(value ?? "");
  const [draft, setDraft] = useState(serverValue);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // Follow the server after a refresh, but never yank the text out from under
  // someone mid-edit.
  useEffect(() => {
    if (!focused) setDraft(serverValue);
  }, [serverValue, focused]);

  if (disabled) {
    return (
      <span className="block px-1.5 text-sm text-ink-muted" title={disabledHint}>
        —
      </span>
    );
  }

  const isNumber = kind === "number";
  // Numbers read as 1,240 at rest and as raw digits while being typed.
  const display = focused ? draft : isNumber ? fmtInt(Number(serverValue) || 0) : serverValue;

  async function commit() {
    setFocused(false);
    if (draft === serverValue) return;
    const ok = await save(field, draft);
    if (!ok) setDraft(serverValue);
  }

  return (
    <input
      ref={ref}
      type={kind === "date" ? "date" : kind === "time" ? "time" : "text"}
      inputMode={isNumber ? "numeric" : undefined}
      value={display}
      placeholder={placeholder}
      disabled={busy}
      title={error ?? (kind === "url" && serverValue ? serverValue : undefined)}
      aria-label={field}
      aria-invalid={!!error}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => {
        setDraft(serverValue);
        setFocused(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(serverValue);
          setFocused(false);
          ref.current?.blur();
        }
      }}
      className={`${BASE}${ring(error, busy)} ${isNumber ? "text-right font-mono tabular" : ""} ${className}`}
    />
  );
}

/**
 * Multi-line editable cell for prose (Caption, Hashtag). Collapses to two lines
 * at rest so the grid stays scannable, and grows while focused.
 */
export function EditableTextCell({
  slug,
  field,
  value,
  placeholder,
  className = "",
  rows = 2,
  focusRows = 6,
}: {
  slug: string;
  field: string;
  value: string;
  placeholder?: string;
  className?: string;
  rows?: number;
  focusRows?: number;
}) {
  const { save, busy, error } = usePatchField(slug);
  const serverValue = value ?? "";
  const [draft, setDraft] = useState(serverValue);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focused) setDraft(serverValue);
  }, [serverValue, focused]);

  async function commit() {
    setFocused(false);
    if (draft === serverValue) return;
    const ok = await save(field, draft);
    if (!ok) setDraft(serverValue);
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={focused ? focusRows : rows}
      placeholder={placeholder}
      disabled={busy}
      title={error ?? (serverValue || undefined)}
      aria-label={field}
      aria-invalid={!!error}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Enter inserts a newline here — Escape is the way out.
        if (e.key === "Escape") {
          e.preventDefault();
          setDraft(serverValue);
          setFocused(false);
          ref.current?.blur();
        }
      }}
      className={`${BASE}${ring(error, busy)} resize-none leading-snug ${className}`}
    />
  );
}

/** Editable dropdown cell (Status, Platform, Pillar). Saves on change. */
export function EditableSelectCell({
  slug,
  field,
  value,
  options,
  className = "",
}: {
  slug: string;
  field: string;
  value: string;
  options: [string, string][];
  className?: string;
}) {
  const { save, busy, error } = usePatchField(slug);
  const [pending, setPending] = useState<string | null>(null);

  // Show the chosen option immediately; drop back to the server value once the
  // refresh lands (or the save failed).
  useEffect(() => {
    setPending(null);
  }, [value]);

  return (
    <select
      value={pending ?? value}
      disabled={busy}
      title={error ?? undefined}
      aria-label={field}
      aria-invalid={!!error}
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        const next = e.target.value;
        setPending(next);
        const ok = await save(field, next);
        if (!ok) setPending(null);
      }}
      className={`${BASE}${ring(error, busy)} cursor-pointer ${className}`}
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Editable tick cell ("Done"). Saves on change. */
export function EditableCheckboxCell({
  slug,
  field,
  value,
  label,
}: {
  slug: string;
  field: string;
  value: boolean;
  label?: string;
}) {
  const { save, busy, error } = usePatchField(slug);
  const [pending, setPending] = useState<boolean | null>(null);

  useEffect(() => {
    setPending(null);
  }, [value]);

  const checked = pending ?? value;
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={busy}
      title={error ?? undefined}
      aria-label={label ?? field}
      aria-invalid={!!error}
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        const next = e.target.checked;
        setPending(next);
        const ok = await save(field, next);
        if (!ok) setPending(null);
      }}
      className={`accent-series-1 disabled:opacity-50 ${error ? "outline outline-1 outline-status-critical" : ""}`}
    />
  );
}
