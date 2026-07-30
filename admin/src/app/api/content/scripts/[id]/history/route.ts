import { NextRequest, NextResponse } from "next/server";
import { readScriptVersions, restoreScriptVersion } from "@/lib/content/scriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/content/scripts/[id]/history — every previous version of this
// script's body, newest first. Fetched on demand (the editor opens the panel
// closed) so a script with a long history doesn't slow the page down.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const versions = await readScriptVersions(params.id);
    return NextResponse.json({
      ok: true,
      versions: versions.map((v) => ({
        version: v.version,
        savedAt: v.savedAt,
        hook: v.script.frontmatter.hook,
        body: v.script.body,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

// POST /api/content/scripts/[id]/history { version } — restore that version's
// body over the current file. The current body is snapshotted first, so a revert
// of a bad refine is itself revertible.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const version = String(body?.version ?? "");
    if (!version) throw new Error("version is required.");
    const script = await restoreScriptVersion(params.id, version);
    return NextResponse.json({ ok: true, id: script.id, restored: version });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
