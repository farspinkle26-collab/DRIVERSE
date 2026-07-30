import { NextRequest, NextResponse } from "next/server";
import {
  PLATFORM_TARGETS,
  POV_TYPES,
  SCRIPT_FEATURES,
  SCRIPT_STATUSES,
  type PlatformTarget,
  type PovType,
  type ScriptFeature,
  type ScriptFormInput,
  type ScriptStatus,
} from "@/lib/content/scriptTypes";
import { createScript, readAllScripts } from "@/lib/content/scriptStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseCreateInput(raw: unknown): ScriptFormInput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Body must be a JSON object.");
  }
  const b = raw as Record<string, unknown>;
  const title = String(b.title ?? "").trim();
  if (!title) throw new Error("title is required.");
  const pov_type = String(b.pov_type ?? "");
  if (!POV_TYPES.includes(pov_type as PovType)) {
    throw new Error(`pov_type must be one of: ${POV_TYPES.join(", ")}.`);
  }
  const feature_shown = String(b.feature_shown ?? "none");
  if (!SCRIPT_FEATURES.includes(feature_shown as ScriptFeature)) {
    throw new Error(`feature_shown must be one of: ${SCRIPT_FEATURES.join(", ")}.`);
  }
  const platform_target = String(b.platform_target ?? "both");
  if (!PLATFORM_TARGETS.includes(platform_target as PlatformTarget)) {
    throw new Error(`platform_target must be one of: ${PLATFORM_TARGETS.join(", ")}.`);
  }
  const status = String(b.status ?? "idea");
  if (!SCRIPT_STATUSES.includes(status as ScriptStatus)) {
    throw new Error(`status must be one of: ${SCRIPT_STATUSES.join(", ")}.`);
  }
  const variants = Number(b.hook_variants_considered ?? 0);
  return {
    title,
    pov_type: pov_type as PovType,
    feature_shown: feature_shown as ScriptFeature,
    platform_target: platform_target as PlatformTarget,
    status: status as ScriptStatus,
    hook: b.hook == null ? "" : String(b.hook),
    hook_variants_considered: Number.isFinite(variants) ? Math.max(0, variants) : 0,
    notes: b.notes == null ? "" : String(b.notes),
  };
}

// GET /api/content/scripts — every POV script, for anything that needs the set
// without a page render (the rotation/hook checks come from here too).
export async function GET() {
  try {
    const scripts = await readAllScripts();
    return NextResponse.json({ ok: true, scripts });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/content/scripts — create a script. Starts at Idea unless told
// otherwise, and comes with a filming checklist already derived from its POV
// type + feature.
export async function POST(req: NextRequest) {
  try {
    const input = parseCreateInput(await req.json());
    const script = await createScript(input, today());
    return NextResponse.json({ ok: true, id: script.id, script });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
