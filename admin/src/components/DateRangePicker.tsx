"use client";

import { useState } from "react";
import { DATE_RANGE_PRESETS, type DateRangeValue } from "@/lib/dates";

/**
 * Date-range control for tables: preset chips (Today / 7d / 30d / 90d /
 * All time) plus a Custom option that reveals two native date inputs.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const [showCustom, setShowCustom] = useState(value.preset === "custom");

  function selectPreset(preset: DateRangeValue["preset"]) {
    if (preset === "custom") {
      setShowCustom(true);
      onChange({ ...value, preset: "custom" });
      return;
    }
    setShowCustom(false);
    onChange({ preset });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
        {DATE_RANGE_PRESETS.map((o) => (
          <button
            key={o.key}
            onClick={() => selectPreset(o.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              value.preset === o.key ? "bg-series-1 text-white" : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input
            type="date"
            value={value.customStart ?? ""}
            onChange={(e) => onChange({ ...value, preset: "custom", customStart: e.target.value })}
            className="rounded-md border border-hairline bg-surface-2 px-2 py-1 font-mono text-ink-secondary"
          />
          <span>–</span>
          <input
            type="date"
            value={value.customEnd ?? ""}
            onChange={(e) => onChange({ ...value, preset: "custom", customEnd: e.target.value })}
            className="rounded-md border border-hairline bg-surface-2 px-2 py-1 font-mono text-ink-secondary"
          />
        </div>
      )}
    </div>
  );
}
