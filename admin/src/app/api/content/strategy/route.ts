import { NextResponse } from "next/server";
import { readAllPosts } from "@/lib/content/store";
import { generateStrategy } from "@/lib/content/strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/content/strategy — the "Next 2 Weeks" card with the model-written
// narrative (deterministic fallback when no API key). The page renders a
// deterministic card on load; this endpoint powers the "Regenerate (AI)" button.
export async function POST() {
  try {
    const posts = await readAllPosts();
    const card = await generateStrategy(posts);
    return NextResponse.json({ ok: true, card });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
