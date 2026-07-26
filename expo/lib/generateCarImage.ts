import { supabase } from "@/lib/supabase";

/**
 * Sends a driver's own car photo to the `generate-car-image` edge function,
 * which restyles it via Gemini and returns the public URL already saved to
 * `car_collections.photo_url`. Throws on failure.
 */
export async function generateCarImage(
  carId: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-car-image", {
    body: { carId, imageBase64, mimeType },
  });
  if (error) throw error;
  if (!data?.photoUrl) throw new Error("No image was returned.");
  return data.photoUrl as string;
}
