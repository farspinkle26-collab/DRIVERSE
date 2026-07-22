import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import * as Location from "expo-location";
import {
  ArrowLeft,
  Coffee,
  Wrench,
  MapPin,
  Star,
  Navigation2,
  Clock,
  RefreshCw,
} from "lucide-react-native";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLEMAPS || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

type PlaceKind = "cafe" | "workshop";

const KIND_CONFIG: Record<PlaceKind, {
  title: string;
  subtitle: string;
  googleType: string;
  keyword?: string;
  icon: React.FC<{ size: number; color: string }>;
  color: string;
  emptyLabel: string;
}> = {
  cafe: {
    title: "Café Finder",
    subtitle: "Nearest pit stops & hangouts",
    googleType: "cafe",
    icon: Coffee,
    color: "#8B5CF6",
    emptyLabel: "cafés",
  },
  workshop: {
    title: "Workshops",
    subtitle: "Nearest tuning & repair shops",
    googleType: "car_repair",
    icon: Wrench,
    color: "#F59E0B",
    emptyLabel: "workshops",
  },
};

interface NearbyPlace {
  id: string;
  name: string;
  vicinity?: string;
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean;
  lat: number;
  lng: number;
  distanceMeters: number;
}

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

function fmtDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function NearbyPlacesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const kind: PlaceKind = params.type === "workshop" ? "workshop" : "cafe";
  const config = KIND_CONFIG[kind];
  const Icon = config.icon;

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNearby = useCallback(async (coords: { latitude: number; longitude: number }) => {
    if (!GOOGLE_API_KEY) {
      setError("Google Maps API key not configured");
      setPlaces([]);
      return;
    }
    try {
      // rankby=distance returns results ordered nearest-first and requires
      // type/keyword/name instead of a radius.
      const url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${coords.latitude},${coords.longitude}` +
        `&rankby=distance` +
        `&type=${config.googleType}` +
        `&key=${GOOGLE_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === "OK" && Array.isArray(data.results)) {
        const mapped: NearbyPlace[] = data.results.map((place: any) => {
          const lat = place.geometry.location.lat;
          const lng = place.geometry.location.lng;
          return {
            id: place.place_id,
            name: place.name,
            vicinity: place.vicinity,
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
            openNow: place.opening_hours?.open_now,
            lat,
            lng,
            distanceMeters: haversineMeters(coords, { latitude: lat, longitude: lng }),
          };
        });
        mapped.sort((a, b) => a.distanceMeters - b.distanceMeters);
        setPlaces(mapped);
        setError(mapped.length === 0 ? `No nearby ${config.emptyLabel} found` : null);
      } else if (data.status === "ZERO_RESULTS") {
        setPlaces([]);
        setError(`No nearby ${config.emptyLabel} found`);
      } else {
        setPlaces([]);
        setError(data.error_message || "Could not load nearby places");
      }
    } catch {
      setPlaces([]);
      setError("Could not reach Google Maps");
    }
  }, [config.googleType, config.emptyLabel]);

  const locateAndFetch = useCallback(async () => {
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission is needed to find the nearest place");
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coords);
      await fetchNearby(coords);
    } catch {
      setError("Could not get your current location");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchNearby]);

  useEffect(() => {
    setLoading(true);
    locateAndFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    locateAndFetch();
  }, [locateAndFetch]);

  const openDirections = useCallback((place: NearbyPlace) => {
    const label = encodeURIComponent(place.name);
    const url = Platform.select({
      ios: `maps://app?daddr=${place.lat},${place.lng}&q=${label}`,
      android: `google.navigation:q=${place.lat},${place.lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&destination_place_id=${place.id}`,
    });
    Linking.openURL(url as string).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`);
    });
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.topTitle}>{config.title}</Text>
          <Text style={styles.topSubtitle}>{config.subtitle}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.backBtn} hitSlop={8}>
          <RefreshCw size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={config.color} size="large" />
          <Text style={styles.emptyTitle}>Finding the nearest {kind === "cafe" ? "café" : "workshop"}…</Text>
        </View>
      ) : error && places.length === 0 ? (
        <View style={styles.empty}>
          <Icon size={44} color="#3A3A4E" />
          <Text style={styles.emptyTitle}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: config.color }]} onPress={onRefresh}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={config.color} />}
        >
          {places.length > 0 && (
            <View style={[styles.nearestBanner, { borderColor: config.color + "33", backgroundColor: config.color + "12" }]}>
              <Icon size={16} color={config.color} />
              <Text style={[styles.nearestBannerText, { color: config.color }]}>
                Nearest: {places[0].name} · {fmtDistance(places[0].distanceMeters)} away
              </Text>
            </View>
          )}

          {places.map((place, index) => (
            <TouchableOpacity
              key={place.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => openDirections(place)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconWrap, { backgroundColor: config.color + "20" }]}>
                  <Icon size={20} color={config.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{place.name}</Text>
                  {!!place.vicinity && (
                    <Text style={styles.cardSub} numberOfLines={1}>{place.vicinity}</Text>
                  )}
                </View>
                {index === 0 && (
                  <View style={[styles.nearestPill, { backgroundColor: config.color }]}>
                    <Text style={styles.nearestPillText}>NEAREST</Text>
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <MapPin size={13} color="#8A8A9A" />
                  <Text style={styles.metaText}>{fmtDistance(place.distanceMeters)}</Text>
                </View>
                {place.rating != null && (
                  <View style={styles.metaItem}>
                    <Star size={13} color="#FBBF24" fill="#FBBF24" />
                    <Text style={styles.metaText}>
                      {place.rating.toFixed(1)}
                      {place.userRatingsTotal ? ` (${place.userRatingsTotal})` : ""}
                    </Text>
                  </View>
                )}
                {place.openNow != null && (
                  <View style={styles.metaItem}>
                    <Clock size={13} color={place.openNow ? "#22C55E" : "#EF4444"} />
                    <Text style={[styles.metaText, { color: place.openNow ? "#22C55E" : "#EF4444" }]}>
                      {place.openNow ? "Open now" : "Closed"}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.directionsBtn}>
                <Navigation2 size={14} color={config.color} />
                <Text style={[styles.directionsText, { color: config.color }]}>Get Directions</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  topSubtitle: { fontSize: 12, color: "#8A8A9A", marginTop: 2 },
  nearestBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  nearestBannerText: { fontSize: 13, fontWeight: "700", flex: 1 },
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  cardSub: { fontSize: 12, color: "#8A8A9A", marginTop: 2 },
  nearestPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nearestPillText: { fontSize: 9, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.5 },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12, fontWeight: "600", color: "#C4C4D0" },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    alignSelf: "flex-start",
  },
  directionsText: { fontSize: 13, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#8A8A9A", marginTop: 14, textAlign: "center" },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});
