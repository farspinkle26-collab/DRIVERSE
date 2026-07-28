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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
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
  Search,
  Navigation,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { COUNTRIES, findCountryByCode, type Country } from "@/constants/countries";
import { CutCornerButton, CutCornerChip, CutCornerSurface } from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import {
  borderWidth,
  colors,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const STEPS = ["account", "nation", "profile", "car"] as const;
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

  // Step 2: Nation
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [detectingCountry, setDetectingCountry] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  // Step 3: Profile
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedColor, setSelectedColor] = useState(CAR_COLORS[4]);

  // Step 4: Car name
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

  const detectCountry = async () => {
    setDetectError(null);
    setDetectingCountry(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setDetectError("Location permission denied. Pick your nation from the list.");
        return;
      }
      const pos =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const match = findCountryByCode(place?.isoCountryCode);
      if (match) {
        setSelectedCountry(match);
        setCountryQuery("");
      } else if (place?.country) {
        // Fall back to the raw name if it's not in our list.
        setSelectedCountry({ code: place.isoCountryCode ?? "", name: place.country, flag: "🌍" });
        setCountryQuery("");
      } else {
        setDetectError("Couldn't detect your nation. Pick it from the list.");
      }
    } catch {
      setDetectError("Couldn't detect your nation. Pick it from the list.");
    } finally {
      setDetectingCountry(false);
    }
  };

  const filteredCountries = countryQuery.trim().length > 0
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(countryQuery.trim().toLowerCase()))
    : COUNTRIES;

  const canGoNext = (): boolean => {
    switch (step) {
      case "account":
        return name.trim().length > 0 && email.trim().length > 0 && password.length >= 6 && password === confirmPassword;
      case "nation":
        return selectedCountry != null;
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
    const success = await signup(email.trim(), password, name.trim(), phone.trim(), selectedCountry?.name);

    if (success) {
      // The starter car is auto-created by the DB trigger, but we can also
      // upsert with the user's chosen car via Supabase directly
      router.replace("/select-car" as any);
    }
  };

  const handleGoogleSignUp = async () => {
    setSocialLoading("google");
    try {
      const success = await signInWithGoogle();
      if (success) router.replace("/select-car" as any);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleAppleSignUp = async () => {
    setSocialLoading("apple");
    try {
      const success = await signInWithApple();
      if (success) router.replace("/select-car" as any);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, paddingTop: insets.top + spacing.spacingLg }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (stepIndex === 0 ? router.back() : prevStep())}
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
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
                      <CheckCircle2 size={12} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
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

          {/* Step titles */}
          <View style={styles.stepTitleSection}>
            <Text style={styles.stepTitle}>
              {step === "account"
                ? "Create Account"
                : step === "nation"
                ? "Your Nation"
                : step === "profile"
                ? "Your Drive"
                : "Name Your Ride"}
            </Text>
            <Text style={styles.stepSubtitle}>
              {step === "account"
                ? "Set up your login credentials"
                : step === "nation"
                ? "Pick your nation or detect it automatically"
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
              </View>
            )}

            {/* ============ STEP 2: NATION ============ */}
            {step === "nation" && (
              <View style={styles.stepForm}>
                {/* GPS auto-detect */}
                <CutCornerButton
                  title={detectingCountry ? "Detecting your location…" : "Detect with GPS"}
                  variant="outline"
                  onPress={detectCountry}
                  disabled={detectingCountry}
                  icon={
                    detectingCountry ? (
                      <ActivityIndicator size="small" color={colors.racingRed} />
                    ) : (
                      <Navigation size={18} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                    )
                  }
                />

                {detectError ? <Text style={styles.detectError}>{detectError}</Text> : null}

                {/* Selected nation */}
                {selectedCountry && (
                  <View style={styles.selectedCountry}>
                    <Text style={styles.selectedCountryFlag}>{selectedCountry.flag}</Text>
                    <Text style={styles.selectedCountryName}>{selectedCountry.name}</Text>
                    <CheckCircle2 size={18} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
                  </View>
                )}

                {/* Search */}
                <View style={styles.inputWrapper}>
                  <Search size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Search nations"
                    placeholderTextColor={colors.textSecondary}
                    value={countryQuery}
                    onChangeText={setCountryQuery}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>

                {/* Nation list */}
                <View style={styles.countryList}>
                  {filteredCountries.map((c) => {
                    const active = selectedCountry?.code === c.code && selectedCountry?.name === c.name;
                    return (
                      <TouchableOpacity
                        key={c.code}
                        style={[styles.countryRow, active && styles.countryRowActive]}
                        onPress={() => { setSelectedCountry(c); setDetectError(null); }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.countryFlag}>{c.flag}</Text>
                        <Text style={[styles.countryName, active && styles.countryNameActive]}>{c.name}</Text>
                        {active && <CheckCircle2 size={16} color={colors.textPrimary} strokeWidth={ICON_STROKE} />}
                      </TouchableOpacity>
                    );
                  })}
                  {filteredCountries.length === 0 && (
                    <Text style={styles.countryEmpty}>No nations match “{countryQuery.trim()}”.</Text>
                  )}
                </View>
              </View>
            )}

            {/* ============ STEP 3: CAR MAKE & COLOR ============ */}
            {step === "profile" && (
              <View style={styles.stepForm}>
                {/* Car make grid */}
                <Text style={styles.sectionLabel}>Car Make</Text>
                <View style={styles.makeGrid}>
                  {CAR_MAKES.map((make) => (
                    <CutCornerChip
                      key={make}
                      label={make}
                      active={selectedMake === make}
                      onPress={() => setSelectedMake(make)}
                    />
                  ))}
                </View>

                {/* Car Year */}
                <Text style={[styles.sectionLabel, { marginTop: spacing.spacingXl }]}>Year</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2024"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="number-pad"
                    value={carYear}
                    onChangeText={setCarYear}
                  />
                </View>

                {/* Color picker */}
                <Text style={[styles.sectionLabel, { marginTop: spacing.spacingXl }]}>Color</Text>
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
                      {selectedColor?.hex === c.hex && (
                        <CheckCircle2 size={16} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ============ STEP 4: CAR NAME ============ */}
            {step === "car" && (
              <View style={styles.stepForm}>
                <View style={styles.carPreview}>
                  <CutCornerSurface
                    fill={selectedColor?.hex ?? colors.racingRed}
                    borderColor={colors.hairline}
                    style={styles.carPreviewBadge}
                    contentStyle={styles.carPreviewBadgeContent}
                  >
                    <Car size={36} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                  </CutCornerSurface>
                  <Text style={styles.carPreviewMake}>{selectedMake || "Your Car"}</Text>
                </View>

                <View style={styles.inputWrapper}>
                  <Car size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Car nickname (e.g. 'Night Fury')"
                    placeholderTextColor={colors.textSecondary}
                    value={carName}
                    onChangeText={setCarName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={[styles.inputWrapper, { marginTop: spacing.spacingMd }]}>
                  <Car size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="License plate (optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={licensePlate}
                    onChangeText={setLicensePlate}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            )}

            {/* Action button */}
            <CutCornerButton
              title={step === "car" ? "Create Account" : "Next"}
              onPress={step === "car" ? handleSignUp : nextStep}
              disabled={loading || !canGoNext()}
              style={styles.actionBtn}
              trailingIcon={
                !loading && step !== "car" ? (
                  <ChevronRight size={18} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                ) : undefined
              }
              icon={loading ? <ActivityIndicator size="small" color={colors.voidBlack} /> : undefined}
            />
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
  progressWrap: {
    flex: 1,
    gap: spacing.spacingSm,
  },
  progressTrack: {
    height: borderWidth.hairline * 3,
    backgroundColor: colors.hairline,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.racingRed,
  },
  stepDots: {
    flexDirection: "row",
    gap: spacing.spacingSm,
  },
  stepDot: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  stepDotDone: {
    backgroundColor: colors.hairline,
    borderColor: colors.textPrimary,
  },
  stepDotActive: {
    backgroundColor: colors.carbonSurface,
    borderColor: colors.racingRed,
  },
  stepDotText: {
    ...textStyle("caption", { fontFamily: fontFamily.dataMedium }),
    fontSize: 11,
    color: colors.textSecondary,
  },
  stepDotTextActive: {
    color: colors.racingRed,
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
  sectionLabel: {
    ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold }),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  // Nation step
  detectError: {
    ...textStyle("caption"),
    color: colors.racingRed,
  },
  selectedCountry: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.textPrimary,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingLg,
    height: 52,
  },
  selectedCountryFlag: {
    fontSize: 22,
  },
  selectedCountryName: {
    flex: 1,
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textPrimary,
  },
  countryList: {
    gap: spacing.spacingXs,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
    height: 48,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  countryRowActive: {
    backgroundColor: colors.hairline,
    borderColor: colors.textPrimary,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryName: {
    flex: 1,
    ...textStyle("body", { fontFamily: fontFamily.bodyMedium }),
    fontSize: 14,
    color: colors.textSecondary,
  },
  countryNameActive: {
    color: colors.textPrimary,
  },
  countryEmpty: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
    paddingVertical: spacing.spacingLg,
  },
  makeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingSm,
    marginTop: spacing.spacingSm,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingMd,
    marginTop: spacing.spacingSm,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: radius.sharp,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  colorSwatchSelected: {
    borderWidth: borderWidth.emphasis,
    borderColor: colors.textPrimary,
  },
  carPreview: {
    alignItems: "center",
    marginBottom: spacing.spacingXl,
  },
  carPreviewBadge: {
    width: 80,
    height: 80,
    marginBottom: spacing.spacingMd,
  },
  carPreviewBadgeContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  carPreviewMake: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
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
