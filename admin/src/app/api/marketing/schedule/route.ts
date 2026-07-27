import { NextRequest, NextResponse } from "next/server";
import { readSchedule, updateItem, addItem, deleteItem } from "@/lib/marketing/store";
import { MARKETING_SECTIONS, type MarketingSection } from "@/lib/marketing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSection(v: unknown): v is MarketingSection {
  return typeof v === "string" && (MARKETING_SECTIONS as readonly string[]).includes(v);
}

// GET /api/marketing/schedule — the full product/content/rollout plan + results log.
export async function GET() {
  const data = await readSchedule();
  return NextResponse.json({ ok: true, data });
}

// PATCH /api/marketing/schedule — edit any field (including `done`) on one
// row of any section. Body: { section, id, patch }.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isSection(body.section) || typeof body.id !== "string" || typeof body.patch !== "object" || body.patch === null) {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }
    const item = await updateItem(body.section, body.id, body.patch);
    if (!item) return NextResponse.json({ ok: false, error: "Item not found." }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

// POST /api/marketing/schedule — log a new results-log entry (the only
// section rows can be added to). Body: { section: "resultsLog", item }.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.section !== "resultsLog" || typeof body.item !== "object" || body.item === null) {
      return NextResponse.json({ ok: false, error: "Only resultsLog rows can be added." }, { status: 400 });
    }
    const item = await addItem(body.section, body.item);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

// DELETE /api/marketing/schedule — remove a results-log entry. Body: { section, id }.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.section !== "resultsLog" || typeof body.id !== "string") {
      return NextResponse.json({ ok: false, error: "Only resultsLog rows can be removed." }, { status: 400 });
    }
    await deleteItem(body.section, body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
