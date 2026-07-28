/**
 * Driveverse — the OSM + community "nearby places" layer.
 *
 *   PlacesFilterBar   the nine category chips, multi-select
 *   PlacesMarkers     the map markers themselves, clustered
 *   PlaceDetailSheet  the callout for a tapped place
 *   SubmitPlaceFab    + SubmitPlaceModal, the community submission flow
 *
 * COLOUR — READ THIS
 *   This layer used to follow the rule "category is shape, state is
 *   colour": one hand-drawn glyph per category, and the only colour that
 *   varied was selected vs not. The marker rebuild replaced that with a
 *   per-category hue from `constants/mapCategoryColors.ts`, on an explicit
 *   instruction to try colour and judge it on screen.
 *
 *   Two things were kept from the old rule, because they are what stop the
 *   coloured version becoming unreadable:
 *
 *   - **The glyphs still carry the category on their own.** No category is
 *     identified by hue alone, so the layer degrades correctly for a
 *     colourblind driver and in greyscale.
 *   - **Selection is still red, and no category is.** `racingRed` remains
 *     reserved, so "this is the one you tapped" can never be confused with
 *     "this is a restaurant".
 *
 *   Reverting is deleting `mapCategoryColors.ts` and the `tint` lookups
 *   below. See `MAP_MARKER_REFERENCE.md` §2.
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
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { Marker } from "react-native-maps";
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
} from "@/components/MapGlyphs";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  mapLabelShadow,
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
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/constants/placesCategories";
import { CATEGORY_COLORS, ON_CATEGORY } from "@/constants/mapCategoryColors";
import { clusterPlaces, isCluster, type Cluster } from "@/lib/mapClustering";

export const PLACE_SUBMIT_XP = 15;

/** Marker glyph size. On the spacing scale, per DRIVE_HUB_REFERENCE D-3. */
const MARKER_GLYPH_SIZE = spacing.spacingLg;

/* ------------------------------------------------------------------ *
 * Category filter chips
 * ------------------------------------------------------------------ */

/**
 * One chip per category, drawn by the shared `CutCornerChip`.
 *
 * Multi-select now, not single-select. The chips are a shortcut into the
 * same filter state the Filters panel writes — tapping "Fuel" here and
 * unticking "Fuel" there are the same operation on the same store, so the
 * two controls can never disagree about what is on the map.
 */
export function PlacesFilterBar({
  isActive,
  onToggle,
  style,
}: {
  isActive: (category: PlaceCategory) => boolean;
  onToggle: (category: PlaceCategory) => void;
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
        const active = isActive(cat);
        return (
          <CutCornerChip
            key={cat}
            label={PLACE_CATEGORY_LABELS[cat]}
            active={active}
            // `checkbox`, not `button`: each chip is an independent on/off,
            // so a screen reader should announce its state rather than
            // implying picking one deselects the rest.
            accessibilityRole="checkbox"
            accessibilityLabel={`${PLACE_CATEGORY_LABELS[cat]} places`}
            onPress={() => onToggle(cat)}
            icon={
              // The chip's glyph takes the category tint when off and the
              // chip's own content colour when on — on an active chip the
              // fill is already carrying state, and a tinted glyph on top of
              // it would put two colours in a 12pt control.
              <Glyph
                size={spacing.spacingMd}
                color={active ? chipContentColor(true) : CATEGORY_COLORS[cat]}
              />
            }
          />
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ *
 * Markers (render as a child of <MapView>)
 * ------------------------------------------------------------------ */

/**
 * Metres between two coordinates. Equirectangular rather than haversine:
 * this runs per marker per region change, and at the sub-5km ranges a
 * marker label shows, the error is well under the rounding.
 */
function metresBetween(
  a: { latitude: number; longitude: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.latitude) * Math.PI) / 180;
  const dLng = ((b.lng - a.longitude) * Math.PI) / 180;
  const meanLat = ((b.lat + a.latitude) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(meanLat);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

/**
 * The places layer's markers.
 *
 * LAYOUT
 *   Stacked: a colour-filled badge carrying the category glyph, the place
 *   name under it, the distance under that. The name and distance sit
 *   directly on map tiles with no surface behind them, so both carry
 *   `mapLabelShadow` — the legibility device described in
 *   MAP_SCREEN_REFERENCE D-6, not an elevation one.
 *
 * FIXED BOUNDS
 *   Every box below is a literal pixel value, not a spacing token, and the
 *   outer wrapper does not change size when a marker is selected. Android
 *   snapshots each custom marker view into a bitmap at capture time; a
 *   marker that grows after capture is what produced the half-size icon bug
 *   recorded in MAP_SCREEN_REFERENCE D-5. Selection changes fill and stroke
 *   only — never geometry.
 */
export function PlacesMarkers({
  places,
  onSelect,
  onSelectCluster,
  selectedId,
  origin,
  latitudeDelta,
}: {
  places: NormalizedPlace[];
  onSelect: (place: NormalizedPlace) => void;
  /** A cluster was tapped — the screen zooms to it rather than opening a sheet. */
  onSelectCluster?: (cluster: Cluster<NormalizedPlace>) => void;
  selectedId?: string | null;
  /** The driver, for the distance line. Omitted before the first GPS fix. */
  origin?: { latitude: number; longitude: number } | null;
  /** Current region height, which decides whether anything clusters. */
  latitudeDelta?: number;
}) {
  // `NormalizedPlace` already satisfies `Clusterable` — id, lat, lng and a
  // `category` that is a string subtype — so it clusters as itself and the
  // members come back fully typed.
  const clusters = clusterPlaces(places, { latitudeDelta: latitudeDelta ?? 0 });

  return (
    <>
      {clusters.map((cluster) => {
        // Per-category clustering means `category` is always set here. The
        // fallback covers only the mixed-cluster case `global` mode can
        // produce, which this call site does not use.
        const category = (cluster.category ?? "cafe") as PlaceCategory;
        const tint = CATEGORY_COLORS[category];

        if (isCluster(cluster)) {
          return (
            <Marker
              key={cluster.id}
              coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
              onPress={() => onSelectCluster?.(cluster)}
              tracksViewChanges={false}
              accessibilityLabel={`${cluster.count} ${PLACE_CATEGORY_LABELS[category]} here. Tap to zoom in.`}
            >
              <View style={styles.markerBox} collapsable={false}>
                <ClusterBadge count={cluster.count} tint={tint} />
              </View>
            </Marker>
          );
        }

        const place = cluster.items[0];
        const Glyph = PLACE_CATEGORY_ICONS[place.category];
        const isSelected = selectedId === place.id;
        const distance = origin ? metresBetween(origin, place) : null;

        return (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.lat, longitude: place.lng }}
            onPress={() => onSelect(place)}
            tracksViewChanges={false}
            accessibilityLabel={`${place.name}, ${
              PLACE_CATEGORY_LABELS[place.category]
            }${distance != null ? `, ${formatDistanceLabel(distance)} away` : ""}`}
          >
            <View style={styles.markerBox} collapsable={false}>
              <CutCornerSurface
                // Selected is red on every category, so "the one you tapped"
                // is never confusable with "this is a restaurant".
                fill={isSelected ? colors.racingRed : tint}
                borderColor={
                  isSelected
                    ? colors.racingRed
                    : // A community submission keeps its lighter outline; an
                      // OSM import gets a dark one that reads as a rim rather
                      // than a second colour.
                      place.source === "user"
                      ? colors.textPrimary
                      : alpha(colors.voidBlack, 0.55)
                }
                borderWidth={borderWidth.hairline}
                cutSize={spacing.spacingSm}
                corners="topRight"
                style={styles.markerBadge}
                contentStyle={styles.markerBadgeContent}
              >
                <Glyph
                  size={MARKER_GLYPH_SIZE}
                  // One ink for every category badge — see the luminance
                  // constraint in `mapCategoryColors.ts`.
                  color={isSelected ? onRacingRed : ON_CATEGORY}
                  strokeWidth={MAP_GLYPH_STROKE}
                />
              </CutCornerSurface>
              <Text style={styles.markerName} numberOfLines={1}>
                {place.name}
              </Text>
              {distance != null ? (
                <Text style={styles.markerDistance}>{formatDistanceLabel(distance)}</Text>
              ) : null}
            </View>
          </Marker>
        );
      })}
    </>
  );
}

/**
 * A cluster badge: the count in mono, on the category's colour.
 *
 * No glyph. At this size the count is the information — a driver zoomed out
 * far enough to see a cluster is asking "how many, and roughly where", and
 * the colour already says which category it is.
 */
function ClusterBadge({ count, tint }: { count: number; tint: string }) {
  return (
    <CutCornerSurface
      fill={tint}
      borderColor={alpha(colors.voidBlack, 0.55)}
      borderWidth={borderWidth.emphasis}
      cutSize={spacing.spacingSm}
      corners="topRight"
      style={styles.clusterBadge}
      contentStyle={styles.markerBadgeContent}
    >
      <Text style={styles.clusterCount}>{count > 99 ? "99+" : count}</Text>
    </CutCornerSurface>
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
 * The same distance as one string, for the marker label.
 *
 * The callout splits value from unit so the number can be mono and the unit
 * Inter (DRIVE_HUB D-9: no letters inside a mono readout). A marker label
 * is a single 10pt line with no column to align to, so it stays whole —
 * splitting it there would buy nothing and cost a second `Text` node on
 * every marker on screen.
 */
function formatDistanceLabel(meters: number): string {
  const { value, unit } = formatDistance(meters);
  return `${value} ${unit}`;
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
 * Category picker for the submit form — the same `CutCornerChip` as
 * `PlacesFilterBar` above, just laid out inline in a form rather than as a
 * scrolling map filter.
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
        const Glyph = PLACE_CATEGORY_ICONS[cat];
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
  /* Filter chips — the chip itself is `CutCornerChip`; this is its row. */
  filterBar: {
    flexDirection: "row",
    gap: spacing.spacingSm,
  },
  /* Markers
   *
   * Every value here is a literal pixel count, deliberately NOT a spacing
   * token — MAP_SCREEN_REFERENCE D-5 and checklist item 12. Android sizes a
   * custom marker's bitmap when it captures the view, so these bounds must
   * not move when the content inside them changes on select. All are even
   * numbers so the badge centres on a whole pixel.
   *
   * 110 tall: 44 badge + 4 gap + ~28 of two label lines, plus slack so a
   * two-line name never pushes the distance outside the captured bitmap. */
  markerBox: {
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  markerBadge: {
    width: 44,
    height: 44,
  },
  markerBadgeContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  clusterBadge: {
    width: 44,
    height: 44,
  },
  clusterCount: {
    ...textStyle("dataSm"),
    color: ON_CATEGORY,
  },
  // Both labels sit straight on map tiles with no surface behind them, so
  // they carry the shadow described in MAP_SCREEN_REFERENCE D-6. It is a
  // legibility device over light tiles, not an elevation one.
  markerName: {
    ...textStyle("caption"),
    fontFamily: fontFamily.displaySemiBold,
    color: colors.textPrimary,
    marginTop: spacing.spacingXs,
    maxWidth: 104,
    textAlign: "center",
    ...mapLabelShadow,
  },
  markerDistance: {
    ...textStyle("dataSm"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textPrimary,
    textAlign: "center",
    ...mapLabelShadow,
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
