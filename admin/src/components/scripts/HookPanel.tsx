"use client";

// 2. Hook repetition check — computed, always visible while drafting.
//
// The last 5 POV hooks, regardless of status, sitting at the top of the editor
// the whole time you're writing a new one — not buried in a generation prompt.
// The draft hook is checked against them as you type (shared-word overlap, a
// deliberately crude signal) and flagged when it's circling the same line.

import Link from "next/link";
import { Card } from "@/components/ui";
import { PovTypeBadge } from "./scriptBadges";
import { similarHooks, type RecentHook } from "@/lib/content/scriptRules";

export function HookPanel({
  hooks,
  draft = "",
}: {
  hooks: RecentHook[];
  /** The hook being written, for the repetition flag. */
  draft?: string;
}) {
  const similar = similarHooks(draft, hooks);
  const similarIds = new Set(similar.map((h) => h.id));

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight">Hooks already used</div>
        <div className="font-mono text-[11px] text-ink-muted">last {hooks.length} POV scripts</div>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-muted">
        First two seconds decide everything — and a hook only works once. Don&apos;t repeat these
        or anything structurally similar.
      </p>

      {hooks.length === 0 ? (
        <p className="text-xs text-ink-muted">No hooks on record yet.</p>
      ) : (
        <ul className="space-y-2">
          {hooks.map((h) => {
            const flagged = similarIds.has(h.id);
            return (
              <li
                key={h.id}
                className={`rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed ${
                  flagged
                    ? "border-status-warning/50 bg-status-warning/10 text-ink-primary"
                    : "border-hairline/60 bg-surface-2/40 text-ink-secondary"
                }`}
              >
                <div className="flex items-center gap-2">
                  <PovTypeBadge type={h.povType} />
                  <Link
                    href={`/content/scripts/${h.id}`}
                    className="truncate text-[11px] text-ink-muted transition hover:text-ink-primary"
                  >
                    {h.title || h.id}
                  </Link>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-muted">
                    {h.createdDate}
                  </span>
                </div>
                <div className="mt-1">&ldquo;{h.hook}&rdquo;</div>
                {flagged && (
                  <div className="mt-1 text-[11px] font-medium text-status-warning">
                    ⚠ Your draft hook shares most of its words with this one.
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
