/**
 * Driveverse — AI Car Showcase client.
 *
 * Thin wrapper over the `generate-showcase` edge function, which is where the
 * entitlement and quota gates actually live (a client-side gate is a UX
 * affordance; the function is what bounds the bill). This module's job is to
 * turn the function's responses into a discriminated union the UI can switch
 * on without parsing error strings.
 */

import { supabase } from "@/lib/supabase";

export type ShowcaseStyle = "signature";

export interface ShowcaseStyleOption {
  id: ShowcaseStyle;
  label: string;
  /** One line, shown under the style name in the picker. */
  note: string;
}

export const SHOWCASE_STYLES: ShowcaseStyleOption[] = [
  {
    id: "signature",
    label: "Driveverse Signature",
    note: "Charcoal-to-espresso studio, amber rim light, consistent across every car.",
  },
];

export interface ShowcaseQuota {
  used: number;
  allowance: number;
  remaining: number;
}

export type ShowcaseResult =
  | { status: "generated"; imageUrl: string; style: ShowcaseStyle; quota: ShowcaseQuota | null }
  /** Not a Platinum subscriber. Caller should raise the paywall. */
  | { status: "not_platinum" }
  /** Platinum, but the monthly allowance is spent. */
  | { status: "quota_exhausted"; message: string; quota: ShowcaseQuota | null }
  | { status: "error"; message: string };

/** Generates a showcase from a car photo the driver just picked. */
export async function generateShowcase(params: {
  carId: string;
  imageBase64: string;
  mimeType: string;
  /** Kept in the request for backwards compatibility; the server enforces Signature. */
  style: ShowcaseStyle;
}): Promise<ShowcaseResult> {
  const { data, error } = await supabase.functions.invoke("generate-showcase", {
    body: {
      carId: params.carId,
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
      style: params.style,
    },
  });

  // supabase-js surfaces a non-2xx as `error` with the body on `context`.
  // Both shapes are checked so a 403/429 is classified rather than shown raw.
  const payload = (data ?? {}) as {
    imageUrl?: string;
    style?: ShowcaseStyle;
    quota?: ShowcaseQuota | null;
    error?: string;
    code?: string;
  };

  if (error) {
    const body = await readErrorBody(error);
    if (body?.code === "not_platinum") return { status: "not_platinum" };
    if (body?.code === "quota_exhausted") {
      return {
        status: "quota_exhausted",
        message: body.error ?? "You've used this month's showcases.",
        quota: body.quota ?? null,
      };
    }
    return {
      status: "error",
      message: body?.error ?? "Couldn't generate your showcase.",
    };
  }

  if (payload.code === "not_platinum") return { status: "not_platinum" };
  if (payload.code === "quota_exhausted") {
    return {
      status: "quota_exhausted",
      message: payload.error ?? "You've used this month's showcases.",
      quota: payload.quota ?? null,
    };
  }
  if (!payload.imageUrl) {
    return {
      status: "error",
      message: payload.error ?? "No image came back. Try again.",
    };
  }

  return {
    status: "generated",
    imageUrl: payload.imageUrl,
    style: payload.style ?? params.style,
    quota: payload.quota ?? null,
  };
}

/**
 * Pulls the JSON body out of a `FunctionsHttpError`. supabase-js keeps the
 * original `Response` on `context`, so the function's `code` survives.
 */
async function readErrorBody(
  error: unknown
): Promise<{ error?: string; code?: string; quota?: ShowcaseQuota | null } | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.json !== "function") return null;
  try {
    return await context.json();
  } catch {
    return null;
  }
}

/** The driver's current month's allowance and usage. */
export async function fetchShowcaseQuota(): Promise<ShowcaseQuota | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase.rpc("ai_showcase_quota", {
    uid: session.user.id,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    used: Number(row.used ?? 0),
    allowance: Number(row.allowance ?? 0),
    remaining: Number(row.remaining ?? 0),
  };
}

/** A driver's previously generated showcases, newest first. */
export async function fetchShowcases(limit = 20): Promise<
  { id: string; car_id: string | null; image_url: string; style: string; created_at: string }[]
> {
  const { data } = await supabase
    .from("ai_showcases")
    .select("id, car_id, image_url, style, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as {
    id: string;
    car_id: string | null;
    image_url: string;
    style: string;
    created_at: string;
  }[];
}
