"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionHeader, Card, Banner } from "@/components/ui";
import { PILLARS, PILLAR_LABELS } from "@/lib/content/types";
import { renderMarkdown } from "@/lib/content/markdown";

export function ScriptorClient() {
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [pillar, setPillar] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ markdown: string; usedModel: boolean; recentHooks: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    if (!topic.trim()) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/content/scriptor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, notes: notes || undefined, pillar: pillar || undefined }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "failed");
      setResult({ markdown: json.markdown, usedModel: json.usedModel, recentHooks: json.recentHooks });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Scriptor"
        description="Topic + notes → a structured script grounded in our own data (what-works.md, top posts by save rate, last hooks used). It never fabricates numbers — real data is injected, gaps become [FILL: …] placeholders."
        right={
          <Link href="/content" className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary">
            ← Back
          </Link>
        }
      />

      <Card className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Garagey card for the Toyota AE86"
            className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-ink-muted">Pillar (optional)</label>
            <select
              value={pillar}
              onChange={(e) => setPillar(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-secondary"
            >
              <option value="">Auto / unspecified</option>
              {PILLARS.map((p) => (
                <option key={p} value={p}>
                  {PILLAR_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-ink-muted">Notes (optional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="angle, hook idea, feature to show…"
              className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink-primary outline-none focus:border-series-1"
            />
          </div>
        </div>
        <div>
          <button
            onClick={generate}
            disabled={busy || !topic.trim()}
            className="rounded-lg bg-series-1 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Writing…" : "Generate script"}
          </button>
        </div>
      </Card>

      {err && <Banner tone="gap">Generation failed: {err}</Banner>}

      {result && (
        <>
          {!result.usedModel && (
            <Banner tone="warning">
              No <code>ANTHROPIC_API_KEY</code> configured — returned a grounded scaffold with{" "}
              <code>[FILL: …]</code> placeholders instead of a model-written script.
            </Banner>
          )}
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Generated script</div>
              <CopyButton text={result.markdown} />
            </div>
            <div className="prose-content text-sm text-ink-secondary" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }} />
          </Card>
          {result.recentHooks.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold">Recent hooks (avoided)</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {result.recentHooks.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
    >
      {copied ? "Copied" : "Copy markdown"}
    </button>
  );
}
