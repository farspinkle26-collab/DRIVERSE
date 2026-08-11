import React, { useState, useRef, useCallback } from "react";
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
  Image,
} from "react-native";
import * as ImagePickerExpo from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  ArrowLeft,
  Camera as CameraIcon,
  Car,
  ChevronRight,
  CheckCircle2,
  Search,
  Navigation,
  Sparkles,
  User as UserIcon,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { uploadCarPhoto } from "@/lib/uploadCarPhoto";
import { useActiveCar } from "@/hooks/useActiveCarStore";
import { supabase } from "@/lib/supabase";
import { COUNTRIES, findCountryByCode, type Country } from "@/constants/countries";
import { CutCornerButton, CutCornerChip, CutCornerSurface } from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import { appAlert } from "@/lib/appAlert";
import { isOnboardingReviewPrompt, requestStoreReview } from "@/lib/storeReview";
import {
  borderWidth,
  colors,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

/**
 * Four steps, and the first one is skippable on purpose.
 *
 * `photo` leads because a driver's face is what every other driver sees on
 * the map, in a convoy and in chat — an account that reaches the map with the
 * default avatar is one the rest of the app cannot tell apart. It is still
 * skippable: a signup that hard-blocks on "find a photo of yourself right
 * now" loses the people who do not have one to hand, and the profile screen
 * can set it later just as well.
 *
 * `car` gained a **model** field. `car_collections.model` has existed since
 * the garage migration and nothing has ever written to it — the make alone
 * turns every Toyota in the app into the same car.
 */
const STEPS = ["photo", "nation", "car", "identity"] as const;
type Step = (typeof STEPS)[number];

const STEP_COPY: Record<Step, { title: string; subtitle: string }> = {
  photo: {
    title: "Your Face",
    subtitle: "This is what other drivers see on the map. You can add it later.",
  },
  nation: {
    title: "Your Nation",
    subtitle: "Pick your nation or detect it automatically",
  },
  car: {
    title: "Your Drive",
    subtitle: "Make, model and colour — what you actually drive",
  },
  identity: {
    title: "Name Your Ride",
    subtitle: "Give your ride an identity",
  },
};

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
 * One recognisable model per make, used only as the model field's placeholder.
 *
 * This is a hint, not a vocabulary — the field is free text and accepts
 * anything. The point is that "e.g. Supra" under Toyota tells the driver what
 * kind of answer the box wants far faster than the word "Model" does.
 */
const MODEL_HINTS: Record<string, string> = {
  Toyota: "Supra",
  Honda: "Civic",
  BMW: "M3",
  "Mercedes-Benz": "C-Class",
  Audi: "RS6",
  Porsche: "911",
  Nissan: "Skyline",
  Mitsubishi: "Lancer",
  Suzuki: "Swift",
  Daihatsu: "Ayla",
  Hyundai: "Ioniq",
  Kia: "Stinger",
  Mazda: "RX-7",
  Subaru: "WRX",
  Volkswagen: "Golf",
  Ford: "Mustang",
  Chevrolet: "Camaro",
  Lexus: "IS",
  Ferrari: "488",
  Lamborghini: "Huracán",
};

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
  const { user, completeProfileCustomization, updateProfilePicture, error, logout } = useAuth();
  const { cars, loadingCars, refreshCars } = useActiveCar();
  const scrollRef = useRef<ScrollView>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("photo");
  const stepIndex = STEPS.indexOf(step);
  const progress = useRef(new Animated.Value((stepIndex + 1) / STEPS.length)).current;
  // Guards the store-review prompt to once per screen mount — a driver who
  // steps back to "nation" and forward again must not see it twice.
  const reviewPromptedRef = useRef(false);

  // Step 1: Profile photo. Local URI only — the upload happens on finish, so
  // a driver who backs out of signup has not written anything to storage.
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);

  // Step 2: Nation
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [detectingCountry, setDetectingCountry] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  // Step 3: Car make, model & color
  const [selectedMake, setSelectedMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [selectedColor, setSelectedColor] = useState(CAR_COLORS[4]);

  // Step 4: Car identity, and the optional photo of the real car
  const [carName, setCarName] = useState("");
  const [carYear, setCarYear] = useState("2024");
  const [carPhotoUri, setCarPhotoUri] = useState<string | null>(null);
  const [pickingCarPhoto, setPickingCarPhoto] = useState(false);

  /**
   * Picks an image, from the camera or the library.
   *
   * `expo-image-picker` is already a static import on this screen and has been
   * since before the migration, so there is no new module-scope native reach
   * here (LAUNCH_SAFETY_REFERENCE.md §10) — but the permission request and the
   * picker call both happen inside this handler, never at module scope.
   *
   * A denied permission is not an error state: the driver is told once and the
   * step stays skippable, because neither photo is required to finish signup.
   */
  const pickImage = useCallback(
    async (useCamera: boolean, aspect: [number, number]): Promise<string | null> => {
      const perm = useCamera
        ? await ImagePickerExpo.requestCameraPermissionsAsync()
        : await ImagePickerExpo.requestMediaLibraryPermissionsAsync();

      if (perm.status !== "granted") {
        appAlert(
          useCamera ? "Camera access is off" : "Photo access is off",
          "Driveverse can't open it without permission. Turn it on in Settings, or skip this step — you can add a photo later from your profile."
        );
        return null;
      }

      const result = useCamera
        ? await ImagePickerExpo.launchCameraAsync({ allowsEditing: true, aspect, quality: 0.8 })
        : await ImagePickerExpo.launchImageLibraryAsync({ allowsEditing: true, aspect, quality: 0.8 });

      if (result.canceled || !result.assets?.[0]) return null;
      return result.assets[0].uri;
    },
    []
  );

  const chooseAvatar = useCallback(() => {
    const run = async (useCamera: boolean) => {
      setPickingAvatar(true);
      try {
        const uri = await pickImage(useCamera, [1, 1]);
        if (uri) setAvatarUri(uri);
      } catch {
        appAlert("That didn't work", "Something went wrong opening your photos. Try again, or skip for now.");
      } finally {
        setPickingAvatar(false);
      }
    };

    appAlert("Profile photo", "Where should we get it from?", [
      { text: "Take a photo", onPress: () => void run(true) },
      { text: "Choose from library", onPress: () => void run(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickImage]);

  const chooseCarPhoto = useCallback(() => {
    const run = async (useCamera: boolean) => {
      setPickingCarPhoto(true);
      try {
        // 4:3 rather than square — a car is wider than it is tall, and a
        // square crop of one is mostly bodywork with the ends cut off.
        const uri = await pickImage(useCamera, [4, 3]);
        if (uri) setCarPhotoUri(uri);
      } catch {
        appAlert("That didn't work", "Something went wrong opening your photos. Try again, or skip for now.");
      } finally {
        setPickingCarPhoto(false);
      }
    };

    appAlert("Photo of your car", "Where should we get it from?", [
      { text: "Take a photo", onPress: () => void run(true) },
      { text: "Choose from library", onPress: () => void run(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickImage]);

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

      // The midpoint of onboarding — mid-flow, not mid-app. A driver who has
      // stayed for two steps of four is already invested and has not yet had
      // the chance to churn out silently; asking here, rather than after a
      // trip or a rank-up, is what puts brand-new drivers in the review pool
      // at all, not just the ones who stuck around. See lib/storeReview.ts.
      if (
        !reviewPromptedRef.current &&
        isOnboardingReviewPrompt(nextIdx, STEPS.length)
      ) {
        reviewPromptedRef.current = true;
        void requestStoreReview();
      }
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
      // Deliberately always true: the photo is optional, and the button
      // reads "Skip for now" until one is picked rather than sitting there
      // disabled with nothing explaining why.
      case "photo":
        return true;
      case "nation":
        return selectedCountry != null;
      case "car":
        return selectedMake.length > 0 && selectedColor != null;
      case "identity":
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
      // The nickname falls back to make + model + year, which is a better
      // default than make + year now that the model is collected: "Toyota
      // Supra 2024" rather than "Toyota 2024".
      const fullCarName =
        carName.trim() ||
        [selectedMake, carModel.trim(), carYear].filter(Boolean).join(" ");

      // The profile photo is uploaded here rather than when it was picked, so
      // abandoning signup leaves nothing behind in storage. A failed upload is
      // not a failed signup: `updateProfilePicture` already falls back to the
      // local URI, and the driver can set it again from their profile.
      if (avatarUri) {
        try {
          await updateProfilePicture(avatarUri);
        } catch {
          // Non-fatal on purpose — see above.
        }
      }

      // The DB trigger already created a starter car on account creation
      // (email, Google or Apple alike) — this fills it in with what the
      // driver actually picked instead of leaving "Starter Ride" behind.
      const primaryCar = cars.find((c) => c.is_primary) ?? cars[0];
      if (primaryCar) {
        let photoUrl: string | null = null;
        if (carPhotoUri) {
          try {
            photoUrl = await uploadCarPhoto(user.id, primaryCar.id, carPhotoUri);
          } catch {
            // Same rule as the avatar: a photo that would not upload does not
            // cost the driver their car details or block them from the garage.
          }
        }

        await supabase
          .from("car_collections")
          .update({
            name: fullCarName,
            make: selectedMake,
            model: carModel.trim(),
            year: carYear,
            color: selectedColor.hex,
            color_name: selectedColor.name,
            ...(photoUrl ? { photo_url: photoUrl } : {}),
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
            <Text style={styles.stepTitle}>{STEP_COPY[step].title}</Text>
            <Text style={styles.stepSubtitle}>{STEP_COPY[step].subtitle}</Text>
          </View>

          <View style={styles.formContent}>
            {/* ============ STEP 1: PROFILE PHOTO ============
                Optional, and the screen says so rather than implying it with
                a greyed-out button. The preview is the same circle the map
                marker and the profile header use, so what the driver picks
                here is what they will actually see. */}
            {step === "photo" && (
              <View style={styles.stepForm}>
                <View style={styles.avatarStage}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={avatarUri ? "Change your profile photo" : "Add a profile photo"}
                    onPress={chooseAvatar}
                    disabled={pickingAvatar}
                    activeOpacity={0.8}
                    style={styles.avatarRing}
                  >
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                    ) : (
                      <UserIcon size={44} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                    )}

                    <View style={styles.avatarCameraBadge}>
                      {pickingAvatar ? (
                        <ActivityIndicator size="small" color={colors.voidBlack} />
                      ) : (
                        <CameraIcon size={16} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                      )}
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.avatarHint}>
                    {avatarUri
                      ? "Looking good. Tap the photo to change it."
                      : "Tap to add a photo — or skip and add one later from your profile."}
                  </Text>

                  {avatarUri && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Remove the photo"
                      onPress={() => setAvatarUri(null)}
                      hitSlop={spacing.spacingSm}
                    >
                      <Text style={styles.avatarRemove}>Remove photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* ============ STEP 2: NATION ============ */}
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
            {step === "car" && (
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

                {/* Model is free text, not a picker: the make list is twenty
                    entries and closed, but every make has dozens of models and
                    a closed list would be wrong for somebody on day one. It is
                    optional — a driver who does not know or care still gets a
                    car, they just get "Toyota" instead of "Toyota Supra". */}
                <Text style={[styles.sectionLabel, { marginTop: spacing.spacingXl }]}>
                  Model <Text style={styles.sectionLabelOptional}>· optional</Text>
                </Text>
                <View style={styles.inputWrapper}>
                  <Car size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder={selectedMake ? `e.g. ${MODEL_HINTS[selectedMake] ?? "Model"}` : "e.g. Supra"}
                    placeholderTextColor={colors.textSecondary}
                    value={carModel}
                    onChangeText={setCarModel}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
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
            {step === "identity" && (
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

                {/* No license plate field, deliberately. A plate identifies a
                    real vehicle and, through it, a person — it is the one
                    thing a driver could enter here that would follow them
                    off the app, and nothing in Driveverse reads it. Do not
                    add it back without a feature that needs it. */}

                {/* ---- Optional photo of the real car ----
                    Offered, never required, and deliberately not gated behind
                    anything: the photo is useful on its own (it is what the
                    garage and the share card show) and it is also the input
                    the AI showcase needs later. The showcase itself is NOT
                    generated here — see the note below. */}
                <Text style={[styles.sectionLabel, { marginTop: spacing.spacingXl }]}>
                  Photo of your car <Text style={styles.sectionLabelOptional}>· optional</Text>
                </Text>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={carPhotoUri ? "Change the photo of your car" : "Add a photo of your car"}
                  onPress={chooseCarPhoto}
                  disabled={pickingCarPhoto}
                  activeOpacity={0.8}
                  style={styles.carPhotoDrop}
                >
                  {carPhotoUri ? (
                    <Image source={{ uri: carPhotoUri }} style={styles.carPhotoImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.carPhotoEmpty}>
                      {pickingCarPhoto ? (
                        <ActivityIndicator size="small" color={colors.racingRed} />
                      ) : (
                        <CameraIcon size={26} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                      )}
                      <Text style={styles.carPhotoEmptyText}>Add a photo of your car</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {carPhotoUri && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Remove the car photo"
                    onPress={() => setCarPhotoUri(null)}
                    hitSlop={spacing.spacingSm}
                  >
                    <Text style={styles.avatarRemove}>Remove photo</Text>
                  </TouchableOpacity>
                )}

                {/* ---- The AI showcase, mentioned but not run ----
                    WHY IT IS A NOTE AND NOT A BUTTON HERE. Generating a
                    showcase costs money per call and is Platinum-only —
                    `lib/aiShowcase.ts`, gated server-side in the
                    `generate-showcase` edge function, with a monthly quota
                    that `ai_showcases` ledgers. Putting that call on the
                    signup path would mean either spending on accounts that
                    have not driven anywhere yet, or showing a paywall to
                    someone who has not seen the app work. Neither is a good
                    first impression, and the request was explicitly that this
                    not be a must.

                    So signup collects the input the feature needs and tells
                    the driver the feature exists. The garage runs it, once
                    they have a reason to want it. */}
                <View style={styles.showcaseNote}>
                  <Sparkles size={16} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                  <Text style={styles.showcaseNoteText}>
                    Added a photo? You can turn it into an AI studio shot of your car from
                    your garage later — no need to do it now.
                  </Text>
                </View>
              </View>
            )}

            {/* Action button */}
            <CutCornerButton
              title={
                step === "identity"
                  ? "Enter the Garage"
                  : step === "photo" && !avatarUri
                    ? "Skip for now"
                    : "Next"
              }
              onPress={step === "identity" ? handleFinish : nextStep}
              disabled={submitting || loadingCars || !canGoNext()}
              style={styles.actionBtn}
              trailingIcon={
                !submitting && step !== "identity" ? (
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
  /** "· optional" beside a label — same size, less weight, so it reads as an
   *  aside rather than part of the field name. */
  sectionLabelOptional: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 0,
  },

  /* ---------------- Step 1: profile photo ---------------- */
  avatarStage: {
    alignItems: "center",
    gap: spacing.spacingLg,
    paddingVertical: spacing.spacingXl,
  },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    // The badge hangs off the bottom-right of the circle.
    position: "relative",
  },
  avatarImage: {
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  avatarCameraBadge: {
    position: "absolute",
    right: 0,
    bottom: spacing.spacingXs,
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: spacing.spacingXl,
    backgroundColor: colors.racingRed,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borderWidth.emphasis,
    borderColor: colors.voidBlack,
  },
  avatarHint: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.spacingLg,
  },
  avatarRemove: {
    ...textStyle("caption"),
    color: colors.racingRed,
    textAlign: "center",
    marginTop: spacing.spacingSm,
  },

  /* ---------------- Step 4: car photo ---------------- */
  carPhotoDrop: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  carPhotoImage: {
    width: "100%",
    height: "100%",
  },
  carPhotoEmpty: {
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  carPhotoEmptyText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  showcaseNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.spacingSm,
    marginTop: spacing.spacingLg,
    padding: spacing.spacingMd,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
  },
  showcaseNoteText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 17,
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
