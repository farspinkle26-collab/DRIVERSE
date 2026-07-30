import { NextRequest, NextResponse } from "next/server";
import { applyScriptPatch } from "@/lib/content/scriptPatch";
import { readScript, saveScript } from "@/lib/content/scriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/content/scripts/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const script = await readScript(params.id);
    if (!script) {
      return NextResponse.json({ ok: false, error: "Script not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, script });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

// PATCH /api/content/scripts/[id] — update just the fields in the body. Used by
// every editor control, the checklist ticks and the Kanban drag, so a drag that
// knows only `status` can't overwrite the script someone else is typing into.
// A patch that moves a body section snapshots the previous file first
// (scripts/_history/{id}/) — that's the version history.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await readScript(params.id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Script not found." }, { status: 404 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const { script, changed, bodyChanged } = applyScriptPatch(existing, await req.json(), {
      today,
    });
    const { version } = await saveScript(script, {
      previous: existing,
      bodyChanged,
      message: `content: set ${changed.join(", ")} on script ${script.id}`,
    });
    return NextResponse.json({ ok: true, id: script.id, changed, snapshot: version });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
