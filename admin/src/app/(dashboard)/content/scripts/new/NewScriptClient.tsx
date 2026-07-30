"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionHeader, Card, Banner } from "@/components/ui";
import { RotationPanel } from "@/components/scripts/RotationPanel";
import { HookPanel } from "@/components/scripts/HookPanel";
import {
  PLATFORM_TARGETS,
  PLATFORM_TARGET_LABELS,
  POV_TYPES,
  POV_TYPE_LABELS,
  SCRIPT_STATUSES,
  SCRIPT_STATUS_LABELS,
  type PlatformTarget,
  type PovType,
  type ScriptFeature,
  type ScriptStatus,
} from "@/lib/content/scriptTypes";
import {
  densityGate,
  type DensitySnapshot,
  type FeatureRotation,
  type RecentHook,
} from "@/lib/content/scriptRules";

const inputClass =
  "w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1";

export function NewScriptClient({
  rotation,
  recentHooks,
  density,
}: {
  rotation: FeatureRotation;
  recentHooks: RecentHook[];
  density: DensitySnapshot;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [povType, setPovType] = useState<PovType>("solo");
  // Pre-filled with the rotation recommendation — the one computed nudge that
  // keeps the app screen from repeating two scripts running.
  const [feature, setFeature] = useState<ScriptFeature>(rotation.recommended ?? "live_map");
  const [hook, setHook] = useState("");
  const [platform, setPlatform] = useState<PlatformTarget>("both");
  const [status, setStatus] = useState<ScriptStatus>("idea");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gate = densityGate(povType, density);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/content/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          pov_type: povType,
          feature_shown: feature,
          hook,
          platform_target: platform,
          status,
          notes,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Create failed.");
      router.push(`/content/scripts/${json.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="New POV script"
        description="Pick the screen this one shows and the hook it opens on — both against what the last five scripts already used."
        right={
          <Link
            href="/content/scripts"
            className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
          >
            ← Board
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RotationPanel rotation={rotation} selected={feature} onSelect={setFeature} />
        <HookPanel hooks={recentHooks} draft={hook} />
      </div>

      {gate && <Banner tone={gate.tone}>{gate.message}</Banner>}

      <Card className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Working title (not the on-screen text)
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Trip card at the end of an ordinary commute"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Hook (optional now — the generator will offer variants)
          </label>
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="The line the first two seconds live on"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">POV type</label>
            <select
              value={povType}
              onChange={(e) => setPovType(e.target.value as PovType)}
              className={`${inputClass} cursor-pointer`}
            >
              {POV_TYPES.map((t) => (
                <option key={t} value={t}>
                  {POV_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Platform target</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformTarget)}
              className={`${inputClass} cursor-pointer`}
            >
              {PLATFORM_TARGETS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_TARGET_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Start at</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ScriptStatus)}
              className={`${inputClass} cursor-pointer`}
            >
              {SCRIPT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SCRIPT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="scenario, where you'll film it, anything the script should honour"
            className={`${inputClass} resize-y`}
          />
        </div>

        {error && <Banner tone="gap">{error}</Banner>}

        <div className="flex items-center gap-3">
          <button
            onClick={create}
            disabled={busy || !title.trim()}
            className="rounded-lg bg-series-1 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create script"}
          </button>
          <span className="text-xs text-ink-muted">
            Writes <span className="font-mono">content/scripts/&lt;date&gt;-{povType}-&lt;title&gt;.md</span>{" "}
            with a filming checklist already generated for this POV type + feature.
          </span>
        </div>
      </Card>
    </div>
  );
}
