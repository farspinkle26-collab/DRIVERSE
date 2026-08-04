export const DRIVEVERSE_CAR_RENDER_MODEL = "google/gemini-3.1-flash-lite-image";

/**
 * One visual contract for every generated car in Driveverse. Keep this prompt
 * shared by the garage render and the standalone showcase so a driver's cars
 * always belong to the same collection.
 */
export const DRIVEVERSE_CAR_RENDER_STYLE = [
  "Create a Driveverse Signature automotive studio render from this exact car photo.",
  "Preserve the real make, model, body shape, paint colour, wheels, proportions and visible details exactly; do not redesign the vehicle or add accessories.",
  "Use a centered low three-quarter front view with the full car visible and generous negative space.",
  "Use a seamless near-black charcoal background fading subtly into warm espresso brown.",
  "Use cinematic warm amber-orange rim light tracing the roof and shoulder line, with a restrained cool neutral fill so the car remains legible.",
  "Give the vehicle a premium matte-gloss showroom finish and a soft controlled floor reflection.",
  "Keep the composition clean, uncluttered and consistent across every vehicle.",
  "No people, no other vehicles, no text, no watermark, no added logos, no signage and no frame or collage.",
].join(" ");

interface CarRenderRequest {
  imageBase64: string;
  mimeType: string;
  prompt?: string;
}

function dataUrlFromImage(value: unknown): string | null {
  if (typeof value === "string") return value.startsWith("data:") ? value : null;
  if (!value || typeof value !== "object") return null;
  const record = value as { image_url?: { url?: unknown }; url?: unknown };
  const url = record.image_url?.url ?? record.url;
  return typeof url === "string" && url.startsWith("data:") ? url : null;
}

function extractImageDataUrl(payload: unknown): string | null {
  const response = payload as {
    choices?: Array<{ message?: { images?: unknown[] } }>;
    images?: unknown[];
  };
  const messageImages = response?.choices?.[0]?.message?.images ?? [];
  const images = messageImages.length > 0 ? messageImages : response?.images ?? [];
  return dataUrlFromImage(images[0]);
}

/** Error carrying only a safe provider-facing message for an edge response. */
export class CarRenderError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "CarRenderError";
    this.status = status;
  }
}

/**
 * Calls Gemini Flash Lite Image through Rork Toolkit when the edge function has
 * the server-side Toolkit secret, with OpenRouter retained as a deployment
 * fallback for existing Supabase projects that already use that secret.
 */
export async function generateCarRender(request: CarRenderRequest): Promise<string> {
  const toolkitUrl = Deno.env.get("RORK_TOOLKIT_URL") ?? Deno.env.get("EXPO_PUBLIC_TOOLKIT_URL");
  const toolkitKey =
    Deno.env.get("RORK_TOOLKIT_SECRET_KEY") ??
    Deno.env.get("EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY");
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");

  const usingToolkit = Boolean(toolkitUrl && toolkitKey);
  const apiUrl = usingToolkit
    ? `${toolkitUrl!.replace(/\/$/, "")}/v2/vercel/v1/chat/completions`
    : "https://openrouter.ai/api/v1/chat/completions";
  const apiKey = toolkitKey ?? openRouterKey;

  if (!apiKey) {
    console.error("[car-render] no AI provider secret is configured");
    throw new CarRenderError("Image generation is not available right now", 500);
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(usingToolkit ? { "idempotency-key": crypto.randomUUID() } : {}),
    },
    body: JSON.stringify({
      model: DRIVEVERSE_CAR_RENDER_MODEL,
      modalities: ["text", "image"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: request.prompt ?? DRIVEVERSE_CAR_RENDER_STYLE },
            {
              type: "image_url",
              image_url: { url: `data:${request.mimeType};base64,${request.imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`[car-render] provider error ${response.status}: ${errorText.slice(0, 240)}`);
    throw new CarRenderError("Couldn't generate your car render, try again.", response.status >= 500 ? 502 : 400);
  }

  const payload = await response.json().catch(() => null);
  const dataUrl = extractImageDataUrl(payload);
  if (!dataUrl) {
    console.error("[car-render] provider response did not contain an image");
    throw new CarRenderError("Couldn't generate your car render, try again.");
  }
  return dataUrl;
}
