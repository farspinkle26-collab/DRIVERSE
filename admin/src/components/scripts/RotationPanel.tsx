"use client";

// 1. Feature rotation enforcement — computed, no model involved.
//
// Which app screens the last N scripts used, which one to reach for next, and a
// visible warning when the pick repeats the previous script. It never blocks:
// the rule ("never the same screen twice running") is enforced by being
// impossible to miss at the moment the choice is made.

import Link from "next/link";
import { Card } from "@/components/ui";
import { FeatureTag } from "./scriptBadges";
import {
  ROTATABLE_FEATURES,
  SCRIPT_FEATURES,
  SCRIPT_FEATURE_LABELS,
  type ScriptFeature,
} from "@/lib/content/scriptTypes";
import { rotationWarning, type FeatureRotation } from "@/lib/content/scriptRules";

export function RotationPanel({
  rotation,
  selected,
  onSelect,
}: {
  rotation: FeatureRotation;
  selected: ScriptFeature;
  /** When given, the feature chips become the picker itself. */
  onSelect?: (feature: ScriptFeature) => void;
}) {
  const warning = rotationWarning(selected, rotation);

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight">Feature rotation</div>
        <div className="font-mono text-[11px] text-ink-muted">last {rotation.n} scripts</div>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-muted">
        Never the same screen twice running.
        {rotation.recommended && (
          <>
            {" "}
            Recommended next:{" "}
            <span className="font-medium text-status-good">
              {SCRIPT_FEATURE_LABELS[rotation.recommended]}
            </span>
            {rotation.unused.length > 0 ? " (unused in this window)" : " (least recently used)"}.
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {SCRIPT_FEATURES.map((feature) => {
          const count = rotation.counts[feature];
          const isSelected = feature === selected;
          const isRecommended = feature === rotation.recommended;
          const isPrevious = feature === rotation.previous;
          const tone = isSelected
            ? isPrevious
              ? "border-status-warning bg-status-warning/15 text-ink-primary"
              : "border-series-1 bg-series-1/15 text-ink-primary"
            : isRecommended
              ? "border-status-good/50 bg-status-good/10 text-ink-secondary"
              : "border-hairline bg-surface-2 text-ink-muted";
          const label = (
            <>
              <span aria-hidden className="mr-1">
                {isRecommended ? "★" : isPrevious ? "⚠" : ""}
              </span>
              {SCRIPT_FEATURE_LABELS[feature]}
              <span className="ml-1.5 font-mono text-[10px] opacity-70">{count}×</span>
            </>
          );
          const title = isPrevious
            ? "Used in the immediately preceding script"
            : isRecommended
              ? "Recommended — rotate to this one"
              : `${count} of the last ${rotation.n} scripts`;
          return onSelect ? (
            <button
              key={feature}
              type="button"
              onClick={() => onSelect(feature)}
              title={title}
              aria-pressed={isSelected}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium transition hover:text-ink-primary ${tone}`}
            >
              {label}
            </button>
          ) : (
            <span
              key={feature}
              title={title}
              className={`rounded-md border px-2 py-1 text-[11px] font-medium ${tone}`}
            >
              {label}
            </span>
          );
        })}
      </div>

      {warning && (
        <div className="mt-3 flex gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs leading-relaxed text-ink-secondary">
          <span aria-hidden>⚠</span>
          <span>{warning}</span>
        </div>
      )}

      {rotation.recent.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-hairline/60 pt-2 text-xs">
          {rotation.recent.map((entry, i) => (
            <li key={entry.id} className="flex items-baseline gap-2">
              <span className="w-4 shrink-0 font-mono text-[10px] text-ink-muted">
                {i === 0 ? "prev" : `-${i + 1}`}
              </span>
              <FeatureTag feature={entry.feature} />
              <Link
                href={`/content/scripts/${entry.id}`}
                className="truncate text-ink-secondary transition hover:text-ink-primary"
              >
                {entry.title || entry.id}
              </Link>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-muted">
                {entry.createdDate}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rotation.n === 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          No scripts on record yet — nothing to rotate away from.
        </p>
      )}
      {rotation.n > 0 && rotation.unused.length === ROTATABLE_FEATURES.length && (
        <p className="mt-2 text-xs text-ink-muted">
          None of the app screens appear in this window.
        </p>
      )}
    </Card>
  );
}
