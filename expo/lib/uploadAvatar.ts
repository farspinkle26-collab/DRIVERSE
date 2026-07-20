import { supabase } from "@/lib/supabase";

const AVATAR_BUCKET = "avatars";

/**
 * Uploads a locally-picked image to the `avatars` storage bucket and returns
 * its public URL. Throws on failure so callers can fall back to the local URI.
 *
 * Works in React Native by reading the picked file through `fetch` and
 * uploading the raw bytes — no extra native modules required.
 */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const resp = await fetch(localUri);
  const arrayBuffer = await resp.arrayBuffer();

  const rawExt = (localUri.split(".").pop() || "jpg").split("?")[0].toLowerCase();
  const ext = ["png", "jpg", "jpeg", "webp"].includes(rawExt) ? rawExt : "jpg";
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  // One stable path per user so old avatars are overwritten (upsert).
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, arrayBuffer, { contentType, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Cache-bust so the new image shows immediately after re-upload.
  return `${data.publicUrl}?t=${Date.now()}`;
}
