import { NextRequest, NextResponse } from "next/server";
import { parsePostFormInput } from "@/lib/content/parsePostForm";
import { buildPostFromForm, listPostSlugs, uniqueSlug, writePost } from "@/lib/content/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/content/posts — create a new post (Scheduled or Published).
export async function POST(req: NextRequest) {
  try {
    const input = parsePostFormInput(await req.json());
    const taken = new Set(await listPostSlugs());
    const slug = uniqueSlug(input, taken);
    const post = buildPostFromForm(input, null, slug);
    await writePost(post);
    return NextResponse.json({ ok: true, slug: post.slug });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
