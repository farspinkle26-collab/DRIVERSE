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
  Car,
  ChevronRight,
  CheckCircle2,
  Search,
  Navigation,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useActiveCar } from "@/hooks/useActiveCarStore";
import { supabase } from "@/lib/supabase";
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

const STEPS = ["nation", "profile", "car"] as const;
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

/**
 * The customization step every signup path funnels through exactly once —
 * email, Google and Apple alike — before the garage gate. `app/index.tsx`
 * routes here whenever `needsProfileCustomization` is true (a profile with
 * no `registration_completed_at`), so a social sign-in can no longer skip
 * straight past nation and car setup the way it used to.
 */
export default function CustomizeProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, completeProfileCustomization, error, logout } = useAuth();
  const { cars, loadingCars, refreshCars } = useActiveCar();
  const scrollRef = useRef<ScrollView>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("nation");
  const stepIndex = STEPS.indexOf(step);
  const progress = useRef(new Animated.Value((stepIndex + 1) / STEPS.length)).current;

  // Step 1: Nation
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [detectingCountry, setDetectingCountry] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  // Step 2: Car make & color
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedColor, setSelectedColor] = useState(CAR_COLORS[4]);

  // Step 3: Car identity
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

  // Nothing to go back to from the first step — this screen only exists
  // because an account was just created. Back out by signing out again.
  const handleAbandon = async () => {
    await logout();
    router.replace("/login" as any);
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
      case "nation":
        return selectedCountry != null;
      case "profile":
        return selectedMake.length > 0 && selectedColor != null;
      case "car":
        return true; // car name can be auto-set
      default:
        return false;
    }
  };

  const handleFinish = async () => {
    if (!canGoNext() || !user) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const fullCarName = carName.trim() || `${selectedMake} ${carYear}`;

      // The DB trigger already created a starter car on account creation
      // (email, Google or Apple alike) — this fills it in with what the
      // driver actually picked instead of leaving "Starter Ride" behind.
      const primaryCar = cars.find((c) => c.is_primary) ?? cars[0];
      if (primaryCar) {
        await supabase
          .from("car_collections")
          .update({
            name: fullCarName,
            make: selectedMake,
            year: carYear,
            color: selectedColor.hex,
            color_name: selectedColor.name,
            license_plate: licensePlate.trim() || null,
          })
          .eq("id", primaryCar.id);
        await refreshCars();
      }

      const success = await completeProfileCustomization(selectedCountry?.name);
      if (success) {
        router.replace("/select-car" as any);
      } else {
        setLocalError("Couldn't save your profile. Please try again.");
      }
    } finally {
      setSubmitting(false);
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
            onPress={() => (stepIndex === 0 ? handleAbandon() : prevStep())}
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
          {(localError || error) ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {localError || error}
            </Text>
          ) : null}

          {/* Step titles */}
          <View style={styles.stepTitleSection}>
            <Text style={styles.stepTitle}>
              {step === "nation" ? "Your Nation" : step === "profile" ? "Your Drive" : "Name Your Ride"}
            </Text>
            <Text style={styles.stepSubtitle}>
              {step === "nation"
                ? "Pick your nation or detect it automatically"
                : step === "profile"
                ? "Choose your car's make and color"
                : "Give your ride an identity"}
            </Text>
          </View>

          <View style={styles.formContent}>
            {/* ============ STEP 1: NATION ============ */}
            {step === "nation" && (
              <View style={styles.stepForm}>
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

                {selectedCountry && (
                  <View style={styles.selectedCountry}>
                    <Text style={styles.selectedCountryFlag}>{selectedCountry.flag}</Text>
                    <Text style={styles.selectedCountryName}>{selectedCountry.name}</Text>
                    <CheckCircle2 size={18} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
                  </View>
                )}

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

            {/* ============ STEP 2: CAR MAKE & COLOR ============ */}
            {step === "profile" && (
              <View style={styles.stepForm}>
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

            {/* ============ STEP 3: CAR NAME ============ */}
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
              title={step === "car" ? "Enter the Garage" : "Next"}
              onPress={step === "car" ? handleFinish : nextStep}
              disabled={submitting || loadingCars || !canGoNext()}
              style={styles.actionBtn}
              trailingIcon={
                !submitting && step !== "car" ? (
                  <ChevronRight size={18} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                ) : undefined
              }
              icon={submitting ? <ActivityIndicator size="small" color={colors.voidBlack} /> : undefined}
            />
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
});
