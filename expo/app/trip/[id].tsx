import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapView, Camera, MarkerView, ShapeSource, LineLayer, StyleImport } from "@/lib/mapboxCompat";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { ArrowLeft, MapPin, Route as RouteIcon, Timer, Gauge, TrendingUp, Zap, Flag, Pencil } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { decodePolyline, boundsForPath } from "@/lib/polyline";
import { useTheme } from "@/hooks/useThemeStore";
import { MAPBOX_STYLE_URL_STANDARD, getMapboxStaticImageUrl } from "@/constants/mapbox";
import { lineStringFeature } from "@/lib/geo";
import RenameModal from "@/components/RenameModal";

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
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  top_speed_kmh: number;
  xp_earned: number;
  was_faster_than_estimation: boolean;
  completed_at: string;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark } = useTheme();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRename, setShowRename] = useState(false);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { data } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
      if (!cancelled) {
        setTrip((data as TripDetail) ?? null);
        setLoading(false);
      }
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
  // otherwise the origin/destination pair.
  const fitPoints = useMemo(() => {
    if (coords.length > 1) return coords;
    const pts: { latitude: number; longitude: number }[] = [];
    if (trip?.origin_lat && trip?.origin_lng) pts.push({ latitude: trip.origin_lat, longitude: trip.origin_lng });
    if (trip?.destination_lat && trip?.destination_lng) pts.push({ latitude: trip.destination_lat, longitude: trip.destination_lng });
    return pts;
  }, [coords, trip]);

  const bounds = useMemo(() => boundsForPath(fitPoints.length > 0 ? fitPoints : coords), [fitPoints, coords]);
  const singlePoint = fitPoints.length === 1 ? fitPoints[0] : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{trip ? tripDisplayName : "Trip"}</Text>
        {trip ? (
          <TouchableOpacity onPress={() => setShowRename(true)} style={styles.iconBtn} hitSlop={8}>
            <Pencil size={18} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#FF3B30" style={{ marginTop: 60 }} />
      ) : !trip ? (
        <View style={styles.notFound}>
          <RouteIcon size={44} color="#3A3A4E" />
          <Text style={styles.notFoundText}>Trip not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          <View style={styles.mapWrap}>
            {Platform.OS === "web" ? (
              (singlePoint ?? coords[0]) ? (
                <Image
                  source={{ uri: getMapboxStaticImageUrl((singlePoint ?? coords[0])!.latitude, (singlePoint ?? coords[0])!.longitude, { dark: isDark, width: 600, height: 300, zoom: 12 }) }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              ) : null
            ) : (
              <MapView style={StyleSheet.absoluteFill} styleURL={MAPBOX_STYLE_URL_STANDARD} scaleBarEnabled={false}>
                <Camera
                  bounds={bounds ? { ...bounds, paddingTop: 60, paddingBottom: 60, paddingLeft: 40, paddingRight: 40 } : undefined}
                  centerCoordinate={!bounds && singlePoint ? [singlePoint.longitude, singlePoint.latitude] : undefined}
                  zoomLevel={!bounds && singlePoint ? 14 : undefined}
                  animationDuration={0}
                />
                {/* Hide base-map POI/transit labels so they don't clutter this route preview
                    (matches the original Google-style-JSON HIDE_POI_LABELS behavior). */}
                <StyleImport
                  id="basemap"
                  existing
                  config={{ lightPreset: isDark ? "night" : "day", showPointOfInterestLabels: false, showTransitLabels: false }}
                />

                {coords.length > 1 && (
                  <>
                    <ShapeSource id="tripRouteGlow" shape={lineStringFeature(coords)}>
                      <LineLayer id="tripRouteGlowLine" style={{ lineWidth: 8, lineColor: "rgba(255,59,48,0.25)", lineCap: "round", lineJoin: "round" }} />
                    </ShapeSource>
                    <ShapeSource id="tripRoute" shape={lineStringFeature(coords)}>
                      <LineLayer id="tripRouteLine" style={{ lineWidth: 4, lineColor: "#FF3B30", lineCap: "round", lineJoin: "round" }} />
                    </ShapeSource>
                  </>
                )}
                {coords.length > 0 && (
                  <MarkerView coordinate={[coords[0].longitude, coords[0].latitude]} anchor={{ x: 0.5, y: 0.5 }}>
                    <View style={[styles.endpoint, { backgroundColor: "#00D4AA" }]} />
                  </MarkerView>
                )}
                {coords.length > 1 && (
                  <MarkerView coordinate={[coords[coords.length - 1].longitude, coords[coords.length - 1].latitude]} anchor={{ x: 0.5, y: 1 }}>
                    <Flag size={26} color="#FF3B6F" fill="#FF3B6F30" />
                  </MarkerView>
                )}
                {coords.length === 0 && trip.origin_lat && trip.origin_lng && (
                  <MarkerView coordinate={[trip.origin_lng, trip.origin_lat]} anchor={{ x: 0.5, y: 0.5 }}>
                    <View style={[styles.endpoint, { backgroundColor: "#00D4AA" }]} />
                  </MarkerView>
                )}
                {coords.length === 0 && trip.destination_lat && trip.destination_lng && (
                  <MarkerView coordinate={[trip.destination_lng, trip.destination_lat]} anchor={{ x: 0.5, y: 1 }}>
                    <Flag size={26} color="#FF3B6F" fill="#FF3B6F30" />
                  </MarkerView>
                )}
              </MapView>
            )}
          </View>

          <View style={styles.body}>
            <TouchableOpacity style={styles.nameRow} onPress={() => setShowRename(true)} activeOpacity={0.7}>
              <Text style={styles.nameText} numberOfLines={1}>{tripDisplayName}</Text>
              <Pencil size={14} color="#8A8A9A" />
            </TouchableOpacity>

            <View style={styles.routeLine}>
              <MapPin size={13} color="#00D4AA" />
              <Text style={styles.routeLineText} numberOfLines={2}>
                {trip.origin_name || "Start"} → {trip.destination_name || "Finish"}
              </Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <RouteIcon size={16} color="#FF3B30" />
                <Text style={styles.statBoxValue}>{trip.distance_km.toFixed(1)}</Text>
                <Text style={styles.statBoxLabel}>km</Text>
              </View>
              <View style={styles.statBox}>
                <Timer size={16} color="#F59E0B" />
                <Text style={styles.statBoxValue}>{fmtDuration(trip.duration_seconds)}</Text>
                <Text style={styles.statBoxLabel}>time</Text>
              </View>
              <View style={styles.statBox}>
                <TrendingUp size={16} color="#3B82F6" />
                <Text style={styles.statBoxValue}>{trip.avg_speed_kmh.toFixed(0)}</Text>
                <Text style={styles.statBoxLabel}>km/h avg</Text>
              </View>
              <View style={styles.statBox}>
                <Gauge size={16} color="#FF3B6F" />
                <Text style={styles.statBoxValue}>{trip.top_speed_kmh.toFixed(0)}</Text>
                <Text style={styles.statBoxLabel}>km/h top</Text>
              </View>
            </View>

            {trip.xp_earned > 0 && (
              <View style={styles.xpRow}>
                <Zap size={15} color="#FFD700" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: "#FFFFFF", textAlign: "center" },
  mapWrap: {
    height: 300,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#12121C",
  },
  endpoint: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#0A0A0F",
  },
  body: { padding: 20 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  nameText: { fontSize: 20, fontWeight: "800", color: "#FFFFFF", flexShrink: 1 },
  routeLine: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 18 },
  routeLineText: { fontSize: 14, color: "#CACAD5", flex: 1, lineHeight: 19 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statBoxValue: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  statBoxLabel: { fontSize: 10, color: "#8A8A9A" },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,215,0,0.08)",
    borderRadius: 12,
    padding: 12,
  },
  xpText: { fontSize: 13, fontWeight: "700", color: "#FFD700" },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 10 },
  notFoundText: { fontSize: 18, fontWeight: "700", color: "#8A8A9A" },
});
