import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = "google" | "apple";

const redirectTo = Linking.createURL("auth-callback");

export async function signInWithSocialProvider(provider: SocialProvider): Promise<Session | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
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
