"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shared save plumbing for one script: every control PATCHes just the field it
 * owns (`PATCH /api/content/scripts/[id]`), the same way the posts table's cells
 * do, so a status drag can't clobber a section someone is typing into.
 *
 * `saved` flashes briefly after a successful write — the editor has no Save
 * button, so it needs to say something.
 */
export function useScriptPatch(id: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const patch = useCallback(
    async (fields: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/content/scripts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
        if (!json.ok) throw new Error(json.error || "Save failed.");
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        // Re-read the store: a saved field changes the rotation/hook checks and
        // the board, not just this control.
        router.refresh();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [id, router],
  );

  return { patch, busy, error, saved };
}
