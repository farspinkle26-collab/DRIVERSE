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
  Circle,
  Square,
  Timer,
  Zap,
  TrendingUp,
  Trophy,
} from "lucide-react-native";
import { useXP } from "@/hooks/useXPStore";

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

type SelectedDestination =
  | { type: "cafe"; data: CafePOI }
  | { type: "location"; lat: number; lng: number };

interface RouteInfo {
  coordinates: { latitude: number; longitude: number }[];
  distanceKm: string;
  distanceMeters: number;
  durationMin: string;
  durationSeconds: number;
}

interface TripRecord {
  coordinates: { latitude: number; longitude: number }[];
  distanceMeters: number;
  durationMs: number;
  startedAt: number;
  endedAt?: number;
}

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

// --- Haversine distance (meters) ---
function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

// --- Format helpers ---
function fmtKm(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function fmtMeters(meters: number): string {
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

/** Live timer format: "02:34:15" */
function fmtTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
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

  // Selected destination (cafe or custom tapped location)
  const [selectedDestination, setSelectedDestination] = useState<SelectedDestination | null>(null);

  // Navigation / routing state
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // --- Pick mode --- (toggle to allow dropping a custom pin on the map)
  const [isPickMode, setIsPickMode] = useState(false);

  // --- Recording state ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordedPath, setRecordedPath] = useState<{ latitude: number; longitude: number }[]>([]);
  const [tripDistance, setTripDistance] = useState(0); // meters
  const [tripStartMs, setTripStartMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([]); // past trips
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const isRecordingRef = useRef(false);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Estimated route duration (seconds) — saved when route is fetched, used for XP comparison
  const estimatedDurationRef = useRef<number | null>(null);

  // XP reward display state
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [wasFaster, setWasFaster] = useState(false);
  const [leveledUp, setLeveledUp] = useState(false);

  // XP system
  const { level, xpCurrentLevel, xpRequired, xpProgress, addXP } = useXP();

  // Animations
  const carFloat = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(200)).current;
  const recPulse = useRef(new Animated.Value(1)).current;
  const recSlide = useRef(new Animated.Value(200)).current;

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

    setCafes(allResults.slice(0, 200));
    setLoadingCafes(false);
  }, [fetchCityCafes]);

  // --- Fetch directions from user location to destination ---
  const fetchDirections = useCallback(async (origin: { latitude: number; longitude: number }, dest: { latitude: number; longitude: number }) => {
    if (!GOOGLE_API_KEY) return;
    setLoadingRoute(true);
    try {
      const url =
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&key=${GOOGLE_API_KEY}&mode=driving`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === "OK" && data.routes?.[0]) {
        const route = data.routes[0];
        const leg = route.legs[0];
        const polyline = route.overview_polyline?.points;
        if (polyline) {
          const coords = decodePolyline(polyline);
          const estSecs = leg.duration.value;
          estimatedDurationRef.current = estSecs;
          setRouteInfo({
            coordinates: coords,
            distanceKm: fmtKm(leg.distance.value),
            distanceMeters: leg.distance.value,
            durationMin: fmtDuration(estSecs),
            durationSeconds: estSecs,
          });
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

  // --- GPS detection (runs once, uses refs for recording state to avoid restarts) ---
  // Keep userLocationRef in sync
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

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

        // Watch GPS position for real-time tracking
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 },
          (pos) => {
            if (!mounted) return;
            const newCoord = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setUserLocation(newCoord);
            if (pos.coords.heading != null) setHeading(pos.coords.heading);

            // --- Recording: append new coordinate and update distance ---
            if (isRecordingRef.current) {
              setRecordedPath((prev) => {
                const next = [...prev, newCoord];
                if (lastCoordRef.current) {
                  const dist = haversineMeters(lastCoordRef.current, newCoord);
                  if (dist > 0.1) {
                    setTripDistance((d) => d + dist);
                  }
                }
                lastCoordRef.current = newCoord;
                return next;
              });
            }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Recording timer ---
  useEffect(() => {
    if (isRecording && tripStartMs != null) {
      recordTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - tripStartMs);
      }, 200);
    } else {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [isRecording, tripStartMs]);

  // --- Pulse animation for record button (always subtle, stronger during recording) ---
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(recPulse, { toValue: isRecording ? 1.4 : 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(recPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isRecording, recPulse]);

  // --- Car float ---
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

  // Slide recording card
  useEffect(() => {
    Animated.spring(recSlide, {
      toValue: isRecording ? 0 : 200,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isRecording, recSlide]);

  // --- Handlers ---
  const centerOnUser = useCallback(() => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: userLocation, zoom: 17, pitch: 50, heading },
      { duration: 800 }
    );
  }, [userLocation, heading]);

  const handleCafePress = useCallback((cafe: CafePOI) => {
    setSelectedDestination({ type: "cafe", data: cafe });
    setRouteInfo(null);
    mapRef.current?.animateCamera(
      { center: { latitude: cafe.lat, longitude: cafe.lng }, zoom: 16, pitch: 40 },
      { duration: 600 }
    );
  }, []);

  const destCoords = useCallback((): { latitude: number; longitude: number } | null => {
    if (!selectedDestination) return null;
    if (selectedDestination.type === "cafe") {
      return { latitude: selectedDestination.data.lat, longitude: selectedDestination.data.lng };
    }
    return { latitude: selectedDestination.lat, longitude: selectedDestination.lng };
  }, [selectedDestination]);

  const handleNavigate = useCallback(() => {
    const coords = destCoords();
    if (!userLocation || !coords) return;
    setNavigating(true);
    fetchDirections(userLocation, coords);
  }, [userLocation, destCoords, fetchDirections]);

  const clearRoute = useCallback(() => {
    setRouteInfo(null);
    setNavigating(false);
    setSelectedDestination(null);
    estimatedDurationRef.current = null;
  }, []);

  // --- Toggle pick mode ---
  const togglePickMode = useCallback(() => {
    setIsPickMode((prev) => !prev);
    // Clear any pending destination when leaving pick mode
    if (isPickMode) {
      setSelectedDestination(null);
      setRouteInfo(null);
    }
  }, [isPickMode]);

  // --- Map press: drop a pin at tapped location (only when pick mode is ON) ---
  const mapPressCooldownRef = useRef(0);
  const handleMapPress = useCallback((event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    if (!isPickMode) return;
    const now = Date.now();
    if (now - mapPressCooldownRef.current < 200) return;
    mapPressCooldownRef.current = now;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setSelectedDestination({ type: "location", lat: latitude, lng: longitude });
    setRouteInfo(null);
    // Turn off pick mode after placing a pin (single-use)
    setIsPickMode(false);
  }, [isPickMode]);

  // --- Recording handlers ---
  const startRecording = useCallback(() => {
    const now = Date.now();
    setIsRecording(true);
    setTripStartMs(now);
    setElapsedMs(0);
    setTripDistance(0);
    setRecordedPath([]);
    setXpEarned(null);
    setWasFaster(false);
    setLeveledUp(false);
    lastCoordRef.current = userLocation;
    if (userLocation) {
      setRecordedPath([userLocation]);
      lastCoordRef.current = userLocation;
    }
  }, [userLocation]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    const now = Date.now();
    const actualDurationMs = tripStartMs ? now - tripStartMs : 0;
    const actualDurationSec = actualDurationMs / 1000;
    const avgSpeed = tripDistance > 0 ? (tripDistance / 1000) / (actualDurationSec / 3600) : 0;

    const trip: TripRecord = {
      coordinates: recordedPath,
      distanceMeters: tripDistance,
      durationMs: actualDurationMs,
      startedAt: tripStartMs ?? now,
      endedAt: now,
    };
    setTripHistory((prev) => [trip, ...prev]);

    // --- XP calculation ---
    const estimatedSec = estimatedDurationRef.current;
    const oldLevel = level;
    if (estimatedSec && estimatedSec > 0 && tripDistance > 0) {
      const faster = actualDurationSec < estimatedSec;
      setWasFaster(faster);

      let earned: number;
      if (faster) {
        const timeDiff = estimatedSec - actualDurationSec;
        const ratio = Math.min(timeDiff / estimatedSec, 1);
        const bonus = Math.round(ratio * 200);
        earned = 50 + bonus;
      } else {
        earned = 25;
      }
      setXpEarned(earned);
      const newLvl = addXP(earned);
      setLeveledUp(newLvl > oldLevel);
    } else {
      const earned = 10;
      setXpEarned(earned);
      setWasFaster(false);
      const newLvl = addXP(earned);
      setLeveledUp(newLvl > oldLevel);
    }

    // Keep path visible after stopping
  }, [recordedPath, tripDistance, tripStartMs, level, addXP]);

  // --- Map region ---
  const initialRegion = userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: -6.2088, longitude: 106.8456, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const RECORD_RED = "#FF2D55";
  const RECORD_GLOW = "#FF6482";
  const ROUTE_RED = "#E53935";
  const ROUTE_GLOW = "#FF5252";
  const RECORDED_PATH_COLOR = "#FF2D55";

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
        followsUserLocation={isRecording}
      >
        {/* Cafe & Restaurant Markers */}
        {!isRecording && cafes.map((cafe) => {
          const isSelected = selectedDestination?.type === "cafe" && selectedDestination.data.id === cafe.id;
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

        {/* Recorded path polyline (during and after recording) */}
        {recordedPath.length > 1 && (
          <>
            {/* Glow layer */}
            <Polyline
              coordinates={recordedPath}
              strokeWidth={8}
              strokeColor={`${RECORDED_PATH_COLOR}30`}
              lineCap="round"
              lineJoin="round"
            />
            {/* Outer glow */}
            <Polyline
              coordinates={recordedPath}
              strokeWidth={5}
              strokeColor={`${RECORDED_PATH_COLOR}50`}
              lineCap="round"
              lineJoin="round"
            />
            {/* Core line */}
            <Polyline
              coordinates={recordedPath}
              strokeWidth={3}
              strokeColor={RECORDED_PATH_COLOR}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Route Polyline (navigation to cafe) */}
        {routeInfo && (
          <>
            <Polyline
              coordinates={routeInfo.coordinates}
              strokeWidth={7}
              strokeColor={`${ROUTE_GLOW}40`}
              lineCap="round"
              lineJoin="round"
            />
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
        {selectedDestination && routeInfo && destCoords() && (
          <Marker
            coordinate={destCoords()!}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.destPin}>
              <MapPin size={28} color={ROUTE_RED} fill={ROUTE_RED} />
            </View>
          </Marker>
        )}

        {/* Custom location marker (tapped, no route yet) */}
        {selectedDestination && selectedDestination.type === "location" && !routeInfo && (
          <Marker
            coordinate={{ latitude: selectedDestination.lat, longitude: selectedDestination.lng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.customPin}>
              <MapPin size={28} color="#FF6B35" fill="#FF6B35" />
            </View>
          </Marker>
        )}

        {/* User car marker — always visible, recording or not */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading}
            flat
          >
            <Animated.View style={[styles.carMarker, { transform: [{ translateY: carFloat }] }]}>
              <View style={styles.carGlow} />
              <View style={[styles.carRing, isRecording && styles.carRingRecording]}>
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
      {loadingCafes && !locating && !isRecording && (
        <Animated.View style={[styles.cafeLoading, { top: insets.top + 16, opacity: fadeIn }]}>
          <ActivityIndicator size="small" color="#8B5CF6" />
          <Text style={styles.cafeLoadingText}>Finding cafés across Indonesia...</Text>
        </Animated.View>
      )}



      {/* ===================================================== */}
      {/*   RECORDING HUD — Live stats card                     */}
      {/* ===================================================== */}
      {isRecording && (
        <Animated.View
          style={[
            styles.recordingCard,
            { paddingBottom: insets.bottom + 90, transform: [{ translateY: recSlide }] },
          ]}
        >
          {/* Stop button */}
          <TouchableOpacity style={styles.stopBtn} onPress={stopRecording} activeOpacity={0.7}>
            <Square size={18} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.stopBtnText}>STOP</Text>
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.recordingStats}>
            {/* Distance */}
            <View style={styles.recordingStat}>
              <View style={styles.recordingStatIcon}>
                <Route size={20} color={RECORD_RED} />
              </View>
              <View>
                <Text style={styles.recordingStatLabel}>Distance</Text>
                <Text style={styles.recordingStatValue}>{fmtMeters(tripDistance)}</Text>
              </View>
            </View>

            <View style={styles.recordingDivider} />

            {/* Time */}
            <View style={styles.recordingStat}>
              <View style={styles.recordingStatIcon}>
                <Timer size={20} color="#F59E0B" />
              </View>
              <View>
                <Text style={styles.recordingStatLabel}>Time</Text>
                <Text style={styles.recordingStatValue}>{fmtTimer(elapsedMs)}</Text>
              </View>
            </View>
          </View>

          {/* Recording indicator dot */}
          <View style={styles.recordingIndicator}>
            <Animated.View
              style={[styles.recordingDot, { transform: [{ scale: recPulse }] }]}
            />
            <Text style={styles.recordingIndicatorText}>Recording</Text>
          </View>
        </Animated.View>
      )}

      {/* Trip Summary */}
      {!isRecording && recordedPath.length > 1 && tripDistance > 0 && (() => {
        const actualSec = elapsedMs / 1000;
        const avgSpeed = actualSec > 0 ? (tripDistance / 1000) / (actualSec / 3600) : 0;
        return (
        <View style={[styles.tripSummaryCard, { paddingBottom: insets.bottom + 90 }]}>
          <View style={styles.tripSummaryHeader}>
            <Text style={styles.tripSummaryTitle}>
              {wasFaster ? "Great Drive!" : "Trip Recorded"}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setRecordedPath([]);
                setTripDistance(0);
                setElapsedMs(0);
                setXpEarned(null);
                clearRoute();
              }}
              activeOpacity={0.7}
            >
              <X size={18} color="#5A5A6E" />
            </TouchableOpacity>
          </View>
          <View style={styles.tripStatsGrid}>
            <View style={styles.tripStatItem}>
              <Text style={styles.tripStatLabel}>Distance</Text>
              <View style={styles.tripStatRow}>
                <Route size={14} color={RECORD_RED} />
                <Text style={styles.tripStatValue}>{fmtMeters(tripDistance)}</Text>
              </View>
            </View>
            <View style={styles.tripStatItem}>
              <Text style={styles.tripStatLabel}>Time</Text>
              <View style={styles.tripStatRow}>
                <Clock size={14} color="#F59E0B" />
                <Text style={styles.tripStatValue}>{fmtTimer(elapsedMs)}</Text>
              </View>
            </View>
            <View style={styles.tripStatItem}>
              <Text style={styles.tripStatLabel}>Avg Speed</Text>
              <View style={styles.tripStatRow}>
                <TrendingUp size={14} color="#3B82F6" />
                <Text style={styles.tripStatValue}>{avgSpeed.toFixed(1)}</Text>
                <Text style={styles.tripStatUnit}>km/h</Text>
              </View>
            </View>
          </View>
          {xpEarned != null && (
            <>
              <View style={styles.xpRewardRow}>
                <View style={styles.xpRewardLeft}>
                  <Zap size={18} color="#FFD700" />
                  <Text style={styles.xpRewardLabel}>
                    {wasFaster ? "Faster than estimate!" : "Trip complete"}
                  </Text>
                </View>
                <View style={styles.xpBadge}>
                  <Text style={styles.xpBadgeText}>+{xpEarned} XP</Text>
                </View>
              </View>
              {routeInfo && (
                <View style={styles.comparisonRow}>
                  <Text style={styles.comparisonText}>Est. {routeInfo.durationMin}</Text>
                  <Text style={[styles.comparisonDiff, wasFaster ? styles.comparisonFaster : styles.comparisonSlower]}>
                    {wasFaster ? `-${fmtDuration(routeInfo.durationSeconds - (elapsedMs / 1000))}` : `+${fmtDuration((elapsedMs / 1000) - routeInfo.durationSeconds)}`}
                  </Text>
                </View>
              )}
              {leveledUp && (
                <View style={styles.levelUpBanner}>
                  <Trophy size={16} color="#FFD700" />
                  <Text style={styles.levelUpText}>LEVEL UP! You reached Level {level}</Text>
                </View>
              )}
            </>
          )}
          <View style={styles.levelBarContainer}>
            <View style={styles.levelBarHeader}>
              <Text style={styles.levelBarLabel}>Level {level}</Text>
              <Text style={styles.levelBarXp}>{xpCurrentLevel} / {xpRequired} XP</Text>
            </View>
            <View style={styles.levelBarTrack}>
              <View style={[styles.levelBarFill, { width: `${Math.min(xpProgress * 100, 100)}%` }]} />
            </View>
          </View>
        </View>
        );
      })()}

      {/* --- Right-side buttons --- */}
      {!isRecording && (
        <Animated.View style={[styles.rightButtons, { top: insets.top + 60, opacity: fadeIn }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={centerOnUser} activeOpacity={0.7}>
            <Crosshair size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, isPickMode && styles.actionBtnActive]}
            onPress={togglePickMode}
            activeOpacity={0.7}
          >
            <MapPin size={18} color={isPickMode ? "#FF6B35" : "#6A6A7E"} />
          </TouchableOpacity>
          {routeInfo && (
            <TouchableOpacity style={styles.actionBtn} onPress={clearRoute} activeOpacity={0.7}>
              <X size={20} color="#EF4444" />
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* --- Selected destination card (cafe or custom location) --- */}
      {selectedDestination && !routeInfo && !isRecording && (() => {
        const isCafe = selectedDestination.type === "cafe";
        const destName = isCafe
          ? (selectedDestination as { type: "cafe"; data: CafePOI }).data.name
          : "Selected Location";
        const destVicinity = isCafe
          ? (selectedDestination as { type: "cafe"; data: CafePOI }).data.vicinity
          : undefined;
        const destRating = isCafe
          ? (selectedDestination as { type: "cafe"; data: CafePOI }).data.rating
          : undefined;
        const coordsStr = !isCafe
          ? `Lat: ${(selectedDestination as { type: "location"; lat: number; lng: number }).lat.toFixed(5)}, Lng: ${(selectedDestination as { type: "location"; lat: number; lng: number }).lng.toFixed(5)}`
          : undefined;
        return (
        <View style={[styles.cafeCard, { paddingBottom: insets.bottom + 90 }]}>
          <TouchableOpacity
            style={styles.cafeCardClose}
            onPress={() => setSelectedDestination(null)}
          >
            <View style={styles.cafeCardCloseBar} />
          </TouchableOpacity>
          <View style={styles.cafeCardContent}>
            <View style={styles.cafeCardInfo}>
              <Text style={styles.cafeCardName} numberOfLines={2}>{destName}</Text>
              {destVicinity ? (
                <Text style={styles.cafeCardVicinity} numberOfLines={1}>{destVicinity}</Text>
              ) : coordsStr ? (
                <Text style={styles.cafeCardVicinity} numberOfLines={1}>{coordsStr}</Text>
              ) : null}
              {destRating ? (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingText}>{destRating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={handleNavigate}
              activeOpacity={0.7}
            >
              <Route size={18} color="#FFFFFF" />
              <Text style={styles.navBtnText}>Route</Text>
            </TouchableOpacity>
          </View>
        </View>
        );
      })()}

      {/* --- Navigation route card (distance + ETA) — hidden while recording --- */}
      {routeInfo && !isRecording && (
        <Animated.View
          style={[
            styles.routeCard,
            { paddingBottom: insets.bottom + 90, transform: [{ translateY: cardSlide }] },
          ]}
        >
          <View style={styles.routeCardContent}>
            {loadingRoute && (
              <View style={styles.routeLoader}>
                <ActivityIndicator size="small" color={ROUTE_RED} />
                <Text style={styles.routeLoaderText}>Calculating route...</Text>
              </View>
            )}

            {!loadingRoute && (
              <View style={styles.routeInfoRow}>
                <View style={styles.routeStat}>
                  <View style={styles.routeStatIcon}>
                    <Route size={20} color={ROUTE_RED} />
                  </View>
                  <View>
                    <Text style={styles.routeStatLabel}>Distance</Text>
                    <Text style={styles.routeStatValue}>{routeInfo.distanceKm}</Text>
                  </View>
                </View>

                <View style={styles.routeDivider} />

                <View style={styles.routeStat}>
                  <View style={styles.routeStatIcon}>
                    <Clock size={20} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.routeStatLabel}>Est. Time</Text>
                    <Text style={styles.routeStatValue}>{routeInfo.durationMin}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.routeCancel} onPress={clearRoute} activeOpacity={0.7}>
                  <X size={18} color="#8A8A9A" />
                </TouchableOpacity>
              </View>
            )}

            {(() => {
              const destName = selectedDestination?.type === "cafe"
                ? (selectedDestination as { type: "cafe"; data: CafePOI }).data.name
                : "Selected Location";
              return selectedDestination ? (
                <View style={styles.routeDest}>
                  <MapPin size={14} color={ROUTE_RED} />
                  <Text style={styles.routeDestText} numberOfLines={1}>{destName}</Text>
                </View>
              ) : null;
            })()}

            {/* --- Record button (only after route + ETA visible) --- */}
            {!isRecording && (
              <TouchableOpacity
                style={styles.routeRecBtn}
                onPress={startRecording}
                activeOpacity={0.7}
              >
                <Animated.View style={{ transform: [{ scale: recPulse }] }}>
                  <Circle size={22} color="#FFFFFF" fill={RECORD_RED} />
                </Animated.View>
                <Text style={styles.routeRecBtnText}>START RECORDING</Text>
              </TouchableOpacity>
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
const RECORD_RED = "#FF2D55";
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
  carRingRecording: {
    borderColor: "#FF2D55",
    shadowColor: "#FF2D55",
    shadowOpacity: 0.6,
    shadowRadius: 18,
  },
  // Destination pin
  destPin: {
    alignItems: "center",
    shadowColor: ROUTE_RED,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  // Custom location pin (orange, tapped on map)
  customPin: {
    alignItems: "center",
    shadowColor: "#FF6B35",
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
  actionBtnActive: {
    borderColor: "rgba(255, 107, 53, 0.5)",
    backgroundColor: "rgba(255, 107, 53, 0.12)",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  // ========================
  //  RECORD BUTTON
  // ========================
  recordBtnContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 150,
  },
  recordBtnOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 45, 85, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 45, 85, 0.4)",
    shadowColor: RECORD_RED,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  recordBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 45, 85, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  recordBtnLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: RECORD_RED,
    letterSpacing: 2,
  },
  // ========================
  //  RECORDING HUD
  // ========================
  recordingCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 150,
  },
  recordingStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 45, 85, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    marginBottom: 10,
  },
  recordingStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  recordingStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 45, 85, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  recordingStatLabel: {
    fontSize: 11,
    color: "#6A6A7E",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordingStatValue: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "800",
    marginTop: 2,
  },
  recordingDivider: {
    width: 1,
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginHorizontal: 12,
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: RECORD_RED,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    alignSelf: "center",
    marginBottom: 10,
    shadowColor: RECORD_RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  stopBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RECORD_RED,
  },
  recordingIndicatorText: {
    color: RECORD_RED,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  // ========================
  //  TRIP SUMMARY
  // ========================
  tripSummaryCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 150,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  tripSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  tripSummaryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripSummaryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  tripSummaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  tripSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  tripStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripStatValue: {
    fontSize: 17,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  tripStatUnit: {
    fontSize: 11,
    color: "#6A6A7E",
    fontWeight: "600",
    marginLeft: 2,
  },
  tripStatItem: {
    flex: 1,
    alignItems: "center",
  },
  tripStatLabel: {
    fontSize: 10,
    color: "#6A6A7E",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tripStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tripStatsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  tripSummaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginHorizontal: 4,
  },
  tripSpeedIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  tripSpeedLabel: {
    fontSize: 9,
    color: "#3B82F6",
    fontWeight: "800",
  },
  // XP reward
  xpRewardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 215, 0, 0.06)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.12)",
  },
  xpRewardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  xpRewardLabel: {
    fontSize: 13,
    color: "#CCCCCC",
    fontWeight: "600",
  },
  xpBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
  },
  xpBadgeText: {
    fontSize: 13,
    color: "#FFD700",
    fontWeight: "800",
  },
  // Level bar
  levelBarContainer: {
    marginBottom: 10,
  },
  levelBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  levelBarLabel: {
    fontSize: 12,
    color: "#FF6B35",
    fontWeight: "700",
  },
  levelBarXp: {
    fontSize: 11,
    color: "#5A5A6E",
    fontWeight: "600",
  },
  levelBarTrack: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  levelBarFill: {
    height: 6,
    backgroundColor: "#FF6B35",
    borderRadius: 3,
  },
  levelUpText: {
    fontSize: 13,
    color: "#FFD700",
    fontWeight: "800",
    textAlign: "center",
  },
  levelUpBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  // Comparison row
  comparisonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  comparisonText: {
    fontSize: 12,
    color: "#6A6A7E",
    fontWeight: "500",
  },
  comparisonDiff: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  comparisonFaster: {
    color: "#22C55E",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  comparisonSlower: {
    color: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
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
  cafeCardActions: {
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-end",
  },
  recNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: RECORD_RED,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: RECORD_RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  recNavBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  routeRecBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: RECORD_RED,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 14,
    shadowColor: RECORD_RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  routeRecBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
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
