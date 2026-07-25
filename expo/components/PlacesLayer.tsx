/**
 * Driveverse — the OSM + community "nearby places" layer.
 *
 * Four pieces, all rebuilt on the Phase 1 tokens:
 *   PlacesFilterBar   cafe / gas / workshop / hangout, cut-corner chips
 *   PlacesMarkers     the map markers themselves
 *   PlaceDetailSheet  the callout for a tapped place
 *   SubmitPlaceFab    + SubmitPlaceModal, the community submission flow
 *
 * The colour rule for the whole layer: **category is shape, state is
 * colour.** Each category has its own hand-drawn glyph (MapGlyphs.tsx) at
 * one stroke weight, and the only colour that varies is whether the thing
 * is active/selected (racingRed) or not (hairline + textSecondary). That
 * is what lets four categories live inside a six-value palette; the
 * previous version needed a hue per category and spent four of the six.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Marker } from "react-native-maps";
import { Plus, X } from "lucide-react-native";
import Input from "@/components/Input";
import Dropdown from "@/components/Dropdown";
import ImagePickerField from "@/components/ImagePicker";
import {
  CutCornerButton,
  CutCornerSurface,
} from "@/components/CutCorner";
import {
  CHROME_ICON_STROKE,
  MAP_GLYPH_STROKE,
} from "@/components/MapGlyphs";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  onRacingRed,
  spacing,
  textStyle,
} from "@/constants/theme";
import { useXP } from "@/hooks/useXPStore";
import { uploadPlacePhoto } from "@/lib/uploadPlacePhoto";
import { supabase } from "@/lib/supabase";
import type { NormalizedPlace } from "@/lib/placesApi";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/constants/placesCategories";

export const PLACE_SUBMIT_XP = 15;

/** Marker glyph size. On the spacing scale, per DRIVE_HUB_REFERENCE D-3. */
const MARKER_GLYPH_SIZE = spacing.spacingLg;

/* ------------------------------------------------------------------ *
 * Category filter chips
 * ------------------------------------------------------------------ */

/**
 * One chip per category. Active is a solid racingRed slab with black
 * text; inactive is a carbon slab with a hairline outline — the same
 * primary/outline pair `CutCornerButton` uses, so the chips read as part
 * of the same control family as the screen's buttons.
 *
 * The label is Rajdhani, uppercase, tracked: a control sizing its own
 * label (DRIVE_HUB_REFERENCE D-1), not body copy.
 */
export function PlacesFilterBar({
  active,
  onChange,
  style,
}: {
  active: PlaceCategory;
  onChange: (category: PlaceCategory) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    // Horizontal scroll rather than a fixed row: four chips at Rajdhani 12
    // overflow a 390pt screen once the chrome column is subtracted, and a
    // clipped filter is a filter the driver cannot reach.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style as StyleProp<ViewStyle>}
      contentContainerStyle={styles.filterBar}
      keyboardShouldPersistTaps="handled"
    >
      {PLACE_CATEGORIES.map((cat) => {
        const Glyph = PLACE_CATEGORY_ICONS[cat];
        const isActive = active === cat;
        return (
          <Pressable
            key={cat}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Show ${PLACE_CATEGORY_LABELS[cat]} places`}
            onPress={() => onChange(cat)}
            style={({ pressed }) => [styles.filterChipHit, pressed && styles.pressed]}
          >
            <CutCornerSurface
              fill={isActive ? colors.racingRed : colors.carbonSurface}
              borderColor={isActive ? colors.racingRed : colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.sm}
              corners="topRight"
              contentStyle={styles.filterChip}
            >
              <Glyph
                size={spacing.spacingMd}
                color={isActive ? onRacingRed : colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: isActive ? onRacingRed : colors.textSecondary },
                ]}
              >
                {PLACE_CATEGORY_LABELS[cat].toUpperCase()}
              </Text>
            </CutCornerSurface>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ *
 * Markers (render as a child of <MapView>)
 * ------------------------------------------------------------------ */

export function PlacesMarkers({
  places,
  onSelect,
  selectedId,
}: {
  places: NormalizedPlace[];
  onSelect: (place: NormalizedPlace) => void;
  selectedId?: string | null;
}) {
  return (
    <>
      {places.map((place) => {
        const Glyph = PLACE_CATEGORY_ICONS[place.category];
        const isSelected = selectedId === place.id;
        // A community submission gets the accent outline; an OSM import
        // gets the hairline. One bit of information, one colour step.
        const isCommunity = place.source === "user";
        const borderColor = isSelected
          ? colors.racingRed
          : isCommunity
            ? alpha(colors.racingRed, 0.55)
            : colors.hairline;
        return (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.lat, longitude: place.lng }}
            onPress={() => onSelect(place)}
            tracksViewChanges={false}
          >
            <View style={styles.markerBox} collapsable={false}>
              <CutCornerSurface
                fill={isSelected ? colors.racingRed : colors.carbonSurface}
                borderColor={borderColor}
                borderWidth={borderWidth.hairline}
                cutSize={spacing.spacingSm}
                corners="topRight"
                style={styles.markerBadge}
                contentStyle={styles.markerBadgeContent}
              >
                <Glyph
                  size={MARKER_GLYPH_SIZE}
                  color={isSelected ? onRacingRed : colors.textPrimary}
                  strokeWidth={MAP_GLYPH_STROKE}
                />
              </CutCornerSurface>
            </View>
          </Marker>
        );
      })}
    </>
  );
}

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
  const Glyph = PLACE_CATEGORY_ICONS[place.category];
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
      </CutCornerSurface>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Submit a place
 * ------------------------------------------------------------------ */

const CATEGORY_OPTIONS = PLACE_CATEGORIES.map((cat) => ({
  label: PLACE_CATEGORY_LABELS[cat],
  value: cat,
}));

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

  const SuccessGlyph = PLACE_CATEGORY_ICONS[category];

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
              <Input
                label="Name"
                placeholder="e.g. Warkop Kang Ujang"
                value={name}
                onChangeText={setName}
              />
              <Dropdown
                label="Category"
                placeholder="Select category"
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(v) => setCategory(v as PlaceCategory)}
              />
              <Input
                label="Notes (optional)"
                placeholder="What's good here?"
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              <ImagePickerField label="Photo (optional)" value={photoUri} onChange={setPhotoUri} />
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
  /* Filter chips */
  filterBar: {
    flexDirection: "row",
    gap: spacing.spacingSm,
  },
  /** Press feedback, since Pressable has none by default. */
  pressed: {
    opacity: 0.7,
  },
  filterChipHit: {
    // Keeps the tap target on the chip itself; the surface draws inside it.
    minHeight: spacing.spacingXxl,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingSm,
  },
  filterChipText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
  },
  /* Markers */
  // Fixed outer box: the native Android marker bitmap is sized at capture
  // time, so the bounds must not depend on content that lays out later.
  markerBox: {
    width: spacing.spacingXxxl,
    height: spacing.spacingXxxl,
    alignItems: "center",
    justifyContent: "center",
  },
  markerBadge: {
    width: spacing.spacingXl + spacing.spacingSm,
    height: spacing.spacingXl + spacing.spacingSm,
  },
  markerBadgeContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
});
