/**
 * Driveverse — ShareCardModal.
 *
 * The preview-before-you-post step. A bad first impression here (ugly card,
 * wrong data) undermines the whole growth loop, so the user always sees the
 * exact 1080×1920 image they're about to share, not a fire-and-forget hand-off.
 *
 * FLOW
 *   1. Renders `<ShareableCard>` at native design size (off to the side, ref'd
 *      for capture) and a scaled-down copy the user actually looks at.
 *   2. For a trip, a row of controls above the actions decides what is *on*
 *      the card before it is captured — see COMPOSITION below.
 *   3. Primary CTA "Add to Instagram Story" — the DIRECT integration — is the
 *      loudest action when Instagram is installed. It captures the card to a
 *      PNG and drops it straight into IG's Story composer.
 *   4. "Save PNG" writes the same image to the camera roll and posts nothing.
 *   5. "More options" opens the generic OS share sheet (TikTok, WhatsApp,
 *      Messages…). This is also the graceful fallback when Instagram isn't
 *      installed or the direct path is unavailable.
 *   6. Capture/share shows a per-button loading state (view-shot can take a
 *      beat on slow devices) rather than freezing the UI, and a cancelled
 *      share just closes the modal — never an error.
 *
 * COMPOSITION (trip cards only)
 *   Route — Map / Trace / Off. `Map` is a still of the real map, produced by
 *   `TripMapSnapshot`; the other two exist because a map of a drive that
 *   starts at your house is a map of your house, and a driver who wants to
 *   post the numbers should not have to publish the geography to do it.
 *   Speed heat — colours the route by how fast the car was moving.
 *   Car — the garage car the drive was logged in.
 *
 *   Defaults are the fullest card (map, heat, car) because that is the one
 *   worth posting; the toggles are for the driver who wants less, and the
 *   choice is remembered for the length of the session only.
 *
 * The same modal serves every card type; callers pass `type` + `payload`
 * exactly as `<ShareableCard>` takes them.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Download, Instagram, Share2, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  CutCornerButton,
} from "@/components/CutCorner";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  MAP_SNAPSHOT_WIDTH,
  mapSnapshotHeight,
  ShareableCard,
  type ShareableCardProps,
  type TripRouteStyle,
  type TripSharePayload,
} from "@/components/ShareableCard";
import TripMapSnapshot, { canSnapshotMap } from "@/components/TripMapSnapshot";
import { useMainQuest } from "@/hooks/useMainQuestStore";
import {
  captureCard,
  isInstagramInstalled,
  saveCardToPhotos,
  shareToInstagramStory,
  shareViaSheet,
  type ShareOutcome,
} from "@/lib/shareCard";
import { decodePolyline } from "@/lib/polyline";
import { speedDomain, speedProfileForTrip } from "@/lib/speedTrace";
import {
  alpha,
  borderWidth,
  colors,
  onRacingRed,
  spacing,
  textStyle,
} from "@/constants/theme";

type ShareCardModalProps = ShareableCardProps & {
  visible: boolean;
  onClose: () => void;
  /**
   * Optional caption tagged onto the generic-sheet share (WhatsApp/Messages
   * pick it up; Instagram Stories ignores text). Defaults per card type.
   */
  caption?: string;
};

/** What a pressed button is currently doing, for the loading state. */
type Busy = "instagram" | "sheet" | "save" | null;

const ROUTE_STYLES: { value: TripRouteStyle; label: string }[] = [
  { value: "map", label: "Map" },
  { value: "trace", label: "Trace" },
  { value: "hidden", label: "Off" },
];

export default function ShareCardModal(props: ShareCardModalProps) {
  const { visible, onClose, caption, ...cardProps } = props;
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const { completeStep } = useMainQuest();

  const [igInstalled, setIgInstalled] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isTrip = cardProps.type === "trip";
  const tripPayload = isTrip ? (cardProps.payload as TripSharePayload) : null;

  /* --- Composition state (trip only) --------------------------------- */

  const [routeStyle, setRouteStyle] = useState<TripRouteStyle>("map");
  const [speedHeat, setSpeedHeat] = useState(true);
  const [showCar, setShowCar] = useState(true);
  const [mapUri, setMapUri] = useState<string | null>(null);
  /**
   * The snapshot has finished, one way or the other. Separate from `mapUri`
   * because a give-up also reports `null`: without this the stage would stay
   * mounted, holding a live map open for a picture that is not coming.
   */
  const [mapDone, setMapDone] = useState(false);

  const points = useMemo(() => {
    const encoded = tripPayload?.trip.route_polyline;
    return encoded ? decodePolyline(encoded) : [];
  }, [tripPayload?.trip.route_polyline]);

  const profile = useMemo(
    () =>
      tripPayload
        ? speedProfileForTrip(tripPayload.trip, points)
        : { speeds: [] as number[], source: "none" as const },
    [tripPayload, points]
  );
  const domain = useMemo(() => speedDomain(profile.speeds), [profile.speeds]);

  const hasRoute = points.length > 1;
  const mapAvailable = isTrip && hasRoute && canSnapshotMap();
  const heatAvailable = isTrip && hasRoute && profile.source !== "none";

  // Fit the natural-size card into the space above the action bar.
  const { width: screenW, height: screenH } = Dimensions.get("window");

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(null);
    setSaved(false);
    let active = true;
    isInstagramInstalled().then((v) => {
      if (active) setIgInstalled(v);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  // A build that cannot produce a map still (web, or no Mapbox token) must not
  // offer "Map" as the default and then quietly draw a trace — start on the
  // style it can actually deliver.
  useEffect(() => {
    if (!mapAvailable) setRouteStyle((prev) => (prev === "map" ? "trace" : prev));
  }, [mapAvailable]);

  // The heat toggle changes the colours *on the map*, and the car toggle
  // changes the height the still is captured at (`mapSnapshotHeight` — the
  // capture matches the frame so the route is never cropped), so either one
  // means taking it again. Clearing both here is what re-mounts the stage.
  useEffect(() => {
    setMapUri(null);
    setMapDone(false);
  }, [speedHeat, showCar, points]);

  const handleSnapshot = useCallback((uri: string | null) => {
    setMapUri(uri);
    setMapDone(true);
  }, []);

  const finish = useCallback(
    (outcome: ShareOutcome) => {
      if (outcome.status === "shared") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {}
        );
        // First Mile step 5, "Prove It". Only on a card that actually went
        // somewhere, and only the trip variant — the chain's step is about
        // sharing a *drive*, not a rank or a quest card. Saving the PNG
        // counts too: the driver has the image and posts it on their own
        // time, and the app has no way to watch that happen. This is one of
        // the three steps no trigger can see; see constants/mainQuests.ts.
        if (isTrip) void completeStep("share_trip");

        // A save is not a hand-off: the user stays here, because the next
        // thing they usually want is to post the card they just kept.
        if (outcome.channel === "photos" || outcome.channel === "files") {
          setSaved(true);
          setBusy(null);
          return;
        }
        onClose();
        return;
      }
      if (outcome.status === "error") {
        setError(outcome.message || "Couldn't share that. Try again.");
      }
      // "cancelled" / "unavailable" that reached here: no error, stay open so
      // the user can pick another destination.
      setBusy(null);
    },
    [onClose, isTrip, completeStep]
  );

  const handleInstagram = useCallback(async () => {
    setError(null);
    setBusy("instagram");
    try {
      const uri = await captureCard(cardRef);
      const outcome = await shareToInstagramStory(uri);
      // If the direct path can't run (no backend / IG vanished), fall back to
      // the generic sheet transparently rather than dead-ending the user.
      if (outcome.status === "unavailable") {
        finish(await shareViaSheet(uri, caption));
        return;
      }
      finish(outcome);
    } catch (e) {
      finish({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [caption, finish]);

  const handleSave = useCallback(async () => {
    setError(null);
    setBusy("save");
    try {
      const uri = await captureCard(cardRef);
      finish(await saveCardToPhotos(uri));
    } catch (e) {
      finish({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [finish]);

  const handleMore = useCallback(async () => {
    setError(null);
    setBusy("sheet");
    try {
      const uri = await captureCard(cardRef);
      finish(await shareViaSheet(uri, caption));
    } catch (e) {
      finish({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [caption, finish]);

  // Scale the card down to fit the preview area (leave room for header +
  // controls + action bar). Never scale UP past 1× — the card is the source
  // of truth.
  const chromeHeight = isTrip ? 340 : 260;
  const previewMaxW = screenW - spacing.spacingXl * 2;
  const previewMaxH = screenH - insets.top - insets.bottom - chromeHeight;
  const scale = Math.min(previewMaxW / CARD_WIDTH, previewMaxH / CARD_HEIGHT, 1);
  const boxW = CARD_WIDTH * scale;
  const boxH = CARD_HEIGHT * scale;

  // What the card is actually told to draw, once the controls have had their
  // say. Everything else about the payload comes from the caller untouched.
  const resolvedCardProps: ShareableCardProps = isTrip
    ? {
        type: "trip",
        payload: {
          ...(tripPayload as TripSharePayload),
          routeStyle,
          speedHeat: speedHeat && heatAvailable,
          showCar,
          mapImageUri: mapUri,
        },
      }
    : (cardProps as ShareableCardProps);

  return (
    <>
      {/* The map that becomes the card's map block.
          OUTSIDE the <Modal>, deliberately. It is a sibling of the modal in
          the calling screen's tree, at 1% opacity, with the opaque modal drawn
          over the top of it — so it renders in an ordinary window and fetches
          tiles like any other map. A native MapView mounted *inside* a Modal
          is the configuration react-native-maps is least reliable in on
          Android, and a blank map is exactly what this component exists to
          avoid. See TripMapSnapshot's header for why the card cannot simply
          contain a MapView, and why the stage is not parked offscreen. */}
      {visible && isTrip && routeStyle === "map" && mapAvailable && !mapDone ? (
        <TripMapSnapshot
          key={`snapshot-${speedHeat ? "heat" : "flat"}-${showCar ? "car" : "nocar"}`}
          points={points}
          speeds={profile.speeds}
          domain={domain}
          flat={!(speedHeat && heatAvailable)}
          width={MAP_SNAPSHOT_WIDTH}
          height={mapSnapshotHeight(showCar)}
          onSnapshot={handleSnapshot}
        />
      ) : null}

      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>SHARE</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close share preview"
              hitSlop={spacing.spacingSm}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <X size={spacing.spacingXl} color={colors.textPrimary} strokeWidth={1.5} />
            </Pressable>
          </View>

          {/* Preview */}
          <View style={styles.previewArea}>
            <View style={[styles.previewBox, { width: boxW, height: boxH }]}>
              {/* Natural-size card, centre-scaled to land at the box's top-left.
                  The ref points here so view-shot captures full resolution
                  regardless of the on-screen scale. */}
              <View
                style={[
                  styles.previewCard,
                  {
                    transform: [{ scale }],
                    top: (boxH - CARD_HEIGHT) / 2,
                    left: (boxW - CARD_WIDTH) / 2,
                  },
                ]}
              >
                <ShareableCard ref={cardRef} {...resolvedCardProps} />
              </View>
            </View>
          </View>

          {/* Composition controls */}
          {isTrip ? (
            <View style={styles.controls}>
              <View style={styles.controlRow}>
                <Text style={styles.controlLabel}>ROUTE</Text>
                <View style={styles.segmented}>
                  {ROUTE_STYLES.map((option) => (
                    <Segment
                      key={option.value}
                      label={option.label}
                      active={routeStyle === option.value}
                      disabled={
                        !hasRoute || (option.value === "map" && !mapAvailable)
                      }
                      onPress={() => setRouteStyle(option.value)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.chipRow}>
                <Toggle
                  label="Speed heat"
                  active={speedHeat && heatAvailable}
                  disabled={!heatAvailable || routeStyle === "hidden"}
                  onPress={() => setSpeedHeat((v) => !v)}
                />
                <Toggle
                  label="Car"
                  active={showCar && !!tripPayload?.car}
                  disabled={!tripPayload?.car}
                  onPress={() => setShowCar((v) => !v)}
                />
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Actions */}
          <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
            {igInstalled ? (
              <CutCornerButton
                title={busy === "instagram" ? "Opening…" : "Add to Instagram Story"}
                corners="topRight"
                disabled={busy != null}
                onPress={handleInstagram}
                icon={
                  busy === "instagram" ? (
                    <ActivityIndicator size="small" color={onRacingRed} />
                  ) : (
                    <Instagram size={spacing.spacingLg} color={onRacingRed} strokeWidth={1.5} />
                  )
                }
              />
            ) : null}

            <View style={styles.secondaryActions}>
              <View style={styles.secondaryAction}>
                <CutCornerButton
                  title={busy === "save" ? "Saving…" : saved ? "Saved" : "Save PNG"}
                  variant="ghost"
                  size="sm"
                  corners="topRight"
                  disabled={busy != null}
                  onPress={handleSave}
                  icon={
                    busy === "save" ? (
                      <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : saved ? (
                      <Check
                        size={spacing.spacingLg}
                        color={colors.racingRed}
                        strokeWidth={1.5}
                      />
                    ) : (
                      <Download
                        size={spacing.spacingLg}
                        color={colors.textPrimary}
                        strokeWidth={1.5}
                      />
                    )
                  }
                />
              </View>
              <View style={styles.secondaryAction}>
                <CutCornerButton
                  title={busy === "sheet" ? "Preparing…" : "More"}
                  variant={igInstalled ? "ghost" : "primary"}
                  size="sm"
                  corners="topRight"
                  disabled={busy != null}
                  onPress={handleMore}
                  icon={
                    busy === "sheet" ? (
                      <ActivityIndicator
                        size="small"
                        color={igInstalled ? colors.textPrimary : onRacingRed}
                      />
                    ) : (
                      <Share2
                        size={spacing.spacingLg}
                        color={igInstalled ? colors.textPrimary : onRacingRed}
                        strokeWidth={1.5}
                      />
                    )
                  }
                />
              </View>
            </View>

            <Text style={styles.hint}>
              {saved
                ? "Saved as a 1080×1920 PNG."
                : igInstalled
                  ? "Posts a 1080×1920 story image. More covers TikTok, WhatsApp and Messages."
                  : "Save the PNG, or open the share sheet for TikTok, WhatsApp and Messages."}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 *
 * Plain rectangles, not cut corners: `constants/theme.ts` reserves the cut
 * for brand surfaces, and chips and segmented controls are explicitly on the
 * "no" list. The active state is a red hairline plus a tinted fill — one more
 * red element than a viewport normally gets, which is affordable here because
 * the card itself is behind glass and not competing.
 * ------------------------------------------------------------------ */

function Segment({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`Route style: ${label}`}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.segment,
        active && styles.segmentActive,
        disabled && styles.controlDisabled,
      ]}
    >
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Toggle({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        active && styles.chipActive,
        disabled && styles.controlDisabled,
      ]}
    >
      <View style={[styles.chipDot, active && styles.chipDotActive]} />
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
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
    justifyContent: "space-between",
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
  },
  headerTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  closeBtn: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    alignItems: "center",
    justifyContent: "center",
  },
  previewArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.spacingXl,
  },
  previewBox: {
    // A hairline frame around the exact export, so the preview reads as "this
    // is the image", not a loose composition.
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
    ...Platform.select({
      // A faint lift so the black card separates from the black backdrop.
      ios: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 12 },
      default: {},
    }),
  },
  previewCard: {
    position: "absolute",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },

  // Composition controls
  controls: {
    paddingHorizontal: spacing.spacingLg,
    paddingTop: spacing.spacingMd,
    gap: spacing.spacingSm,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
  },
  controlLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  segmented: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.spacingXs,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.spacingSm,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.carbonSurface,
  },
  segmentActive: {
    borderColor: colors.racingRed,
    backgroundColor: alpha(colors.racingRed, 0.12),
  },
  segmentLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.spacingSm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    paddingVertical: spacing.spacingSm,
    paddingHorizontal: spacing.spacingMd,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.carbonSurface,
  },
  chipActive: {
    borderColor: colors.racingRed,
    backgroundColor: alpha(colors.racingRed, 0.12),
  },
  chipDot: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    backgroundColor: colors.hairline,
  },
  chipDotActive: {
    backgroundColor: colors.racingRed,
  },
  chipLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.textPrimary,
  },
  controlDisabled: {
    opacity: 0.35,
  },

  error: {
    ...textStyle("caption"),
    color: colors.racingRed,
    textAlign: "center",
    paddingHorizontal: spacing.spacingXl,
    marginBottom: spacing.spacingSm,
  },
  actions: {
    paddingHorizontal: spacing.spacingLg,
    paddingTop: spacing.spacingLg,
    gap: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: spacing.spacingMd,
  },
  secondaryAction: {
    flex: 1,
  },
  hint: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
  },
});
