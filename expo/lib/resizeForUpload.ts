import * as ImageManipulator from "expo-image-manipulator";

const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;

const RESIZE_STEPS: ReadonlyArray<{ width: number; compress: number }> = [
  { width: 1280, compress: 0.82 },
  { width: 1024, compress: 0.78 },
  { width: 832, compress: 0.74 },
  { width: 640, compress: 0.7 },
  { width: 512, compress: 0.65 },
];

export interface ResizedImageUpload {
  base64: string;
  mimeType: "image/jpeg";
}

function stripDataUriPrefix(value: string): string {
  if (!value.startsWith("data:")) return value;
  const comma = value.indexOf(",");
  return comma === -1 ? value : value.slice(comma + 1);
}

function estimatedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Re-encodes a picked image below the gateway's request-body budget.
 * Camera-roll originals can be much larger than the model needs, and a fixed
 * pixel resize is not enough because JPEG complexity varies by photo.
 */
export async function resizeForUpload(
  uri: string,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<ResizedImageUpload> {
  let lastBase64: string | null = null;

  for (const step of RESIZE_STEPS) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: step.width } }],
      { base64: true, compress: step.compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    const base64 = stripDataUriPrefix(result.base64 ?? "");
    if (!base64) continue;
    lastBase64 = base64;
    if (estimatedBytes(base64) <= maxBytes) {
      return { base64, mimeType: "image/jpeg" };
    }
  }

  if (lastBase64 && estimatedBytes(lastBase64) <= maxBytes * 1.15) {
    return { base64: lastBase64, mimeType: "image/jpeg" };
  }

  const error = new Error("Image is too large. Please choose a smaller photo.") as Error & {
    code?: string;
  };
  error.code = "IMAGE_TOO_LARGE";
  throw error;
}
