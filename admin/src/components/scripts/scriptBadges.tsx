"use client";

// Shared vocabulary for the POV Script UI: one colour per POV type and one per
// pipeline status, used identically on the Kanban cards, the list table and the
// editor header — the same rule pillar badges follow elsewhere in the dashboard.
//
// POV type is the categorical axis (Solo vs Social), so it gets two clearly
// different hues from the house palette. Status is a *progression*, so it reads
// as one: muted → brick → amber → orange → green at Posted.

import { Badge } from "@/components/ui";
import { SERIES, STATUS } from "@/components/chartTheme";
import {
  POV_TYPE_LABELS,
  SCRIPT_FEATURE_GLYPHS,
  SCRIPT_FEATURE_LABELS,
  SCRIPT_STATUS_LABELS,
  type PovType,
  type ScriptFeature,
  type ScriptStatus,
} from "@/lib/content/scriptTypes";

export const POV_TYPE_COLOR: Record<PovType, string> = {
  solo: SERIES[5], // salmon
  social: SERIES[3], // amber
};

export const SCRIPT_STATUS_COLOR: Record<ScriptStatus, string> = {
  idea: "#9c8482", // ink-muted: not committed to yet
  drafted: SERIES[7], // brick
  ready_to_film: STATUS.warning,
  filmed: STATUS.serious,
  posted: STATUS.good,
};

export function PovTypeBadge({ type }: { type: PovType }) {
  return <Badge label={POV_TYPE_LABELS[type]} color={POV_TYPE_COLOR[type]} dot />;
}

export function ScriptStatusBadge({ status }: { status: ScriptStatus }) {
  return <Badge label={SCRIPT_STATUS_LABELS[status]} color={SCRIPT_STATUS_COLOR[status]} />;
}

/** Feature marker: glyph + label, quiet on purpose (the colour axis is taken). */
export function FeatureTag({
  feature,
  labelled = true,
}: {
  feature: ScriptFeature;
  labelled?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-muted"
      title={SCRIPT_FEATURE_LABELS[feature]}
    >
      <span aria-hidden className="text-ink-secondary">
        {SCRIPT_FEATURE_GLYPHS[feature]}
      </span>
      {labelled && SCRIPT_FEATURE_LABELS[feature]}
    </span>
  );
}
