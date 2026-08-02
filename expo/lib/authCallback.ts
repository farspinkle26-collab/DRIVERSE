/**
 * The pure half of the OAuth round-trip: reading the callback URL.
 *
 * Split out for the same reason `lib/deepLinkFormat.ts` and `lib/routeDraft.ts`
 * are — the rule can be unit-tested by a bare runner with no React Native,
 * Expo or Supabase module anywhere in the import graph. It also deliberately
 * avoids `URL`/`URLSearchParams`: the callback carries a CUSTOM scheme
 * (`myapp://auth-callback`), and the WHATWG parsers treat non-special schemes
 * differently enough between Hermes, the `react-native-url-polyfill` and Node
 * that "works in the test, returns null on the phone" is a real outcome. Two
 * dozen lines of string splitting behave the same everywhere.
 *
 * WHY IT HAS TO READ BOTH THE QUERY AND THE FRAGMENT
 *   Supabase hands the session back in one of two shapes, decided by the
 *   client's `flowType`:
 *
 *     PKCE      myapp://auth-callback?code=<uuid>
 *     implicit  myapp://auth-callback#access_token=...&refresh_token=...
 *
 *   `flowType` is now pinned to `pkce` in `lib/supabase.ts`, so the first is
 *   what we expect. The second is still parsed because the cost is four lines
 *   and the failure it prevents is silent: code that only ever looked at
 *   `searchParams.get("code")` found nothing in an implicit callback, returned
 *   `null`, and the sign-in button simply did nothing with no error anywhere.
 *
 *   Errors arrive in either half depending on which leg failed — Google's own
 *   rejection comes back on the query, Supabase's `error_description` on the
 *   fragment — so both are searched for those too.
 */

export type AuthCallback =
  /** PKCE. Exchange with `supabase.auth.exchangeCodeForSession(code)`. */
  | { kind: "code"; code: string }
  /** Implicit. Adopt with `supabase.auth.setSession({ ... })`. */
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  /** The provider or Supabase said no. `message` is fit to show a user. */
  | { kind: "error"; message: string }
  /** A well-formed URL carrying none of the above. */
  | { kind: "none" };

/** `decodeURIComponent` that yields the raw text rather than throwing. */
function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/**
 * Parses one `a=1&b=2` segment into a map. First occurrence of a key wins,
 * which keeps a malformed duplicate from shadowing the real value.
 */
function parseSegment(segment: string, into: Map<string, string>): void {
  for (const pair of segment.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = decodeParam(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? "" : decodeParam(pair.slice(eq + 1));
    if (key && !into.has(key)) into.set(key, value);
  }
}

/**
 * Every parameter on the URL, from the query string and the fragment alike.
 *
 * Exported for tests and for anything that needs a parameter this module has
 * no opinion about (`state`, say).
 */
export function callbackParams(url: string): Map<string, string> {
  const params = new Map<string, string>();

  const hashAt = url.indexOf("#");
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? "" : url.slice(hashAt + 1);

  const questionAt = beforeHash.indexOf("?");
  if (questionAt !== -1) parseSegment(beforeHash.slice(questionAt + 1), params);

  // A fragment can carry its own `?` (`#/?code=…`); everything after the `#`
  // is treated as one parameter segment, with a leading path stripped.
  if (fragment) {
    const innerQuestion = fragment.indexOf("?");
    parseSegment(innerQuestion === -1 ? fragment : fragment.slice(innerQuestion + 1), params);
  }

  return params;
}

/**
 * A human-readable line for an OAuth failure.
 *
 * `error_description` is the useful one when it exists — Supabase writes real
 * sentences there — and the bare `error` code is the fallback.
 */
function describeError(code: string, description: string | undefined): string {
  const detail = description?.trim();
  if (detail) return detail;
  if (code === "access_denied") return "Sign-in was cancelled.";
  return `Sign-in failed (${code}).`;
}

/**
 * What a redirect back into the app is telling us.
 *
 * Order matters: an error is reported even when the URL also carries a code,
 * because a callback that has both is a failed exchange, not a usable one.
 */
export function parseAuthCallback(url: string): AuthCallback {
  const params = callbackParams(url);

  const errorCode = params.get("error") || params.get("error_code");
  if (errorCode) {
    return { kind: "error", message: describeError(errorCode, params.get("error_description")) };
  }

  const code = params.get("code");
  if (code) return { kind: "code", code };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "tokens", accessToken, refreshToken };

  return { kind: "none" };
}
