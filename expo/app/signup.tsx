import React, { useState, useRef } from "react";
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
  Dimensions,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Car,
  ChevronRight,
  Circle,
  CheckCircle2,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const STEPS = ["account", "profile", "car"] as const;
type Step = (typeof STEPS)[number];

const CAR_COLORS = [
  { name: "Racing Red", hex: "#EF4444" },
  { name: "Midnight Blue", hex: "#3B82F6" },
  { name: "Phantom Black", hex: "#1A1A1A" },
  { name: "Arctic White", hex: "#F9FAFB" },
  { name: "Solar Orange", hex: "#FF6B35" },
  { name: "Toxic Green", hex: "#22C55E" },
  { name: "Royal Purple", hex: "#8B5CF6" },
  { name: "Sunset Yellow", hex: "#F59E0B" },
];

const CAR_MAKES = [
  "Toyota", "Honda", "BMW", "Mercedes-Benz", "Audi", "Porsche",
  "Nissan", "Mitsubishi", "Suzuki", "Daihatsu", "Hyundai", "Kia",
  "Mazda", "Subaru", "Volkswagen", "Ford", "Chevrolet", "Lexus",
  "Ferrari", "Lamborghini", "Other",
];

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signup, signInWithGoogle, signInWithApple, loading, error } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);

  const [step, setStep] = useState<Step>("account");
  const stepIndex = STEPS.indexOf(step);
  const progress = useRef(new Animated.Value(0)).current;

  // Step 1: Account
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Profile
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedColor, setSelectedColor] = useState(CAR_COLORS[4]);

  // Step 3: Car name
  const [carName, setCarName] = useState("");
  const [carYear, setCarYear] = useState("2024");
  const [licensePlate, setLicensePlate] = useState("");

  const animateProgress = (to: number) => {
    Animated.timing(progress, {
      toValue: to,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const nextStep = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) {
      setStep(STEPS[nextIdx]);
      animateProgress((nextIdx + 1) / STEPS.length);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const prevStep = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) {
      setStep(STEPS[prevIdx]);
      animateProgress((prevIdx + 1) / STEPS.length);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const canGoNext = (): boolean => {
    switch (step) {
      case "account":
        return name.trim().length > 0 && email.trim().length > 0 && password.length >= 6 && password === confirmPassword;
      case "profile":
        return selectedMake.length > 0 && selectedColor != null;
      case "car":
        return carName.trim().length > 0 || true; // car name can be auto-set
      default:
        return false;
    }
  };

  const handleSignUp = async () => {
    if (!canGoNext()) return;

    const fullCarName = carName.trim() || `${selectedMake} ${carYear}`;
    const success = await signup(email.trim(), password, name.trim(), phone.trim());

    if (success) {
      // The starter car is auto-created by the DB trigger, but we can also
      // upsert with the user's chosen car via Supabase directly.
      // "/" re-runs the gate: signed in now, so it lands on the garage.
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

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.bg} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, paddingTop: insets.top + 20 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() =>
              stepIndex === 0
                ? router.canGoBack()
                  ? router.back()
                  : router.replace("/sign-in" as any)
                : prevStep()
            }
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <View style={styles.stepDots}>
              {STEPS.map((s, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <View key={s} style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                    {done ? (
                      <CheckCircle2 size={14} color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.stepDotText, active && styles.stepDotTextActive]}>{i + 1}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Step titles */}
          <View style={styles.stepTitleSection}>
            <Text style={styles.stepTitle}>
              {step === "account" ? "Create Account" : step === "profile" ? "Your Drive" : "Name Your Ride"}
            </Text>
            <Text style={styles.stepSubtitle}>
              {step === "account"
                ? "Set up your login credentials"
                : step === "profile"
                ? "Choose your car's make and color"
                : "Give your ride an identity"}
            </Text>
          </View>

          <View style={styles.formContent}>
            {/* ============ STEP 1: ACCOUNT ============ */}
            {step === "account" && (
              <View style={styles.stepForm}>
                <View style={styles.inputWrapper}>
                  <User size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor="#5A5A6E"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Mail size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="#5A5A6E"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Phone size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Phone number (optional)"
                    placeholderTextColor="#5A5A6E"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <Lock size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Password (min. 6 chars)"
                    placeholderTextColor="#5A5A6E"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} activeOpacity={0.7}>
                    {showPassword ? <EyeOff size={18} color="#5A5A6E" /> : <Eye size={18} color="#5A5A6E" />}
                  </TouchableOpacity>
                </View>

                <View style={styles.inputWrapper}>
                  <Lock size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor="#5A5A6E"
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                </View>

                {/* Divider */}
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or sign up with</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Social Sign Up */}
                <View style={styles.socialGroup}>
                  <TouchableOpacity
                    style={styles.googleBtn}
                    activeOpacity={0.7}
                    onPress={handleGoogleSignUp}
                    disabled={socialLoading !== null || loading}
                  >
                    <View style={styles.googleContent}>
                      {socialLoading === "google" ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <View style={styles.googleIcon}>
                            <Text style={styles.googleIconText}>G</Text>
                          </View>
                          <Text style={styles.googleText}>Continue with Google</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>

                  {Platform.OS === "ios" && (
                    <TouchableOpacity
                      style={styles.googleBtn}
                      activeOpacity={0.7}
                      onPress={handleAppleSignUp}
                      disabled={socialLoading !== null || loading}
                    >
                      <View style={styles.googleContent}>
                        {socialLoading === "apple" ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <View style={styles.googleIcon}>
                              <Text style={styles.googleIconText}></Text>
                            </View>
                            <Text style={styles.googleText}>Continue with Apple</Text>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* ============ STEP 2: CAR MAKE & COLOR ============ */}
            {step === "profile" && (
              <View style={styles.stepForm}>
                {/* Car make grid */}
                <Text style={styles.sectionLabel}>Car Make</Text>
                <View style={styles.makeGrid}>
                  {CAR_MAKES.map((make) => (
                    <TouchableOpacity
                      key={make}
                      style={[styles.makeChip, selectedMake === make && styles.makeChipSelected]}
                      onPress={() => setSelectedMake(make)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.makeChipText, selectedMake === make && styles.makeChipTextSelected]}>
                        {make}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Car Year */}
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Year</Text>
                <TextInput
                  style={styles.inputWrapper}
                  placeholder="e.g. 2024"
                  placeholderTextColor="#5A5A6E"
                  keyboardType="number-pad"
                  value={carYear}
                  onChangeText={setCarYear}
                />

                {/* Color picker */}
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Color</Text>
                <View style={styles.colorGrid}>
                  {CAR_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c.hex}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c.hex },
                        selectedColor?.hex === c.hex && styles.colorSwatchSelected,
                      ]}
                      onPress={() => setSelectedColor(c)}
                      activeOpacity={0.7}
                    >
                      {selectedColor?.hex === c.hex && <CheckCircle2 size={16} color="#FFFFFF" />}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ============ STEP 3: CAR NAME ============ */}
            {step === "car" && (
              <View style={styles.stepForm}>
                <View style={styles.carPreview}>
                  <LinearGradient
                    colors={[selectedColor?.hex ?? "#FF6B35", selectedColor?.hex ?? "#FF8A50"]}
                    style={styles.carPreviewBadge}
                  >
                    <Car size={40} color="#FFFFFF" />
                  </LinearGradient>
                  <Text style={styles.carPreviewMake}>{selectedMake || "Your Car"}</Text>
                </View>

                <View style={styles.inputWrapper}>
                  <Car size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Car nickname (e.g. 'Night Fury')"
                    placeholderTextColor="#5A5A6E"
                    value={carName}
                    onChangeText={setCarName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={[styles.inputWrapper, { marginTop: 14 }]}>
                  <Car size={18} color="#8A8A9A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="License plate (optional)"
                    placeholderTextColor="#5A5A6E"
                    value={licensePlate}
                    onChangeText={setLicensePlate}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            )}

            {/* Action button */}
            <TouchableOpacity
              style={[styles.actionBtn, !canGoNext() && styles.actionBtnDisabled]}
              onPress={step === "car" ? handleSignUp : nextStep}
              activeOpacity={0.8}
              disabled={loading || !canGoNext()}
            >
              <LinearGradient
                colors={canGoNext() ? ["#FF6B35", "#FF3B6F"] : ["#2A2A3A", "#2A2A3A"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : step === "car" ? (
                  <>
                    <Text style={styles.actionBtnText}>Create Account</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.actionBtnText}>Next</Text>
                    <ChevronRight size={18} color="#FFFFFF" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Sign In link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace("/sign-in" as any)} activeOpacity={0.7}>
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
    backgroundColor: "#060609",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 16,
    marginBottom: 10,
  },
  backBtn: {
    paddingVertical: 8,
    paddingRight: 4,
  },
  progressWrap: {
    flex: 1,
    gap: 10,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FF6B35",
    borderRadius: 2,
  },
  stepDots: {
    flexDirection: "row",
    gap: 10,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  stepDotDone: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
  },
  stepDotActive: {
    backgroundColor: "#FF6B3520",
    borderColor: "#FF6B35",
  },
  stepDotText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5A5A6E",
  },
  stepDotTextActive: {
    color: "#FF6B35",
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  errorText: {
    fontSize: 13,
    color: "#EF4444",
    textAlign: "center",
    fontWeight: "600",
  },
  stepTitleSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 15,
    color: "#8A8A9A",
    fontWeight: "500",
  },
  formContent: {
    paddingHorizontal: 24,
  },
  stepForm: {
    gap: 14,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5A5A6E",
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  makeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  makeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  makeChipSelected: {
    backgroundColor: "rgba(255, 107, 53, 0.15)",
    borderColor: "#FF6B35",
  },
  makeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  makeChipTextSelected: {
    color: "#FF6B35",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchSelected: {
    borderColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  carPreview: {
    alignItems: "center",
    marginBottom: 20,
  },
  carPreviewBadge: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  carPreviewMake: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  actionBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 24,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 32,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 14,
    color: "#8A8A9A",
  },
  footerLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B35",
  },
  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 18,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  dividerText: {
    fontSize: 12,
    color: "#5A5A6E",
    fontWeight: "600",
  },
  // Social
  socialGroup: {
    gap: 12,
  },
  googleBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 14,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  googleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  googleIconText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#000000",
  },
  googleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
