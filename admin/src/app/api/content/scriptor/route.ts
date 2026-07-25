import { NextRequest, NextResponse } from "next/server";
import { PILLARS, type Pillar } from "@/lib/content/types";
import { readAllPosts } from "@/lib/content/store";
import { generateScript } from "@/lib/content/scriptor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/content/scriptor  { topic, notes?, pillar? } -> generated script.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = String(body?.topic ?? "").trim();
    if (!topic) {
      return NextResponse.json({ ok: false, error: "topic is required" }, { status: 400 });
    }
    const pillar = PILLARS.includes(body?.pillar) ? (body.pillar as Pillar) : undefined;
    const posts = await readAllPosts();
    const result = await generateScript(
      { topic, notes: body?.notes ? String(body.notes) : undefined, pillar },
      posts,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
