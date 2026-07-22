import { supabase } from "@/lib/supabase";

const CAR_PHOTOS_BUCKET = "car-photos";

/**
 * Uploads a locally-picked image to the `car-photos` storage bucket and
 * returns its public URL. Throws on failure.
 *
 * Mirrors uploadAvatar.ts: reads the picked file through `fetch` and
 * uploads the raw bytes, since a device-local `file://`/`ph://` URI is
 * only valid for the current app session and won't survive reloads.
 */
export async function uploadCarPhoto(userId: string, carId: string, localUri: string): Promise<string> {
  const resp = await fetch(localUri);
  const arrayBuffer = await resp.arrayBuffer();

  const rawExt = (localUri.split(".").pop() || "jpg").split("?")[0].toLowerCase();
  const ext = ["png", "jpg", "jpeg", "webp"].includes(rawExt) ? rawExt : "jpg";
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  // One stable path per car so re-generating overwrites the old photo.
  const path = `${userId}/${carId}.${ext}`;

  const { error } = await supabase.storage
    .from(CAR_PHOTOS_BUCKET)
    .upload(path, arrayBuffer, { contentType, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(CAR_PHOTOS_BUCKET).getPublicUrl(path);
  // Cache-bust so the new image shows immediately after re-upload.
  return `${data.publicUrl}?t=${Date.now()}`;
}
