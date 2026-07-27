import { NextRequest, NextResponse } from "next/server";
import { parsePostFormInput } from "@/lib/content/parsePostForm";
import { buildPostFromForm, readPost, setPostChecked, writePost } from "@/lib/content/store";

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

// PATCH /api/content/posts/[slug] — flip only the checklist "checked" tick,
// used by the posts table checkbox column.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const body = await req.json();
    if (typeof body.checked !== "boolean") {
      return NextResponse.json({ ok: false, error: "checked must be a boolean." }, { status: 400 });
    }
    const post = await setPostChecked(params.slug, body.checked);
    if (!post) {
      return NextResponse.json({ ok: false, error: "Post not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, slug: post.slug });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
