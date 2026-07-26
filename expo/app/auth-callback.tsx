/**
 * OAuth landing route.
 *
 * Where Google/Apple send the user back to (`lib/socialAuth.ts` builds the
 * URL from this path). Usually invisible: on native the in-app browser
 * resolves first and this screen only ever sees an already-live session.
 * It matters in the cases where it doesn't —
 *
 *   • the redirect cold-starts the app through a deep link, so the code
 *     arrives here rather than in `openAuthSessionAsync`'s result;
 *   • on web, where the whole page navigated away and back.
 *
 * Either way the job is the same: turn whatever the URL carries into a
 * session, then get out of the way.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { completeAuthFromUrl } from "@/lib/socialAuth";
import { CutCornerButton } from "@/components/CutCorner";
import { colors, spacing, textStyle } from "@/constants/theme";

/**
 * On web, supabase-js consumes the URL itself (`detectSessionInUrl`), and
 * that runs on its own clock. Give it a beat before we try the exchange
 * ourselves — a double exchange burns the one-time code and fails.
 */
const DETECT_SESSION_GRACE_MS = 400;

export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const [failure, setFailure] = useState<string | null>(null);
  const handled = useRef(false);

  const leave = useCallback(() => {
    router.replace("/" as any);
  }, [router]);

  useEffect(() => {
    if (handled.current) return;
    let cancelled = false;

    const finish = () => {
      if (cancelled || handled.current) return;
      handled.current = true;
      leave();
    };

    // The session can also land via the client's own URL detection, which
    // fires as an auth event rather than resolving anything we await.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          finish();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, DETECT_SESSION_GRACE_MS));
        if (cancelled || handled.current) return;

        const { data: retry } = await supabase.auth.getSession();
        if (retry.session) {
          finish();
          return;
        }

        const redirectUrl = url ?? (await Linking.getInitialURL());
        if (redirectUrl) {
          const session = await completeAuthFromUrl(redirectUrl);
          if (session) {
            finish();
            return;
          }
        }

        // Nothing usable in the URL and no session: treat it as a cancelled
        // sign-in rather than an error, and send the user back to the gate.
        finish();
      } catch (err) {
        if (cancelled) return;
        console.error("OAuth callback error:", err);
        setFailure(err instanceof Error ? err.message : "Sign-in could not be completed.");
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [url, leave]);

  if (failure) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.title}>SIGN-IN FAILED</Text>
        <Text style={styles.body}>{failure}</Text>
        <CutCornerButton
          title="Back to sign in"
          variant="outline"
          size="md"
          corners="topRight"
          onPress={leave}
          style={styles.action}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.center]}>
      <ActivityIndicator size="large" color={colors.racingRed} />
      <Text style={styles.body}>Finishing sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.spacingXl,
    gap: spacing.spacingMd,
  },
  title: { ...textStyle("displayMd"), color: colors.textPrimary },
  body: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center" },
  action: { marginTop: spacing.spacingSm },
});
