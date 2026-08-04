// POST /generate-car-image — authenticated AI car render generation.
//
// Takes a driver's own car photo and restyles it into the dark studio-lit
// showcase look (matte finish, dramatic rim light, gradient backdrop) using
// Gemini 3.1 Flash Lite Image ("Nano Banana 2 Lite") through the shared
// renderer. The
// result is stored in the `car-photos` bucket and written to
// `car_collections.photo_url`, the same column the manual-upload flow used
// before this replaced it — so every other place that reads photo_url
// (garage cards, public profile, FeaturedCar) needs no changes.
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

const CAR_PHOTOS_BUCKET = "car-photos";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // Provider-side guard; the app compresses to 3MB before upload.


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
  if (!carId || !imageBase64) {
    return jsonResponse({ error: "carId and imageBase64 are required" }, 400);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return jsonResponse({ error: "Unsupported image type" }, 400);
  }
  if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
    // base64 inflates size ~4/3x; reject clearly oversized payloads up front.
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
  // rights over it beyond their own row) and owns the storage write below.
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Gate: entitlement ──────────────────────────────────────
  // AI car generation is a Platinum benefit; the client checks this too, but
  // the function is what actually bounds the image-provider bill.
  const { data: isPlatinum, error: entitlementError } = await adminClient.rpc(
    "is_platinum",
    { uid: userId }
  );
  if (entitlementError) {
    console.error(`[generate-car-image] entitlement check failed: ${entitlementError.message}`);
    return jsonResponse({ error: "Couldn't verify your subscription." }, 500);
  }
  if (!isPlatinum) {
    return jsonResponse(
      { error: "AI car generation is a Platinum feature.", code: "not_platinum" },
      403
    );
  }

  let generatedDataUrl: string;
  try {
    generatedDataUrl = await generateCarRender({ imageBase64, mimeType });
  } catch (err) {
    if (err instanceof CarRenderError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    console.error(
      `[generate-car-image] render failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
    return jsonResponse({ error: "Couldn't generate your car render, try again." }, 502);
  }

  const [, outMime, outBase64] = generatedDataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];
  if (!outBase64) {
    return jsonResponse({ error: "Couldn't generate your car render, try again." }, 502);
  }
  const outBytes = Uint8Array.from(atob(outBase64), (c) => c.charCodeAt(0));
  const outExt = outMime === "image/png" ? "png" : outMime === "image/webp" ? "webp" : "jpg";

  const path = `${userId}/${carId}.${outExt}`;
  const { error: uploadError } = await adminClient.storage
    .from(CAR_PHOTOS_BUCKET)
    .upload(path, outBytes, { contentType: outMime, upsert: true });
  if (uploadError) {
    console.error(`[generate-car-image] storage upload failed: ${uploadError.message}`);
    return jsonResponse({ error: "Couldn't save your generated car." }, 500);
  }

  const { data: publicUrlData } = adminClient.storage.from(CAR_PHOTOS_BUCKET).getPublicUrl(path);
  const photoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await adminClient
    .from("car_collections")
    .update({ photo_url: photoUrl })
    .eq("id", carId);
  if (updateError) {
    console.error(`[generate-car-image] car_collections update failed: ${updateError.message}`);
    return jsonResponse({ error: "Couldn't save your generated car." }, 500);
  }

  return jsonResponse({ photoUrl });
});
