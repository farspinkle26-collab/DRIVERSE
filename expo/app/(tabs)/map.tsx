import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Animated,
  StatusBar,
  Dimensions,
} from "react-native";
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { BlurView } from "expo-blur";
import {
  Wrench,
  Coffee,
  Fuel,
  Zap,
  Calendar,
  Mountain,
  Users,
  AlertTriangle,
  Navigation,
  MapPin,
  Menu,
  Compass,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuthStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// POI data — in a real app this comes from a backend
const MOCK_POIS = [
  { id: "1", type: "workshop" as const, name: "Garage 75", lat: -6.2000, lng: 106.8430 },
  { id: "2", type: "cafe" as const, name: "Pit Stop Café", lat: -6.1950, lng: 106.8400 },
  { id: "3", type: "fuel" as const, name: "Shell V-Power", lat: -6.2100, lng: 106.8480 },
  { id: "4", type: "ev" as const, name: "Tesla Supercharger", lat: -6.1980, lng: 106.8500 },
  { id: "5", type: "event" as const, name: "Night Rally Meet", lat: -6.2050, lng: 106.8350 },
  { id: "6", type: "scenic" as const, name: "Coastal Highway", lat: -6.1900, lng: 106.8550 },
  { id: "7", type: "community" as const, name: "Jakarta Car Club", lat: -6.2150, lng: 106.8420 },
];

type POIType = "workshop" | "cafe" | "fuel" | "ev" | "event" | "scenic" | "community" | "emergency";

const POI_COLORS: Record<POIType, string> = {
  workshop: "#FF6B35",
  cafe: "#8B5CF6",
  fuel: "#F59E0B",
  ev: "#22C55E",
  event: "#FF3B6F",
  scenic: "#00D4AA",
  community: "#3B82F6",
  emergency: "#EF4444",
};

const POI_ICONS: Record<POIType, React.FC<{ size: number; color: string }>> = {
  workshop: Wrench,
  cafe: Coffee,
  fuel: Fuel,
  ev: Zap,
  event: Calendar,
  scenic: Mountain,
  community: Users,
  emergency: AlertTriangle,
};

const MAP_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0F0F18" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5A5A6E" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0F0F18" }] },
  { elementType: "road", stylers: [{ color: "#1A1A2A" }] },
  { elementType: "road.highway", stylers: [{ color: "#1E1E30" }] },
  { elementType: "road.arterial", stylers: [{ color: "#181828" }] },
  { elementType: "water", stylers: [{ color: "#060618" }] },
  { elementType: "landscape", stylers: [{ color: "#0C0C16" }] },
  { elementType: "poi", stylers: [{ visibility: "off" }] },
  { elementType: "transit", stylers: [{ visibility: "off" }] },
];

export default function MapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [greeting, setGreeting] = useState<string>("Good evening");
  const [selectedPOI, setSelectedPOI] = useState<typeof MOCK_POIS[0] | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<POIType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const carBounce = useRef(new Animated.Value(0)).current;
  const filterSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  // GPS tracking
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      setUserLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
        },
        (loc) => {
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (loc.coords.heading != null) setHeading(loc.coords.heading);
        }
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // Car bounce animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(carBounce, { toValue: -4, duration: 1200, useNativeDriver: true }),
        Animated.timing(carBounce, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [carBounce]);

  // POI pulse
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const filteredPOIs = useMemo(() => {
    if (activeFilters.size === 0) return MOCK_POIS;
    return MOCK_POIS.filter((p) => activeFilters.has(p.type));
  }, [activeFilters]);

  const toggleFilter = (type: POIType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const centerOnUser = () => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: userLocation, heading, zoom: 16, pitch: 45 },
      { duration: 800 }
    );
  };

  const handlePOIPress = (poi: typeof MOCK_POIS[0]) => {
    setSelectedPOI(poi);
  };

  const handleEmergency = () => {
    router.push("/request-tow" as any);
  };

  const toggleFilterPanel = () => {
    const toValue = showFilters ? 0 : 1;
    setShowFilters(!showFilters);
    Animated.spring(filterSlide, { toValue, useNativeDriver: true }).start();
  };

  const FILTER_TYPES: { type: POIType; label: string }[] = [
    { type: "workshop", label: "Workshop" },
    { type: "cafe", label: "Café" },
    { type: "fuel", label: "Fuel" },
    { type: "ev", label: "EV" },
    { type: "event", label: "Events" },
    { type: "scenic", label: "Scenic" },
    { type: "community", label: "Community" },
  ];

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
        initialRegion={{
          latitude: userLocation?.latitude ?? -6.2088,
          longitude: userLocation?.longitude ?? 106.8456,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        zoomEnabled
        scrollEnabled
        pitchEnabled
        rotateEnabled
        customMapStyle={MAP_DARK_STYLE}
        onPress={() => setSelectedPOI(null)}
      >
        {/* POI markers */}
        {filteredPOIs.map((poi) => {
          const color = POI_COLORS[poi.type];
          const isSelected = selectedPOI?.id === poi.id;
          const IconComponent = POI_ICONS[poi.type];
          return (
            <Marker
              key={poi.id}
              coordinate={{ latitude: poi.lat, longitude: poi.lng }}
              onPress={() => handlePOIPress(poi)}
            >
              <Animated.View
                style={[
                  styles.poiMarker,
                  {
                    backgroundColor: color + "20",
                    borderColor: color,
                    transform: [{ scale: isSelected ? 1.3 : 1 }],
                  },
                ]}
              >
                <IconComponent size={isSelected ? 16 : 14} color={color} />
              </Animated.View>
            </Marker>
          );
        })}

        {/* User car marker */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading}
            flat
          >
            <Animated.View
              style={[styles.carMarker, { transform: [{ translateY: carBounce }] }]}
            >
              <View style={styles.carGlow} />
              <View style={styles.carBody}>
                <Navigation size={22} color="#FF6B35" fill="#FF6B3520" />
              </View>
            </Animated.View>
          </Marker>
        )}
      </MapView>

      {/* Top bar — greeting + profile */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topBarInner}>
          <View>
            <Text style={styles.greetingLabel}>{greeting}</Text>
            <Text style={styles.greetingName}>{user?.name ?? "Driver"}</Text>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={toggleFilterPanel}
              activeOpacity={0.7}
            >
              <Menu size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.push("/(tabs)/profile" as any)}
              activeOpacity={0.7}
            >
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarText}>
                  {(user?.name ?? "D")[0].toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* POI filter panel */}
      <Animated.View
        style={[
          styles.filterPanel,
          {
            transform: [
              {
                translateY: filterSlide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-200, 0],
                }),
              },
            ],
            opacity: filterSlide,
          },
        ]}
        pointerEvents={showFilters ? "auto" : "none"}
      >
        <View style={styles.filterRow}>
          {FILTER_TYPES.map((f) => {
            const isActive = activeFilters.has(f.type);
            const color = POI_COLORS[f.type];
            return (
              <TouchableOpacity
                key={f.type}
                style={[
                  styles.filterChip,
                  isActive && { backgroundColor: color + "30", borderColor: color },
                ]}
                onPress={() => toggleFilter(f.type)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.filterChipText, isActive && { color }]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>

      {/* Selected POI info card */}
      {selectedPOI && (
        <View style={[styles.poiInfoCard, { paddingBottom: insets.bottom }]}>
          <View style={styles.poiInfoContent}>
            <View
              style={[
                styles.poiInfoDot,
                { backgroundColor: POI_COLORS[selectedPOI.type] },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.poiInfoName}>{selectedPOI.name}</Text>
              <Text style={styles.poiInfoType}>
                {selectedPOI.type.charAt(0).toUpperCase() + selectedPOI.type.slice(1)}
              </Text>
            </View>
            <TouchableOpacity style={styles.poiGoButton} activeOpacity={0.7}>
              <Compass size={18} color="#FF6B35" />
              <Text style={styles.poiGoText}>Go</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Compass / center button */}
      <TouchableOpacity
        style={styles.compassButton}
        onPress={centerOnUser}
        activeOpacity={0.7}
      >
        <Compass size={20} color="#FF6B35" />
      </TouchableOpacity>

      {/* Emergency SOS button */}
      <TouchableOpacity
        style={styles.emergencyButton}
        onPress={handleEmergency}
        activeOpacity={0.7}
      >
        <AlertTriangle size={20} color="#EF4444" />
      </TouchableOpacity>

      {/* Bottom gradient overlay */}
      <View style={styles.bottomGradient} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#060609",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  // Top bar
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "rgba(6, 6, 9, 0.75)",
  },
  topBarInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greetingLabel: {
    fontSize: 13,
    color: "#8A8A9A",
    fontWeight: "500",
  },
  greetingName: {
    fontSize: 22,
    color: "#FFFFFF",
    fontWeight: "700",
    marginTop: 2,
  },
  topActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF6B3530",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B35",
  },
  // Filter panel
  filterPanel: {
    position: "absolute",
    top: 140,
    left: 20,
    right: 20,
    zIndex: 99,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  // Car marker
  carMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  carGlow: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FF6B3520",
  },
  carBody: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0A0A0F",
    borderWidth: 2,
    borderColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  // POI markers
  poiMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
  },
  // POI info card
  poiInfoCard: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    zIndex: 100,
  },
  poiInfoContent: {
    backgroundColor: "rgba(18, 18, 26, 0.95)",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  poiInfoDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  poiInfoName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  poiInfoType: {
    fontSize: 12,
    color: "#8A8A9A",
    marginTop: 2,
  },
  poiGoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF6B3520",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  poiGoText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FF6B35",
  },
  // Action buttons
  compassButton: {
    position: "absolute",
    top: 160,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(18, 18, 26, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    zIndex: 98,
  },
  emergencyButton: {
    position: "absolute",
    top: 214,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    zIndex: 98,
  },
  // Bottom gradient
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 1,
    // Subtle dark fade at the bottom
  },
});
