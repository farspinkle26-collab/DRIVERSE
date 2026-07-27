/**
 * Driveverse — the OSM + community "nearby places" layer.
 *
 * Two pieces, on the Phase 1 tokens:
 *   PlaceDetailSheet  the callout for a tapped place
 *   SubmitPlaceFab    + SubmitPlaceModal, the community submission flow
 *
 * `PlacesFilterBar` and `PlacesMarkers` used to live here too. Both are
 * gone: POIs are the map's own layer now, rendered once in
 * app/(tabs)/map.tsx with clustering, and category selection belongs to
 * the Filters panel, which has real on/off state per category rather than
 * one active selection. Keeping a second marker renderer for the same data
 * would only let the two drift apart.
 *
 * The colour rule for the whole layer: **category is shape, state is
 * colour.** Each category has its own hand-drawn glyph (MapGlyphs.tsx) at
 * one stroke weight, and the only colour that varies is whether the thing
 * is active/selected (racingRed) or not (hairline + textSecondary). That
 * is what lets nine categories live inside a six-value palette; the
 * previous version needed a hue per category and spent four of the six.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Bookmark, Camera, Plus, X } from "lucide-react-native";
import * as ImagePickerExpo from "expo-image-picker";
import {
  chipContentColor,
  CutCornerButton,
  CutCornerChip,
  CutCornerSurface,
} from "@/components/CutCorner";
import {
  CHROME_ICON_STROKE,
  MAP_GLYPH_STROKE,
  PLACE_CATEGORY_GLYPHS,
} from "@/components/MapGlyphs";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  onRacingRed,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { useXP } from "@/hooks/useXPStore";
import { useSavedPlaces } from "@/hooks/useSavedPlacesStore";
import { platinum } from "@/constants/platinum";
import { uploadPlacePhoto } from "@/lib/uploadPlacePhoto";
import { supabase } from "@/lib/supabase";
import type { NormalizedPlace } from "@/lib/placesApi";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/constants/placesCategories";

export const PLACE_SUBMIT_XP = 15;

/* ------------------------------------------------------------------ *
 * Tap callout
 * ------------------------------------------------------------------ */

/** `1.2 km` / `840 m`, split so the unit can render in Inter beside the mono value. */
function formatDistance(meters: number): { value: string; unit: string } {
  if (meters < 1000) return { value: String(Math.round(meters)), unit: "m" };
  return { value: (meters / 1000).toFixed(1), unit: "km" };
}

/**
 * The callout for a tapped place. Carbon surface, hairline outline, one
 * cut corner — the same slab as a trip card.
 *
 * Type roles, per the token file: Rajdhani for the place name, Inter for
 * the description/notes/hours, JetBrains Mono for the distance and the
 * coordinates. The coordinates are new — a place callout that cannot tell
 * you where the place *is* was the one piece of information the sheet was
 * missing.
 */
export function PlaceDetailSheet({
  place,
  onClose,
  distanceMeters,
  bottomInset = 0,
}: {
  place: NormalizedPlace | null;
  onClose: () => void;
  /** Metres from the driver. Omitted when there is no GPS fix yet. */
  distanceMeters?: number | null;
  /** Clearance for the floating tab bar, supplied by the screen. */
  bottomInset?: number;
}) {
  if (!place) return null;
  const Glyph = PLACE_CATEGORY_GLYPHS[place.category];
  const openingHours = place.tags.opening_hours;
  const notes = place.tags.notes;
  const distance = distanceMeters != null ? formatDistance(distanceMeters) : null;

  return (
    <View style={[styles.sheetWrap, { paddingBottom: bottomInset }]} pointerEvents="box-none">
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.sheetCard}
      >
        <View style={styles.sheetHeader}>
          <CutCornerSurface
            fill={colors.voidBlack}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={spacing.spacingSm}
            corners="topRight"
            style={styles.sheetIconBadge}
            contentStyle={styles.sheetIconBadgeContent}
          >
            <Glyph size={spacing.spacingLg} color={colors.textPrimary} />
          </CutCornerSurface>
          <View style={styles.sheetHeaderText}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {PLACE_CATEGORY_LABELS[place.category]}
              {place.source === "user" ? " · Community" : " · OpenStreetMap"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close place details"
            onPress={onClose}
            hitSlop={spacing.spacingSm}
          >
            <X size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          </Pressable>
        </View>

        <View style={styles.sheetReadouts}>
          {distance ? (
            <View style={styles.sheetReadout}>
              <Text style={styles.sheetReadoutLabel}>AWAY</Text>
              <View style={styles.sheetReadoutValueRow}>
                <Text style={styles.sheetReadoutValue}>{distance.value}</Text>
                <Text style={styles.sheetReadoutUnit}>{distance.unit}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.sheetReadout}>
            <Text style={styles.sheetReadoutLabel}>COORDS</Text>
            <Text style={styles.sheetReadoutValue}>
              {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
            </Text>
          </View>
        </View>

        {place.source === "osm" && openingHours ? (
          <Text style={styles.sheetLine}>Open {openingHours}</Text>
        ) : null}
        {place.source === "user" ? (
          <>
            <Text style={styles.sheetLine}>Added by a Driveverse driver.</Text>
            {notes ? <Text style={styles.sheetLine}>{notes}</Text> : null}
          </>
        ) : null}

        <SavePlaceAction place={place} />
      </CutCornerSurface>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Save a place
 * ------------------------------------------------------------------ */

/**
 * The bookmark toggle on a place callout, plus the usage line beneath it.
 *
 * Regular drivers keep 10 saved places, Platinum is uncapped. The count is
 * on screen BEFORE the cap is hit ("7 of 10 saved") so the eleventh tap is
 * the expected outcome rather than a surprise; at the cap the store raises
 * the paywall on the Saved Places benefit.
 */
function SavePlaceAction({ place }: { place: NormalizedPlace }) {
  const { isSaved, togglePlace, count, cap } = useSavedPlaces();
  const [busy, setBusy] = useState(false);
  const saved = isSaved(place.id);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    await togglePlace({
      place_id: place.id,
      source: place.source,
      name: place.name,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
    });
    setBusy(false);
  };

  return (
    <View style={styles.saveRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
        onPress={onPress}
        disabled={busy}
        hitSlop={spacing.spacingSm}
        style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
      >
        <Bookmark
          size={spacing.spacingLg}
          color={saved ? platinum.chrome : colors.textSecondary}
          fill={saved ? platinum.chrome : "none"}
          strokeWidth={CHROME_ICON_STROKE}
        />
        <Text style={[styles.saveLabel, saved && styles.saveLabelActive]}>
          {saved ? "SAVED" : "SAVE"}
        </Text>
      </Pressable>
      {cap !== null ? (
        <Text style={styles.saveUsage}>
          {count} of {cap} saved
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Submit a place
 * ------------------------------------------------------------------ */

export function SubmitPlaceFab({ onPress, style }: { onPress: () => void; style?: object }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Submit a new place"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={style}
    >
      <CutCornerSurface
        fill={pressed ? alpha(colors.racingRed, 0.85) : colors.racingRed}
        borderColor={colors.racingRed}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        style={styles.fab}
        contentStyle={styles.fabContent}
      >
        <Plus size={spacing.spacingXl} color={onRacingRed} strokeWidth={MAP_GLYPH_STROKE} />
      </CutCornerSurface>
    </Pressable>
  );
}

/**
 * Category picker for the submit form. The one place a driver picks a
 * single category rather than toggling several, so it stays a chip row
 * rather than borrowing the Filters panel's checkbox list.
 */
function CategoryPicker({
  value,
  onChange,
}: {
  value: PlaceCategory;
  onChange: (category: PlaceCategory) => void;
}) {
  return (
    <View style={styles.categoryRow}>
      {PLACE_CATEGORIES.map((cat) => {
        const Glyph = PLACE_CATEGORY_GLYPHS[cat];
        const isActive = value === cat;
        return (
          <CutCornerChip
            key={cat}
            label={PLACE_CATEGORY_LABELS[cat]}
            active={isActive}
            accessibilityLabel={`Category: ${PLACE_CATEGORY_LABELS[cat]}`}
            onPress={() => onChange(cat)}
            icon={
              <Glyph
                size={spacing.spacingMd}
                color={chipContentColor(isActive)}
              />
            }
          />
        );
      })}
    </View>
  );
}

/**
 * Minimal inline photo picker, reskinned to the token system. The shared
 * `components/ImagePicker.tsx` still carries the legacy orange palette and
 * is used elsewhere, so rather than touch it this duplicates its (small)
 * pick/capture logic directly against `expo-image-picker`.
 */
function PhotoField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (uri: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS === "web") return true;
    const { status: cameraStatus } =
      await ImagePickerExpo.requestCameraPermissionsAsync();
    const { status: mediaStatus } =
      await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
    if (cameraStatus !== "granted" || mediaStatus !== "granted") {
      Alert.alert(
        "Permissions required",
        "Camera and photo library access is needed to add a photo."
      );
      return false;
    }
    return true;
  };

  const pickFrom = async (source: "camera" | "library") => {
    try {
      setLoading(true);
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;
      const result =
        source === "camera"
          ? await ImagePickerExpo.launchCameraAsync({
              mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.8,
            })
          : await ImagePickerExpo.launchImageLibraryAsync({
              mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.8,
            });
      if (!result.canceled && result.assets[0]) {
        onChange(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Couldn't get that photo", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const choose = () => {
    Alert.alert("Add a photo", undefined, [
      { text: "Camera", onPress: () => pickFrom("camera") },
      { text: "Photo Library", onPress: () => pickFrom("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>PHOTO (OPTIONAL)</Text>
      {value ? (
        <View style={styles.photoPreviewWrap}>
          <Image source={{ uri: value }} style={styles.photoPreview} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            onPress={() => onChange(null)}
            style={styles.photoRemoveBtn}
          >
            <X size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          onPress={choose}
          disabled={loading}
          style={styles.photoPickerBox}
        >
          <Camera size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          <Text style={styles.photoPickerText}>
            {loading ? "Loading…" : "Add photo"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function SubmitPlaceModal({
  visible,
  onClose,
  coordinate,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  coordinate: { latitude: number; longitude: number } | null;
  onSubmit: (input: {
    name: string;
    lat: number;
    lng: number;
    category: PlaceCategory;
    notes?: string;
    photoUrl?: string;
  }) => Promise<{ error: string | null }>;
}) {
  const { addXP } = useXP();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory>("cafe");
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setName("");
    setCategory("cafe");
    setNotes("");
    setPhotoUri(null);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!coordinate) return;
    if (!name.trim()) {
      setError("This place needs a name before it can be submitted. Type one above.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let photoUrl: string | undefined;
      if (photoUri) {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;
        if (userId) {
          photoUrl = await uploadPlacePhoto(userId, photoUri);
        }
      }
      const result = await onSubmit({
        name: name.trim(),
        lat: coordinate.latitude,
        lng: coordinate.longitude,
        category,
        notes: notes.trim() || undefined,
        photoUrl,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      addXP(PLACE_SUBMIT_XP);
      setSuccess(true);
      setTimeout(handleClose, 1400);
    } catch {
      setError("The submission didn't reach the server. Check your connection and tap Submit Place again.");
    } finally {
      setSubmitting(false);
    }
  };

  const SuccessGlyph = PLACE_CATEGORY_GLYPHS[category];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <CutCornerSurface
          fill={colors.carbonSurface}
          borderColor={colors.hairline}
          borderWidth={borderWidth.hairline}
          cutSize={cut.lg}
          corners="topRight"
          style={styles.modalSheet}
          contentStyle={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>SUBMIT A PLACE</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={handleClose}
              hitSlop={spacing.spacingSm}
            >
              <X size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            </Pressable>
          </View>

          {coordinate ? (
            <Text style={styles.modalCoords}>
              {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
            </Text>
          ) : null}

          {success ? (
            <View style={styles.successBox}>
              <SuccessGlyph size={spacing.spacingXxl} color={colors.racingRed} />
              <Text style={styles.successText}>Place added. +{PLACE_SUBMIT_XP} XP</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>NAME</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Warkop Kang Ujang"
                  placeholderTextColor={colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CATEGORY</Text>
                <CategoryPicker value={category} onChange={setCategory} />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  placeholder="What's good here?"
                  placeholderTextColor={colors.textSecondary}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </View>

              <PhotoField value={photoUri} onChange={setPhotoUri} />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {submitting ? (
                <View style={styles.submittingRow}>
                  <ActivityIndicator size="small" color={colors.racingRed} />
                  <Text style={styles.submittingText}>Sending…</Text>
                </View>
              ) : (
                <CutCornerButton
                  title="Submit Place"
                  onPress={handleSubmit}
                  disabled={submitting}
                  corners="topRight"
                  style={styles.submitBtn}
                />
              )}
            </ScrollView>
          )}
        </CutCornerSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /* Detail sheet */
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.spacingMd,
  },
  sheetCard: {
    padding: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
  },
  sheetIconBadge: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
  },
  sheetIconBadgeContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  sheetReadouts: {
    flexDirection: "row",
    gap: spacing.spacingXl,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingMd,
  },
  sheetReadout: {
    gap: spacing.spacingXs,
  },
  sheetReadoutLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  sheetReadoutValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  sheetReadoutValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  sheetReadoutUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  sheetLine: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  /* Save place */
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.spacingMd,
    paddingTop: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  savePressed: {
    opacity: 0.7,
  },
  saveLabel: {
    ...textStyle("caption"),
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  saveLabelActive: {
    color: platinum.chrome,
  },
  saveUsage: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  /* Submit FAB */
  fab: {
    width: spacing.spacingXxxl,
    height: spacing.spacingXxxl,
  },
  fabContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Submit modal */
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: alpha(colors.voidBlack, 0.75),
  },
  modalSheet: {
    maxHeight: "85%",
  },
  modalContent: {
    padding: spacing.spacingXl,
    gap: spacing.spacingMd,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  modalCoords: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  errorText: {
    ...textStyle("body"),
    color: colors.racingRed,
    marginBottom: spacing.spacingSm,
  },
  submitBtn: {
    marginTop: spacing.spacingSm,
  },
  submittingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingSm,
    marginTop: spacing.spacingSm,
    paddingVertical: spacing.spacingMd,
  },
  submittingText: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  successBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.spacingXxxl,
    gap: spacing.spacingMd,
  },
  successText: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  /* Form fields (name / category / notes / photo) */
  fieldGroup: {
    gap: spacing.spacingXs,
    marginBottom: spacing.spacingMd,
  },
  fieldLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
    color: colors.textPrimary,
    ...textStyle("body"),
  },
  textInputMultiline: {
    minHeight: spacing.spacingXxxl + spacing.spacingXl,
    textAlignVertical: "top",
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingSm,
  },
  photoPickerBox: {
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    minHeight: spacing.spacingXxxl + spacing.spacingXl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingXs,
  },
  photoPickerText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  photoPreviewWrap: {
    position: "relative",
    borderRadius: radius.sharp,
    overflow: "hidden",
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  photoPreview: {
    width: "100%",
    height: spacing.spacingXxxl * 2,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: spacing.spacingSm,
    right: spacing.spacingSm,
    backgroundColor: alpha(colors.voidBlack, 0.7),
    borderRadius: radius.sharp,
    padding: spacing.spacingXs,
  },
});
