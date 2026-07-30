/**
 * LAUNCH SAFETY — nothing in this module may run at import time.
 *
 * `useAuthStore` imports this file and `app/_layout.tsx` imports that, so this
 * module is evaluated while Hermes is still loading the bundle, before the
 * app's first frame and outside any React error boundary. Anything that throws
 * up here takes the process down on launch with a blank screen and no
 * diagnosable error — which is how it reaches a store listing and starts
 * looking like "the app just crashes when you open it".
 *
 * Two calls used to sit at module scope and both are now deferred:
 *
 *   WebBrowser.maybeCompleteAuthSession() — reaches into the ExpoWebBrowser
 *     native module. It is a no-op off the web anyway (the native side does
 *     not implement it), so its only effect on a phone was the risk.
 *
 *   Linking.createURL("auth-callback") — throws in a release build when the
 *     expo-constants manifest or its `scheme` is missing. Now built lazily
 *     through `lib/deepLink.ts`, which cannot throw, on the first sign-in
 *     attempt rather than on every launch.
 */

import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import { createAppLink } from "@/lib/deepLink";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export type SocialProvider = "google" | "apple";

let cachedRedirectTo: string | null = null;

/**
 * The OAuth callback URL, resolved on first use and reused after that.
 *
 * Deferred rather than computed at import, and cached rather than recomputed,
 * so the two round-trips of one sign-in always agree on the same redirect —
 * Supabase matches the callback against the URL the flow started with.
 */
function getRedirectTo(): string {
  if (cachedRedirectTo === null) {
    cachedRedirectTo = createAppLink("auth-callback");
  }
  return cachedRedirectTo;
}

/**
 * Closes a lingering auth popup on web. A no-op on iOS and Android, called
 * from the sign-in path instead of at import time.
 */
function completeAnyPendingAuthSession(): void {
  if (Platform.OS !== "web") return;
  try {
    WebBrowser.maybeCompleteAuthSession();
  } catch (err) {
    console.warn("[Auth] maybeCompleteAuthSession failed:", err);
  }
}

export async function signInWithSocialProvider(provider: SocialProvider): Promise<Session | null> {
  completeAnyPendingAuthSession();

  if (provider === "apple") {
    return signInWithAppleNative();
  }

  return signInWithGoogleOAuth();
}

async function signInWithAppleNative(): Promise<Session | null> {
  console.log("[Auth] Starting Apple NATIVE sign in...");

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple sign-in did not return an identity token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });

  if (error) throw error;

  console.log("[Auth] Apple NATIVE sign in succeeded.");

  return data.session ?? null;
}

async function signInWithGoogleOAuth(): Promise<Session | null> {
  const redirectTo = getRedirectTo();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== "web",
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("No OAuth URL returned from Supabase.");

  if (Platform.OS === "web") {
    // On web, Supabase handles the redirect to the provider directly.
    return null;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== "success" || !result.url) {
    return null;
  }

  const url = new URL(result.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return null;
  }

  const { data: sessionData, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) throw exchangeErr;

  return sessionData.session ?? null;
}
