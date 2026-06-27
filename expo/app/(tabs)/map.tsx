import React, { useEffect, useState, useRef, useCallback } from "react";
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
  Navigation,
  Crosshair,
  UtensilsCrossed,
} from "lucide-react-native";
import { useRouter } from "expo-router";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// --- Google Places nearby search ---
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLEMAPS ?? "";
const PLACES_SEARCH_RADIUS = 3000; // 3km radius

interface CafePOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  vicinity?: string;
  types: string[];
}

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
  const [cafes, setCafes] = useState<CafePOI[]>([]);
  const [loadingCafes, setLoadingCafes] = useState(false);
  const [selectedCafe, setSelectedCafe] = useState<CafePOI | null>(null);

  // Animations
  const carFloat = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // --- Fetch nearby cafes & restaurants from Google Places ---
  const fetchNearbyCafes = useCallback(async (lat: number, lng: number) => {
    if (!GOOGLE_API_KEY) return;
    setLoadingCafes(true);
    try {
      const types = ["cafe", "restaurant"];
      const allResults: CafePOI[] = [];
      const seen = new Set<string>();

      for (const type of types) {
        const url =
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${PLACES_SEARCH_RADIUS}&type=${type}&key=${GOOGLE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === "OK" && data.results) {
          for (const place of data.results) {
            if (seen.has(place.place_id)) continue;
            seen.add(place.place_id);
            allResults.push({
              id: place.place_id,
              name: place.name,
              lat: place.geometry.location.lat,
              lng: place.geometry.location.lng,
              rating: place.rating,
              vicinity: place.vicinity,
              types: place.types ?? [],
            });
          }
        }
      }

      setCafes(allResults.slice(0, 60)); // Cap at 60 markers
    } catch {
      // Silently fail — map still works without POIs
    } finally {
      setLoadingCafes(false);
    }
  }, []);

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

        // Fade in and load cafes
        Animated.timing(fadeIn, { toValue: 1, duration: 800, useNativeDriver: true }).start();
        fetchNearbyCafes(coords.latitude, coords.longitude);

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
  }, [fetchNearbyCafes, fadeIn]);

  // --- Animations ---
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(carFloat, { toValue: -4, duration: 1200, useNativeDriver: true }),
        Animated.timing(carFloat, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [carFloat]);

  // --- Handlers ---
  const centerOnUser = useCallback(() => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: userLocation, zoom: 17, pitch: 50, heading },
      { duration: 800 }
    );
  }, [userLocation, heading]);

  const handleCafePress = (cafe: CafePOI) => {
    setSelectedCafe(cafe);
    mapRef.current?.animateCamera(
      { center: { latitude: cafe.lat, longitude: cafe.lng }, zoom: 17, pitch: 40 },
      { duration: 600 }
    );
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
        onPress={() => setSelectedCafe(null)}
      >
        {/* Cafe & Restaurant Markers */}
        {cafes.map((cafe) => {
          const isSelected = selectedCafe?.id === cafe.id;
          return (
            <Marker
              key={cafe.id}
              coordinate={{ latitude: cafe.lat, longitude: cafe.lng }}
              onPress={() => handleCafePress(cafe)}
              tracksViewChanges={isSelected}
            >
              <View style={[styles.cafeMarker, isSelected && styles.cafeMarkerSelected]}>
                <UtensilsCrossed
                  size={isSelected ? 16 : 14}
                  color={isSelected ? CAFE_COLOR_SELECTED : CAFE_COLOR}
                  strokeWidth={2}
                />
              </View>
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

      {/* --- Loading cafes indicator --- */}
      {loadingCafes && !locating && (
        <Animated.View style={[styles.cafeLoading, { top: insets.top + 16, opacity: fadeIn }]}>
          <ActivityIndicator size="small" color="#8B5CF6" />
          <Text style={styles.cafeLoadingText}>Finding cafés nearby...</Text>
        </Animated.View>
      )}

      {/* --- Right-side action buttons --- */}
      <Animated.View style={[styles.rightButtons, { top: insets.top + 60, opacity: fadeIn }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={centerOnUser} activeOpacity={0.7}>
          <Crosshair size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* --- Selected cafe card --- */}
      {selectedCafe && (
        <View style={[styles.cafeCard, { paddingBottom: insets.bottom + 70 }]}>
          <TouchableOpacity
            style={styles.cafeCardClose}
            onPress={() => setSelectedCafe(null)}
          >
            <View style={styles.cafeCardCloseBar} />
          </TouchableOpacity>
          <View style={styles.cafeCardContent}>
            <View style={styles.cafeCardInfo}>
              <Text style={styles.cafeCardName} numberOfLines={2}>{selectedCafe.name}</Text>
              {selectedCafe.vicinity ? (
                <Text style={styles.cafeCardVicinity} numberOfLines={1}>{selectedCafe.vicinity}</Text>
              ) : null}
              {selectedCafe.rating ? (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingText}>{selectedCafe.rating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.cafeCardCuisine}>
              <Text style={styles.cafeCardCuisineText}>
                {selectedCafe.types.includes("cafe") ? "Café" : "Restaurant"}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// --- Styles ---
const CAFE_COLOR = "#8B5CF6";
const CAFE_COLOR_SELECTED = "#A78BFA";

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
  // Cafe loading
  cafeLoading: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
    zIndex: 100,
  },
  cafeLoadingText: {
    color: "#A78BFA",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 6,
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
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
  // Cafe marker (clean fork+knife symbol)
  cafeMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(18, 18, 30, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: CAFE_COLOR + "50",
  },
  cafeMarkerSelected: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderColor: CAFE_COLOR_SELECTED,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    shadowColor: CAFE_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
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
  // Cafe card
  cafeCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 150,
  },
  cafeCardClose: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  cafeCardCloseBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  cafeCardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  cafeCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  cafeCardName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cafeCardVicinity: {
    fontSize: 12,
    color: "#6A6A7E",
    marginTop: 4,
    fontWeight: "500",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  ratingStar: {
    color: "#F59E0B",
    fontSize: 13,
  },
  ratingText: {
    color: "#8A8A9A",
    fontSize: 13,
    fontWeight: "600",
  },
  cafeCardCuisine: {
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  cafeCardCuisineText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#A78BFA",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
