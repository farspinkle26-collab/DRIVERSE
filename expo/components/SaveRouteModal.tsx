/**
 * Driveverse — SaveRouteModal.
 *
 * The sheet that turns a just-finished drive into a row in the driver's
 * route library. Reached from the trip summary's SAVE button on the map.
 *
 * STYLING
 *   Migrated off the legacy orange/gradient styling onto `constants/theme`
 *   (DESIGN_SYSTEM_AUDIT §2, MAP_SCREEN_REFERENCE §8 "Known gaps"). It is a
 *   form sheet, so it follows `CreateConvoyModal` rather than the map's
 *   cut-corner cards: plain carbon slab, hairline rules, `radius.sharp`
 *   inputs and chips. The red budget is one element — the SAVE ROUTE
 *   button — which is why the activity and visibility selections mark
 *   themselves with `textPrimary` rather than a second accent.
 *
 * WHY THE FOOTER IS PINNED
 *   The button used to sit below an unbounded ScrollView inside a
 *   `KeyboardAvoidingView` with no definite height, so `maxHeight: "92%"`
 *   had nothing to resolve against and the sheet grew past the bottom of
 *   the screen — the visibility options were cut in half and the action
 *   overlapped them. The wrapper now takes `flex: 1` so the percentage is
 *   real, and the action bar lives outside the scroller so it is always
 *   reachable.
 *
 * WHY THE ERROR IS IN THE FOOTER
 *   It used to be the last child of the scroll content, several hundred
 *   points below the fold. A failed save therefore looked exactly like a
 *   dead button. It now sits directly above the action, where the driver is
 *   already looking when they press it.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Briefcase,
  Car,
  Coffee,
  Flame,
  Gauge,
  Globe,
  Lock,
  Map as MapIcon,
  Route as RouteIcon,
  Timer,
  Users,
  X,
} from "lucide-react-native";
import { CutCornerButton } from "@/components/CutCorner";
import TierLimitNotice from "@/components/platinum/TierLimitNotice";
import { ICON_STROKE } from "@/components/TripCard";
import { convertSpeed, speedUnitLabel, type SpeedUnit } from "@/lib/speedUnits";
import {
  borderWidth,
  colors,
  fontFamily,
  onRacingRed,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useRoutes, ActivityType, RouteVisibility } from "@/hooks/useRoutesStore";
import { encodePolyline, simplifyPath, LatLng } from "@/lib/polyline";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  describeSaveFailure,
  validateRouteDraft,
} from "@/lib/routeDraft";

interface SaveRouteModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: (routeId: string) => void;
  path: LatLng[];
  /**
   * Measured per-point speeds for `path`, already encoded and already thinned
   * through the same indices `simplifyPath` will use below. Stored alongside
   * the polyline so a saved route keeps the drive's real speed profile rather
   * than only its shape.
   */
  speedProfile?: string | null;
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  topSpeedKmh: number;
  xpEarned?: number;
  originName?: string;
  destinationName?: string;
  carId?: string | null;
  /** The `trips` row written automatically when the drive ended, so the
   * name entered here can be written back onto it — that row is otherwise
   * never named, even though the Drive Hub and trip detail screen both
   * prefer it over the destination fallback. */
  tripId?: string | null;
  /** The viewer's own regional unit (`speedUnitForCountry`). Defaults to km/h. */
  speedUnit?: SpeedUnit;
}

type IconComponent = React.FC<{ size: number; color: string; strokeWidth?: number }>;

/**
 * Category is shape, not hue (MAP_SCREEN_REFERENCE §9.10) — the glyph says
 * which activity it is, and colour is reserved for which one is selected.
 */
const ACTIVITY_OPTIONS: { key: ActivityType; label: string; icon: IconComponent }[] = [
  { key: "drive", label: "Drive", icon: Car },
  { key: "cruise", label: "Cruise", icon: Coffee },
  { key: "commute", label: "Commute", icon: Briefcase },
  { key: "race", label: "Race", icon: Flame },
  { key: "roadtrip", label: "Road Trip", icon: MapIcon },
];

const VISIBILITY_OPTIONS: {
  key: RouteVisibility;
  label: string;
  sub: string;
  icon: IconComponent;
}[] = [
  { key: "public", label: "Public", sub: "Everyone can see it and give kudos", icon: Globe },
  { key: "friends", label: "Friends", sub: "Only your friends can see it", icon: Users },
  { key: "private", label: "Private", sub: "Only you can see it", icon: Lock },
];

function fmtMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "0";
  if (meters < 1000) return `${Math.round(meters)}`;
  return (meters / 1000).toFixed(2);
}

function metersUnit(meters: number): string {
  return Number.isFinite(meters) && meters >= 1000 ? "km" : "m";
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** One column of the stats strip: mono value, Inter unit, caption label. */
function StatColumn({
  glyph: Glyph,
  value,
  unit,
  label,
}: {
  glyph: IconComponent;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.statColumn}>
      <Glyph size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function SaveRouteModal({
  visible,
  onClose,
  onSaved,
  path,
  speedProfile,
  distanceMeters,
  durationSeconds,
  avgSpeedKmh,
  topSpeedKmh,
  xpEarned = 0,
  originName,
  destinationName,
  carId,
  tripId,
  speedUnit = "kmh",
}: SaveRouteModalProps) {
  const insets = useSafeAreaInsets();
  const { saveRoute, myRoutes, savedRouteLimit } = useRoutes();

  const defaultTitle =
    destinationName && destinationName !== "Unknown"
      ? `Drive to ${destinationName}`
      : "Morning Drive";

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [activity, setActivity] = useState<ActivityType>("drive");
  const [visibility, setVisibility] = useState<RouteVisibility>("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The sheet is mounted for the life of the map screen and only toggled by
  // `visible`, so without this the fields keep whatever the last drive left
  // in them — including a stale "Drive to <somewhere I am not going>".
  useEffect(() => {
    if (!visible) return;
    setTitle(defaultTitle);
    setDescription("");
    setActivity("drive");
    setVisibility("public");
    setSaving(false);
    setError(null);
    // `defaultTitle` is derived from the destination, which is fixed for the
    // drive being saved; re-running on every keystroke would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSave = useCallback(async () => {
    if (saving) return;

    const problem = validateRouteDraft({
      title,
      description,
      pathLength: path.length,
    });
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const simplified = simplifyPath(path, 400);
      const polyline = encodePolyline(simplified);
      const start = path[0];
      const end = path[path.length - 1];

      const { id, error: saveError } = await saveRoute({
        title: title.trim(),
        description: description.trim(),
        activity_type: activity,
        route_polyline: polyline,
        speed_profile: speedProfile ?? null,
        start_lat: start.latitude,
        start_lng: start.longitude,
        end_lat: end.latitude,
        end_lng: end.longitude,
        origin_name: originName ?? "",
        destination_name: destinationName ?? "",
        distance_km: distanceMeters / 1000,
        duration_seconds: Math.round(durationSeconds),
        avg_speed_kmh: avgSpeedKmh,
        top_speed_kmh: topSpeedKmh,
        xp_earned: xpEarned,
        visibility,
        car_id: carId ?? null,
      });

      if (saveError) {
        setError(saveError);
        return;
      }
      // Best-effort: the route saved fine either way, so a failure here
      // (or no tripId, on drives that failed their automatic trips write)
      // must not block the sheet from closing.
      if (tripId) {
        supabase.from("trips").update({ name: title.trim() }).eq("id", tripId).then();
      }
      if (id) onSaved?.(id);
      onClose();
    } catch (err) {
      // Encoding the polyline or the store itself throwing must not leave
      // the button spinning with nothing said.
      setError(describeSaveFailure(err));
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    title,
    description,
    path,
    saveRoute,
    activity,
    originName,
    destinationName,
    distanceMeters,
    durationSeconds,
    avgSpeedKmh,
    topSpeedKmh,
    xpEarned,
    visibility,
    carId,
    tripId,
    onSaved,
    onClose,
  ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <RouteIcon size={18} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                </View>
                <Text style={styles.headerTitle}>SAVE ROUTE</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close save route"
                hitSlop={spacing.spacingSm}
                onPress={onClose}
                style={styles.closeBtn}
              >
                <X size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              {/* Stats strip — a utility surface, so a plain rect. */}
              <View style={styles.statsStrip}>
                <StatColumn
                  glyph={RouteIcon}
                  value={fmtMeters(distanceMeters)}
                  unit={metersUnit(distanceMeters)}
                  label="DISTANCE"
                />
                <View style={styles.statDivider} />
                <StatColumn glyph={Timer} value={fmtDuration(durationSeconds)} label="TIME" />
                <View style={styles.statDivider} />
                <StatColumn
                  glyph={Gauge}
                  value={Number.isFinite(avgSpeedKmh) ? convertSpeed(avgSpeedKmh, speedUnit).toFixed(0) : "0"}
                  unit={speedUnitLabel(speedUnit)}
                  label="AVG"
                />
              </View>

              <Text style={styles.label}>Route name</Text>
              <TextInput
                style={styles.input}
                placeholder="Sunset Canyon Run"
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
                maxLength={TITLE_MAX}
              />

              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="How was the drive? Add notes for your followers…"
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={DESCRIPTION_MAX}
              />

              <Text style={styles.label}>Activity type</Text>
              <View style={styles.chipRow}>
                {ACTIVITY_OPTIONS.map((opt) => {
                  const active = activity === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => setActivity(opt.key)}
                    >
                      <opt.icon
                        size={14}
                        color={active ? colors.textPrimary : colors.textSecondary}
                        strokeWidth={ICON_STROKE}
                      />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Who can see this?</Text>
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = visibility === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${opt.label}. ${opt.sub}`}
                    style={({ pressed }) => [
                      styles.visRow,
                      active && styles.visRowActive,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setVisibility(opt.key)}
                  >
                    <View style={[styles.visIcon, active && styles.visIconActive]}>
                      <opt.icon
                        size={16}
                        color={active ? colors.textPrimary : colors.textSecondary}
                        strokeWidth={ICON_STROKE}
                      />
                    </View>
                    <View style={styles.visText}>
                      <Text style={[styles.visLabel, active && styles.visLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.visSub}>{opt.sub}</Text>
                    </View>
                    {/* A square mark, not a radio dot — the shape policy has
                        no pill or circle outside avatars. */}
                    <View style={[styles.mark, active && styles.markActive]}>
                      {active ? <View style={styles.markFill} /> : null}
                    </View>
                  </Pressable>
                );
              })}

              {/* Says the ceiling out loud rather than letting the driver
                  find it by pressing Save on their eleventh drive. */}
              <TierLimitNotice
                current={myRoutes.length}
                cap={savedRouteLimit}
                noun="routes"
                benefit="routes"
                atCapMessage={`Your route library is full at ${savedRouteLimit}. Delete one, or go Platinum for unlimited.`}
                style={styles.limitNotice}
              />
            </ScrollView>

            {/* Action bar — outside the scroller so it is always reachable,
                with the failure reason directly above it. */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
              {error ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
              <CutCornerButton
                title={saving ? "Saving…" : "Save Route"}
                corners="topRight"
                disabled={saving}
                onPress={handleSave}
                accessibilityLabel="Save this route to your profile"
                icon={
                  saving ? (
                    <ActivityIndicator size="small" color={onRacingRed} />
                  ) : (
                    <RouteIcon size={18} color={onRacingRed} strokeWidth={ICON_STROKE} />
                  )
                }
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  // `flex: 1` is load-bearing: without a definite height on this wrapper the
  // sheet's percentage maxHeight resolves to nothing and the sheet grows off
  // the bottom of the screen.
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.carbonSurface,
    borderTopWidth: borderWidth.hairline,
    borderLeftWidth: borderWidth.hairline,
    borderRightWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingXl,
    paddingTop: spacing.spacingLg,
    maxHeight: "92%",
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.spacingMd,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sharp,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  headerTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: spacing.spacingLg,
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingVertical: spacing.spacingMd,
  },
  statColumn: {
    flex: 1,
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  statDivider: {
    width: borderWidth.hairline,
    backgroundColor: colors.hairline,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  statValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  statUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  statLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  label: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
    marginTop: spacing.spacingLg,
    marginBottom: spacing.spacingSm,
  },
  input: {
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    color: colors.textPrimary,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
    ...textStyle("body"),
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingSm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.voidBlack,
  },
  chipActive: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.hairline,
  },
  chipText: {
    ...textStyle("caption", { fontFamily: fontFamily.bodyMedium }),
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textPrimary,
  },
  visRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingMd,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.voidBlack,
    marginBottom: spacing.spacingSm,
  },
  visRowActive: {
    borderColor: colors.textPrimary,
  },
  visIcon: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  visIconActive: {
    backgroundColor: colors.hairline,
    borderColor: colors.textPrimary,
  },
  visText: {
    flex: 1,
    gap: spacing.spacingXs / 2,
  },
  visLabel: {
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textSecondary,
  },
  visLabelActive: {
    color: colors.textPrimary,
  },
  visSub: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  mark: {
    width: spacing.spacingLg,
    height: spacing.spacingLg,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  markActive: {
    borderColor: colors.textPrimary,
  },
  markFill: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    backgroundColor: colors.textPrimary,
  },
  limitNotice: {
    marginTop: spacing.spacingLg,
  },
  footer: {
    paddingTop: spacing.spacingLg,
    gap: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  errorText: {
    ...textStyle("caption"),
    color: colors.racingRed,
  },
});
