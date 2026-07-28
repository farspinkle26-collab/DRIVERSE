// POST /places-submit — authenticated community place submission.
// Auto-approves (status='approved') so submissions show up immediately;
// there's no moderation queue/UI in the app today. Revisit if abuse shows up.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isPlaceCategory } from "../_shared/placesSource.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  // Client bound to the caller's JWT so RLS enforces "insert as yourself".
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return jsonResponse({ error: "name is required" }, 400);
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonResponse({ error: "lat and lng are required numeric fields" }, 400);
  }
  if (!isPlaceCategory(body.category)) {
    return jsonResponse({ error: "category must be one of cafe, gas_station, workshop, hangout" }, 400);
  }

  const { data, error } = await supabase
    .from("places")
    .insert({
      name: body.name.trim(),
      lat,
      lng,
      category: body.category,
      notes: typeof body.notes === "string" ? body.notes.trim() : null,
      photo_url: typeof body.photoUrl === "string" ? body.photoUrl : null,
      submitted_by_user_id: userData.user.id,
      status: "approved",
    })
    .select()
    .single();

  if (error) {
    console.error(`[places-submit] insert failed: ${error.message}`);
    return jsonResponse({ error: "Couldn't submit place, try again." }, 500);
  }

  return jsonResponse({
    place: {
      id: data.id,
      name: data.name,
      lat: data.lat,
      lng: data.lng,
      category: data.category,
      tags: {
        ...(data.notes ? { notes: data.notes } : {}),
        ...(data.photo_url ? { photo_url: data.photo_url } : {}),
        submitted_by_user_id: data.submitted_by_user_id,
        created_at: data.created_at,
      },
      source: "user",
    },
  });
});
