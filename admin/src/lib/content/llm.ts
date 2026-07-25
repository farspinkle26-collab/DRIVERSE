import "server-only";

// Single choke-point for every model call in the content pipeline. It talks to
// the Anthropic Messages API directly over fetch (Node 18+/22 global fetch) so
// we add zero npm dependencies. Every caller has a deterministic fallback, so
// when ANTHROPIC_API_KEY is absent the pipeline still runs — it just produces
// numbers-only output instead of model-written prose, and flags that clearly.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** Default model. Override with CONTENT_LLM_MODEL. */
export function llmModel(): string {
  return process.env.CONTENT_LLM_MODEL || "claude-opus-5";
}

export function llmAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface LlmImage {
  media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string; // base64, no data: prefix, no newlines
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

async function callMessages(opts: {
  system?: string;
  content: ContentBlock[];
  maxTokens?: number;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: llmModel(),
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (json.stop_reason === "refusal") {
    throw new Error("Model declined the request (refusal).");
  }
  return (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
}

/** Plain text completion. */
export async function llmText(
  system: string,
  prompt: string,
  maxTokens = 4096,
): Promise<string> {
  return callMessages({
    system,
    content: [{ type: "text", text: prompt }],
    maxTokens,
  });
}

/** Vision + text: prompt over one or more images. */
export async function llmVision(
  system: string,
  prompt: string,
  images: LlmImage[],
  maxTokens = 2048,
): Promise<string> {
  const content: ContentBlock[] = images.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.media_type, data: img.data },
  }));
  content.push({ type: "text", text: prompt });
  return callMessages({ system, content, maxTokens });
}

/**
 * JSON completion. We prompt for JSON and parse the first balanced object from
 * the reply — robust across models and needs no schema-compile round-trip.
 */
export async function llmJSON<T = unknown>(
  system: string,
  prompt: string,
  maxTokens = 2048,
): Promise<T> {
  const raw = await llmText(
    system +
      "\n\nRespond with ONLY a single valid JSON value and no prose, no code fences.",
    prompt,
    maxTokens,
  );
  return parseFirstJson<T>(raw);
}

/** Extract the first balanced JSON object/array from a string. */
export function parseFirstJson<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall through to bracket-scan.
  }
  const startObj = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  const start =
    startObj === -1
      ? startArr
      : startArr === -1
        ? startObj
        : Math.min(startObj, startArr);
  if (start === -1) throw new Error("No JSON found in model response.");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error("Unbalanced JSON in model response.");
}
