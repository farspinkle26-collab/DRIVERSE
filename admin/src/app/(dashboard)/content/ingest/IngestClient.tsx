"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SectionHeader, Card, Banner } from "@/components/ui";

const JSON_EXAMPLE = `{
  "platform": "instagram",
  "post_id": "ig_ae86_0801",
  "permalink": "https://www.instagram.com/reel/xxxx/",
  "date": "2026-08-01",
  "time": "18:30",
  "pillar": "garagey",
  "format": "car showcase",
  "feature_shown": "garage card",
  "duration_seconds": 12,
  "views": 40000,
  "reach": 37000,
  "likes": 2900,
  "comments_total": 180,
  "comments_seeded": 4,
  "comments_organic_pickup": 17,
  "saves": 1600,
  "shares": 520,
  "avg_watch_time": 8.2,
  "new_follows": 180
}`;

const TEXT_EXAMPLE = `platform: instagram
post_id: ig_ae86_0801
date: 2026-08-01
time: 18:30
pillar: garagey
Views: 40.2k
Reach: 37,000
Likes: 2,900
Comments: 180
Seeded: 4
Organic: 17
Saves: 1.6k
Shares: 520
Follows: 180
Duration: 12
Avg watch time: 8.2`;

export function IngestClient() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!input.trim()) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/content/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "failed");
      setMsg(`${json.created ? "Created" : "Updated"} post ${json.slug} (source: ${json.source}). Rates recomputed. Run enrichment to generate the Takeaway.`);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Ingest metrics"
        description="Manual entry. No native Instagram/TikTok or Supermetrics connector is available in this environment, so paste numbers in here. Structured as a swappable source — a real API drops in without touching the rest of the pipeline."
        right={
          <Link href="/content" className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary">
            ← Back
          </Link>
        }
      />

      <Banner tone="info">
        <strong>Ingestion source: manual.</strong> Paste a JSON object <em>or</em> the raw text
        copied from an Insights screen (one <code>label: value</code> per line). A screenshot can be
        read with the vision model — paste the numbers it returns here. Matching is by{" "}
        <code>post_id</code>: an existing post is updated in place, a new one is created.
      </Banner>

      <Card className="space-y-3 p-4">
        <label className="block text-xs font-medium text-ink-muted">Pasted metrics (JSON or Insights text)</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={14}
          placeholder="Paste JSON or Insights text here…"
          className="w-full rounded-lg border border-hairline bg-surface-2 px-3 py-2 font-mono text-xs text-ink-primary outline-none focus:border-series-1"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="rounded-lg bg-series-1 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Ingest"}
          </button>
          <button
            onClick={() => setInput(JSON_EXAMPLE)}
            className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
          >
            Fill JSON example
          </button>
          <button
            onClick={() => setInput(TEXT_EXAMPLE)}
            className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
          >
            Fill text example
          </button>
        </div>
      </Card>

      {msg && <Banner tone="info">{msg}</Banner>}
      {err && <Banner tone="gap">Ingest failed: {err}</Banner>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-sm font-semibold">JSON shape</div>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs text-ink-secondary">{JSON_EXAMPLE}</pre>
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-sm font-semibold">Insights-text shape</div>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs text-ink-secondary">{TEXT_EXAMPLE}</pre>
        </Card>
      </div>
    </div>
  );
}
