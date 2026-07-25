"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Manual per-section refresh: re-runs the server component's data fetch. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
      // router.refresh resolves via the transition; clear the spinner shortly after.
      setTimeout(() => setSpinning(false), 600);
    });
  }

  return (
    <button
      onClick={refresh}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:border-baseline hover:text-ink-primary disabled:opacity-60"
      title="Re-fetch this section from Supabase"
    >
      <span className={spinning ? "inline-block animate-spin" : "inline-block"}>↻</span>
      Refresh
    </button>
  );
}
