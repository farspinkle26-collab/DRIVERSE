// Shared session helpers for the shared-password gate. Uses Web Crypto (HMAC)
// so the exact same logic runs in both the Edge middleware and Node route
// handlers. No secret is ever stored in the cookie — only an HMAC over a fixed
// payload, which the middleware recomputes and compares.
//
// This is intentionally minimal: a single shared password for the founding
// team. It is NOT real auth. Replace with per-user accounts + roles (e.g.
// Supabase Auth restricted to an allow-list) before granting wider access.

export const SESSION_COOKIE = "dv_admin";
const PAYLOAD = "driveverse-admin-session-v1";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    ""
  );
}

/** The expected cookie value: HMAC-SHA256(secret, fixed payload). */
export async function expectedToken(): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(PAYLOAD));
  return toHex(sig);
}

/** Constant-time-ish string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await expectedToken();
  return safeEqual(cookieValue, expected);
}
