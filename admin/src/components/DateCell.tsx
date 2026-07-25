import { fmtAbsoluteWIB, fmtDateShort, fmtRelative, fmtWeekdayAbbrev } from "@/lib/dates";

/**
 * Two-line date cell: relative time on top, short absolute date underneath.
 * Full timestamp (date + time + WIB) is available on hover via a native
 * title tooltip — no extra JS needed for that part.
 */
export function DateCell({
  value,
  showWeekday = false,
  now,
}: {
  value: string | Date | null | undefined;
  showWeekday?: boolean;
  now?: Date;
}) {
  if (!value) return <span className="text-ink-muted">—</span>;
  const weekday = showWeekday ? fmtWeekdayAbbrev(value) : null;
  return (
    <span className="inline-flex flex-col leading-tight" title={fmtAbsoluteWIB(value)}>
      <span className="text-ink-primary">{fmtRelative(value, now)}</span>
      <span className="font-mono text-[11px] text-ink-muted">
        {weekday ? `${weekday} · ` : ""}
        {fmtDateShort(value)}
      </span>
    </span>
  );
}
