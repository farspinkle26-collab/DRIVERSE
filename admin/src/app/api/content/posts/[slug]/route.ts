import { NextRequest, NextResponse } from "next/server";
import { parsePostFormInput } from "@/lib/content/parsePostForm";
import { applyPostPatch } from "@/lib/content/patchPost";
import { buildPostFromForm, readPost, writePost } from "@/lib/content/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/content/posts/[slug] — edit an existing post (e.g. flip a
// Scheduled post to Published and fill in real metrics).
export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const existing = await readPost(params.slug);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    }
    const input = parsePostFormInput(await req.json());
    const post = buildPostFromForm(input, existing, existing.slug);
    await writePost(post, `content: edit ${post.slug}`);
    return NextResponse.json({ ok: true, slug: post.slug });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

// PATCH /api/content/posts/[slug] — update just the fields in the body, used by
// the planning table's inline cell editors (and the "Done" checkbox). Unlike PUT
// this never rebuilds the post from a full form payload, so a cell edit can't
// clobber a field the editor didn't know about.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const existing = await readPost(params.slug);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    }
    const { post, changed } = applyPostPatch(existing, await req.json());
    await writePost(post, `content: set ${changed.join(", ")} on ${post.slug}`);
    return NextResponse.json({ ok: true, slug: post.slug, changed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
