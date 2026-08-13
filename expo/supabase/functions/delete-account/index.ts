// POST /delete-account — permanent, self-service account deletion.
//
// Apple App Store Guideline 5.1.1(v): an app that supports account creation
// must also let a driver delete their account from inside the app, without
// requiring a support email/call. This is that endpoint; the confirmation
// step lives client-side (components/DeleteAccountModal.tsx) — by the time
// this runs, the driver has already confirmed.
//
// WHY THIS HAS TO BE AN EDGE FUNCTION
//   Actually removing a driver's row from `auth.users` requires
//   `auth.admin.deleteUser()`, which only works with the SERVICE ROLE key —
//   a key that can never ship inside the app. This function is the one place
//   that key is used, and it only ever acts on the caller's own uid (read
//   from their verified JWT, never a client-supplied id).
//
// WHY DELETING auth.users IS ENOUGH FOR THE APP'S OWN TABLES
//   Every table this app's features actually write to — profiles, cars,
//   trips, XP, quests, badges, saved places/routes, friends, convoys,
//   direct messages, group chat, events, main-quest progress — has a
//   foreign key to `auth.users(id)` with `ON DELETE CASCADE` (audited
//   directly against every database_migration_*.sql file before writing
//   this). Deleting the auth user cascades through all of it in one
//   transaction. See MAIN_QUEST_REFERENCE.md-adjacent audit notes in the PR
//   description for the full table list.
//
// WHAT STILL NEEDS MANUAL CLEANUP, AND WHY
//   Two things cascade does not reach:
//     1. Supabase Storage objects (avatars/car-photos/place-photos). Postgres
//        foreign keys have no idea storage objects exist, so they are listed
//        and removed by the `${userId}/` prefix before the auth user goes.
//     2. A handful of tables from the app's original "towing" template
//        (`database_setup_complete.sql` / `chat_system_tables.sql`, outside
//        the database_migration_* pattern this app's real features use) —
//        `tow_requests`, `chat_messages`, `company_registrations.reviewed_by`.
//        Those files disagree with each other on whether the relevant
//        columns cascade, and which of the two ever actually ran against
//        this project's database cannot be determined from the repo alone.
//        Cleaned defensively here so a leftover, undocumented NO ACTION
//        constraint can never turn into a failed deletion — every statement
//        tolerates the referenced table simply not existing (undefined_table,
//        42P01) rather than aborting the whole request over legacy schema
//        that may or may not be there.
//
//   Both are best-effort and logged, not fatal: a driver who asked to delete
//   their account should not be told it failed because an old photo bucket
//   listing timed out. The one step that IS fatal is the final
//   `auth.admin.deleteUser()` call itself — if that fails, the response says
//   so rather than claiming success over data that is still there.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Every bucket a driver's own uploads can land in, keyed `${userId}/...`. */
const USER_STORAGE_BUCKETS = ["avatars", "car-photos", "place-photos"];

/** Postgres: relation does not exist — the legacy table this project never ran. */
const UNDEFINED_TABLE = "42P01";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function cleanupStorage(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  for (const bucket of USER_STORAGE_BUCKETS) {
    try {
      const { data: files, error: listError } = await adminClient.storage
        .from(bucket)
        .list(userId);
      if (listError) {
        console.error(`[delete-account] listing ${bucket}/${userId} failed:`, listError.message);
        continue;
      }
      if (!files || files.length === 0) continue;
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeError } = await adminClient.storage.from(bucket).remove(paths);
      if (removeError) {
        console.error(`[delete-account] removing from ${bucket} failed:`, removeError.message);
      }
    } catch (err) {
      console.error(`[delete-account] storage cleanup for ${bucket} threw:`, err);
    }
  }
}

/**
 * Best-effort cleanup for the legacy "towing" schema — see the file header.
 * `action` is the actual delete/update; failures other than "table doesn't
 * exist" are logged (not swallowed silently) but never block the deletion.
 */
async function tolerantCleanup(label: string, action: () => Promise<{ error: { code?: string; message: string } | null }>): Promise<void> {
  try {
    const { error } = await action();
    if (error && error.code !== UNDEFINED_TABLE) {
      console.error(`[delete-account] ${label} failed:`, error.message);
    }
  } catch (err) {
    console.error(`[delete-account] ${label} threw:`, err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Authentication required" }, 401);

  // Bound to the caller's own JWT — this is what makes "delete my account"
  // safe to expose with no other input: there is no id to tamper with.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Authentication required" }, 401);
  const userId = userData.user.id;

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  await cleanupStorage(adminClient, userId);

  await tolerantCleanup("tow_requests (as customer)", () =>
    adminClient.from("tow_requests").delete().eq("customer_id", userId)
  );
  await tolerantCleanup("tow_requests (as driver)", () =>
    adminClient.from("tow_requests").update({ driver_id: null }).eq("driver_id", userId)
  );
  await tolerantCleanup("chat_messages (sent or received)", () =>
    adminClient.from("chat_messages").delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
  );
  await tolerantCleanup("company_registrations.reviewed_by", () =>
    adminClient.from("company_registrations").update({ reviewed_by: null }).eq("reviewed_by", userId)
  );

  // The fatal step. Every current feature table cascades from this; a
  // failure here means something outside that cascade still references the
  // driver, and the response has to say the deletion did not complete.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[delete-account] auth.admin.deleteUser failed:", deleteError.message);
    return jsonResponse(
      { error: "Couldn't complete account deletion. Please try again." },
      500
    );
  }

  return jsonResponse({ success: true });
});
