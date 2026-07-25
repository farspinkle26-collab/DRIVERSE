import { NextRequest, NextResponse } from "next/server";
import { readAllPosts, readPost, writePost } from "@/lib/content/store";
import { enrichPost, readOnScreenText, readRetention } from "@/lib/content/enrich";
import type { LlmImage } from "@/lib/content/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/content/enrich
//   { slug, forceTakeaway?, onScreenTextImages?: LlmImage[], retentionImages?: LlmImage[] }
// Idempotent enrichment for a single post: classify (if unset), generate the
// Takeaway (only once settled), and optionally run vision reads over uploaded
// frames / a retention screenshot.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slug: string = body?.slug;
    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
    }
    const post = await readPost(slug);
    if (!post) {
      return NextResponse.json({ ok: false, error: `Post not found: ${slug}` }, { status: 404 });
    }
    const all = await readAllPosts();

    const actions: string[] = [];

    // Optional vision reads first, so the Takeaway sees the fresh body.
    const osImages = body?.onScreenTextImages as LlmImage[] | undefined;
    if (osImages?.length) {
      post.body.onScreenText = await readOnScreenText(osImages);
      actions.push("read on-screen text (vision)");
    }
    const retImages = body?.retentionImages as LlmImage[] | undefined;
    if (retImages?.length) {
      post.body.retention = await readRetention(retImages);
      actions.push("read retention graph (vision)");
    }

    const result = await enrichPost(post, all, { forceTakeaway: !!body?.forceTakeaway });
    actions.push(...result.actions);

    if (result.changed || osImages?.length || retImages?.length) {
      await writePost(result.post);
    }
    return NextResponse.json({ ok: true, slug, changed: result.changed || !!(osImages?.length || retImages?.length), actions });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
