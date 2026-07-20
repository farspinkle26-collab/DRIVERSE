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
  Image,
  TextInput,
  Keyboard,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import {
  Navigation,
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
  Users,
  UserPlus,
  Coffee,
  Fuel,
  ShoppingBag,
  Flag,
  Crown,
  LogOut,
  Bookmark,
  Share2,
  ChevronRight,
  Search,
  SlidersHorizontal,
  LocateFixed,
  Plus,
  MessageCircle,
  ChevronDown,
  Car,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Check,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import SaveRouteModal from "@/components/SaveRouteModal";
import { useXP } from "@/hooks/useXPStore";
import { useOnlineUsers, OnlineUser } from "@/hooks/useOnlineUsers";
import { useEvents, DriveEvent } from "@/hooks/useEventsStore";
import CreateEventModal, {
  EventTypeIcon,
  eventTypeColor,
  eventTypeLabel,
} from "@/components/CreateEventModal";
import { useAuth } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";
import { Alert } from "react-native";

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

type LandmarkCategory = "cafe" | "restaurant" | "spbu" | "shopping" | "carwash" | "charging";

interface CafePOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  vicinity?: string;
  types: string[];
  category: LandmarkCategory;
}

/** Detect landmark category from Google Places types */
function detectCategory(placeTypes: string[]): LandmarkCategory {
  const t = placeTypes.map((s) => s.toLowerCase());
  if (t.some((s) => s.includes("charging") || s === "electric_vehicle_charging_station")) return "charging";
  if (t.some((s) => s.includes("car_wash"))) return "carwash";
  if (t.some((s) => s.includes("gas") || s === "gas_station")) return "spbu";
  if (t.some((s) => s.includes("restaurant") || s.includes("food"))) return "restaurant";
  if (t.some((s) => s.includes("cafe"))) return "cafe";
  if (t.some((s) => s.includes("store") || s.includes("shop") || s.includes("mall") || s === "shopping_mall")) return "shopping";
  return "restaurant";
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

// --- Compass bearing (degrees, 0-360) from point a to point b ---
function bearingBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// --- Shortest signed delta between two headings (-180..180) ---
function headingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
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

/** Event start time: "Live now", "Today 20:00", "Tomorrow 10:00", "12 Aug 19:30" */
function fmtEventTime(iso: string, isLive: boolean): string {
  if (isLive) return "Live now";
  const d = new Date(iso);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${time}`;
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

/** Featured event header date: "Sun, 19 May • 07:00" */
function fmtFeaturedDate(iso: string): string {
  const d = new Date(iso);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} • ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Relative time for the live feed: "2 min ago", "1 hr ago" */
function fmtAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

/** Time-of-day greeting */
function greetingForHour(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Open-Meteo WMO weather code → icon */
function WeatherGlyph({ code, size }: { code: number; size: number }) {
  if (code >= 95) return <CloudLightning size={size} color="#F2C94C" />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow size={size} color="#CFE2FF" />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain size={size} color="#7FB2F2" />;
  if (code >= 45 && code <= 48) return <CloudFog size={size} color="#9AA4BC" />;
  if (code >= 2) return <Cloud size={size} color="#B9C2D8" />;
  return <Sun size={size} color="#FFD75E" fill="rgba(255, 215, 94, 0.25)" />;
}

// Neon ring palette for other players on the map (stable per user id)
const PLAYER_COLORS = ["#22D3EE", "#A78BFA", "#FB923C", "#F472B6", "#FACC15", "#34D399"];
function playerColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

const CAT_COLORS: Record<LandmarkCategory, string> = {
  cafe: "#D4A574",
  restaurant: "#FF6B6B",
  spbu: "#F59E0B",
  shopping: "#00D4AA",
  carwash: "#3B82F6",
  charging: "#A3E635",
};

const CAT_LABELS: Record<LandmarkCategory, string> = {
  cafe: "Cafes",
  restaurant: "Food",
  spbu: "Fuel",
  shopping: "Shops",
  carwash: "Car Wash",
  charging: "Charging",
};

// Neon badge marker images (design reference). SPBU still uses the vector
// chip — its badge image is yet to come.
const CAT_ICONS: Partial<Record<LandmarkCategory, number>> = {
  cafe: require("@/assets/images/map-icons/cafe.png"),
  restaurant: require("@/assets/images/map-icons/restaurant.png"),
  shopping: require("@/assets/images/map-icons/shopping.png"),
  carwash: require("@/assets/images/map-icons/carwash.png"),
  charging: require("@/assets/images/map-icons/charging.png"),
};

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
  // Hide all default Google POI icons/labels — only our custom cafe/restaurant/SPBU/shopping markers should show
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#1E2E24" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ visibility: "on" }, { color: "#6A8A6A" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#252540" }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#7A7A8E" }] },
];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();

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
  // Whether the selected pin has been confirmed (kept for marker emphasis styling)
  const [locationChosen, setLocationChosen] = useState(false);

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
  const [currentSpeed, setCurrentSpeed] = useState(0); // km/h during recording
  const [tripTopSpeed, setTripTopSpeed] = useState(0); // max km/h reached this trip
  const [routeSplitIdx, setRouteSplitIdx] = useState<number | null>(null); // index where user crossed on route polyline
  // Save & Share Route modal
  const [showSaveRoute, setShowSaveRoute] = useState(false);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastCoordTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Smoothed heading the chase camera is currently pointing at (degrees)
  const navHeadingRef = useRef(0);

  // Estimated route duration (seconds) — saved when route is fetched, used for XP comparison
  const estimatedDurationRef = useRef<number | null>(null);

  // Refs for GPS watcher to read live state without restarting the effect
  const routeInfoRef = useRef<RouteInfo | null>(null);
  const destCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // XP reward display state
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [wasFaster, setWasFaster] = useState(false);
  const [leveledUp, setLeveledUp] = useState(false);

  // XP system
  const { level, xpCurrentLevel, xpRequired, xpProgress, addXP } = useXP();

  // Online users system
  const { onlineUsers, isOnline: isUserOnline, goOnline, goOffline } = useOnlineUsers();
  const { user } = useAuth();
  const [selectedOnlineUser, setSelectedOnlineUser] = useState<OnlineUser | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);

  // ─── HUD chrome state (GTA-style homepage) ───────────────
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [greetingExpanded, setGreetingExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCats, setVisibleCats] = useState<Record<LandmarkCategory, boolean>>({
    cafe: true,
    restaurant: true,
    spbu: true,
    shopping: true,
    carwash: true,
    charging: true,
  });
  const [showEventsLayer, setShowEventsLayer] = useState(true);
  const [showDriversLayer, setShowDriversLayer] = useState(true);
  const weatherFetchedRef = useRef(false);

  // Keep markers re-rendering briefly after POIs change so the badge images
  // finish decoding before tracksViewChanges turns off (Android blank-marker fix)
  const [markerImagesSettling, setMarkerImagesSettling] = useState(true);
  useEffect(() => {
    setMarkerImagesSettling(true);
    const t = setTimeout(() => setMarkerImagesSettling(false), 1500);
    return () => clearTimeout(t);
  }, [cafes]);

  // Events system
  const { events, joinEvent, leaveEvent, cancelEvent } = useEvents();
  const [isEventPickMode, setIsEventPickMode] = useState(false);
  const [eventCoordinate, setEventCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventActionBusy, setEventActionBusy] = useState(false);
  // Keep the selected event fresh as realtime updates flow in
  const selectedEvent: DriveEvent | null =
    events.find((e) => e.id === selectedEventId) ?? null;

  // Animations
  const carFloat = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(200)).current;
  const recPulse = useRef(new Animated.Value(1)).current;
  const recSlide = useRef(new Animated.Value(200)).current;
  const onlinePulse = useRef(new Animated.Value(1)).current;
  const onlineSlide = useRef(new Animated.Value(0)).current;

  // --- Fetch cafes from a specific city ---
  const fetchCityCafes = useCallback(async (lat: number, lng: number, cityName: string): Promise<CafePOI[]> => {
    if (!GOOGLE_API_KEY) return [];
    const types = ["cafe", "restaurant", "gas_station", "shopping_mall", "store", "car_wash", "electric_vehicle_charging_station"];
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
              category: detectCategory(place.types ?? []),
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
  useEffect(() => { routeInfoRef.current = routeInfo; }, [routeInfo]);

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
            // Outside navigation, keep the marker pointed with raw GPS course.
            // While navigating, the chase camera below owns the heading.
            if (!isRecordingRef.current && pos.coords.heading != null && pos.coords.heading >= 0) {
              setHeading(pos.coords.heading);
            }

            // --- Recording: append new coordinate, update distance, calculate speed ---
            if (isRecordingRef.current) {
              const now = Date.now();
              // Capture the previous fix before setRecordedPath overwrites the ref,
              // so we can derive travel direction for the chase camera.
              const prevCoord = lastCoordRef.current;
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

              // --- Current speed (km/h) ---
              if (lastCoordRef.current && lastCoordTimeRef.current > 0) {
                const timeDeltaSec = (now - lastCoordTimeRef.current) / 1000;
                if (timeDeltaSec > 0.3) {
                  const dist = haversineMeters(lastCoordRef.current, newCoord);
                  const speedKmh = (dist / 1000) / (timeDeltaSec / 3600);
                  if (speedKmh < 200) {
                    setCurrentSpeed(speedKmh);
                    setTripTopSpeed((m) => Math.max(m, speedKmh));
                  }
                }
              }
              lastCoordTimeRef.current = now;

              // --- Third-person chase camera (Google Maps navigation style) ---
              // Determine the direction of travel, preferring GPS course while
              // moving, falling back to the bearing between fixes, then holding
              // the last heading when stationary so the view doesn't spin.
              const movedMeters = prevCoord ? haversineMeters(prevCoord, newCoord) : 0;
              const gpsHeading = pos.coords.heading;
              const gpsSpeed = pos.coords.speed; // m/s (may be null/-1)
              let targetHeading = navHeadingRef.current;
              if (typeof gpsHeading === "number" && gpsHeading >= 0 && (gpsSpeed == null || gpsSpeed > 0.7)) {
                targetHeading = gpsHeading;
              } else if (prevCoord && movedMeters > 2) {
                targetHeading = bearingBetween(prevCoord, newCoord);
              }
              // Ease toward the target heading to avoid jitter on noisy fixes.
              const smoothedHeading =
                (navHeadingRef.current + headingDelta(navHeadingRef.current, targetHeading) * 0.6 + 360) % 360;
              navHeadingRef.current = smoothedHeading;
              setHeading(smoothedHeading);
              mapRef.current?.animateCamera(
                { center: newCoord, zoom: 18, pitch: 60, heading: smoothedHeading },
                { duration: 900 }
              );

              // --- Auto-stop when near destination ---
              const dest = destCoordsRef.current;
              const rtInfo = routeInfoRef.current;
              if (rtInfo && dest) {
                const distToDest = haversineMeters(newCoord, dest);

                // --- Compute route split index (yellow = traversed, red = remaining) ---
                let closestIdx = 0;
                let closestDist = Infinity;
                for (let i = 0; i < rtInfo.coordinates.length; i++) {
                  const d = haversineMeters(newCoord, rtInfo.coordinates[i]);
                  if (d < closestDist) {
                    closestDist = d;
                    closestIdx = i;
                  }
                }
                setRouteSplitIdx(closestIdx > 0 ? closestIdx : null);

                if (distToDest < 50) {
                  // Auto-stop — dispatch with a small delay to let state settle
                  setTimeout(() => {
                    setIsRecording(false);
                  }, 500);
                }
              }
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

  // Online pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(onlinePulse, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(onlinePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [onlinePulse]);

  // Online card always visible — content switches between offline/online
  useEffect(() => {
    Animated.spring(onlineSlide, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [onlineSlide]);

  // --- Live weather for the greeting pill (Open-Meteo, keyless) ---
  useEffect(() => {
    if (!userLocation || weatherFetchedRef.current) return;
    weatherFetchedRef.current = true;
    (async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}&current=temperature_2m,weather_code`
        );
        const data = await res.json();
        if (data?.current?.temperature_2m != null) {
          setWeather({
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weather_code ?? 0,
          });
        }
      } catch {
        // Greeting pill simply renders without a temperature
      }
    })();
  }, [userLocation]);

  // --- Add friend from map marker ---
  const handleAddFriendFromMap = useCallback(async (friendId: string, friendName: string) => {
    if (!user) return;
    setAddingFriend(true);
    try {
      const { error } = await supabase.from("friends").insert({
        user_id: user.id,
        friend_id: friendId,
        status: "pending",
      });
      if (error) {
        if (error.code === "23505") {
          Alert.alert("Already Connected", `You are already connected with ${friendName}`);
        } else {
          Alert.alert("Error", error.message);
        }
      } else {
        Alert.alert("Request Sent!", `Friend request sent to ${friendName}`);
      }
    } catch {
      // Silent
    } finally {
      setAddingFriend(false);
    }
  }, [user]);

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
    setLocationChosen(false);
    setRouteInfo(null);
    mapRef.current?.animateCamera(
      { center: { latitude: cafe.lat, longitude: cafe.lng }, zoom: 17, pitch: 40 },
      { duration: 500 }
    );
  }, []);

  const destCoords = useCallback((): { latitude: number; longitude: number } | null => {
    if (!selectedDestination) return null;
    if (selectedDestination.type === "cafe") {
      return { latitude: selectedDestination.data.lat, longitude: selectedDestination.data.lng };
    }
    return { latitude: selectedDestination.lat, longitude: selectedDestination.lng };
  }, [selectedDestination]);

  // Sync destCoordsRef for use inside the GPS watcher (stale closure)
  useEffect(() => { destCoordsRef.current = destCoords(); }, [destCoords]);

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
    setLocationChosen(false);
    estimatedDurationRef.current = null;
  }, []);

  // --- Toggle pick mode ---
  const togglePickMode = useCallback(() => {
    setIsPickMode((prev) => !prev);
    // Clear any pending destination when leaving pick mode
    if (isPickMode) {
      setSelectedDestination(null);
      setLocationChosen(false);
      setRouteInfo(null);
    }
  }, [isPickMode]);

  // --- Map press: drop a pin at tapped location (only when pick mode is ON) ---
  const mapPressCooldownRef = useRef(0);
  const handleMapPress = useCallback((event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    if (!isPickMode && !isEventPickMode) return;
    const now = Date.now();
    if (now - mapPressCooldownRef.current < 200) return;
    mapPressCooldownRef.current = now;
    const { latitude, longitude } = event.nativeEvent.coordinate;

    // Event building mode: drop the event pin and open the builder
    if (isEventPickMode) {
      setIsEventPickMode(false);
      setEventCoordinate({ latitude, longitude });
      setShowCreateEvent(true);
      mapRef.current?.animateCamera(
        { center: { latitude, longitude }, zoom: 16, pitch: 40 },
        { duration: 400 }
      );
      return;
    }
    setSelectedDestination({ type: "location", lat: latitude, lng: longitude });
    setLocationChosen(false);
    setRouteInfo(null);
    // Turn off pick mode after placing a pin (single-use)
    setIsPickMode(false);
    mapRef.current?.animateCamera(
      { center: { latitude, longitude }, zoom: 17, pitch: 40 },
      { duration: 500 }
    );
  }, [isPickMode, isEventPickMode]);

  // --- Event handlers ---
  const toggleEventPickMode = useCallback(() => {
    if (!user) {
      Alert.alert("Sign In Required", "Create an account to build events on the map");
      return;
    }
    setIsEventPickMode((prev) => !prev);
    setIsPickMode(false);
  }, [user]);

  const handleEventCreated = useCallback(() => {
    setShowCreateEvent(false);
    setEventCoordinate(null);
  }, []);

  const handleJoinEvent = useCallback(async (ev: DriveEvent) => {
    setEventActionBusy(true);
    const { error } = await joinEvent(ev.id);
    setEventActionBusy(false);
    if (error) Alert.alert("Could Not Join", error);
  }, [joinEvent]);

  const handleLeaveEvent = useCallback(async (ev: DriveEvent) => {
    setEventActionBusy(true);
    const { error } = await leaveEvent(ev.id);
    setEventActionBusy(false);
    if (error) Alert.alert("Could Not Leave", error);
  }, [leaveEvent]);

  const handleCancelEvent = useCallback((ev: DriveEvent) => {
    Alert.alert("Cancel Event", `Cancel "${ev.title}" for everyone?`, [
      { text: "Keep Event", style: "cancel" },
      {
        text: "Cancel Event",
        style: "destructive",
        onPress: async () => {
          setEventActionBusy(true);
          const { error } = await cancelEvent(ev.id);
          setEventActionBusy(false);
          setSelectedEventId(null);
          if (error) Alert.alert("Error", error);
        },
      },
    ]);
  }, [cancelEvent]);

  const handleRouteToEvent = useCallback((ev: DriveEvent) => {
    if (!userLocation) return;
    setSelectedEventId(null);
    setSelectedDestination({ type: "location", lat: ev.latitude, lng: ev.longitude });
    setLocationChosen(true);
    setNavigating(true);
    fetchDirections(userLocation, { latitude: ev.latitude, longitude: ev.longitude });
  }, [userLocation, fetchDirections]);

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
    setCurrentSpeed(0);
    setTripTopSpeed(0);
    setRouteSplitIdx(null);
    lastCoordRef.current = userLocation;
    lastCoordTimeRef.current = now;
    navHeadingRef.current = heading;
    if (userLocation) {
      setRecordedPath([userLocation]);
      lastCoordRef.current = userLocation;
    }
    // Drop into the third-person navigation view: tight zoom, tilted horizon,
    // and rotated so the direction of travel points up the screen.
    if (userLocation && mapRef.current) {
      mapRef.current.animateCamera(
        { center: userLocation, zoom: 18, pitch: 60, heading },
        { duration: 600 }
      );
    }
  }, [userLocation, heading]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setCurrentSpeed(0);
    setRouteSplitIdx(null);
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

    // Save trip to Supabase
    if (user?.id) {
      const destName = selectedDestination?.type === "cafe"
        ? (selectedDestination as { type: "cafe"; data: CafePOI }).data.name
        : selectedDestination
        ? `${(selectedDestination as { type: "location"; lat: number; lng: number }).lat.toFixed(4)}, ${(selectedDestination as { type: "location"; lat: number; lng: number }).lng.toFixed(4)}`
        : "Unknown";
      const dest = destCoords();
      const estSec = estimatedDurationRef.current ?? 0;
      supabase.from("trips").insert({
        user_id: user.id,
        origin_name: "Current Location",
        origin_lat: recordedPath[0]?.latitude ?? 0,
        origin_lng: recordedPath[0]?.longitude ?? 0,
        destination_name: destName,
        destination_lat: dest?.latitude ?? 0,
        destination_lng: dest?.longitude ?? 0,
        distance_km: tripDistance / 1000,
        duration_seconds: Math.round(actualDurationSec),
        avg_speed_kmh: avgSpeed,
        top_speed_kmh: currentSpeed,
        estimated_duration_seconds: Math.round(estSec),
        xp_earned: xpEarned ?? 10,
        was_faster_than_estimation: wasFaster,
        started_at: new Date(tripStartMs ?? now).toISOString(),
        completed_at: new Date(now).toISOString(),
      }).then(({ error }) => {
        if (error) console.error("Failed to save trip:", error);
      });
    }

    // Keep path visible after stopping
  }, [recordedPath, tripDistance, tripStartMs, level, addXP, user, selectedDestination, destCoords, currentSpeed, xpEarned, wasFaster]);

  // --- Map region ---
  const initialRegion = userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: -6.2088, longitude: 106.8456, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const RECORD_RED = "#FF2D55";
  const RECORD_GLOW = "#FF6482";
  const ROUTE_RED = "#E53935";
  const ROUTE_GLOW = "#FF5252";
  const RECORDED_PATH_COLOR = "#FF2D55";

  // ─── HUD derived data ────────────────────────────────────
  // Idle = no route/recording/cards open; the full homepage chrome shows only then
  const hudIdle =
    !isRecording &&
    !routeInfo &&
    !selectedDestination &&
    !selectedEvent &&
    !selectedOnlineUser &&
    recordedPath.length === 0;

  const firstName = (user?.name ?? "Driver").split(" ")[0];
  const greeting = greetingForHour(new Date().getHours());

  // Featured event for the top banner: live first, else next upcoming
  const featuredEvent = events.find((e) => e.is_live) ?? events[0] ?? null;

  // Nearest landmark (fills the "trending" slot of the live feed)
  let nearestPoi: (CafePOI & { dist: number }) | null = null;
  if (userLocation && cafes.length > 0) {
    for (const c of cafes) {
      const d = haversineMeters(userLocation, { latitude: c.lat, longitude: c.lng });
      if (!nearestPoi || d < nearestPoi.dist) nearestPoi = { ...c, dist: d };
    }
  }

  // Live feed rows: live meets → upcoming events → trending landmark
  type FeedItem = {
    id: string;
    color: string;
    title: string;
    sub: string;
    time: string;
    count?: number;
    onPress: () => void;
    icon: React.ReactNode;
  };
  const feedItems: FeedItem[] = [];
  for (const ev of events) {
    if (feedItems.length >= 3) break;
    const evColor = eventTypeColor(ev.event_type);
    feedItems.push({
      id: `feed-ev-${ev.id}`,
      color: evColor,
      title: ev.is_live ? `${ev.host_name} started a meet` : `New event by ${ev.host_name}`,
      sub: ev.title,
      time: ev.is_live ? fmtAgo(ev.starts_at) : fmtEventTime(ev.starts_at, false),
      count: ev.participant_count,
      icon: <EventTypeIcon type={ev.event_type} size={15} color={evColor} />,
      onPress: () => {
        setSelectedEventId(ev.id);
        mapRef.current?.animateCamera(
          { center: { latitude: ev.latitude, longitude: ev.longitude }, zoom: 15, pitch: 40 },
          { duration: 600 }
        );
      },
    });
  }
  if (feedItems.length < 3 && nearestPoi) {
    const poi = nearestPoi;
    feedItems.push({
      id: `feed-poi-${poi.id}`,
      color: CAT_COLORS[poi.category],
      title: `${poi.name} is trending`,
      sub: "Popular with drivers nearby",
      time: fmtMeters(Math.round(poi.dist)),
      icon: <Coffee size={15} color={CAT_COLORS[poi.category]} />,
      onPress: () => handleCafePress(poi),
    });
  }

  // Search results: name match, nearest first
  const searchResults = searchOpen && searchQuery.trim().length > 0
    ? cafes
        .filter((c) => c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .map((c) => ({
          ...c,
          dist: userLocation
            ? haversineMeters(userLocation, { latitude: c.lat, longitude: c.lng })
            : Number.MAX_SAFE_INTEGER,
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6)
    : [];

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      {/* --- Map --- */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        zoomEnabled
        scrollEnabled
        pitchEnabled
        rotateEnabled
        customMapStyle={MAP_GLOW}
        onPress={handleMapPress}
        followsUserLocation={false}
      >
        {/* Landmark Markers — neon badge image + name + distance label (design spec) */}
        {!isRecording && cafes.filter((poi) => visibleCats[poi.category]).map((poi) => {
          const isSelected = selectedDestination?.type === "cafe" && selectedDestination.data.id === poi.id;
          const cat = poi.category;
          const catColor = CAT_COLORS[cat];
          const badgeSrc = CAT_ICONS[cat];
          const catIcon = (s: number, c: string) => {
            switch (cat) {
              case "cafe": return <Coffee size={s} color={c} strokeWidth={2.2} />;
              case "spbu": return <Fuel size={s} color={c} strokeWidth={2.2} />;
              case "shopping": return <ShoppingBag size={s} color={c} strokeWidth={2.2} />;
              default: return <UtensilsCrossed size={s} color={c} strokeWidth={2.2} />;
            }
          };
          const isChosen = isSelected && locationChosen;
          const distLabel = userLocation
            ? fmtMeters(Math.round(haversineMeters(userLocation, { latitude: poi.lat, longitude: poi.lng })))
            : null;
          return (
            <Marker
              key={poi.id}
              coordinate={{ latitude: poi.lat, longitude: poi.lng }}
              onPress={() => handleCafePress(poi)}
              tracksViewChanges={markerImagesSettling || isSelected}
              anchor={{ x: 0.5, y: 0.3 }}
            >
              <View style={styles.poiMarkerWrap}>
                {badgeSrc ? (
                  <Image
                    source={badgeSrc}
                    style={[
                      styles.poiBadge,
                      isSelected && styles.poiBadgeSelected,
                      isChosen && styles.poiBadgeChosen,
                    ]}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[
                    styles.landmarkMarker,
                    { borderColor: `${catColor}70` },
                    isSelected && [styles.landmarkMarkerSelected, { borderColor: catColor, backgroundColor: `${catColor}18`, shadowColor: catColor }],
                    isChosen && styles.landmarkMarkerChosen,
                  ]}>
                    {catIcon(isChosen ? 19 : isSelected ? 16 : 13, isSelected ? "#EAEAEA" : catColor)}
                  </View>
                )}
                <Text style={styles.poiMarkerName} numberOfLines={1}>{poi.name}</Text>
                {distLabel && <Text style={styles.poiMarkerDist}>{distLabel}</Text>}
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

        {/* Route Polyline — split into yellow (traversed) + red (remaining) during recording */}
        {routeInfo && (() => {
          const splitIdx = isRecording ? routeSplitIdx : null;
          if (splitIdx != null && splitIdx > 0 && splitIdx < routeInfo.coordinates.length - 1) {
            const traversed = routeInfo.coordinates.slice(0, splitIdx + 1);
            const remaining = routeInfo.coordinates.slice(splitIdx);
            return (
              <>
                {/* Traversed — yellow glow + core */}
                {traversed.length > 1 && (
                  <>
                    <Polyline
                      coordinates={traversed}
                      strokeWidth={8}
                      strokeColor="rgba(250, 204, 21, 0.25)"
                      lineCap="round"
                      lineJoin="round"
                    />
                    <Polyline
                      coordinates={traversed}
                      strokeWidth={4}
                      strokeColor="#FACC15"
                      lineCap="round"
                      lineJoin="round"
                    />
                  </>
                )}
                {/* Remaining — red glow + core */}
                {remaining.length > 1 && (
                  <>
                    <Polyline
                      coordinates={remaining}
                      strokeWidth={7}
                      strokeColor={`${ROUTE_GLOW}40`}
                      lineCap="round"
                      lineJoin="round"
                    />
                    <Polyline
                      coordinates={remaining}
                      strokeWidth={4}
                      strokeColor={ROUTE_RED}
                      lineCap="round"
                      lineJoin="round"
                    />
                  </>
                )}
              </>
            );
          }
          // No split yet — show full red route
          return (
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
          );
        })()}

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
            tracksViewChanges={locationChosen}
          >
            <View style={styles.customPin}>
              <MapPin size={locationChosen ? 36 : 28} color="#FF6B35" fill="#FF6B35" />
            </View>
          </Marker>
        )}

        {/* Online player markers — neon ring + car + name/level (design spec) */}
        {isUserOnline && showDriversLayer && onlineUsers.length > 0 && onlineUsers.map((onlineUser) => {
          const ringColor = playerColor(onlineUser.user_id);
          return (
            <Marker
              key={`online-${onlineUser.user_id}`}
              coordinate={{ latitude: onlineUser.latitude, longitude: onlineUser.longitude }}
              anchor={{ x: 0.5, y: 0.35 }}
              onPress={() => setSelectedOnlineUser(onlineUser)}
              tracksViewChanges={false}
            >
              <View style={styles.playerMarkerWrap}>
                <View style={[styles.playerRing, { borderColor: ringColor, shadowColor: ringColor }]}>
                  {onlineUser.avatar ? (
                    <Image source={{ uri: onlineUser.avatar }} style={styles.playerAvatarImg} />
                  ) : (
                    <Car size={15} color={ringColor} strokeWidth={2.2} />
                  )}
                </View>
                <Text style={styles.playerName} numberOfLines={1}>{onlineUser.name}</Text>
                <Text style={styles.playerLevel}>Lv. {onlineUser.level}</Text>
              </View>
            </Marker>
          );
        })}

        {/* Event markers — pin + mini info card (design spec) */}
        {!isRecording && showEventsLayer && events.map((ev) => {
          const evColor = eventTypeColor(ev.event_type);
          const isSelected = selectedEventId === ev.id;
          return (
            <Marker
              key={`event-${ev.id}`}
              coordinate={{ latitude: ev.latitude, longitude: ev.longitude }}
              anchor={{ x: 0.5, y: 0.22 }}
              onPress={() => setSelectedEventId(ev.id)}
              tracksViewChanges={isSelected}
            >
              <View style={styles.eventMarkerColumn}>
                <View style={styles.eventMarkerWrap}>
                  {ev.is_live && <View style={[styles.eventMarkerLiveRing, { borderColor: `${evColor}70` }]} />}
                  <View style={[
                    styles.eventMarker,
                    { borderColor: evColor, shadowColor: evColor },
                    isSelected && styles.eventMarkerSelected,
                  ]}>
                    <EventTypeIcon type={ev.event_type} size={isSelected ? 18 : 15} color={evColor} />
                  </View>
                  <View style={[styles.eventMarkerBadge, { backgroundColor: evColor }]}>
                    <Text style={styles.eventMarkerBadgeText}>{ev.participant_count}</Text>
                  </View>
                </View>
                <View style={[styles.eventMiniCard, { borderColor: `${evColor}55` }]}>
                  <Text style={[styles.eventMiniTitle, { color: evColor }]} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.eventMiniMeta} numberOfLines={1}>
                    {fmtEventTime(ev.starts_at, ev.is_live)}
                    {ev.location_name ? ` · ${ev.location_name}` : ""}
                  </Text>
                </View>
              </View>
            </Marker>
          );
        })}

        {/* Pending event pin (placed, builder open) */}
        {eventCoordinate && showCreateEvent && (
          <Marker coordinate={eventCoordinate} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.customPin}>
              <Flag size={30} color="#FF6B35" fill="#FF6B3530" />
            </View>
          </Marker>
        )}

        {/* User car marker — green "You" ring + level label (design spec) */}
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
                <Navigation
                  size={16}
                  color={isRecording ? "#FF2D55" : "#22C55E"}
                  fill={isRecording ? "rgba(255,45,85,0.15)" : "rgba(34,197,94,0.15)"}
                  strokeWidth={2.5}
                />
              </View>
            </Animated.View>
          </Marker>
        )}

        {/* "You · Lv." label rides in a separate non-rotating marker so it stays upright */}
        {userLocation && !isRecording && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: -0.35 }}
            tracksViewChanges={false}
          >
            <View style={styles.youLabelWrap}>
              <Text style={styles.youLabelName}>You</Text>
              <Text style={styles.youLabelLevel}>Lv. {level}</Text>
            </View>
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
          <Text style={styles.cafeLoadingText}>Finding landmarks across Indonesia...</Text>
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
                <Route size={18} color={RECORD_RED} />
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
                <Timer size={18} color="#F59E0B" />
              </View>
              <View>
                <Text style={styles.recordingStatLabel}>Time</Text>
                <Text style={styles.recordingStatValue}>{fmtTimer(elapsedMs)}</Text>
              </View>
            </View>

            <View style={styles.recordingDivider} />

            {/* Current Speed */}
            <View style={styles.recordingStat}>
              <View style={styles.recordingStatSpeedIcon}>
                <TrendingUp size={18} color="#3B82F6" />
              </View>
              <View>
                <Text style={styles.recordingStatLabel}>Speed</Text>
                <View style={styles.speedRow}>
                  <Text style={styles.recordingStatValue}>{currentSpeed.toFixed(0)}</Text>
                  <Text style={styles.speedUnit}>km/h</Text>
                </View>
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

          {/* Save & Share this route (Strava-style) */}
          <View style={styles.saveRouteRow}>
            <TouchableOpacity
              style={styles.saveRouteBtn}
              onPress={() => setShowSaveRoute(true)}
              activeOpacity={0.85}
            >
              <Bookmark size={17} color="#FFFFFF" />
              <Text style={styles.saveRouteBtnText}>Save & Share Route</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.myRoutesBtn}
              onPress={() => router.push("/routes" as any)}
              activeOpacity={0.7}
            >
              <Share2 size={17} color="#FF6B35" />
            </TouchableOpacity>
          </View>
        </View>
        );
      })()}

      {/* ===================================================== */}
      {/*   TOP CHROME — greeting pill + featured event banner   */}
      {/* ===================================================== */}
      {!isRecording && !isEventPickMode && !searchOpen && (
        <Animated.View
          style={[styles.topChrome, { top: insets.top + 10, opacity: fadeIn }]}
          pointerEvents="box-none"
        >
          {/* Weather / greeting pill */}
          <TouchableOpacity
            style={styles.greetingPill}
            onPress={() => setGreetingExpanded((v) => !v)}
            activeOpacity={0.85}
          >
            <View style={styles.greetingTempRow}>
              <WeatherGlyph code={weather?.code ?? 0} size={16} />
              {weather && <Text style={styles.greetingTemp}>{weather.temp}°</Text>}
            </View>
            <Text style={styles.greetingLabel}>{greeting},</Text>
            <View style={styles.greetingNameRow}>
              <Text style={styles.greetingName} numberOfLines={1}>{firstName}!</Text>
              <ChevronDown
                size={14}
                color="#8A8A9A"
                style={greetingExpanded ? { transform: [{ rotate: "180deg" }] } : undefined}
              />
            </View>
            {greetingExpanded && (
              <Text style={styles.greetingDate}>
                {fmtFeaturedDate(new Date().toISOString())}
              </Text>
            )}
          </TouchableOpacity>

          {/* Featured event banner */}
          {featuredEvent && (() => {
            const fe = featuredEvent;
            const feColor = eventTypeColor(fe.event_type);
            return (
              <TouchableOpacity
                style={styles.featuredCard}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedEventId(fe.id);
                  mapRef.current?.animateCamera(
                    { center: { latitude: fe.latitude, longitude: fe.longitude }, zoom: 15, pitch: 40 },
                    { duration: 600 }
                  );
                }}
              >
                <View style={[styles.featuredThumb, { backgroundColor: `${feColor}1E`, borderColor: `${feColor}50` }]}>
                  <EventTypeIcon type={fe.event_type} size={20} color={feColor} />
                </View>
                <View style={styles.featuredInfo}>
                  <Text style={styles.featuredTitle} numberOfLines={1}>{fe.title}</Text>
                  <Text style={styles.featuredMeta} numberOfLines={1}>
                    {fmtFeaturedDate(fe.starts_at)}
                  </Text>
                  <View style={styles.featuredLocRow}>
                    <MapPin size={11} color="#8A8A9A" />
                    <Text style={styles.featuredLoc} numberOfLines={1}>
                      {fe.location_name || "On the map"}
                    </Text>
                  </View>
                </View>
                <View style={styles.featuredBadge}>
                  <Users size={11} color="#FFFFFF" />
                  <Text style={styles.featuredBadgeText}>{fe.participant_count}</Text>
                </View>
              </TouchableOpacity>
            );
          })()}
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   RIGHT COLUMN — Search / My Location / Filters        */}
      {/* ===================================================== */}
      {!isRecording && !searchOpen && (
        <Animated.View style={[styles.rightButtons, { top: insets.top + 10, opacity: fadeIn }]}>
          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={[styles.actionBtn, searchOpen && styles.actionBtnActive]}
              onPress={() => {
                if (searchOpen) {
                  closeSearch();
                } else {
                  setSearchOpen(true);
                  setFiltersOpen(false);
                }
              }}
              activeOpacity={0.7}
            >
              <Search size={19} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>Search</Text>
          </View>

          <View style={styles.labeledBtn}>
            <TouchableOpacity style={styles.actionBtn} onPress={centerOnUser} activeOpacity={0.7}>
              <LocateFixed size={19} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>My Location</Text>
          </View>

          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={[styles.actionBtn, filtersOpen && styles.actionBtnActive]}
              onPress={() => { setFiltersOpen((v) => !v); if (searchOpen) closeSearch(); }}
              activeOpacity={0.7}
            >
              <SlidersHorizontal size={18} color={filtersOpen ? "#FF6B35" : "#FFFFFF"} strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>Filters</Text>
          </View>

          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={[styles.actionBtn, isPickMode && styles.actionBtnActive]}
              onPress={togglePickMode}
              activeOpacity={0.7}
            >
              <MapPin size={18} color={isPickMode ? "#FF6B35" : "#FFFFFF"} strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>Drop Pin</Text>
          </View>

          {routeInfo && (
            <View style={styles.labeledBtn}>
              <TouchableOpacity style={styles.actionBtn} onPress={clearRoute} activeOpacity={0.7}>
                <X size={20} color="#EF4444" />
              </TouchableOpacity>
              <Text style={styles.actionBtnLabel}>Clear</Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   SEARCH OVERLAY                                       */}
      {/* ===================================================== */}
      {searchOpen && !isRecording && (
        <View style={[styles.searchOverlay, { top: insets.top + 10 }]}>
          <View style={styles.searchBar}>
            <Search size={17} color="#8A8A9A" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search places nearby..."
              placeholderTextColor="#5A5A6E"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={closeSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color="#8A8A9A" />
            </TouchableOpacity>
          </View>
          {searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.map((res) => (
                <TouchableOpacity
                  key={res.id}
                  style={styles.searchResultRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    closeSearch();
                    handleCafePress(res);
                  }}
                >
                  <View style={[styles.searchResultIcon, { borderColor: `${CAT_COLORS[res.category]}55` }]}>
                    {CAT_ICONS[res.category] ? (
                      <Image source={CAT_ICONS[res.category]} style={styles.searchResultBadge} resizeMode="contain" />
                    ) : res.category === "spbu" ? <Fuel size={14} color={CAT_COLORS[res.category]} />
                      : <UtensilsCrossed size={14} color={CAT_COLORS[res.category]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.searchResultName} numberOfLines={1}>{res.name}</Text>
                    {res.vicinity && (
                      <Text style={styles.searchResultVicinity} numberOfLines={1}>{res.vicinity}</Text>
                    )}
                  </View>
                  {res.dist < Number.MAX_SAFE_INTEGER && (
                    <Text style={styles.searchResultDist}>{fmtMeters(Math.round(res.dist))}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ===================================================== */}
      {/*   FILTERS POPOVER                                      */}
      {/* ===================================================== */}
      {filtersOpen && !isRecording && (
        <View style={[styles.filtersPopover, { top: insets.top + 150 }]}>
          <Text style={styles.filtersTitle}>Map Layers</Text>
          {(Object.keys(CAT_LABELS) as LandmarkCategory[]).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={styles.filterRow}
              activeOpacity={0.7}
              onPress={() => setVisibleCats((prev) => ({ ...prev, [cat]: !prev[cat] }))}
            >
              <View style={[styles.filterDot, { backgroundColor: CAT_COLORS[cat] }]} />
              <Text style={styles.filterLabel}>{CAT_LABELS[cat]}</Text>
              <View style={[styles.filterCheck, visibleCats[cat] && styles.filterCheckOn]}>
                {visibleCats[cat] && <Check size={11} color="#0A0A14" strokeWidth={3.5} />}
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.filterRow}
            activeOpacity={0.7}
            onPress={() => setShowEventsLayer((v) => !v)}
          >
            <View style={[styles.filterDot, { backgroundColor: "#A78BFA" }]} />
            <Text style={styles.filterLabel}>Events</Text>
            <View style={[styles.filterCheck, showEventsLayer && styles.filterCheckOn]}>
              {showEventsLayer && <Check size={11} color="#0A0A14" strokeWidth={3.5} />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterRow}
            activeOpacity={0.7}
            onPress={() => setShowDriversLayer((v) => !v)}
          >
            <View style={[styles.filterDot, { backgroundColor: "#22C55E" }]} />
            <Text style={styles.filterLabel}>Drivers</Text>
            <View style={[styles.filterCheck, showDriversLayer && styles.filterCheckOn]}>
              {showDriversLayer && <Check size={11} color="#0A0A14" strokeWidth={3.5} />}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ===================================================== */}
      {/*   LIVE FEED — bottom-left panel                        */}
      {/* ===================================================== */}
      {hudIdle && !searchOpen && !isEventPickMode && (
        <Animated.View
          style={[styles.liveFeedPanel, { bottom: insets.bottom + 168, opacity: fadeIn }]}
        >
          <View style={styles.liveFeedHeader}>
            <View style={styles.liveFeedTitleRow}>
              <View style={styles.liveFeedDot} />
              <Text style={styles.liveFeedTitle}>Live Feed</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (events.length > 0) {
                  mapRef.current?.fitToCoordinates(
                    events.map((e) => ({ latitude: e.latitude, longitude: e.longitude })),
                    { edgePadding: { top: 140, right: 100, bottom: 320, left: 60 }, animated: true }
                  );
                }
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.liveFeedSeeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {feedItems.length === 0 ? (
            <Text style={styles.liveFeedEmpty}>
              No activity yet — create an event and get the city moving.
            </Text>
          ) : (
            feedItems.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.liveFeedRow, i > 0 && styles.liveFeedRowBorder]}
                activeOpacity={0.7}
                onPress={item.onPress}
              >
                <View style={[styles.liveFeedIcon, { borderColor: `${item.color}60` }]}>
                  {item.icon}
                </View>
                <View style={styles.liveFeedTextWrap}>
                  <Text style={styles.liveFeedRowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={[styles.liveFeedRowSub, { color: item.color }]} numberOfLines={1}>
                    {item.sub}
                  </Text>
                  <Text style={styles.liveFeedRowTime}>{item.time}</Text>
                </View>
                {item.count != null && item.count > 0 && (
                  <View style={[styles.liveFeedCount, { backgroundColor: `${item.color}22` }]}>
                    <Users size={10} color={item.color} />
                    <Text style={[styles.liveFeedCountText, { color: item.color }]}>{item.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   ACTION STACK — Create Event / Convoy / Chat          */}
      {/* ===================================================== */}
      {hudIdle && !searchOpen && (
        <Animated.View
          style={[styles.actionStack, { bottom: insets.bottom + 168, opacity: fadeIn }]}
        >
          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={[styles.createEventBtn, isEventPickMode && styles.createEventBtnActive]}
              onPress={toggleEventPickMode}
              activeOpacity={0.8}
            >
              {isEventPickMode ? (
                <X size={26} color="#FFFFFF" strokeWidth={2.5} />
              ) : (
                <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>{isEventPickMode ? "Cancel" : "Create Event"}</Text>
          </View>

          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={styles.stackBtn}
              onPress={() => router.push("/(tabs)/drive" as any)}
              activeOpacity={0.7}
            >
              <Users size={20} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>Convoy</Text>
          </View>

          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={styles.stackBtn}
              onPress={() => router.push("/chat" as any)}
              activeOpacity={0.7}
            >
              <MessageCircle size={20} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>Chat</Text>
          </View>
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   ONLINE STATUS BANNER — compact, above the tab bar    */}
      {/* ===================================================== */}
      {!isRecording && !routeInfo && !selectedDestination && recordedPath.length === 0 && (() => {
        const onlineCount = onlineUsers.length;
        return (
          <Animated.View
            style={[
              styles.onlineBigCard,
              { paddingBottom: insets.bottom + 78, transform: [{ translateY: onlineSlide }] },
            ]}
            pointerEvents="box-none"
          >
            {!user ? (
              /* NOT LOGGED IN — prompt to sign in */
              <View style={[styles.onlineBanner, styles.onlineBannerOffline]}>
                <View style={styles.onlineBannerLeft}>
                  <View style={[styles.onlineBannerDot, { backgroundColor: "#6A6A7E" }]} />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={[styles.onlineBannerTitle, { color: "#C0C0CE" }]}>Sign in to go online</Text>
                    <Text style={styles.onlineBannerSub}>
                      See other drivers and share your location.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.onlineBannerBtnGreen}
                  onPress={() => router.push("/login" as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.onlineBannerBtnGreenText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : !isUserOnline ? (
              /* OFFLINE — compact banner with green Go Online pill */
              <View style={[styles.onlineBanner, styles.onlineBannerOffline]}>
                <View style={styles.onlineBannerLeft}>
                  <View style={[styles.onlineBannerDot, { backgroundColor: "#6A6A7E" }]} />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={[styles.onlineBannerTitle, { color: "#C0C0CE" }]}>You're Offline</Text>
                    <Text style={styles.onlineBannerSub}>
                      Hidden from the map. Go online to join the action.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.onlineBannerBtnGreen}
                  onPress={goOnline}
                  activeOpacity={0.8}
                >
                  <Text style={styles.onlineBannerBtnGreenText}>Go Online</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ONLINE — glowing green banner (design spec) */
              <View style={styles.onlineBanner}>
                <View style={styles.onlineBannerLeft}>
                  <Animated.View
                    style={[
                      styles.onlineBannerDot,
                      { backgroundColor: "#22C55E", transform: [{ scale: onlinePulse }] },
                    ]}
                  />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={styles.onlineBannerTitle}>You're Online</Text>
                    <Text style={styles.onlineBannerSub}>
                      {onlineCount > 0
                        ? `Your location is visible to others. ${onlineCount} driver${onlineCount !== 1 ? "s" : ""} on the map.`
                        : "Your location is visible to others.\nTap to change privacy settings."}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.goOfflineBtn}
                  onPress={goOffline}
                  activeOpacity={0.7}
                >
                  <Text style={styles.goOfflineBtnText}>Go Offline</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        );
      })()}

      {/* --- Online user profile card (tapped on map) --- */}
      {selectedOnlineUser && !isRecording && (
        <View style={[styles.onlineUserCard, { paddingBottom: insets.bottom + 90 }]}>
          <TouchableOpacity
            style={styles.cafeCardClose}
            onPress={() => setSelectedOnlineUser(null)}
          >
            <View style={styles.cafeCardCloseBar} />
          </TouchableOpacity>
          <View style={styles.onlineUserCardContent}>
            <TouchableOpacity
              style={styles.onlineUserCardHeader}
              activeOpacity={0.7}
              onPress={() => {
                const uid = selectedOnlineUser.user_id;
                setSelectedOnlineUser(null);
                router.push(`/user/${uid}` as any);
              }}
            >
              <View style={styles.onlineUserCardAvatar}>
                {selectedOnlineUser.avatar ? (
                  <Image source={{ uri: selectedOnlineUser.avatar }} style={styles.onlineUserCardAvatarImg} />
                ) : (
                  <Text style={styles.onlineUserCardAvatarText}>
                    {(selectedOnlineUser.name?.[0] ?? "D").toUpperCase()}
                  </Text>
                )}
                <View style={styles.onlineUserCardOnlineDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.onlineUserCardName} numberOfLines={1}>
                  {selectedOnlineUser.name}
                </Text>
                <Text style={styles.onlineUserCardLevel}>
                  Level {selectedOnlineUser.level} · Online now
                </Text>
              </View>
              <ChevronRight size={22} color="#8A8A9A" />
            </TouchableOpacity>
            <View style={styles.onlineUserCardActions}>
              <TouchableOpacity
                style={styles.onlineUserProfileBtn}
                onPress={() => {
                  const uid = selectedOnlineUser.user_id;
                  setSelectedOnlineUser(null);
                  router.push(`/user/${uid}` as any);
                }}
                activeOpacity={0.8}
              >
                <Users size={18} color="#FFFFFF" />
                <Text style={styles.onlineUserProfileBtnText}>View Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.onlineUserAddBtn, addingFriend && { opacity: 0.5 }]}
                onPress={() => handleAddFriendFromMap(selectedOnlineUser.user_id, selectedOnlineUser.name)}
                disabled={addingFriend}
                activeOpacity={0.7}
              >
                <UserPlus size={18} color="#FFFFFF" />
                <Text style={styles.onlineUserAddBtnText}>
                  {addingFriend ? "Sending..." : "Add Friend"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
            onPress={() => { setSelectedDestination(null); setLocationChosen(false); }}
          >
            <View style={styles.cafeCardCloseBar} />
          </TouchableOpacity>
          <View style={styles.cafeCardContent}>
            <View style={styles.cafeCardInfo}>
              <View style={styles.destCardNameRow}>
                {isCafe && (() => {
                  const catData = (selectedDestination as { type: "cafe"; data: CafePOI }).data;
                  const catColorMap: Record<LandmarkCategory, string> = {
                    cafe: "#D4A574", restaurant: "#E53935", spbu: "#F59E0B", shopping: "#00D4AA",
                    carwash: "#3B82F6", charging: "#A3E635",
                  };
                  const cc = catColorMap[catData.category];
                  return (
                    <View style={[styles.categoryDot, { backgroundColor: cc }]} />
                  );
                })()}
                <Text style={styles.cafeCardName} numberOfLines={2}>{destName}</Text>
              </View>
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
            <View style={styles.cafeCardActions}>
              <TouchableOpacity
                style={styles.navBtnOutline}
                onPress={handleNavigate}
                activeOpacity={0.7}
              >
                <Route size={16} color={ROUTE_RED} />
                <Text style={styles.navBtnOutlineText}>Route</Text>
              </TouchableOpacity>
            </View>
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
                <Text style={styles.routeRecBtnText}>START NAVIGATION</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}

      {/* --- Event pick mode banner --- */}
      {isEventPickMode && (
        <View style={[styles.eventPickBanner, { top: insets.top + 16 }]} pointerEvents="none">
          <Flag size={14} color="#FF6B35" />
          <Text style={styles.eventPickBannerText}>Tap the map to place your event</Text>
        </View>
      )}

      {/* --- Selected event card --- */}
      {selectedEvent && !isRecording && (() => {
        const ev = selectedEvent;
        const evColor = eventTypeColor(ev.event_type);
        const isFull =
          ev.max_participants > 0 && ev.participant_count >= ev.max_participants && !ev.is_joined;
        return (
          <View style={[styles.eventCard, { paddingBottom: insets.bottom + 90 }]}>
            <TouchableOpacity
              style={styles.cafeCardClose}
              onPress={() => setSelectedEventId(null)}
            >
              <View style={styles.cafeCardCloseBar} />
            </TouchableOpacity>

            <View style={styles.eventCardHeader}>
              <View style={[styles.eventCardIcon, { borderColor: evColor, backgroundColor: `${evColor}15` }]}>
                <EventTypeIcon type={ev.event_type} size={20} color={evColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventCardTitle} numberOfLines={2}>{ev.title}</Text>
                <View style={styles.eventCardMetaRow}>
                  <View style={[styles.eventTypePill, { backgroundColor: `${evColor}18` }]}>
                    <Text style={[styles.eventTypePillText, { color: evColor }]}>
                      {eventTypeLabel(ev.event_type)}
                    </Text>
                  </View>
                  {ev.is_live && (
                    <View style={styles.eventLivePill}>
                      <View style={styles.eventLiveDot} />
                      <Text style={styles.eventLivePillText}>LIVE</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {ev.description ? (
              <Text style={styles.eventCardDesc} numberOfLines={2}>{ev.description}</Text>
            ) : null}

            <View style={styles.eventCardStats}>
              <View style={styles.eventCardStat}>
                <Clock size={14} color="#F59E0B" />
                <Text style={styles.eventCardStatText}>{fmtEventTime(ev.starts_at, ev.is_live)}</Text>
              </View>
              <View style={styles.eventCardStat}>
                <Users size={14} color="#22C55E" />
                <Text style={styles.eventCardStatText}>
                  {ev.participant_count}
                  {ev.max_participants > 0 ? ` / ${ev.max_participants}` : ""} joined
                </Text>
              </View>
              <View style={styles.eventCardStat}>
                <Crown size={14} color="#FFD700" />
                <Text style={styles.eventCardStatText} numberOfLines={1}>{ev.host_name}</Text>
              </View>
            </View>

            <View style={styles.eventCardActions}>
              {ev.is_host ? (
                <TouchableOpacity
                  style={[styles.eventCancelBtn, eventActionBusy && { opacity: 0.5 }]}
                  onPress={() => handleCancelEvent(ev)}
                  disabled={eventActionBusy}
                  activeOpacity={0.7}
                >
                  <X size={16} color="#EF4444" />
                  <Text style={styles.eventCancelBtnText}>Cancel Event</Text>
                </TouchableOpacity>
              ) : ev.is_joined ? (
                <TouchableOpacity
                  style={[styles.eventLeaveBtn, eventActionBusy && { opacity: 0.5 }]}
                  onPress={() => handleLeaveEvent(ev)}
                  disabled={eventActionBusy}
                  activeOpacity={0.7}
                >
                  <LogOut size={16} color="#8A8A9A" />
                  <Text style={styles.eventLeaveBtnText}>Leave</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.eventJoinBtn,
                    { backgroundColor: evColor },
                    (eventActionBusy || isFull || !user) && { opacity: 0.5 },
                  ]}
                  onPress={() => handleJoinEvent(ev)}
                  disabled={eventActionBusy || isFull || !user}
                  activeOpacity={0.7}
                >
                  <UserPlus size={16} color="#FFFFFF" />
                  <Text style={styles.eventJoinBtnText}>
                    {isFull ? "Event Full" : eventActionBusy ? "Joining..." : "Join Event"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.navBtnOutline}
                onPress={() => handleRouteToEvent(ev)}
                activeOpacity={0.7}
              >
                <Route size={16} color={ROUTE_RED} />
                <Text style={styles.navBtnOutlineText}>Route</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* --- Event builder modal --- */}
      <CreateEventModal
        visible={showCreateEvent}
        coordinate={eventCoordinate}
        onClose={() => {
          setShowCreateEvent(false);
          setEventCoordinate(null);
        }}
        onCreated={handleEventCreated}
      />

      {/* --- Save & Share Route modal --- */}
      <SaveRouteModal
        visible={showSaveRoute}
        onClose={() => setShowSaveRoute(false)}
        path={recordedPath}
        distanceMeters={tripDistance}
        durationSeconds={elapsedMs / 1000}
        avgSpeedKmh={
          elapsedMs > 0 ? (tripDistance / 1000) / (elapsedMs / 1000 / 3600) : 0
        }
        topSpeedKmh={tripTopSpeed}
        xpEarned={xpEarned ?? 0}
        originName="Current Location"
        destinationName={
          selectedDestination?.type === "cafe"
            ? selectedDestination.data.name
            : selectedDestination?.type === "location"
            ? "Dropped Pin"
            : ""
        }
        onSaved={(routeId) => router.push(`/route/${routeId}` as any)}
      />
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
  // Landmark loading
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
  // Landmark marker (generic base; per-category colors applied inline)
  landmarkMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(18, 18, 30, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
  },
  landmarkMarkerSelected: {
    width: 40,
    height: 40,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  landmarkMarkerChosen: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2.5,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 10,
  },
  // POI marker label column (icon chip + name + distance)
  poiMarkerWrap: {
    alignItems: "center",
    maxWidth: 110,
  },
  // Neon badge image markers (glow is baked into the PNG)
  poiBadge: {
    width: 44,
    height: 44,
  },
  poiBadgeSelected: {
    width: 58,
    height: 58,
  },
  poiBadgeChosen: {
    width: 66,
    height: 66,
  },
  searchResultBadge: {
    width: 24,
    height: 24,
  },
  poiMarkerName: {
    marginTop: 4,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#E8E8F0",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    maxWidth: 108,
  },
  poiMarkerDist: {
    marginTop: 1,
    fontSize: 9.5,
    fontWeight: "600",
    color: "#9A9AB0",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  carRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0A0A14",
    borderWidth: 2,
    borderColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  // "You / Lv." label under the player's own marker
  youLabelWrap: {
    alignItems: "center",
  },
  youLabelName: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  youLabelLevel: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#9A9AB0",
    marginTop: 1,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    right: 8,
    gap: 12,
    zIndex: 100,
    alignItems: "center",
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
  labeledBtn: {
    alignItems: "center",
    width: 62,
  },
  actionBtnLabel: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "600",
    color: "#C0C0CE",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ========================
  //  TOP CHROME
  // ========================
  topChrome: {
    position: "absolute",
    left: 14,
    right: 76,
    flexDirection: "row",
    gap: 10,
    zIndex: 120,
    alignItems: "flex-start",
  },
  greetingPill: {
    backgroundColor: "rgba(14, 14, 24, 0.92)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 108,
    maxWidth: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  greetingTempRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  greetingTemp: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  greetingLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#8A8A9A",
    marginTop: 4,
  },
  greetingNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  greetingName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    flexShrink: 1,
  },
  greetingDate: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "#6A6A7E",
    marginTop: 6,
  },
  featuredCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(14, 14, 24, 0.92)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  featuredThumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  featuredInfo: {
    flex: 1,
  },
  featuredTitle: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FF9450",
  },
  featuredMeta: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#B0B0C0",
    marginTop: 2,
  },
  featuredLocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  featuredLoc: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#8A8A9A",
    flexShrink: 1,
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  featuredBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  // ========================
  //  SEARCH OVERLAY
  // ========================
  searchOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 250,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.3)",
    paddingHorizontal: 14,
    height: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    paddingVertical: 0,
  },
  searchResults: {
    marginTop: 8,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchResultIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(18, 18, 30, 0.9)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  searchResultVicinity: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6A6A7E",
    marginTop: 1,
  },
  searchResultDist: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8A8A9A",
  },
  // ========================
  //  FILTERS POPOVER
  // ========================
  filtersPopover: {
    position: "absolute",
    right: 78,
    width: 170,
    backgroundColor: "rgba(14, 14, 24, 0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 240,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  filtersTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6A6A7E",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 7,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#E0E0EA",
  },
  filterCheck: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  filterCheckOn: {
    backgroundColor: "#FF6B35",
    borderColor: "#FF6B35",
  },
  // ========================
  //  LIVE FEED PANEL
  // ========================
  liveFeedPanel: {
    position: "absolute",
    left: 14,
    width: SCREEN_WIDTH * 0.62,
    maxWidth: 300,
    backgroundColor: "rgba(14, 14, 24, 0.92)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    zIndex: 130,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  liveFeedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  liveFeedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  liveFeedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  liveFeedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  liveFeedSeeAll: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  liveFeedEmpty: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6A6A7E",
    lineHeight: 16,
    paddingBottom: 8,
  },
  liveFeedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  liveFeedRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  liveFeedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(18, 18, 30, 0.9)",
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  liveFeedTextWrap: {
    flex: 1,
  },
  liveFeedRowTitle: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#E8E8F0",
  },
  liveFeedRowSub: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  liveFeedRowTime: {
    fontSize: 9.5,
    fontWeight: "500",
    color: "#6A6A7E",
    marginTop: 1,
  },
  liveFeedCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 9,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  liveFeedCountText: {
    fontSize: 10,
    fontWeight: "800",
  },
  // ========================
  //  ACTION STACK (Create Event / Convoy / Chat)
  // ========================
  actionStack: {
    position: "absolute",
    right: 8,
    alignItems: "center",
    gap: 12,
    zIndex: 130,
  },
  createEventBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  createEventBtnActive: {
    backgroundColor: "#E5502A",
  },
  stackBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(18, 18, 30, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
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
    paddingHorizontal: 14,
    paddingVertical: 14,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 45, 85, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  recordingStatSpeedIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  speedRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginTop: 2,
  },
  speedUnit: {
    fontSize: 11,
    color: "#6A6A7E",
    fontWeight: "600",
  },
  recordingStatLabel: {
    fontSize: 11,
    color: "#6A6A7E",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordingStatValue: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "800",
  },
  recordingDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginHorizontal: 8,
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
  saveRouteRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  saveRouteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#FF6B35",
  },
  saveRouteBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  myRoutesBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,107,53,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,107,53,0.3)",
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
    flex: 1,
  },
  destCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
  cafeCardActions: {
    flexDirection: "column",
    gap: 8,
    alignItems: "stretch",
  },
  navBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${ROUTE_RED}60`,
  },
  navBtnOutlineText: {
    color: ROUTE_RED,
    fontSize: 12,
    fontWeight: "700",
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
  // ─── ONLINE STATUS BANNER ────────────────────────────
  onlineBigCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 155,
  },
  onlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "rgba(12, 22, 16, 0.94)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(34, 197, 94, 0.4)",
    paddingHorizontal: 16,
    paddingVertical: 13,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  onlineBannerOffline: {
    backgroundColor: "rgba(16, 16, 26, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
  },
  onlineBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },
  onlineBannerDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 7,
    elevation: 5,
  },
  onlineBannerTextWrap: {
    flex: 1,
  },
  onlineBannerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#22C55E",
    letterSpacing: 0.3,
  },
  onlineBannerSub: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#8FA89A",
    marginTop: 2,
    lineHeight: 14,
  },
  onlineBannerBtnGreen: {
    backgroundColor: "#22C55E",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  onlineBannerBtnGreenText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#06130B",
  },
  goOfflineBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  goOfflineBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#E0E0EA",
  },
  // ─── Online player markers on map ────────────────────
  playerMarkerWrap: {
    alignItems: "center",
    maxWidth: 96,
  },
  playerRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(10, 10, 20, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
    overflow: "hidden",
  },
  playerAvatarImg: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  playerName: {
    marginTop: 4,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#E8E8F0",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    maxWidth: 92,
  },
  playerLevel: {
    marginTop: 1,
    fontSize: 9.5,
    fontWeight: "600",
    color: "#9A9AB0",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ─── Online user profile card ─────────────────────────
  onlineUserCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 160,
  },
  onlineUserCardContent: {
    backgroundColor: "rgba(18, 22, 32, 0.97)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  onlineUserCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  onlineUserCardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#22C55E",
    justifyContent: "center",
    alignItems: "center",
  },
  onlineUserCardAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  onlineUserCardOnlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#22C55E",
    borderWidth: 2.5,
    borderColor: "rgba(18, 22, 32, 1)",
  },
  onlineUserCardAvatarText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  onlineUserCardName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  onlineUserCardLevel: {
    fontSize: 13,
    color: "#22C55E",
    fontWeight: "600",
    marginTop: 2,
  },
  onlineUserCardActions: {
    flexDirection: "row",
    gap: 10,
  },
  onlineUserProfileBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(34, 197, 94, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.35)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  onlineUserProfileBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  onlineUserAddBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FF6B35",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  onlineUserAddBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // ========================
  //  EVENTS
  // ========================
  eventMarkerColumn: {
    alignItems: "center",
    maxWidth: 170,
  },
  eventMarkerWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
  },
  eventMiniCard: {
    marginTop: 2,
    backgroundColor: "rgba(14, 14, 24, 0.94)",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: 168,
    alignItems: "center",
  },
  eventMiniTitle: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  eventMiniMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: "#9A9AB0",
    marginTop: 1,
  },
  eventMarkerLiveRing: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
  },
  eventMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(14, 14, 24, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  eventMarkerSelected: {
    width: 44,
    height: 44,
    borderRadius: 22,
    shadowOpacity: 0.8,
    shadowRadius: 14,
  },
  eventMarkerBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#0E0E18",
  },
  eventMarkerBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  eventPickBanner: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(10, 10, 20, 0.92)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.35)",
    zIndex: 200,
  },
  eventPickBannerText: {
    color: "#FF6B35",
    fontSize: 13,
    fontWeight: "600",
  },
  eventCard: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    backgroundColor: "rgba(14, 14, 24, 0.97)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  eventCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  eventCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
  },
  eventCardTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  eventCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  eventTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  eventTypePillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  eventLivePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  eventLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  eventLivePillText: {
    color: "#22C55E",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  eventCardDesc: {
    color: "#8A8A9A",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  eventCardStats: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  eventCardStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "45%",
  },
  eventCardStatText: {
    color: "#C0C0CE",
    fontSize: 12.5,
    fontWeight: "600",
  },
  eventCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  eventJoinBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  eventJoinBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  eventLeaveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  eventLeaveBtnText: {
    color: "#8A8A9A",
    fontSize: 14,
    fontWeight: "700",
  },
  eventCancelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  eventCancelBtnText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "700",
  },
});
