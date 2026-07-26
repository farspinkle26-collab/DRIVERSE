// POST /revenuecat-webhook — keeps `platinum_subscribers` in step with
// RevenueCat.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────
// The app NEVER asks this table whether someone is Platinum; it asks the
// RevenueCat SDK. This mirror exists for the two jobs a client cannot do:
//
//   1. Enforce caps in the database. The tier triggers in
//      `database_migration_platinum.sql` call `is_platinum()`, which reads
//      this table — so a modified client cannot insert a third car.
//   2. Bound real spend. `generate-showcase` checks entitlement here before
//      calling a paid image API.
//
// It is also the table a future admin "Monetization" dashboard reads: active
// subscriber counts, churn, renewal dates. No extra pipeline needed for it.
//
// ── EVENTS ──────────────────────────────────────────────────────────
// RevenueCat sends one event per subscription lifecycle change. Rather than
// branching on all fourteen types, this handler derives activity from
// `expiration_at_ms` and the small set of types that mean "access ends now"
// — that way a type we haven't seen before (RevenueCat adds them) fails
// toward the expiry date rather than toward a wrong boolean.
//
// ── SECURITY ────────────────────────────────────────────────────────
// RevenueCat signs nothing by default; it sends whatever Authorization header
// you configure in the dashboard. Set REVENUECAT_WEBHOOK_SECRET to that value.
// Without it configured the function refuses every request rather than
// accepting unauthenticated writes to the entitlement mirror.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The entitlement this app cares about. Matches `constants/platinum.ts`. */
const PLATINUM_ENTITLEMENT_ID = "platinum";

/** Event types that end access immediately, regardless of expiry date. */
const TERMINAL_TYPES = new Set(["CANCELLATION", "EXPIRATION", "SUBSCRIPTION_PAUSED"]);

/**
 * `TRANSFER` moves a subscription between app user ids. It carries
 * `transferred_from` / `transferred_to` instead of the usual entitlement
 * fields, so it is handled separately.
 */
const TRANSFER_TYPE = "TRANSFER";

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  store?: string;
  period_type?: string;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  cancel_reason?: string | null;
  transferred_from?: string[];
  transferred_to?: string[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Whether this event touches the Platinum entitlement at all. */
function touchesPlatinum(event: RevenueCatEvent): boolean {
  if (event.entitlement_id === PLATINUM_ENTITLEMENT_ID) return true;
  if (event.entitlement_ids?.includes(PLATINUM_ENTITLEMENT_ID)) return true;
  // Some event types omit entitlement fields entirely (TRANSFER, and older
  // payloads). Treat those as relevant and let the update decide — a missed
  // expiry is worse than a redundant write.
  return !event.entitlement_id && !event.entitlement_ids;
}

/** The Supabase user id. We configure the SDK with it, so it is app_user_id. */
function resolveUserId(event: RevenueCatEvent): string | null {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ];
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Anonymous RevenueCat ids look like "$RCAnonymousID:…" and are not users
  // of ours; only a real uuid can be a Supabase account.
  return candidates.find((c) => typeof c === "string" && uuid.test(c)) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (!expected) {
    console.error("[revenuecat-webhook] REVENUECAT_WEBHOOK_SECRET is not set");
    return jsonResponse({ error: "Webhook is not configured" }, 500);
  }
  if (req.headers.get("Authorization") !== expected) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const payload = await req.json().catch(() => null);
  const event = payload?.event as RevenueCatEvent | undefined;
  if (!event?.type) {
    return jsonResponse({ error: "Malformed event" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── TRANSFER: move the subscription, don't create a second one ──
  if (event.type === TRANSFER_TYPE) {
    const from = (event.transferred_from ?? []).filter(Boolean);
    const to = (event.transferred_to ?? []).filter(Boolean);
    if (from.length) {
      await admin
        .from("platinum_subscribers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("user_id", from);
    }
    // The receiving account gets its state from the RENEWAL/INITIAL_PURCHASE
    // event RevenueCat sends alongside; nothing to write optimistically here.
    return jsonResponse({ ok: true, transferred: { from, to } });
  }

  if (!touchesPlatinum(event)) {
    return jsonResponse({ ok: true, skipped: "not the platinum entitlement" });
  }

  const userId = resolveUserId(event);
  if (!userId) {
    // An anonymous purchase that hasn't been aliased to an account yet. It
    // will arrive again once the SDK logs in, so this is not an error.
    return jsonResponse({ ok: true, skipped: "no supabase user id on event" });
  }

  const expiresAtMs = event.expiration_at_ms ?? null;
  const expiresAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;

  // Active if the store says the period hasn't ended, unless the event type
  // itself terminates access now. Deriving from the date rather than from a
  // per-type boolean means an unfamiliar event type still lands correctly.
  const isActive = TERMINAL_TYPES.has(event.type)
    ? false
    : expiresAtMs
      ? expiresAtMs > Date.now()
      : true;

  const eventAt = event.event_timestamp_ms
    ? new Date(event.event_timestamp_ms).toISOString()
    : new Date().toISOString();

  // Out-of-order delivery guard: RevenueCat retries, and a retried older
  // event must not overwrite a newer state.
  const { data: existing } = await admin
    .from("platinum_subscribers")
    .select("last_event_at, last_event_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.last_event_id && existing.last_event_id === event.id) {
    return jsonResponse({ ok: true, skipped: "duplicate event" });
  }
  if (existing?.last_event_at && new Date(existing.last_event_at) > new Date(eventAt)) {
    return jsonResponse({ ok: true, skipped: "stale event" });
  }

  const { error } = await admin.from("platinum_subscribers").upsert(
    {
      user_id: userId,
      rc_app_user_id: event.app_user_id ?? null,
      is_active: isActive,
      product_id: event.product_id ?? null,
      store: event.store ?? null,
      period_type: event.period_type ?? null,
      expires_at: expiresAt,
      // RevenueCat sends CANCELLATION when auto-renew is switched off; access
      // continues to `expires_at`, which is why is_active can stay true here.
      will_renew: !TERMINAL_TYPES.has(event.type),
      last_event_id: event.id ?? null,
      last_event_at: eventAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error(`[revenuecat-webhook] upsert failed: ${error.message}`);
    // 500 so RevenueCat retries — a dropped event leaves the mirror wrong.
    return jsonResponse({ error: "Could not record the subscription" }, 500);
  }

  return jsonResponse({ ok: true, userId, isActive });
});
