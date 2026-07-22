import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { ArrowLeft, MapPin, Route as RouteIcon, Timer, Gauge, TrendingUp, Zap, Flag, Pencil } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { decodePolyline, regionForPath } from "@/lib/polyline";
import { useTheme } from "@/hooks/useThemeStore";
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from "@/constants/mapStyles";
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
  const mapRef = useRef<MapView>(null);
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
  // otherwise the origin/destination pair — even a two-point fallback
  // deserves a proper fit instead of trusting initialRegion alone, since
  // it can render at a stale zoom before the native view has laid out.
  const fitPoints = useMemo(() => {
    if (coords.length > 1) return coords;
    const pts: { latitude: number; longitude: number }[] = [];
    if (trip?.origin_lat && trip?.origin_lng) pts.push({ latitude: trip.origin_lat, longitude: trip.origin_lng });
    if (trip?.destination_lat && trip?.destination_lng) pts.push({ latitude: trip.destination_lat, longitude: trip.destination_lng });
    return pts;
  }, [coords, trip]);

  const fitToPoints = useCallback(() => {
    if (fitPoints.length > 1) {
      mapRef.current?.fitToCoordinates(fitPoints, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }
  }, [fitPoints]);

  useEffect(() => {
    const t = setTimeout(fitToPoints, 400);
    return () => clearTimeout(t);
  }, [fitToPoints]);

  const region = regionForPath(fitPoints.length > 0 ? fitPoints : coords);

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
        <ActivityIndicator color="#FF6B35" style={{ marginTop: 60 }} />
      ) : !trip ? (
        <View style={styles.notFound}>
          <RouteIcon size={44} color="#3A3A4E" />
          <Text style={styles.notFoundText}>Trip not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
              initialRegion={region}
              customMapStyle={isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
              onMapReady={fitToPoints}
            >
              {coords.length > 1 && (
                <>
                  <Polyline coordinates={coords} strokeWidth={8} strokeColor="rgba(255,107,53,0.25)" lineCap="round" />
                  <Polyline coordinates={coords} strokeWidth={4} strokeColor="#FF6B35" lineCap="round" />
                </>
              )}
              {coords.length > 0 && (
                <Marker coordinate={coords[0]} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[styles.endpoint, { backgroundColor: "#00D4AA" }]} />
                </Marker>
              )}
              {coords.length > 1 && (
                <Marker coordinate={coords[coords.length - 1]} anchor={{ x: 0.5, y: 1 }}>
                  <Flag size={26} color="#FF3B6F" fill="#FF3B6F30" />
                </Marker>
              )}
              {coords.length === 0 && trip.origin_lat && trip.origin_lng && (
                <Marker coordinate={{ latitude: trip.origin_lat, longitude: trip.origin_lng }} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[styles.endpoint, { backgroundColor: "#00D4AA" }]} />
                </Marker>
              )}
              {coords.length === 0 && trip.destination_lat && trip.destination_lng && (
                <Marker coordinate={{ latitude: trip.destination_lat, longitude: trip.destination_lng }} anchor={{ x: 0.5, y: 1 }}>
                  <Flag size={26} color="#FF3B6F" fill="#FF3B6F30" />
                </Marker>
              )}
            </MapView>
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
                <RouteIcon size={16} color="#FF6B35" />
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
