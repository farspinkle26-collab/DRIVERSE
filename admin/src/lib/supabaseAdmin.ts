// Server-only Supabase client. Uses the service-role (or dedicated read-only)
// key so the dashboard can aggregate across ALL users despite row-level
// security. This client is NEVER imported into client components — every query
// runs in server components / route handlers and only computed aggregates are
// sent to the browser.
//
// Read-only by convention: this dashboard only ever issues SELECTs. The proper
// hardening (before granting access beyond the founding team) is a dedicated
// Postgres role with BYPASSRLS + SELECT-only grants; swap its key into
// SUPABASE_SERVICE_ROLE_KEY and nothing else here changes.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

let cached: ReturnType<typeof createClient> | null = null;

export function supabaseAdmin() {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-driveverse-admin": "read-only-dashboard" } },
  });
  return cached;
}
