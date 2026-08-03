import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { CutCornerButton } from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import {
  borderWidth,
  colors,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, signInWithGoogle, signInWithApple, loading, error } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    const success = await login(email.trim(), password);
    if (success) {
      // `app/index.tsx` sends an account that never finished nation/car
      // customization to `/customize-profile` instead of straight in.
      router.replace("/" as any);
    }
  };

  const handleGoogleLogin = async () => {
    setSocialLoading("google");
    try {
      const success = await signInWithGoogle();
      if (success) router.replace("/" as any);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleAppleLogin = async () => {
    setSocialLoading("apple");
    try {
      const success = await signInWithApple();
      if (success) router.replace("/" as any);
    } finally {
      setSocialLoading(null);
    }
  };

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, paddingTop: insets.top + spacing.spacingLg }}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </TouchableOpacity>

        <View style={styles.content}>
          {/* Brand */}
          <View style={styles.brandSection}>
            <Text style={styles.wordmark}>DRIVEVERSE</Text>
            <Text style={styles.title}>WELCOME BACK</Text>
            <Text style={styles.subtitle}>Sign in to continue your drive</Text>
          </View>

          {error ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputWrapper}>
              <Mail size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Lock size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} activeOpacity={0.7}>
                {showPassword ? (
                  <EyeOff size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                ) : (
                  <Eye size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                )}
              </TouchableOpacity>
            </View>

            <CutCornerButton
              title={loading ? "Signing in…" : "Sign In"}
              onPress={handleLogin}
              disabled={loading || !canSubmit}
              style={styles.loginBtn}
              icon={loading ? <ActivityIndicator size="small" color={colors.voidBlack} /> : undefined}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Sign In */}
          <View style={styles.socialGroup}>
            <CutCornerButton
              title="Continue with Google"
              variant="ghost"
              onPress={handleGoogleLogin}
              disabled={socialLoading !== null || loading}
              icon={
                socialLoading === "google" ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Text style={styles.socialGlyph}>G</Text>
                )
              }
            />

            {Platform.OS === "ios" && (
              <CutCornerButton
                title="Continue with Apple"
                variant="ghost"
                onPress={handleAppleLogin}
                disabled={socialLoading !== null || loading}
                style={styles.appleBtn}
                icon={
                  socialLoading === "apple" ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                  ) : (
                    <Text style={styles.socialGlyph}></Text>
                  )
                }
              />
            )}
          </View>

          {/* Sign Up link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push("/signup" as any)} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidBlack,
  },
  backBtn: {
    paddingHorizontal: spacing.spacingXl,
    paddingVertical: spacing.spacingSm,
    alignSelf: "flex-start",
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.spacingXl,
    justifyContent: "center",
  },
  // Brand
  brandSection: {
    alignItems: "center",
    marginBottom: spacing.spacingXxl,
  },
  wordmark: {
    ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold }),
    color: colors.racingRed,
    letterSpacing: 3,
    marginBottom: spacing.spacingSm,
  },
  title: {
    ...textStyle("displayXl"),
    color: colors.textPrimary,
    marginBottom: spacing.spacingXs,
  },
  subtitle: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  // Error
  errorText: {
    ...textStyle("caption"),
    color: colors.racingRed,
    textAlign: "center",
    marginBottom: spacing.spacingLg,
  },
  // Form
  form: {
    gap: spacing.spacingMd,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingLg,
    height: 52,
  },
  inputIcon: {
    marginRight: spacing.spacingMd,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    ...textStyle("body"),
  },
  loginBtn: {
    marginTop: spacing.spacingXs,
  },
  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.spacingXxl,
    gap: spacing.spacingMd,
  },
  dividerLine: {
    flex: 1,
    height: borderWidth.hairline,
    backgroundColor: colors.hairline,
  },
  dividerText: {
    ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold }),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  // Social
  socialGroup: {
    gap: spacing.spacingMd,
  },
  appleBtn: {
    marginTop: 0,
  },
  socialGlyph: {
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textPrimary,
  },
  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.spacingXxl,
  },
  footerText: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  footerLink: {
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.racingRed,
  },
});
