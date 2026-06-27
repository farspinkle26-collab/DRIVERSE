import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Animated,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
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
  Compass,
  MapPin,
  Crosshair,
} from "lucide-react-native";
import { useRouter } from "expo-router";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// --- Realistic Jakarta-area POIs ---
const POIS = [
  { id: "1", type: "workshop" as const, name: "Garage 75 Racing", lat: -6.2010, lng: 106.8435 },
  { id: "2", type: "workshop" as const, name: "AutoPro Performance", lat: -6.1935, lng: 106.8380 },
  { id: "3", type: "cafe" as const, name: "Pit Stop Café Garage", lat: -6.1953, lng: 106.8405 },
  { id: "4", type: "cafe" as const, name: "Drive Thru Brew", lat: -6.2080, lng: 106.8340 },
  { id: "5", type: "fuel" as const, name: "Shell V-Power Senayan", lat: -6.2095, lng: 106.8485 },
  { id: "6", type: "fuel" as const, name: "Pertamina Turbo", lat: -6.1920, lng: 106.8440 },
  { id: "7", type: "ev" as const, name: "Tesla Supercharger SCBD", lat: -6.1975, lng: 106.8505 },
  { id: "8", type: "ev" as const, name: "ION Charge Station", lat: -6.2140, lng: 106.8420 },
  { id: "9", type: "event" as const, name: "Night Rally @ Kemang", lat: -6.2045, lng: 106.8355 },
  { id: "10", type: "event" as const, name: "Cars & Coffee Jakarta", lat: -6.1910, lng: 106.8560 },
  { id: "11", type: "scenic" as const, name: "Puncak Pass Drive", lat: -6.1880, lng: 106.8555 },
  { id: "12", type: "scenic" as const, name: "Ancol Coastal Road", lat: -6.2110, lng: 106.8580 },
  { id: "13", type: "community" as const, name: "Jakarta Car Club HQ", lat: -6.2155, lng: 106.8415 },
  { id: "14", type: "community" as const, name: "IDM Garage Community", lat: -6.1905, lng: 106.8390 },
  { id: "15", type: "emergency" as const, name: "24H Towing Station", lat: -6.2060, lng: 106.8370 },
];

type POIType = "workshop" | "cafe" | "fuel" | "ev" | "event" | "scenic" | "community" | "emergency";

const POI_CONFIG: Record<POIType, { color: string; glow: string; icon: React.FC<{ size: number; color: string }>; label: string }> = {
  workshop:  { color: "#FF6B35", glow: "#FF6B3525", icon: Wrench,       label: "Workshop" },
  cafe:      { color: "#8B5CF6", glow: "#8B5CF625", icon: Coffee,       label: "Café" },
  fuel:      { color: "#F59E0B", glow: "#F59E0B25", icon: Fuel,         label: "Fuel" },
  ev:        { color: "#22C55E", glow: "#22C55E25", icon: Zap,          label: "EV Charger" },
  event:     { color: "#FF3B6F", glow: "#FF3B6F25", icon: Calendar,     label: "Event" },
  scenic:    { color: "#00D4AA", glow: "#00D4AA25", icon: Mountain,     label: "Scenic" },
  community: { color: "#3B82F6", glow: "#3B82F625", icon: Users,        label: "Community" },
  emergency: { color: "#EF4444", glow: "#EF444425", icon: AlertTriangle, label: "Emergency" },
};

// --- Warm Glow Map Style (Forza Horizon inspired) ---
const MAP_GLOW = [
  { elementType: "geometry", stylers: [{ color: "#1A1A2E" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8A8A9A" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1A1A2E" }] },
  { elementType: "labels.icon", stylers: [{ saturation: 30, lightness: 20 }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#252540" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2A2A45" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2E2E4A" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#353550" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#222238" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#1E1E34" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#161628" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5A5A8A" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#141420" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#1A2028" }] },
  { featureType: "poi", stylers: [{ visibility: "simplified" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1E2E24" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6A8A6A" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#252540" }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#7A7A8E" }] },
];

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // State
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState<string | null>(null);
  const [selectedPOI, setSelectedPOI] = useState<typeof POIS[0] | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<POIType>>(new Set());

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const carFloat = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // --- GPS detection ---
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (mounted) {
            setLocError("Location permission needed");
            setLocating(false);
          }
          return;
        }

        // Get initial position with high accuracy
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
        });

        if (!mounted) return;

        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);
        if (loc.coords.heading != null) setHeading(loc.coords.heading);
        setLocating(false);

        // Animate map to user location
        setTimeout(() => {
          mapRef.current?.animateCamera(
            { center: coords, zoom: 16, pitch: 45, heading: loc.coords.heading ?? 0 },
            { duration: 1200 }
          );
        }, 300);

        // Fade in POIs
        Animated.timing(fadeIn, { toValue: 1, duration: 800, useNativeDriver: true }).start();

        // Watch position
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
          (pos) => {
            if (!mounted) return;
            setUserLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            if (pos.coords.heading != null) setHeading(pos.coords.heading);
          }
        );
      } catch {
        if (mounted) {
          setLocError("Could not get location");
          setLocating(false);
        }
      }
    })();

    return () => {
      mounted = false;
      sub?.remove();
    };
  }, [fadeIn]);

  // --- Animations ---
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(carFloat, { toValue: -4, duration: 1200, useNativeDriver: true }),
        Animated.timing(carFloat, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [carFloat]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  // Selected card animation
  useEffect(() => {
    Animated.spring(cardSlide, {
      toValue: selectedPOI ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [selectedPOI, cardSlide]);

  // --- Filtered POIs ---
  const visiblePOIs = useMemo(() => {
    if (activeFilters.size === 0) return POIS;
    return POIS.filter((p) => activeFilters.has(p.type));
  }, [activeFilters]);

  // --- Handlers ---
  const centerOnUser = useCallback(() => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: userLocation, zoom: 17, pitch: 50, heading },
      { duration: 800 }
    );
  }, [userLocation, heading]);

  const toggleFilter = (type: POIType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handlePOIPress = (poi: typeof POIS[0]) => {
    setSelectedPOI(poi);
    mapRef.current?.animateCamera(
      { center: { latitude: poi.lat, longitude: poi.lng }, zoom: 17, pitch: 40 },
      { duration: 600 }
    );
  };

  const handleEmergency = () => {
    router.push("/request-tow" as any);
  };

  // --- Map region ---
  const initialRegion = userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: -6.2088, longitude: 106.8456, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  return (
    <View style={styles.container}>
      {/* --- Map --- */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        zoomEnabled
        scrollEnabled
        pitchEnabled
        rotateEnabled
        customMapStyle={MAP_GLOW}
        onPress={() => setSelectedPOI(null)}
      >
        {/* POI Markers */}
        {visiblePOIs.map((poi) => {
          const cfg = POI_CONFIG[poi.type];
          const isSelected = selectedPOI?.id === poi.id;
          const IconComponent = cfg.icon;
          return (
            <Marker
              key={poi.id}
              coordinate={{ latitude: poi.lat, longitude: poi.lng }}
              onPress={() => handlePOIPress(poi)}
              tracksViewChanges={isSelected}
            >
              <Animated.View
                style={[
                  styles.poiOuter,
                  {
                    borderColor: cfg.color + "40",
                    backgroundColor: cfg.color + "10",
                    transform: [
                      { scale: isSelected ? Animated.multiply(pulseAnim, 1.15) : 1 },
                    ],
                  },
                ]}
              >
                <View style={[styles.poiInner, { backgroundColor: cfg.color + "25", borderColor: cfg.color + "80" }]}>
                  <IconComponent size={isSelected ? 15 : 13} color={cfg.color} />
                </View>
                {isSelected && (
                  <Animated.View style={[styles.poiPulse, { borderColor: cfg.color }]} />
                )}
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
            <Animated.View style={[styles.carMarker, { transform: [{ translateY: carFloat }] }]}>
              <View style={styles.carGlow} />
              <View style={styles.carRing}>
                <Navigation size={16} color="#FF6B35" fill="#FF6B3525" strokeWidth={2.5} />
              </View>
            </Animated.View>
          </Marker>
        )}
      </MapView>

      {/* --- Loading overlay while GPS is acquiring --- */}
      {locating && (
        <View style={[styles.loadingOverlay, { paddingTop: insets.top + 20 }]} pointerEvents="none">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#FF6B35" />
            <Text style={styles.loadingText}>Detecting your location...</Text>
          </View>
        </View>
      )}

      {/* --- Location error banner --- */}
      {locError && (
        <View style={[styles.errorBanner, { top: insets.top + 16 }]}>
          <Text style={styles.errorText}>{locError}</Text>
          <TouchableOpacity
            onPress={() => {
              setLocError(null);
              setLocating(true);
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* --- Filter chips at top --- */}
      <Animated.View style={[styles.filterBar, { top: insets.top + 10, opacity: fadeIn }]}>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {Object.entries(POI_CONFIG).map(([type, cfg]) => {
            const isActive = activeFilters.has(type as POIType);
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  isActive && { backgroundColor: cfg.color + "30", borderColor: cfg.color },
                ]}
                onPress={() => toggleFilter(type as POIType)}
                activeOpacity={0.7}
              >
                <cfg.icon size={12} color={isActive ? cfg.color : "#6A6A7E"} />
                <Text style={[styles.filterLabel, isActive && { color: cfg.color }]}>
                  {cfg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Animated.ScrollView>
      </Animated.View>

      {/* --- Right-side action buttons --- */}
      <Animated.View style={[styles.rightButtons, { top: insets.top + 60, opacity: fadeIn }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={centerOnUser} activeOpacity={0.7}>
          <Crosshair size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.sosBtn]} onPress={handleEmergency} activeOpacity={0.7}>
          <AlertTriangle size={18} color="#EF4444" />
        </TouchableOpacity>
      </Animated.View>

      {/* --- Selected POI card — positioned above bottom nav --- */}
      {selectedPOI && (
        <Animated.View
          style={[
            styles.poiCard,
            {
              paddingBottom: insets.bottom + 70,
              transform: [{ translateY: cardSlide.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }],
              opacity: cardSlide,
            },
          ]}
        >
          <View style={[styles.poiCardDot, { backgroundColor: POI_CONFIG[selectedPOI.type].color }]} />
          <View style={styles.poiCardContent}>
            <View style={styles.poiCardInfo}>
              <Text style={styles.poiCardName}>{selectedPOI.name}</Text>
              <Text style={styles.poiCardType}>{POI_CONFIG[selectedPOI.type].label}</Text>
            </View>
            <TouchableOpacity
              style={styles.poiCardGo}
              onPress={() => {
                setSelectedPOI(null);
              }}
              activeOpacity={0.7}
            >
              <Compass size={17} color="#FF6B35" />
              <Text style={styles.poiGoText}>Navigate</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* --- Bottom fade gradient --- */}
      <View style={styles.bottomFade} pointerEvents="none" />
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#161628",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 80,
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(10, 10, 20, 0.92)",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.2)",
  },
  loadingText: {
    color: "#8A8A9A",
    fontSize: 13,
    fontWeight: "500",
  },
  // Error banner
  errorBanner: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    zIndex: 200,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600",
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  // POI markers
  poiOuter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
  },
  poiInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  poiPulse: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    opacity: 0,
  },
  // Car marker
  carMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  carGlow: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 107, 53, 0.08)",
  },
  carRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0A0A14",
    borderWidth: 2,
    borderColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  // Filter bar
  filterBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 100,
  },
  filterScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(18, 18, 30, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6A6A7E",
  },
  // Right buttons
  rightButtons: {
    position: "absolute",
    right: 14,
    gap: 10,
    zIndex: 100,
  },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(18, 18, 30, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  sosBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  // POI card
  poiCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 150,
  },
  poiCardDot: {
    position: "absolute",
    top: -6,
    left: 24,
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  poiCardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  poiCardInfo: {
    flex: 1,
  },
  poiCardName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  poiCardType: {
    fontSize: 12,
    color: "#6A6A7E",
    marginTop: 3,
    fontWeight: "500",
  },
  poiCardGo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255, 107, 53, 0.12)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  poiGoText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FF6B35",
  },
  // Bottom fade
  bottomFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 1,
  },
});
