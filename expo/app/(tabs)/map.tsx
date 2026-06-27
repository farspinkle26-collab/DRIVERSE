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
  ScrollView,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import {
  Navigation,
  Crosshair,
  UtensilsCrossed,
  MapPin,
  X,
  Clock,
  Route,
} from "lucide-react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLEMAPS ?? "";

// --- Major Indonesian cities for nationwide search ---
const INDONESIAN_CITIES = [
  { name: "Jakarta", lat: -6.2088, lng: 106.8456 },
  { name: "Bandung", lat: -6.9175, lng: 107.6191 },
  { name: "Surabaya", lat: -7.2575, lng: 112.7521 },
  { name: "Yogyakarta", lat: -7.7956, lng: 110.3695 },
  { name: "Medan", lat: 3.5952, lng: 98.6722 },
  { name: "Semarang", lat: -6.9932, lng: 110.4203 },
  { name: "Denpasar", lat: -8.6705, lng: 115.2126 },
  { name: "Makassar", lat: -5.1477, lng: 119.4327 },
  { name: "Palembang", lat: -2.9761, lng: 104.7754 },
  { name: "Batam", lat: 1.1301, lng: 104.0527 },
  { name: "Balikpapan", lat: -1.2379, lng: 116.8529 },
  { name: "Manado", lat: 1.4748, lng: 124.8421 },
  { name: "Pontianak", lat: -0.0263, lng: 109.3425 },
  { name: "Banjarmasin", lat: -3.3186, lng: 114.5944 },
  { name: "Lombok", lat: -8.5833, lng: 116.1067 },
  { name: "Malang", lat: -7.9839, lng: 112.6214 },
  { name: "Padang", lat: -0.9471, lng: 100.4172 },
  { name: "Pekanbaru", lat: 0.5071, lng: 101.4478 },
  { name: "Ambon", lat: -3.6954, lng: 128.1814 },
  { name: "Jayapura", lat: -2.5916, lng: 140.6690 },
];

interface CafePOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  vicinity?: string;
  types: string[];
}

interface RouteInfo {
  coordinates: { latitude: number; longitude: number }[];
  distanceKm: string;
  distanceMeters: number;
  durationMin: string;
  durationSeconds: number;
}

// --- Warm Glow Map Style ---
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

// --- Google Polyline Decoder ---
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// --- Format helpers ---
function fmtKm(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // GPS state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState<string | null>(null);

  // Cafe state
  const [cafes, setCafes] = useState<CafePOI[]>([]);
  const [loadingCafes, setLoadingCafes] = useState(false);
  const [selectedCafe, setSelectedCafe] = useState<CafePOI | null>(null);

  // Navigation / routing state
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Animations
  const carFloat = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(200)).current;

  // --- Fetch cafes from a specific city ---
  const fetchCityCafes = useCallback(async (lat: number, lng: number, cityName: string): Promise<CafePOI[]> => {
    if (!GOOGLE_API_KEY) return [];
    const types = ["cafe", "restaurant"];
    const allResults: CafePOI[] = [];
    const seen = new Set<string>();

    for (const type of types) {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=${type}&key=${GOOGLE_API_KEY}`;
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
              vicinity: place.vicinity ?? cityName,
              types: place.types ?? [],
            });
          }
        }
      } catch {
        // Skip failed city
      }
    }
    return allResults;
  }, []);

  // --- Fetch cafes from ALL Indonesian cities ---
  const fetchAllIndonesiaCafes = useCallback(async () => {
    if (!GOOGLE_API_KEY) return;
    setLoadingCafes(true);

    const seen = new Set<string>();
    const allResults: CafePOI[] = [];

    // Fan out to all cities in parallel batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < INDONESIAN_CITIES.length; i += BATCH_SIZE) {
      const batch = INDONESIAN_CITIES.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((city) => fetchCityCafes(city.lat, city.lng, city.name));
      const batchResults = await Promise.all(batchPromises);
      for (const results of batchResults) {
        for (const cafe of results) {
          if (seen.has(cafe.id)) continue;
          seen.add(cafe.id);
          allResults.push(cafe);
        }
      }
    }

    setCafes(allResults.slice(0, 200)); // Cap at 200 markers for performance
    setLoadingCafes(false);
  }, [fetchCityCafes]);

  // --- Fetch directions from user location to cafe ---
  const fetchDirections = useCallback(async (origin: { latitude: number; longitude: number }, dest: CafePOI) => {
    if (!GOOGLE_API_KEY) return;
    setLoadingRoute(true);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${dest.lat},${dest.lng}&key=${GOOGLE_API_KEY}&mode=driving`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === "OK" && data.routes?.[0]) {
        const route = data.routes[0];
        const leg = route.legs[0];
        const polyline = route.overview_polyline?.points;
        if (polyline) {
          const coords = decodePolyline(polyline);
          setRouteInfo({
            coordinates: coords,
            distanceKm: fmtKm(leg.distance.value),
            distanceMeters: leg.distance.value,
            durationMin: fmtDuration(leg.duration.value),
            durationSeconds: leg.duration.value,
          });
          // Fit map to show the entire route
          mapRef.current?.fitToCoordinates(coords, {
            edgePadding: { top: 80, right: 60, bottom: 250, left: 60 },
            animated: true,
          });
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingRoute(false);
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

        setTimeout(() => {
          mapRef.current?.animateCamera(
            { center: coords, zoom: 16, pitch: 45, heading: loc.coords.heading ?? 0 },
            { duration: 1200 }
          );
        }, 300);

        Animated.timing(fadeIn, { toValue: 1, duration: 800, useNativeDriver: true }).start();

        // Load ALL Indonesia cafes
        fetchAllIndonesiaCafes();

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
  }, [fetchAllIndonesiaCafes, fadeIn]);

  // --- Animations ---
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(carFloat, { toValue: -4, duration: 1200, useNativeDriver: true }),
        Animated.timing(carFloat, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [carFloat]);

  // Slide card when route info changes
  useEffect(() => {
    Animated.spring(cardSlide, {
      toValue: routeInfo ? 0 : 200,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [routeInfo, cardSlide]);

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
    setRouteInfo(null); // Clear previous route
    mapRef.current?.animateCamera(
      { center: { latitude: cafe.lat, longitude: cafe.lng }, zoom: 16, pitch: 40 },
      { duration: 600 }
    );
  };

  const handleNavigate = useCallback(() => {
    if (!userLocation || !selectedCafe) return;
    setNavigating(true);
    fetchDirections(userLocation, selectedCafe);
  }, [userLocation, selectedCafe, fetchDirections]);

  const clearRoute = useCallback(() => {
    setRouteInfo(null);
    setNavigating(false);
  }, []);

  const handleMapPress = useCallback(() => {
    setSelectedCafe(null);
  }, []);

  // --- Map region ---
  const initialRegion = userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: -6.2088, longitude: 106.8456, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const ROUTE_RED = "#E53935";
  const ROUTE_GLOW = "#FF5252";

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
        onPress={handleMapPress}
      >
        {/* Cafe & Restaurant Markers */}
        {cafes.map((cafe) => {
          const isSelected = selectedCafe?.id === cafe.id;
          return (
            <Marker
              key={cafe.id}
              coordinate={{ latitude: cafe.lat, longitude: cafe.lng }}
              onPress={() => handleCafePress(cafe)}
              tracksViewChanges={false}
            >
              <View style={[styles.cafeMarker, isSelected && styles.cafeMarkerSelected]}>
                <UtensilsCrossed
                  size={isSelected ? 15 : 12}
                  color={isSelected ? "#EAEAEA" : "#8B5CF6"}
                  strokeWidth={2}
                />
              </View>
            </Marker>
          );
        })}

        {/* Route Polyline */}
        {routeInfo && (
          <>
            {/* Glow line */}
            <Polyline
              coordinates={routeInfo.coordinates}
              strokeWidth={7}
              strokeColor={`${ROUTE_GLOW}40`}
              lineCap="round"
              lineJoin="round"
            />
            {/* Main red line */}
            <Polyline
              coordinates={routeInfo.coordinates}
              strokeWidth={4}
              strokeColor={ROUTE_RED}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Destination marker (when navigating) */}
        {selectedCafe && routeInfo && (
          <Marker
            coordinate={{ latitude: selectedCafe.lat, longitude: selectedCafe.lng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.destPin}>
              <MapPin size={28} color={ROUTE_RED} fill={ROUTE_RED} />
            </View>
          </Marker>
        )}

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

      {/* --- Loading overlay --- */}
      {locating && (
        <View style={[styles.loadingOverlay, { paddingTop: insets.top + 20 }]} pointerEvents="none">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#FF6B35" />
            <Text style={styles.loadingText}>Detecting your location...</Text>
          </View>
        </View>
      )}

      {/* --- Error banner --- */}
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
          <Text style={styles.cafeLoadingText}>Finding cafés across Indonesia...</Text>
        </Animated.View>
      )}

      {/* --- Right-side buttons --- */}
      <Animated.View style={[styles.rightButtons, { top: insets.top + 60, opacity: fadeIn }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={centerOnUser} activeOpacity={0.7}>
          <Crosshair size={20} color="#FFFFFF" />
        </TouchableOpacity>
        {routeInfo && (
          <TouchableOpacity style={styles.actionBtn} onPress={clearRoute} activeOpacity={0.7}>
            <X size={20} color="#EF4444" />
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* --- Selected cafe card --- */}
      {selectedCafe && !routeInfo && (
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
            <TouchableOpacity
              style={styles.navBtn}
              onPress={handleNavigate}
              activeOpacity={0.7}
            >
              <Route size={18} color="#FFFFFF" />
              <Text style={styles.navBtnText}>Go</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* --- Navigation route card (distance + ETA) --- */}
      {routeInfo && (
        <Animated.View
          style={[
            styles.routeCard,
            { paddingBottom: insets.bottom + 70, transform: [{ translateY: cardSlide }] },
          ]}
        >
          <View style={styles.routeCardContent}>
            {/* Loading indicator */}
            {loadingRoute && (
              <View style={styles.routeLoader}>
                <ActivityIndicator size="small" color={ROUTE_RED} />
                <Text style={styles.routeLoaderText}>Calculating route...</Text>
              </View>
            )}

            {!loadingRoute && (
              <View style={styles.routeInfoRow}>
                {/* Distance */}
                <View style={styles.routeStat}>
                  <View style={styles.routeStatIcon}>
                    <Route size={20} color={ROUTE_RED} />
                  </View>
                  <View>
                    <Text style={styles.routeStatLabel}>Distance</Text>
                    <Text style={styles.routeStatValue}>{routeInfo.distanceKm}</Text>
                  </View>
                </View>

                {/* Divider */}
                <View style={styles.routeDivider} />

                {/* ETA */}
                <View style={styles.routeStat}>
                  <View style={styles.routeStatIcon}>
                    <Clock size={20} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.routeStatLabel}>Est. Time</Text>
                    <Text style={styles.routeStatValue}>{routeInfo.durationMin}</Text>
                  </View>
                </View>

                {/* Cancel */}
                <TouchableOpacity style={styles.routeCancel} onPress={clearRoute} activeOpacity={0.7}>
                  <X size={18} color="#8A8A9A" />
                </TouchableOpacity>
              </View>
            )}

            {/* Destination name */}
            {selectedCafe && !loadingRoute && (
              <View style={styles.routeDest}>
                <MapPin size={14} color={ROUTE_RED} />
                <Text style={styles.routeDestText} numberOfLines={1}>{selectedCafe.name}</Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// --- Styles ---
const CAFE_COLOR = "#8B5CF6";
const CAFE_COLOR_SELECTED = "#A78BFA";
const ROUTE_RED = "#E53935";

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
    flex: 1,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 12,
  },
  // Cafe marker
  cafeMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(18, 18, 30, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: CAFE_COLOR + "50",
  },
  cafeMarkerSelected: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderColor: CAFE_COLOR_SELECTED,
    backgroundColor: "rgba(139, 92, 246, 0.18)",
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
  // Destination pin
  destPin: {
    alignItems: "center",
    shadowColor: ROUTE_RED,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
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
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: ROUTE_RED,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: ROUTE_RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  navBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  // Route card
  routeCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 150,
  },
  routeCardContent: {
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(229, 57, 53, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  routeLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  routeLoaderText: {
    color: "#E53935",
    fontSize: 14,
    fontWeight: "600",
  },
  routeInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  routeStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  routeStatLabel: {
    fontSize: 11,
    color: "#6A6A7E",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeStatValue: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "800",
    marginTop: 2,
  },
  routeDivider: {
    width: 1,
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginHorizontal: 12,
  },
  routeCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  routeDest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  routeDestText: {
    color: "#8A8A9A",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
});
