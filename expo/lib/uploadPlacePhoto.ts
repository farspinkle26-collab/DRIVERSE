import { supabase } from "@/lib/supabase";

const PLACE_PHOTOS_BUCKET = "place-photos";

/**
 * Uploads a locally-picked image to the `place-photos` storage bucket and
 * returns its public URL. Mirrors uploadAvatar.ts / uploadCarPhoto.ts.
 */
export async function uploadPlacePhoto(userId: string, localUri: string): Promise<string> {
  const resp = await fetch(localUri);
  const arrayBuffer = await resp.arrayBuffer();

  const rawExt = (localUri.split(".").pop() || "jpg").split("?")[0].toLowerCase();
  const ext = ["png", "jpg", "jpeg", "webp"].includes(rawExt) ? rawExt : "jpg";
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(PLACE_PHOTOS_BUCKET)
    .upload(path, arrayBuffer, { contentType });

  if (error) throw error;

  const { data } = supabase.storage.from(PLACE_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
