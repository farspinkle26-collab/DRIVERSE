/**
 * Driveverse — the sign-in gate.
 *
 * The first screen of the app: nothing behind it is reachable without a
 * session (`AuthGate` in `app/_layout.tsx` enforces that). Built on the
 * Phase 1 token system (`constants/theme.ts`, `components/CutCorner.tsx`),
 * same vocabulary as the garage gate it hands off to.
 *
 * Anatomy, top to bottom:
 *   brand     accent rule, DRIVERSE wordmark, title, one line of purpose
 *   providers Continue with Google / Apple — the primary path, no typing
 *   divider   OR WITH EMAIL
 *   form      email + password, then the one red button on the screen
 *   footer    create-account link, terms line
 *
 * Google and Apple both run through Supabase OAuth (`lib/socialAuth.ts`);
 * Apple is hidden on Android, where it has no platform meaning and the
 * provider is usually not configured for it.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { AppleMark, GoogleMark } from "@/components/BrandMarks";
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const SCREEN_MARGIN = spacing.spacingXl;
const ICON_MD = 18;
const ICON_STROKE = 1.75;
/** Width of the red accent rule that anchors the brand block. */
const RULE_WIDTH = 48;

const OVERLINE = {
  fontFamily: fontFamily.displaySemiBold,
  fontSize: 12,
  lineHeight: 16,
  letterSpacing: 1.6,
} as const;

type Pending = "google" | "apple" | "email" | null;

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, signInWithGoogle, signInWithApple, error } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const busy = pending !== null;
  const canSubmit = email.trim().length > 0 && password.length > 0;

  // On success the auth listener flips `isAuthenticated` and `AuthGate`
  // takes over; routing to "/" just makes the hand-off immediate instead of
  // waiting for the next render pass.
  const enterApp = useCallback(() => {
    router.replace("/" as any);
  }, [router]);

  const handleEmailSignIn = useCallback(async () => {
    if (!canSubmit || busy) return;
    setPending("email");
    try {
      const success = await login(email.trim(), password);
      if (success) enterApp();
    } finally {
      setPending(null);
    }
  }, [canSubmit, busy, login, email, password, enterApp]);

  const handleGoogle = useCallback(async () => {
    if (busy) return;
    setPending("google");
    try {
      const success = await signInWithGoogle();
      if (success) enterApp();
    } finally {
      setPending(null);
    }
  }, [busy, signInWithGoogle, enterApp]);

  const handleApple = useCallback(async () => {
    if (busy) return;
    setPending("apple");
    try {
      const success = await signInWithApple();
      if (success) enterApp();
    } finally {
      setPending(null);
    }
  }, [busy, signInWithApple, enterApp]);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + spacing.spacingXxl,
              paddingBottom: insets.bottom + spacing.spacingXl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ═══ BRAND ═══ */}
          {/* Typographic lockup rather than the logo PNG: that asset is a
              1024×1536 render with its own background, which cannot sit on
              voidBlack without a visible plate around it. */}
          <View style={styles.brand}>
            <View style={styles.rule} />
            <Text style={styles.wordmark}>DRIVERSE</Text>
            <Text style={styles.title}>SIGN IN</Text>
            <Text style={styles.subtitle}>
              Your garage, your routes and the drivers around you all hang off
              your account. Sign in to pick up where you left off.
            </Text>
          </View>

          {/* ═══ ERROR ═══ */}
          {error ? (
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={colors.racingRed}
              borderWidth={borderWidth.hairline}
              cutSize={cut.sm}
              corners="topRight"
              style={styles.errorBox}
              contentStyle={styles.errorContent}
            >
              <Text style={styles.errorText}>{error}</Text>
            </CutCornerSurface>
          ) : null}

          {/* ═══ PROVIDERS ═══ */}
          <View style={styles.providers}>
            <CutCornerButton
              title={pending === "google" ? "Connecting…" : "Continue with Google"}
              variant="ghost"
              size="md"
              corners="topRight"
              icon={
                pending === "google" ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <GoogleMark size={ICON_MD} />
                )
              }
              onPress={handleGoogle}
              disabled={busy}
              accessibilityLabel="Continue with Google"
              style={styles.providerBtn}
            />

            {Platform.OS !== "android" && (
              <CutCornerButton
                title={pending === "apple" ? "Connecting…" : "Continue with Apple"}
                variant="ghost"
                size="md"
                corners="topRight"
                icon={
                  pending === "apple" ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <AppleMark size={ICON_MD} color={colors.textPrimary} />
                  )
                }
                onPress={handleApple}
                disabled={busy}
                accessibilityLabel="Continue with Apple"
                style={styles.providerBtn}
              />
            )}
          </View>

          {/* ═══ DIVIDER ═══ */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>OR WITH EMAIL</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ═══ EMAIL FORM ═══ */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Mail size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                editable={!busy}
              />
            </View>

            <View style={styles.field}>
              <Lock size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                onSubmitEditing={handleEmailSignIn}
                returnKeyType="go"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={spacing.spacingSm}
              >
                {showPassword ? (
                  <EyeOff size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                ) : (
                  <Eye size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                )}
              </Pressable>
            </View>

            <CutCornerButton
              title={pending === "email" ? "Signing in…" : "Sign In"}
              variant="primary"
              size="lg"
              corners="topRight"
              onPress={handleEmailSignIn}
              disabled={!canSubmit || busy}
              style={styles.submit}
            />
          </View>

          {/* ═══ FOOTER ═══ */}
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>New to Driverse? </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push("/signup" as any)}
                hitSlop={spacing.spacingSm}
                disabled={busy}
              >
                <Text style={styles.footerLink}>Create an account</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/terms-and-conditions" as any)}
              hitSlop={spacing.spacingSm}
            >
              <Text style={styles.legal}>
                By continuing you agree to our Terms and Privacy Policy.
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: SCREEN_MARGIN,
    justifyContent: "center",
  },

  // Brand
  brand: { alignItems: "center", gap: spacing.spacingXs },
  rule: {
    width: RULE_WIDTH,
    height: borderWidth.emphasis,
    backgroundColor: colors.racingRed,
    marginBottom: spacing.spacingLg,
  },
  wordmark: { ...OVERLINE, color: colors.racingRed },
  title: { ...textStyle("displayXl"), color: colors.textPrimary },
  subtitle: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.spacingXs,
  },

  // Error
  errorBox: { marginTop: spacing.spacingXl },
  errorContent: { padding: spacing.spacingMd },
  errorText: { ...textStyle("body"), color: colors.racingRed, textAlign: "center" },

  // Providers
  providers: { marginTop: spacing.spacingXxl, gap: spacing.spacingMd },
  providerBtn: { alignSelf: "stretch" },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    marginVertical: spacing.spacingXl,
  },
  dividerLine: { flex: 1, height: borderWidth.hairline, backgroundColor: colors.hairline },
  dividerLabel: { ...OVERLINE, fontSize: 11, color: colors.textSecondary },

  // Form
  form: { gap: spacing.spacingMd },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingLg,
    height: 52,
  },
  input: {
    flex: 1,
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  submit: { alignSelf: "stretch", marginTop: spacing.spacingXs },

  // Footer
  footer: { marginTop: spacing.spacingXxl, gap: spacing.spacingMd, alignItems: "center" },
  footerRow: { flexDirection: "row", alignItems: "center" },
  footerText: { ...textStyle("body"), color: colors.textSecondary },
  footerLink: { ...textStyle("body"), color: colors.racingRed },
  legal: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
  },
});
