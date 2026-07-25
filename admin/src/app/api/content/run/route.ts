import { NextResponse } from "next/server";
import { readAllPosts, writePost } from "@/lib/content/store";
import { enrichPost, isSettled } from "@/lib/content/enrich";
import { regenerateWhatWorks } from "@/lib/content/learn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/content/run  — the full scheduled pipeline (idempotent):
//   1. Enrich every settled post (classify if unset, generate Takeaway if missing)
//   2. Regenerate the AUTO-fenced section of what-works.md
// The "Next 2 Weeks" strategy card is computed on read (Insights tab), so it
// needs nothing persisted here.
//
// This is the entrypoint a Claude Code Routine / cron should hit. See
// content/README.md for the auth + scheduling recipe.
export async function POST() {
  try {
    const posts = await readAllPosts();
    const enriched: { slug: string; actions: string[] }[] = [];

    for (const post of posts) {
      // Only spend model calls where there's something to do.
      const needsClassify = post.frontmatter.pillar == null || !post.frontmatter.format;
      const needsTakeaway = !post.body.takeaway && isSettled(post);
      if (!needsClassify && !needsTakeaway) continue;

      const result = await enrichPost(post, posts);
      if (result.changed) {
        await writePost(result.post);
        // Reflect the change for later posts' baselines in this same run.
        const idx = posts.findIndex((p) => p.slug === post.slug);
        if (idx !== -1) posts[idx] = result.post;
      }
      if (result.actions.length) enriched.push({ slug: post.slug, actions: result.actions });
    }

    const auto = await regenerateWhatWorks(posts);

    return NextResponse.json({
      ok: true,
      postsScanned: posts.length,
      enriched,
      whatWorksBytes: auto.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
