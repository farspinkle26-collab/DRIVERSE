"use client";

import { RANGE_OPTIONS, RangeKey } from "@/lib/dates";

/** Segmented date-range control. Filters happen client-side over fetched data. */
export function RangeToggle({
  value,
  onChange,
  options,
}: {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
  options?: RangeKey[];
}) {
  const opts = options
    ? RANGE_OPTIONS.filter((o) => options.includes(o.key))
    : RANGE_OPTIONS;
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-surface-2 p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            value === o.key
              ? "bg-series-1 text-white"
              : "text-ink-muted hover:text-ink-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
