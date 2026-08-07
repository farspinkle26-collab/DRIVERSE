/**
 * Driveverse — turning a failed convoy write into something a driver can act on.
 *
 * "Couldn't create convoy / Please try again." was the only thing this feature
 * ever said when a write failed, and it was wrong in the one case that
 * mattered: every cause below is permanent, so trying again does nothing but
 * produce the same alert. Worse, the real Postgres error was swallowed into a
 * `console.error` that nobody on a store build can read — three of the four
 * causes here are indistinguishable from the outside.
 *
 * So the rule is: name the failure, and say who can fix it. A schema problem
 * is not the driver's fault and must not be phrased as if it were, but it is
 * also not "try again" — it is "this needs a database migration", and saying
 * so out loud is what turns a support ticket into a one-line fix.
 *
 * Pure and tested (`__tests__/convoyErrors.test.ts`): the mapping is a lookup
 * over Postgres/PostgREST codes, and the interesting part is which codes mean
 * "retry with the older code path" rather than "stop".
 */

import { parseLimitRejection } from "@/lib/platinumLimits";

export interface ConvoyErrorInfo {
  /** Alert title — names the failure, not the action. */
  title: string;
  /** Body — what happened and what changes it. */
  message: string;
  /** Postgres SQLSTATE or PostgREST code, when the error carried one. */
  code?: string;
  /**
   * The database is missing something this build expects. Nothing the driver
   * does will help; `database_migration_convoy_shared_nav.sql` is the fix.
   */
  needsMigration: boolean;
  /**
   * The `create_convoy` / `invite_to_convoy` RPC isn't deployed. The store
   * falls back to the direct table writes it used before those existed, so
   * this is the one "error" that is not shown to anyone.
   */
  rpcMissing: boolean;
}

/** PostgREST reports a missing function as PGRST202; Postgres as 42883. */
const RPC_MISSING = new Set(["PGRST202", "42883"]);
/** A column the client sent that the deployed schema doesn't have. */
const COLUMN_MISSING = new Set(["PGRST204", "42703"]);
/** A table the client wrote to that doesn't exist at all. */
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

/**
 * True when the failure means "this build is talking to a database that
 * predates it" — a missing RPC, column or table. Callers use it to decide
 * whether to retry through the legacy path before giving up.
 */
export function isMissingDatabaseObject(error: unknown): boolean {
  const code = codeOf(error);
  if (!code) return false;
  return RPC_MISSING.has(code) || COLUMN_MISSING.has(code) || TABLE_MISSING.has(code);
}

/**
 * Maps a Supabase error onto driver-facing copy.
 *
 * `action` names what was being attempted ("create a convoy", "send that
 * invite") and is used verbatim inside the generic sentence, so it reads as a
 * clause: "Driveverse couldn't <action> …".
 */
export function describeConvoyError(error: unknown, action: string): ConvoyErrorInfo {
  const code = codeOf(error);
  const raw = messageOf(error);

  // A tier cap has its own copy already, written for the paywall.
  const rejection = parseLimitRejection(error);
  if (rejection) {
    return {
      title: "That convoy is full",
      message: rejection.message,
      code,
      needsMigration: false,
      rpcMissing: false,
    };
  }

  if (code && RPC_MISSING.has(code)) {
    return {
      title: "Convoys need a database update",
      message:
        "This build expects the create_convoy function, and the database doesn't have it yet. Run database_migration_convoy_shared_nav.sql in the Supabase SQL editor.",
      code,
      needsMigration: true,
      rpcMissing: true,
    };
  }

  if (code && (COLUMN_MISSING.has(code) || TABLE_MISSING.has(code))) {
    return {
      title: "Convoys need a database update",
      message: `The database is missing something this version of the app writes to (${raw || code}). Run the outstanding migrations in expo/ — database_migration_convoy_shared_nav.sql is the one that covers convoys.`,
      code,
      needsMigration: true,
      rpcMissing: false,
    };
  }

  // 42P17: "infinite recursion detected in policy for relation …". A
  // party_members policy that queries party_members. Named explicitly because
  // it is the exact failure database_migration_fix_convoy_rls_recursion.sql
  // exists to undo, and because nothing about the generic copy would point
  // anyone at it.
  if (code === "42P17" || /infinite recursion/i.test(raw)) {
    return {
      title: "Convoy permissions are misconfigured",
      message:
        "The convoy tables have a row-level-security policy that refers to itself, so the database refuses every write. Run database_migration_convoy_shared_nav.sql to replace it.",
      code,
      needsMigration: true,
      rpcMissing: false,
    };
  }

  if (code === "23505" || /duplicate key/i.test(raw)) {
    return {
      title: "You're already in a convoy",
      message:
        "A driver can only be in one convoy at a time. Leave the one you're in, then start this one.",
      code,
      needsMigration: false,
      rpcMissing: false,
    };
  }

  // 42501 is a straight RLS denial; the PostgREST wrapper is PGRST301.
  if (code === "42501" || code === "PGRST301" || /row-level security/i.test(raw)) {
    return {
      title: "Not allowed to do that",
      message:
        "The database refused the write. If you're signed in and this keeps happening, the convoy policies need database_migration_convoy_shared_nav.sql.",
      code,
      needsMigration: true,
      rpcMissing: false,
    };
  }

  if (/CONVOY_FULL/i.test(raw)) {
    return {
      title: "That convoy is full",
      message: raw.replace(/CONVOY_FULL:?\s*/i, "") || "There's no seat left in it.",
      code,
      needsMigration: false,
      rpcMissing: false,
    };
  }

  if (/network|fetch failed|timeout|abort/i.test(raw)) {
    return {
      title: "No connection to the server",
      message: `Driveverse couldn't ${action} because the request didn't reach Supabase. Check your connection and try again.`,
      code,
      needsMigration: false,
      rpcMissing: false,
    };
  }

  return {
    title: `Couldn't ${action}`,
    // The raw message goes in deliberately. It is the only copy of the cause
    // that reaches anyone once the app is on a phone.
    message: raw
      ? `${raw}${code ? ` (${code})` : ""}`
      : "The database rejected the write and didn't say why.",
    code,
    needsMigration: false,
    rpcMissing: false,
  };
}
