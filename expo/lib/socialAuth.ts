import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

const redirectTo = Linking.createURL("auth-callback");

export async function signInWithGoogleOAuth(): Promise<Session | null> {
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

  console.log("[Auth] Opening browser for Google auth...", redirectTo);

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

export async function signInWithAppleNative(): Promise<Session | null> {
  console.log("[Auth] Starting Apple NATIVE sign in...");

  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Apple Sign In is not available on this device.");
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple Sign In did not return an identity token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });

  if (error) throw error;

  console.log("[Auth] Apple NATIVE sign in succeeded.");

  return data.session ?? null;
}
