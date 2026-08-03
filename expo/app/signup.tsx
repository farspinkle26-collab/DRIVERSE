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
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
} from "lucide-react-native";
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

/**
 * Account creation only — email, or Google/Apple. Nation and car
 * customization used to live in this same wizard, which is how a social
 * sign-in ended up skipping them entirely: `signInWithGoogle`/`signInWithApple`
 * jumped straight to the garage gate the moment the OAuth round-trip
 * finished, never touching the later steps at all.
 *
 * Every path now lands on `/` after account creation, and `app/index.tsx`
 * routes a fresh account to `/customize-profile` before it ever reaches
 * `/select-car` — so customization happens exactly once, the same way,
 * regardless of how the account was created.
 */
export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signup, signInWithGoogle, signInWithApple, loading, error } = useAuth();
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length >= 6 && password === confirmPassword;

  const handleSignUp = async () => {
    if (!canSubmit) return;
    const success = await signup(email.trim(), password, name.trim(), phone.trim());
    if (success) {
      router.replace("/" as any);
    }
  };

  const handleGoogleSignUp = async () => {
    setSocialLoading("google");
    try {
      const success = await signInWithGoogle();
      if (success) router.replace("/" as any);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleAppleSignUp = async () => {
    setSocialLoading("apple");
    try {
      const success = await signInWithApple();
      if (success) router.replace("/" as any);
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, paddingTop: insets.top + spacing.spacingLg }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.spacingXxl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error */}
          {error ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          {/* Title */}
          <View style={styles.stepTitleSection}>
            <Text style={styles.stepTitle}>Create Account</Text>
            <Text style={styles.stepSubtitle}>Set up your login credentials</Text>
          </View>

          <View style={styles.formContent}>
            <View style={styles.stepForm}>
              <View style={styles.inputWrapper}>
                <User size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>

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
                <Phone size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number (optional)"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Lock size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Password (min. 6 chars)"
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

              <View style={styles.inputWrapper}>
                <Lock size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR SIGN UP WITH</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social Sign Up */}
              <View style={styles.socialGroup}>
                <CutCornerButton
                  title="Continue with Google"
                  variant="ghost"
                  onPress={handleGoogleSignUp}
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
                    onPress={handleAppleSignUp}
                    disabled={socialLoading !== null || loading}
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

              {/* Action button */}
              <CutCornerButton
                title="Create Account"
                onPress={handleSignUp}
                disabled={loading || !canSubmit}
                style={styles.actionBtn}
                icon={loading ? <ActivityIndicator size="small" color={colors.voidBlack} /> : undefined}
              />
            </View>
          </View>

          {/* Sign In link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidBlack,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.spacingLg,
    gap: spacing.spacingLg,
    marginBottom: spacing.spacingSm,
  },
  backBtn: {
    paddingVertical: spacing.spacingSm,
    paddingRight: spacing.spacingXs,
  },
  errorText: {
    ...textStyle("caption"),
    color: colors.racingRed,
    textAlign: "center",
    marginHorizontal: spacing.spacingXl,
    marginBottom: spacing.spacingLg,
  },
  stepTitleSection: {
    paddingHorizontal: spacing.spacingXl,
    marginBottom: spacing.spacingXl,
  },
  stepTitle: {
    ...textStyle("displayXl"),
    color: colors.textPrimary,
    marginBottom: spacing.spacingXs,
  },
  stepSubtitle: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  formContent: {
    paddingHorizontal: spacing.spacingXl,
  },
  stepForm: {
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
  actionBtn: {
    marginTop: spacing.spacingXl,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.spacingXxl,
    paddingBottom: spacing.spacingLg,
  },
  footerText: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  footerLink: {
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.racingRed,
  },
  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.spacingXl,
    marginBottom: spacing.spacingLg,
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
  socialGlyph: {
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textPrimary,
  },
});
