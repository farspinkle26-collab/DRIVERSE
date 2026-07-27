import { supabase } from "@/lib/supabase";

/**
 * Sends a driver's own car photo to the `generate-car-image` edge function,
 * which restyles it via Gemini and returns the public URL already saved to
 * `car_collections.photo_url`. The function is a Platinum-gated feature; a
 * 403 with `code: "not_platinum"` is surfaced as `err.code` so the caller can
 * raise the paywall instead of showing a raw error. Throws on failure.
 */
export async function generateCarImage(
  carId: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-car-image", {
    body: { carId, imageBase64, mimeType },
  });

  if (error) {
    const body = await readErrorBody(error);
    const err = new Error(body?.error ?? "Could not generate your car.") as Error & { code?: string };
    if (body?.code) err.code = body.code;
    throw err;
  }
  if (!data?.photoUrl) throw new Error("No image was returned.");
  return data.photoUrl as string;
}

/**
 * Pulls the JSON body out of a `FunctionsHttpError`. supabase-js keeps the
 * original `Response` on `context`, so the function's `code` survives.
 */
async function readErrorBody(
  error: unknown
): Promise<{ error?: string; code?: string } | null> {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.json !== "function") return null;
  try {
    return await context.json();
  } catch {
    return null;
  }
}
