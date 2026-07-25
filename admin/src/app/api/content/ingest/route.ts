import { NextRequest, NextResponse } from "next/server";
import { activeIngestSource, applyIngest } from "@/lib/content/ingest";
import { readAllPosts, writePost } from "@/lib/content/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/content/ingest
//   { input: <string (JSON or pasted Insights text) | object> }
// Parses via the active ingestion source (manual here — no connector), merges
// onto an existing post (matched by post_id) or creates a new one, and writes
// the Markdown file. Enrichment/dashboard/strategy never see the source.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = body?.input ?? body;
    const source = activeIngestSource();
    const metrics = source.parse(input);
    if (!metrics.post_id) {
      return NextResponse.json(
        { ok: false, error: "post_id is required (nothing to key the post on)." },
        { status: 400 },
      );
    }
    const all = await readAllPosts();
    const existing = all.find((p) => p.frontmatter.post_id === metrics.post_id) ?? null;
    const { post, created } = applyIngest(metrics, existing);
    await writePost(post);
    return NextResponse.json({
      ok: true,
      slug: post.slug,
      created,
      source: source.id,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
