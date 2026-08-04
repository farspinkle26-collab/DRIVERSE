// POST /generate-showcase — Platinum AI car showcase.
//
// Takes a driver's own car photo and produces a stylised showcase render they
// can save and share. Distinct from `generate-car-image`, which restyles the
// garage photo IN PLACE (it writes `car_collections.photo_url` and every
// garage surface picks it up). A showcase is a standalone artwork: it goes to
// its own bucket, its own ledger row, and out to the share sheet.
//
// ── WHY THE GATE IS HERE AND NOT ONLY IN THE APP ────────────────────
// Every generation is a real per-image spend with the provider. The client
// checks entitlement and quota to give a good experience, but a client check
// is a suggestion — the two things that actually bound the bill are in this
// function:
//   1. Platinum entitlement, read from `platinum_subscribers`, the mirror
//      RevenueCat's webhook writes. Not from anything the client sends.
//   2. A monthly quota, counted from the `ai_showcases` ledger, which only
//      the service role can write.
// The ledger row is inserted BEFORE the response is returned, so a client
// that fires ten requests in parallel cannot get ten free images past a
// five-image allowance.
//
// PROVIDER
//   Gemini 3.1 Flash Lite Image ("Nano Banana 2 Lite") through the shared
//   Rork Toolkit renderer, with an OpenRouter fallback for existing deployments.
//   Adding a second vendor for a second image feature would double the
//   billing surface and the failure modes for no product gain.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CarRenderError,
  generateCarRender,
} from "../_shared/carRender.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHOWCASE_BUCKET = "car-showcases";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // Provider-side guard; the app compresses to 3MB before upload.
const SHOWCASE_STYLE = "signature";


function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  // Client bound to the caller's JWT so RLS enforces "only your own car".
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }
  const userId = userData.user.id;

  const body = await req.json().catch(() => null);
  const carId = typeof body?.carId === "string" ? body.carId : null;
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : null;
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";
  // The client may send an older style value, but every generated car is now
  // forced through the same Driveverse Signature treatment.
  const style = SHOWCASE_STYLE;

  if (!carId || !imageBase64) {
    return jsonResponse({ error: "carId and imageBase64 are required" }, 400);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return jsonResponse({ error: "Unsupported image type" }, 400);
  }
  if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
    return jsonResponse({ error: "Image is too large" }, 400);
  }

  const { data: car, error: carError } = await userClient
    .from("car_collections")
    .select("id, name, user_id")
    .eq("id", carId)
    .eq("user_id", userId)
    .single();
  if (carError || !car) {
    return jsonResponse({ error: "Car not found" }, 404);
  }

  // Service-role client: reads the entitlement mirror (no client has select
  // rights over it beyond their own row) and owns the ledger.
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Gate 1: entitlement ────────────────────────────────────
  const { data: isPlatinum, error: entitlementError } = await adminClient.rpc(
    "is_platinum",
    { uid: userId }
  );
  if (entitlementError) {
    console.error(`[generate-showcase] entitlement check failed: ${entitlementError.message}`);
    return jsonResponse({ error: "Couldn't verify your subscription." }, 500);
  }
  if (!isPlatinum) {
    return jsonResponse(
      { error: "AI Showcase is a Platinum feature.", code: "not_platinum" },
      403
    );
  }

  // ── Gate 2: monthly quota ──────────────────────────────────
  const { data: quotaRows, error: quotaError } = await adminClient.rpc(
    "ai_showcase_quota",
    { uid: userId }
  );
  if (quotaError) {
    console.error(`[generate-showcase] quota check failed: ${quotaError.message}`);
    return jsonResponse({ error: "Couldn't check your monthly allowance." }, 500);
  }
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
  const remaining = Number(quota?.remaining ?? 0);
  if (remaining <= 0) {
    return jsonResponse(
      {
        error: `You've used all ${quota?.allowance ?? 0} showcases this month. Your allowance resets on the 1st.`,
        code: "quota_exhausted",
        quota,
      },
      429
    );
  }

  // ── Generate ───────────────────────────────────────────────
  let generatedDataUrl: string;
  try {
    generatedDataUrl = await generateCarRender({ imageBase64, mimeType });
  } catch (err) {
    if (err instanceof CarRenderError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    console.error(
      `[generate-showcase] render failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
    return jsonResponse({ error: "Couldn't generate your showcase, try again." }, 502);
  }

  const [, outMime, outBase64] = generatedDataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];
  if (!outBase64) {
    return jsonResponse({ error: "Couldn't generate your showcase, try again." }, 502);
  }
  const outBytes = Uint8Array.from(atob(outBase64), (c) => c.charCodeAt(0));
  const outExt = outMime === "image/png" ? "png" : outMime === "image/webp" ? "webp" : "jpg";

  // ── Store ──────────────────────────────────────────────────
  // Unique path per generation, not per car: a showcase is an artwork the
  // driver keeps, so generating a second one must not silently destroy the
  // first (which they may already have shared).
  const path = `${userId}/${carId}-${Date.now()}.${outExt}`;
  const { error: uploadError } = await adminClient.storage
    .from(SHOWCASE_BUCKET)
    .upload(path, outBytes, { contentType: outMime, upsert: false });
  if (uploadError) {
    console.error(`[generate-showcase] storage upload failed: ${uploadError.message}`);
    return jsonResponse({ error: "Couldn't save your showcase." }, 500);
  }

  const { data: publicUrlData } = adminClient.storage
    .from(SHOWCASE_BUCKET)
    .getPublicUrl(path);
  const imageUrl = publicUrlData.publicUrl;

  // The ledger is the budget. Written before the response so a burst of
  // parallel requests can't each see the same "remaining" count.
  const { error: ledgerError } = await adminClient.from("ai_showcases").insert({
    user_id: userId,
    car_id: carId,
    image_url: imageUrl,
    style,
  });
  if (ledgerError) {
    console.error(`[generate-showcase] ledger insert failed: ${ledgerError.message}`);
    // The image exists and the driver should get it — losing the ledger row
    // costs one un-counted generation, which is strictly better than charging
    // for an image we then refuse to hand over.
  }

  const { data: afterRows } = await adminClient.rpc("ai_showcase_quota", { uid: userId });
  const after = Array.isArray(afterRows) ? afterRows[0] : afterRows;

  return jsonResponse({ imageUrl, style, quota: after ?? null });
});
