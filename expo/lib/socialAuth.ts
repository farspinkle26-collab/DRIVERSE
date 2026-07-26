/**
 * Google / Apple sign-in, backed by Supabase's OAuth endpoints.
 *
 * Deliberately no native SDKs: the flow is `expo-web-browser` +
 * `expo-linking`, so it runs in the managed build (and on web) without a
 * prebuild step. See OAUTH_SETUP.md for the Supabase dashboard side —
 * every redirect URL this file can produce has to be on the allow list or
 * the provider bounces the user back with `error=redirect_uri_mismatch`.
 *
 * Flow, on native:
 *   1. `signInWithOAuth({ skipBrowserRedirect: true })` returns the
 *      provider's authorise URL — Supabase does not navigate for us.
 *   2. `openAuthSessionAsync` shows it in an in-app browser tab that keeps
 *      the app's cookies isolated, and resolves when the provider redirects
 *      to our `redirectTo`.
 *   3. The redirect carries `?code=` (PKCE), which we swap for a session.
 *
 * On web there is no step 2 — Supabase redirects the page itself and the
 * client picks the session out of the URL on return (`detectSessionInUrl`).
 */

import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = "google" | "apple";

/** Route the provider sends the user back to. Also a real screen: `app/auth-callback.tsx`. */
export const AUTH_CALLBACK_PATH = "auth-callback";

/**
 * Where the provider should return to.
 *
 *   native  myapp://auth-callback         (or exp://…/--/auth-callback in dev)
 *   web     https://<origin>/auth-callback
 */
export function authRedirectUrl(): string {
  if (Platform.OS === "web") {
    return `${window.location.origin}/${AUTH_CALLBACK_PATH}`;
  }
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

/** Params can arrive as a query string or as a `#` fragment. Read both. */
function paramsFromUrl(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((value, key) => merged.set(key, value));
    const fragment = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    new URLSearchParams(fragment).forEach((value, key) => merged.set(key, value));
  } catch {
    // Custom-scheme URLs (myapp://auth-callback?code=…) are not always
    // parseable by URL on every runtime — fall back to a manual split.
    const [, rest = ""] = url.split(/[?#]/, 2);
    new URLSearchParams(rest).forEach((value, key) => merged.set(key, value));
  }
  return merged;
}

/**
 * Turns a redirect URL into a session.
 *
 * Handles the PKCE `?code=` we ask for, and the implicit
 * `#access_token=&refresh_token=` shape as a fallback — a provider or a
 * legacy allow-list entry can still hand that back, and silently failing
 * there looks to the user like sign-in did nothing.
 *
 * Returns `null` when the URL carries neither (i.e. it was not an auth
 * redirect at all). Throws when the provider reported an error.
 */
export async function completeAuthFromUrl(url: string): Promise<Session | null> {
  const params = paramsFromUrl(url);

  const errorDescription = params.get("error_description") ?? params.get("error");
  if (errorDescription) {
    throw new Error(errorDescription.replace(/\+/g, " "));
  }

  const code = params.get("code");
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session ?? null;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return data.session ?? null;
  }

  return null;
}

/**
 * Starts the provider handshake.
 *
 * Resolves with the new session on success, or `null` when the user backed
 * out of the browser tab — a cancel is not an error and must not surface as
 * one. Throws only when the provider or Supabase actually rejected us.
 */
export async function signInWithSocialProvider(provider: SocialProvider): Promise<Session | null> {
  const redirectTo = authRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== "web",
    },
  });

  if (error) throw error;

  if (Platform.OS === "web") {
    // Supabase has already navigated the page to the provider. The session
    // materialises after the redirect back, not here.
    return null;
  }

  if (!data?.url) throw new Error("No OAuth URL returned from Supabase.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== "success" || !result.url) {
    // "cancel" (user closed the tab) and "dismiss" (app came back to the
    // foreground another way) both land here.
    return null;
  }

  return completeAuthFromUrl(result.url);
}
