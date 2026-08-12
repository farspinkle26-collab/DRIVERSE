import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { ArrowLeft, MapPin, Route as RouteIcon, Timer, Gauge, TrendingUp, Zap, Pencil, Send, Share2 } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { decodePolyline } from "@/lib/polyline";
import { useTheme } from "@/hooks/useThemeStore";
import { useAuth } from "@/hooks/useAuthStore";
import { speedUnitForCountry } from "@/lib/speedUnits";
import RenameModal from "@/components/RenameModal";
import ShareCardModal from "@/components/ShareCardModal";
import ShareTripToFriendModal from "@/components/ShareTripToFriendModal";
import { ICON_STROKE } from "@/components/TripCard";
import type { Trip } from "@/components/TripCard";
import { loadMapbox, initMapbox } from "@/lib/mapboxNative";
import { useMapboxCamera } from "@/hooks/useMapboxCamera";
import { toPosition } from "@/lib/mapboxCoords";
import { mapboxStyleUrl } from "@/constants/mapbox";
import MapPolyline from "@/components/MapPolyline";
import { DestinationMark } from "@/components/MapGlyphs";
import { CutCornerCard, CutCornerBadge } from "@/components/CutCorner";
import { SpeedLegend } from "@/components/SpeedTrace";
import { heatSegments, speedDomain, speedProfileForTrip, SPEED_HEAT_FLAT } from "@/lib/speedTrace";
import {
  driveScore,
  formatDistance,
  formatDuration,
  formatSpeed,
  SCORE_STANDOUT,
} from "@/lib/tripStats";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface TripDetail {
  id: string;
  name: string | null;
  origin_name: string;
  origin_lat: number;
  origin_lng: number;
  destination_name: string;
  destination_lat: number;
  destination_lng: number;
  route_polyline: string;
  /** Per-point km/h behind the speed heatmap — see `lib/speedTrace.ts`. */
  speed_profile: string | null;
  car_id: string | null;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  top_speed_kmh: number;
  /** Feeds `driveScore`'s pace penalty. Not selected before this screen used it. */
  estimated_duration_seconds: number | null;
  xp_earned: number;
  was_faster_than_estimation: boolean;
  completed_at: string;
}

/** The garage car this drive was logged in, as the share card wants it. */
interface TripCar {
  name: string;
  make: string | null;
  model: string | null;
  year: string | null;
  color: string | null;
  hp: number | null;
  photo_url: string | null;
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const speedUnit = useMemo(() => speedUnitForCountry(user?.country), [user?.country]);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [car, setCar] = useState<TripCar | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRename, setShowRename] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showShareToFriend, setShowShareToFriend] = useState(false);

  /**
   * `loadMapbox()` rather than a static import — the package reaches a
   * throwing native lookup at module scope, so the platform/native-module
   * check has to come first. See LAUNCH_SAFETY_REFERENCE.md §20 and
   * `lib/mapboxNative.ts`. `initMapbox()` hands over the access token from a
   * mount effect, never at import time (§1/§2).
   */
  const Mapbox = loadMapbox();
  const { ref: cameraRef, fitTo: fitToCoordinates } = useMapboxCamera();
  useEffect(() => {
    initMapbox();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { data } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      const row = (data as TripDetail) ?? null;
      setTrip(row);
      setLoading(false);

      // The car is a second round trip on purpose: it only feeds the share
      // card, so it must never hold up the screen, and a garage car that has
      // since been deleted just means the card has no car strip.
      if (!row?.car_id) {
        setCar(null);
        return;
      }
      const { data: carRow } = await supabase
        .from("car_collections")
        .select("name, make, model, year, color, hp, photo_url")
        .eq("id", row.car_id)
        .maybeSingle();
      if (!cancelled) setCar((carRow as TripCar) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const defaultTripName = trip
    ? trip.destination_name && trip.destination_name !== "Unknown"
      ? `Drive to ${trip.destination_name}`
      : "Drive"
    : "Drive";
  const tripDisplayName = trip?.name?.trim() ? trip.name : defaultTripName;

  const handleRename = async (value: string) => {
    if (!trip) return;
    setRenaming(true);
    const { error } = await supabase.from("trips").update({ name: value }).eq("id", trip.id);
    setRenaming(false);
    if (!error) {
      setTrip((prev) => (prev ? { ...prev, name: value } : prev));
      setShowRename(false);
    }
  };

  const coords = useMemo(
    () => (trip?.route_polyline ? decodePolyline(trip.route_polyline) : []),
    [trip?.route_polyline]
  );

  // Points to frame the camera around: the recorded path if we have one,
  // otherwise the origin/destination pair — even a two-point fallback
  // deserves a proper fit instead of trusting the default camera alone,
  // since it can render at a stale zoom before the native view has laid out.
  const fitPoints = useMemo(() => {
    if (coords.length > 1) return coords;
    const pts: { latitude: number; longitude: number }[] = [];
    if (trip?.origin_lat && trip?.origin_lng) pts.push({ latitude: trip.origin_lat, longitude: trip.origin_lng });
    if (trip?.destination_lat && trip?.destination_lng) pts.push({ latitude: trip.destination_lat, longitude: trip.destination_lng });
    return pts;
  }, [coords, trip]);

  const fitToPoints = useCallback(() => {
    if (fitPoints.length > 1) {
      fitToCoordinates(fitPoints, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        duration: 500,
      });
    }
  }, [fitPoints, fitToCoordinates]);

  useEffect(() => {
    const t = setTimeout(fitToPoints, 400);
    return () => clearTimeout(t);
  }, [fitToPoints]);

  /**
   * The same speed heatmap the share card draws — see `lib/speedTrace.ts`.
   * Measured where the recorder wrote a profile, derived from geometry
   * otherwise, flat where neither is usable. Quantised into
   * `HEAT_BUCKETS` runs so the map mounts a handful of `MapPolyline`s
   * rather than one per GPS fix.
   */
  const profile = useMemo(
    () => (trip ? speedProfileForTrip(trip, coords) : { speeds: [] as number[], source: "none" as const }),
    [trip, coords]
  );
  const domain = useMemo(() => speedDomain(profile.speeds), [profile.speeds]);
  const segments = useMemo(
    () => (coords.length > 1 ? heatSegments(coords, profile.speeds, domain) : []),
    [coords, profile.speeds, domain]
  );

  const score = trip ? driveScore(trip) : 0;
  const distance = trip ? formatDistance(trip.distance_km) : formatDistance(0);
  const duration = trip ? formatDuration(trip.duration_seconds) : formatDuration(0);
  const avgSpeed = trip ? formatSpeed(trip.avg_speed_kmh, speedUnit) : formatSpeed(0, speedUnit);
  const topSpeed = trip ? formatSpeed(trip.top_speed_kmh ?? 0, speedUnit) : formatSpeed(0, speedUnit);

  const legendWidth = SCREEN_WIDTH - spacing.spacingXl * 2;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.spacingSm }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{trip ? tripDisplayName : "Trip"}</Text>
        {trip ? (
          <View style={styles.topActions}>
            <TouchableOpacity onPress={() => setShowShareToFriend(true)} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Send this trip to a friend">
              <Send size={18} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowShare(true)} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Share this trip">
              <Share2 size={18} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowRename(true)} style={styles.iconBtn} hitSlop={8}>
              <Pencil size={18} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: spacing.spacingXxl + spacing.spacingSm }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.racingRed} style={{ marginTop: spacing.spacingXxxl + spacing.spacingMd }} />
      ) : !trip ? (
        <View style={styles.notFound}>
          <RouteIcon size={44} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          <Text style={styles.notFoundText}>Trip not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.spacingXxl }} showsVerticalScrollIndicator={false}>
          <View style={styles.mapWrap}>
            {Mapbox ? (
              <Mapbox.MapView
                style={StyleSheet.absoluteFill}
                styleURL={mapboxStyleUrl(isDark)}
                zoomEnabled
                scrollEnabled
                pitchEnabled
                rotateEnabled
                compassEnabled={false}
                scaleBarEnabled={false}
                // Required by Mapbox's terms for apps drawing their maps, and
                // the attribution control carries the OpenStreetMap credit
                // the data requires — see `lib/mapboxNative.ts`.
                logoEnabled
                attributionEnabled
                onDidFinishLoadingMap={fitToPoints}
              >
                <Mapbox.Camera
                  ref={cameraRef}
                  defaultSettings={{
                    centerCoordinate: toPosition(fitPoints[0] ?? { latitude: -6.2088, longitude: 106.8456 }),
                    zoomLevel: 12,
                  }}
                />

                {coords.length > 1 && (
                  <>
                    <MapPolyline id="trip-casing" points={coords} width={8} color={colors.voidBlack} opacity={0.55} />
                    {segments.length > 0 ? (
                      segments.map((seg, i) => (
                        <MapPolyline key={`trip-heat-${i}`} id={`trip-heat-${i}`} points={seg.points} width={5} color={seg.color} />
                      ))
                    ) : (
                      <MapPolyline id="trip-flat" points={coords} width={5} color={SPEED_HEAT_FLAT} />
                    )}
                  </>
                )}

                {coords.length > 0 && (
                  <Mapbox.MarkerView coordinate={toPosition(coords[0])} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
                    <View style={styles.startDot} />
                  </Mapbox.MarkerView>
                )}
                {coords.length > 1 && (
                  <Mapbox.MarkerView coordinate={toPosition(coords[coords.length - 1])} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
                    <DestinationMark size={28} />
                  </Mapbox.MarkerView>
                )}
                {coords.length === 0 && trip.origin_lat && trip.origin_lng && (
                  <Mapbox.MarkerView
                    coordinate={toPosition({ latitude: trip.origin_lat, longitude: trip.origin_lng })}
                    anchor={{ x: 0.5, y: 0.5 }}
                    allowOverlap
                  >
                    <View style={styles.startDot} />
                  </Mapbox.MarkerView>
                )}
                {coords.length === 0 && trip.destination_lat && trip.destination_lng && (
                  <Mapbox.MarkerView
                    coordinate={toPosition({ latitude: trip.destination_lat, longitude: trip.destination_lng })}
                    anchor={{ x: 0.5, y: 0.5 }}
                    allowOverlap
                  >
                    <DestinationMark size={28} />
                  </Mapbox.MarkerView>
                )}
              </Mapbox.MapView>
            ) : (
              <View style={styles.mapUnavailable}>
                <Text style={styles.mapUnavailableText}>The map isn&apos;t available in this build.</Text>
              </View>
            )}
          </View>

          {profile.source !== "none" && coords.length > 1 && (
            <View style={styles.legendRow}>
              <SpeedLegend topSpeedKmh={domain.max} width={legendWidth} unit={speedUnit} />
            </View>
          )}

          <View style={styles.body}>
            <TouchableOpacity style={styles.nameRow} onPress={() => setShowRename(true)} activeOpacity={0.7}>
              <Text style={styles.nameText} numberOfLines={1}>{tripDisplayName}</Text>
              <Pencil size={14} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </TouchableOpacity>

            <View style={styles.routeLine}>
              <MapPin size={13} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <Text style={styles.routeLineText} numberOfLines={2}>
                {trip.origin_name || "Start"} → {trip.destination_name || "Finish"}
              </Text>
            </View>

            {/* Hero readout + score — the same pairing the Drive Hub's trip
                card uses (components/TripCard.tsx), so a drive reads the
                same way whether it is being scrolled past or opened. */}
            <View style={styles.heroRow}>
              <View style={styles.heroValueRow}>
                <Text style={styles.heroValue}>{distance.value}</Text>
                <Text style={styles.heroUnit}>{distance.unit}</Text>
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreLabel}>SCORE</Text>
                <CutCornerBadge
                  label={String(score)}
                  numeric
                  solid={score >= SCORE_STANDOUT}
                  color={score >= SCORE_STANDOUT ? colors.racingRed : colors.hairline}
                  textColor={colors.textPrimary}
                  corners="topRight"
                />
              </View>
            </View>

            <View style={styles.statsGrid}>
              <CutCornerCard corners="topRight" cutSize={cut.sm} style={styles.statBox} contentStyle={styles.statBoxContent}>
                <Timer size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                <Text style={styles.statBoxValue}>{duration.value}</Text>
                <Text style={styles.statBoxLabel}>{duration.unit}</Text>
              </CutCornerCard>
              <CutCornerCard corners="topRight" cutSize={cut.sm} style={styles.statBox} contentStyle={styles.statBoxContent}>
                <TrendingUp size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                <Text style={styles.statBoxValue}>{avgSpeed.value}</Text>
                <Text style={styles.statBoxLabel}>avg {avgSpeed.unit}</Text>
              </CutCornerCard>
              <CutCornerCard corners="topRight" cutSize={cut.sm} style={styles.statBox} contentStyle={styles.statBoxContent}>
                <Gauge size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                <Text style={styles.statBoxValue}>{topSpeed.value}</Text>
                <Text style={styles.statBoxLabel}>top {topSpeed.unit}</Text>
              </CutCornerCard>
            </View>

            {trip.xp_earned > 0 && (
              <View style={styles.xpRow}>
                <Zap size={15} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                <Text style={styles.xpText}>Earned +{trip.xp_earned} XP on this drive</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {trip && (
        <RenameModal
          visible={showRename}
          title="Rename Trip"
          initialValue={tripDisplayName}
          placeholder="e.g. Sunset Canyon Run"
          saving={renaming}
          onCancel={() => setShowRename(false)}
          onSave={handleRename}
        />
      )}

      {trip && (
        <ShareCardModal
          visible={showShare}
          onClose={() => setShowShare(false)}
          type="trip"
          payload={{ trip: trip as unknown as Trip, car }}
          caption={`${tripDisplayName} · ${trip.distance_km.toFixed(1)} km on Driveverse`}
        />
      )}

      {trip && (
        <ShareTripToFriendModal
          visible={showShareToFriend}
          onClose={() => setShowShareToFriend(false)}
          trip={{
            id: trip.id,
            title: tripDisplayName,
            distanceLabel: `${distance.value} ${distance.unit}`,
            durationLabel: duration.value,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingMd,
    gap: spacing.spacingSm,
  },
  iconBtn: {
    width: spacing.spacingXxl + spacing.spacingSm,
    height: spacing.spacingXxl + spacing.spacingSm,
    borderRadius: radius.circle,
    backgroundColor: alpha(colors.textPrimary, 0.06),
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: {
    flex: 1,
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    textAlign: "center",
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  mapWrap: {
    height: 300,
    marginHorizontal: spacing.spacingLg,
    borderRadius: radius.sharp,
    overflow: "hidden",
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.carbonSurface,
  },
  mapUnavailable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.spacingXl,
  },
  mapUnavailableText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
  },
  startDot: {
    width: 16,
    height: 16,
    borderRadius: radius.circle,
    borderWidth: borderWidth.emphasis,
    borderColor: colors.voidBlack,
    backgroundColor: colors.textPrimary,
  },
  legendRow: {
    paddingHorizontal: spacing.spacingXl,
    paddingTop: spacing.spacingMd,
  },
  body: { padding: spacing.spacingXl, gap: spacing.spacingMd },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  nameText: { ...textStyle("displayMd"), color: colors.textPrimary, flexShrink: 1 },
  routeLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.spacingSm },
  routeLineText: { ...textStyle("caption"), color: colors.textSecondary, flex: 1, lineHeight: 18 },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: spacing.spacingSm,
  },
  heroValueRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.spacingXs },
  heroValue: { ...textStyle("dataLg"), color: colors.textPrimary },
  heroUnit: { ...textStyle("caption"), color: colors.textSecondary },
  scoreBadge: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  scoreLabel: { ...textStyle("caption"), color: colors.textSecondary, letterSpacing: 1 },
  statsGrid: { flexDirection: "row", gap: spacing.spacingSm },
  statBox: { flex: 1 },
  statBoxContent: {
    paddingVertical: spacing.spacingMd,
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  statBoxValue: { ...textStyle("dataSm"), color: colors.textPrimary },
  statBoxLabel: { ...textStyle("caption"), color: colors.textSecondary },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    backgroundColor: alpha(colors.racingRed, 0.08),
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: alpha(colors.racingRed, 0.25),
    padding: spacing.spacingMd,
  },
  xpText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold }), color: colors.racingRed },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.spacingXxl, gap: spacing.spacingMd },
  notFoundText: { ...textStyle("body"), color: colors.textSecondary },
});
