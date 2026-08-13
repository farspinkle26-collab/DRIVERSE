import { supabase } from "@/lib/supabase";

/**
 * Permanently deletes the signed-in driver's account and everything tied to
 * it — see `supabase/functions/delete-account/index.ts` for exactly what
 * that covers and why an edge function is the only place this can run
 * (deleting `auth.users` needs the service role key). Throws on failure;
 * the caller (`components/DeleteAccountModal.tsx`) is expected to already
 * have confirmed with the driver before calling this.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke("delete-account", {
    body: {},
  });

  if (error) {
    const body = await readErrorBody(error);
    throw new Error(body?.error ?? "Couldn't delete your account. Try again.");
  }
}

/**
 * Pulls the JSON body out of a `FunctionsHttpError`. supabase-js keeps the
 * original `Response` on `context`, so the function's message survives.
 */
async function readErrorBody(
  error: unknown
): Promise<{ error?: string } | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.json !== "function") return null;
  try {
    return await context.json();
  } catch {
    return null;
  }
}
