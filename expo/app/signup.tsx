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
  Animated,
  Modal,
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
  CheckCircle2,
  Globe,
  Gauge,
  Check,
  X,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { usePreferences, LANGUAGES } from "@/hooks/usePreferencesStore";

const STEPS = ["account", "profile", "car", "preferences"] as const;
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
  const { signup, loading, error } = useAuth();
  const {
    currentLanguage,
    setLanguage,
    speedUnit,
    setSpeedUnit,
  } = usePreferences();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<Step>("account");
  const stepIndex = STEPS.indexOf(step);
  const progress = useRef(new Animated.Value(1 / STEPS.length)).current;

  const [langModal, setLangModal] = useState(false);

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
      case "preferences":
        return true; // language + units always have sensible defaults
      default:
        return false;
    }
  };

  const handleSignUp = async () => {
    if (!canGoNext()) return;

    const success = await signup(email.trim(), password, name.trim(), phone.trim());

    if (success) {
      // The starter car is auto-created by the DB trigger, but we can also
      // upsert with the user's chosen car via Supabase directly
      router.back();
    }
  };

  const isLastStep = step === "preferences";

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const stepTitle =
    step === "account" ? "Create Account"
    : step === "profile" ? "Your Drive"
    : step === "car" ? "Name Your Ride"
    : "Personalize";

  const stepSubtitle =
    step === "account" ? "Set up your login credentials"
    : step === "profile" ? "Choose your car's make and color"
    : step === "car" ? "Give your ride an identity"
    : "Language and how you like your speed shown";

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.bg} />
      {/* Decorative ambient glow orbs */}
      <View pointerEvents="none" style={styles.orbLayer}>
        <View style={[styles.orb, styles.orbOrange]} />
        <View style={[styles.orb, styles.orbPink]} />
        <View style={[styles.orb, styles.orbBlue]} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, paddingTop: insets.top + 16 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (stepIndex === 0 ? router.back() : prevStep())}
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

          {/* Quick language switcher — always available */}
          <TouchableOpacity
            style={styles.langPill}
            onPress={() => setLangModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.langPillFlag}>{currentLanguage.flag}</Text>
            <Text style={styles.langPillText}>{currentLanguage.code.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand mark */}
          <View style={styles.brand}>
            <LinearGradient
              colors={["#FF6B35", "#FF3B6F"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandBadge}
            >
              <Car size={30} color="#FFFFFF" strokeWidth={2.4} />
            </LinearGradient>
            <Text style={styles.brandName}>DRIVERSE</Text>
            <Text style={styles.brandTagline}>Build your driver profile</Text>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Step titles */}
          <View style={styles.stepTitleSection}>
            <View style={styles.stepTitleRow}>
              <View style={styles.stepAccent} />
              <Text style={styles.stepTitle}>{stepTitle}</Text>
            </View>
            <Text style={styles.stepSubtitle}>{stepSubtitle}</Text>
          </View>

          <View style={styles.formContent}>
            <View style={styles.card}>
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

            {/* ============ STEP 4: PREFERENCES ============ */}
            {step === "preferences" && (
              <View style={styles.stepForm}>
                {/* Language */}
                <View style={styles.prefHeaderRow}>
                  <View style={styles.prefIcon}>
                    <Globe size={18} color="#FF6B35" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefTitle}>Language</Text>
                    <Text style={styles.prefHint}>Choose your preferred language</Text>
                  </View>
                </View>
                <View style={styles.langList}>
                  {LANGUAGES.map((lang) => {
                    const active = currentLanguage.code === lang.code;
                    return (
                      <TouchableOpacity
                        key={lang.code}
                        style={[styles.langRow, active && styles.langRowActive]}
                        onPress={() => setLanguage(lang.code)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.langFlag}>{lang.flag}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.langName, active && styles.langNameActive]}>{lang.label}</Text>
                          <Text style={styles.langEnglish}>{lang.english}</Text>
                        </View>
                        {active && (
                          <View style={styles.langCheck}>
                            <Check size={14} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Speed units */}
                <View style={[styles.prefHeaderRow, { marginTop: 24 }]}>
                  <View style={styles.prefIcon}>
                    <Gauge size={18} color="#FF6B35" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefTitle}>Speed Units</Text>
                    <Text style={styles.prefHint}>How your speed and distance are shown</Text>
                  </View>
                </View>
                <View style={styles.unitToggle}>
                  {(["kmh", "mph"] as const).map((unit) => {
                    const active = speedUnit === unit;
                    return (
                      <TouchableOpacity
                        key={unit}
                        style={styles.unitOption}
                        onPress={() => setSpeedUnit(unit)}
                        activeOpacity={0.85}
                      >
                        {active ? (
                          <LinearGradient
                            colors={["#FF6B35", "#FF3B6F"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.unitOptionActive}
                          >
                            <Text style={styles.unitTextActive}>{unit === "kmh" ? "km/h" : "mph"}</Text>
                            <Text style={styles.unitSubActive}>
                              {unit === "kmh" ? "Kilometers" : "Miles"}
                            </Text>
                          </LinearGradient>
                        ) : (
                          <View style={styles.unitOptionInner}>
                            <Text style={styles.unitText}>{unit === "kmh" ? "km/h" : "mph"}</Text>
                            <Text style={styles.unitSub}>{unit === "kmh" ? "Kilometers" : "Miles"}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            </View>

            {/* Action button */}
            <TouchableOpacity
              style={[styles.actionBtn, !canGoNext() && styles.actionBtnDisabled]}
              onPress={isLastStep ? handleSignUp : nextStep}
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
                ) : isLastStep ? (
                  <Text style={styles.actionBtnText}>Create Account</Text>
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
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Language quick-select modal */}
      <Modal visible={langModal} animationType="fade" transparent onRequestClose={() => setLangModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setLangModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Globe size={18} color="#FF6B35" />
              <Text style={styles.modalTitle}>Change Language</Text>
              <TouchableOpacity onPress={() => setLangModal(false)} activeOpacity={0.7}>
                <X size={20} color="#8A8A9A" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map((lang) => {
                const active = currentLanguage.code === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.langRow, active && styles.langRowActive]}
                    onPress={() => {
                      setLanguage(lang.code);
                      setLangModal(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.langFlag}>{lang.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.langName, active && styles.langNameActive]}>{lang.label}</Text>
                      <Text style={styles.langEnglish}>{lang.english}</Text>
                    </View>
                    {active && (
                      <View style={styles.langCheck}>
                        <Check size={14} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  orbLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  orb: {
    position: "absolute",
    borderRadius: 260,
  },
  orbOrange: {
    width: 320,
    height: 320,
    top: -110,
    right: -90,
    backgroundColor: "rgba(255, 107, 53, 0.18)",
  },
  orbPink: {
    width: 300,
    height: 300,
    top: 180,
    left: -130,
    backgroundColor: "rgba(255, 59, 111, 0.14)",
  },
  orbBlue: {
    width: 340,
    height: 340,
    bottom: -140,
    right: -110,
    backgroundColor: "rgba(59, 130, 246, 0.10)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 14,
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
    gap: 8,
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
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
  langPillFlag: {
    fontSize: 15,
  },
  langPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EAEAEA",
    letterSpacing: 0.5,
  },
  brand: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  brandBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  brandName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 4,
  },
  brandTagline: {
    fontSize: 13,
    color: "#8A8A9A",
    fontWeight: "500",
    marginTop: 4,
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
    marginBottom: 18,
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  stepAccent: {
    width: 4,
    height: 26,
    borderRadius: 2,
    backgroundColor: "#FF6B35",
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  stepSubtitle: {
    fontSize: 15,
    color: "#8A8A9A",
    fontWeight: "500",
  },
  formContent: {
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    padding: 18,
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
  // --- Preferences step ---
  prefHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  prefIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 53, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  prefTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  prefHint: {
    fontSize: 12,
    color: "#8A8A9A",
    marginTop: 1,
  },
  langList: {
    gap: 8,
    marginTop: 4,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  langRowActive: {
    backgroundColor: "rgba(255, 107, 53, 0.12)",
    borderColor: "#FF6B35",
  },
  langFlag: {
    fontSize: 24,
  },
  langName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EAEAEA",
  },
  langNameActive: {
    color: "#FFFFFF",
  },
  langEnglish: {
    fontSize: 12,
    color: "#7A7A8A",
    marginTop: 1,
  },
  langCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  unitToggle: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  unitOption: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  unitOptionInner: {
    height: 74,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  unitOptionActive: {
    height: 74,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  unitText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#8A8A9A",
  },
  unitTextActive: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  unitSub: {
    fontSize: 11,
    color: "#6A6A7A",
    marginTop: 2,
    fontWeight: "600",
  },
  unitSubActive: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 2,
    fontWeight: "600",
  },
  actionBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 20,
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
    marginTop: 28,
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
  // --- Language modal ---
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#14141F",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingBottom: 34,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  modalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
