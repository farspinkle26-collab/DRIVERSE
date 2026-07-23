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
import MapboxTileLayer from "@/components/MapboxTileLayer";
import { PlacesFilterBar, PlacesMarkers, PlaceDetailSheet, SubmitPlaceFab, SubmitPlaceModal } from "@/components/PlacesLayer";
import { usePlaces } from "@/hooks/usePlaces";
import type { NormalizedPlace } from "@/lib/placesApi";
import Svg, { Circle as SvgCircle, Path as SvgPath } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import {
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
  Wrench,
  Car,
  Flag,
  Crown,
  LogOut,
  Bookmark,
  Share2,
  ChevronRight,
  Search,
  SlidersHorizontal,
  LocateFixed,
  MessageCircle,
  ChevronDown,
  User,
  Handshake,
  Sun,
  Moon,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Check,
  CornerUpRight,
  CornerUpLeft,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowUp,
  RotateCcw,
  RefreshCw,
  Navigation,
  Pause,
  Play,
  Camera,
  Star,
  Leaf,
  Mountain,
  ChevronUp,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import * as ImagePickerExpo from "expo-image-picker";
import SaveRouteModal from "@/components/SaveRouteModal";
import { useXP } from "@/hooks/useXPStore";
import { useOnlineUsers, OnlineUser } from "@/hooks/useOnlineUsers";
import { useParty } from "@/hooks/usePartyStore";
import { useEvents, DriveEvent } from "@/hooks/useEventsStore";
import { EventTypeIcon, eventTypeColor, eventTypeLabel } from "@/components/EventMeta";
import { useAuth } from "@/hooks/useAuthStore";
import { useActiveCar } from "@/hooks/useActiveCarStore";
import { useTheme } from "@/hooks/useThemeStore";
import { supabase } from "@/lib/supabase";
import { Alert } from "react-native";
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from "@/constants/mapStyles";
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";
import { searchPlaces, getDirectionsWithSteps } from "@/lib/mapboxApi";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

type LandmarkCategory = "cafe" | "restaurant" | "spbu" | "shopping" | "carwash" | "charging" | "workshop";

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

// --- Mapbox Geocoding search terms used to populate each landmark category ---
const LANDMARK_CATEGORY_QUERIES: { category: LandmarkCategory; query: string }[] = [
  { category: "cafe", query: "cafe" },
  { category: "restaurant", query: "restaurant" },
  { category: "spbu", query: "gas station" },
  { category: "shopping", query: "shopping mall" },
  { category: "carwash", query: "car wash" },
  { category: "workshop", query: "car repair" },
  { category: "charging", query: "ev charging station" },
];

type SelectedDestination =
  | { type: "cafe"; data: CafePOI }
  | { type: "location"; lat: number; lng: number; name?: string };

interface RouteInfo {
  coordinates: { latitude: number; longitude: number }[];
  distanceKm: string;
  distanceMeters: number;
  durationMin: string;
  durationSeconds: number;
}

// A single turn-by-turn maneuver parsed from the Mapbox Directions leg.steps[]
interface RouteStep {
  maneuver: string;
  instruction: string;
  street: string;
  distanceMeters: number;
  durationSeconds: number;
  // Distance from the start of the route through the END of this step —
  // lets us find "which step am I on" from the odometer alone.
  cumulativeMeters: number;
}

/** Mapbox Directions maneuver {type, modifier} -> the maneuver-key strings maneuverMeta() understands */
function mapboxManeuverKey(type: string, modifier?: string): string {
  const mod = modifier ?? "";
  switch (type) {
    case "turn":
      if (mod === "uturn") return "uturn-right";
      if (mod === "sharp right") return "turn-sharp-right";
      if (mod === "sharp left") return "turn-sharp-left";
      if (mod === "slight right") return "turn-slight-right";
      if (mod === "slight left") return "turn-slight-left";
      if (mod === "right") return "turn-right";
      if (mod === "left") return "turn-left";
      return "straight";
    case "merge":
      return "merge";
    case "fork":
      if (mod.includes("left")) return "fork-left";
      if (mod.includes("right")) return "fork-right";
      return "straight";
    case "on ramp":
    case "off ramp":
      if (mod.includes("left")) return "ramp-left";
      if (mod.includes("right")) return "ramp-right";
      return "straight";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return mod.includes("left") ? "roundabout-left" : "roundabout-right";
    case "uturn":
      return "uturn-right";
    default:
      return "straight";
  }
}

/** Maneuver key -> icon + short display label */
function maneuverMeta(maneuver: string): { Icon: typeof ArrowUp; label: string } {
  switch (maneuver) {
    case "turn-right": return { Icon: CornerUpRight, label: "Turn Right" };
    case "turn-left": return { Icon: CornerUpLeft, label: "Turn Left" };
    case "turn-slight-right": return { Icon: ArrowUpRight, label: "Bear Right" };
    case "turn-slight-left": return { Icon: ArrowUpLeft, label: "Bear Left" };
    case "turn-sharp-right": return { Icon: CornerUpRight, label: "Sharp Right" };
    case "turn-sharp-left": return { Icon: CornerUpLeft, label: "Sharp Left" };
    case "uturn-right":
    case "uturn-left": return { Icon: RotateCcw, label: "U-Turn" };
    case "roundabout-right":
    case "roundabout-left": return { Icon: RefreshCw, label: "Roundabout" };
    case "merge": return { Icon: ArrowUpRight, label: "Merge" };
    case "fork-left": return { Icon: ArrowUpLeft, label: "Keep Left" };
    case "fork-right": return { Icon: ArrowUpRight, label: "Keep Right" };
    case "ramp-left": return { Icon: ArrowUpLeft, label: "Take Ramp Left" };
    case "ramp-right": return { Icon: ArrowUpRight, label: "Take Ramp Right" };
    default: return { Icon: ArrowUp, label: "Continue Straight" };
  }
}

function fmtThousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

interface TripRecord {
  coordinates: { latitude: number; longitude: number }[];
  distanceMeters: number;
  durationMs: number;
  startedAt: number;
  endedAt?: number;
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

// NOTE: no speed-limit data source is wired up anywhere in this app (no Roads
// API, no OSM tags) — this is a fixed placeholder purely to match the driving
// HUD mockup visually. Do not treat it as a real regulatory speed limit.
const PLACEHOLDER_SPEED_LIMIT_KMH = 50;

const CAT_COLORS: Record<LandmarkCategory, string> = {
  cafe: "#D4A574",
  restaurant: "#FF6B6B",
  spbu: "#F59E0B",
  shopping: "#00D4AA",
  carwash: "#3B82F6",
  charging: "#A3E635",
  workshop: "#FF7A1A",
};

const CAT_LABELS: Record<LandmarkCategory, string> = {
  cafe: "Cafes",
  restaurant: "Food",
  spbu: "Fuel",
  shopping: "Shops",
  carwash: "Car Wash",
  charging: "Charging",
  workshop: "Workshop",
};

// Neon badge marker images — every category has a matching badge so POI
// markers always render consistently (no vector fallback in normal use).
const CAT_ICONS: Partial<Record<LandmarkCategory, number>> = {
  cafe: require("@/assets/images/map-icons/cafe.png"),
  restaurant: require("@/assets/images/map-icons/restaurant.png"),
  spbu: require("@/assets/images/map-icons/spbu.png"),
  shopping: require("@/assets/images/map-icons/shopping.png"),
  carwash: require("@/assets/images/map-icons/carwash.png"),
  charging: require("@/assets/images/map-icons/charging.png"),
  workshop: require("@/assets/images/map-icons/workshop.png"),
};

// ─── PlayerPuck ──────────────────────────────────────────
// The player's own map marker, drawn entirely in code (SVG) instead of a
// bitmap asset, so it can never ship cropped, half-loaded, or missing.
// Styled after Google Maps' own navigation arrow (blue chevron, white
// outline, soft halo) so it reads as familiar rather than blocking the
// map. The arrow points up and the parent Marker's `rotation={heading}` +
// `flat` steer it with the vehicle.
const PLAYER_PUCK_SIZE = 36;
function PlayerPuck() {
  return (
    <Svg width={PLAYER_PUCK_SIZE} height={PLAYER_PUCK_SIZE} viewBox="0 0 36 36">
      {/* soft blue halo */}
      <SvgCircle cx="18" cy="18" r="17" fill="#4285F4" opacity={0.16} />
      {/* navigation chevron, Google Maps blue-dot style */}
      <SvgPath
        d="M18 6 L27 27 L18 22 L9 27 Z"
        fill="#4285F4"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── SettledMarker ───────────────────────────────────────
// Android draws custom marker views by snapshotting them into a bitmap.
// Turning tracksViewChanges off in the same frame the content finishes
// (image onLoadEnd, text layout, size change on select/deselect) can freeze
// the snapshot mid-paint, which shows up as icons cropped to half their
// size. This wrapper keeps tracking on until `ready` is true AND a short
// grace period passes with no appearance change (`settleKey`), then freezes
// the bitmap for performance. Any settleKey/ready change re-arms tracking.
const MARKER_SETTLE_MS = 600;
type SettledMarkerProps = React.ComponentProps<typeof Marker> & {
  settleKey: string;
  ready?: boolean;
};
function SettledMarker({ settleKey, ready = true, children, ...markerProps }: SettledMarkerProps) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    if (!ready) return;
    const t = setTimeout(() => setTracking(false), MARKER_SETTLE_MS);
    return () => clearTimeout(t);
  }, [settleKey, ready]);
  return (
    <Marker {...markerProps} tracksViewChanges={tracking}>
      {children}
    </Marker>
  );
}

// ─── EyeIcon ─────────────────────────────────────────────
// Visibility toggle glyph: open eye when visible to others, slashed eye
// when hidden. Drawn in code (SVG) to match the app's other in-map icons.
function EyeIcon({ visible, color, size = 14 }: { visible: boolean; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <SvgPath
        d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <SvgCircle cx="12" cy="12" r="3.2" stroke={color} strokeWidth={2} />
      {!visible && (
        <SvgPath d="M3 3L21 21" stroke={color} strokeWidth={2} strokeLinecap="round" />
      )}
    </Svg>
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();

  // GPS state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState<string | null>(null);

  // Cafe state
  const [cafes, setCafes] = useState<CafePOI[]>([]);
  const [loadingCafes, setLoadingCafes] = useState(false);

  // OSM + community "nearby places" layer (cafes/gas/workshop/hangout via Overpass)
  const places = usePlaces();
  const [placesLayerOpen, setPlacesLayerOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<NormalizedPlace | null>(null);
  const [submitPlaceCoord, setSubmitPlaceCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showSubmitPlaceModal, setShowSubmitPlaceModal] = useState(false);

  // Selected destination (cafe or custom tapped location)
  const [selectedDestination, setSelectedDestination] = useState<SelectedDestination | null>(null);
  // Whether the selected pin has been confirmed (kept for marker emphasis styling)
  const [locationChosen, setLocationChosen] = useState(false);
  // Drive/drop-pin mode: independent of online status. While true, the map is
  // listening for a tap to place a destination pin, and the "Drop the pin
  // anywhere" hint is shown.
  const [showDropPinHint, setShowDropPinHint] = useState(false);

  // Navigation / routing state
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

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
  // Turn-by-turn steps parsed from the last fetched Directions route
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  // Driving-mode HUD extras
  const [isPaused, setIsPaused] = useState(false);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [smoothScore, setSmoothScore] = useState(100);
  const [scenicBonusAwarded, setScenicBonusAwarded] = useState(false);
  const [showScenicToast, setShowScenicToast] = useState(false);
  const [photoToast, setPhotoToast] = useState<string | null>(null);
  const isPausedRef = useRef(false);
  const pauseStartRef = useRef<number>(0);
  const pausedAccumRef = useRef<number>(0);
  const speedSamplesRef = useRef<number[]>([]);
  const photoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenicToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // Always points at the latest stopRecording, so the mount-once GPS watcher
  // can trigger a full trip completion (XP + save) instead of a stale closure.
  const stopRecordingRef = useRef<() => void>(() => {});

  // XP reward display state
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [wasFaster, setWasFaster] = useState(false);
  const [leveledUp, setLeveledUp] = useState(false);

  // XP system
  const { level, totalXp, xpCurrentLevel, xpRequired, xpProgress, addXP } = useXP();

  // Online users system
  const { onlineUsers, isOnline: isUserOnline, goOnline, goOffline } = useOnlineUsers();
  const { user } = useAuth();
  const { activeCar } = useActiveCar();
  const { party, partyMemberIds, inviteFriend } = useParty();
  const [selectedOnlineUser, setSelectedOnlineUser] = useState<OnlineUser | null>(null);
  const [invitingToParty, setInvitingToParty] = useState(false);
  const [addingFriend, setAddingFriend] = useState(false);
  const [askingMeetup, setAskingMeetup] = useState(false);

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
    workshop: true,
  });
  const [showEventsLayer, setShowEventsLayer] = useState(true);
  const [showDriversLayer, setShowDriversLayer] = useState(true);
  const weatherFetchedRef = useRef(false);

  // Keep each badge marker re-rendering (tracksViewChanges) until its Image has
  // actually finished decoding, so the native Android marker snapshot isn't taken
  // mid-load (which is what produced icons frozen at half-drawn/cropped size).
  // A blind timeout can't guarantee the image is ready by the time it fires, so
  // we track load completion per-marker instead.
  const [loadedBadgeIds, setLoadedBadgeIds] = useState<Set<string>>(new Set());
  const handleBadgeLoaded = useCallback((id: string) => {
    setLoadedBadgeIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  useEffect(() => {
    const currentIds = new Set(cafes.map((poi) => poi.id));
    setLoadedBadgeIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (currentIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [cafes]);

  // Same load-gating for online player avatars (network images) so their
  // markers don't freeze before the photo has decoded.
  const [loadedAvatarIds, setLoadedAvatarIds] = useState<Set<string>>(new Set());
  const handleAvatarLoaded = useCallback((id: string) => {
    setLoadedAvatarIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // Events system
  const { events, joinEvent, leaveEvent, cancelEvent } = useEvents();
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
    if (!MAPBOX_ACCESS_TOKEN) return [];
    const allResults: CafePOI[] = [];
    const seen = new Set<string>();

    for (const { category, query } of LANDMARK_CATEGORY_QUERIES) {
      try {
        const places = await searchPlaces(query, { latitude: lat, longitude: lng });
        for (const place of places) {
          if (seen.has(place.id)) continue;
          seen.add(place.id);
          allResults.push({
            id: place.id,
            name: place.name,
            lat: place.latitude,
            lng: place.longitude,
            vicinity: place.fullAddress ?? cityName,
            types: [],
            category,
          });
        }
      } catch {
        // Skip failed category
      }
    }
    return allResults;
  }, []);

  // --- Fetch cafes from ALL Indonesian cities ---
  const fetchAllIndonesiaCafes = useCallback(async () => {
    if (!MAPBOX_ACCESS_TOKEN) return;
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
    if (!MAPBOX_ACCESS_TOKEN) {
      Alert.alert("Route Unavailable", "Mapbox access token is missing, so a route can't be calculated.");
      setNavigating(false);
      return;
    }
    setLoadingRoute(true);
    try {
      const result = await getDirectionsWithSteps(origin, dest);

      if (result) {
        estimatedDurationRef.current = result.durationSeconds;
        setRouteInfo({
          coordinates: result.coordinates,
          distanceKm: fmtKm(result.distanceMeters),
          distanceMeters: result.distanceMeters,
          durationMin: fmtDuration(result.durationSeconds),
          durationSeconds: result.durationSeconds,
        });

        // Turn-by-turn steps for the driving-mode instruction card
        let cumulative = 0;
        const steps: RouteStep[] = result.steps.map((s) => {
          cumulative += s.distanceMeters;
          return {
            maneuver: mapboxManeuverKey(s.maneuverType, s.maneuverModifier),
            instruction: s.instruction,
            street: s.street,
            distanceMeters: s.distanceMeters,
            durationSeconds: s.durationSeconds,
            cumulativeMeters: cumulative,
          };
        });
        setRouteSteps(steps);

        mapRef.current?.fitToCoordinates(result.coordinates, {
          edgePadding: { top: 80, right: 60, bottom: 250, left: 60 },
          animated: true,
        });
      } else {
        setNavigating(false);
        Alert.alert("Route Unavailable", "No driving route could be found to this destination.");
      }
    } catch {
      setNavigating(false);
      Alert.alert("Route Unavailable", "Couldn't reach Mapbox. Check your connection and try again.");
    } finally {
      setLoadingRoute(false);
    }
  }, []);

  // --- GPS detection (runs once, uses refs for recording state to avoid restarts) ---
  // Keep userLocationRef in sync
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { routeInfoRef.current = routeInfo; }, [routeInfo]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

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
            // (paused trips keep the GPS sub alive but freeze distance/time/speed accrual)
            if (isRecordingRef.current && !isPausedRef.current) {
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

                    // --- "Smooth Drive" score: penalize harsh accel/braking ---
                    // Derived from real telemetry (rolling avg of |speed delta|
                    // between samples) — not a fabricated number, just a simple
                    // heuristic since there's no accelerometer feed to draw on.
                    const samples = speedSamplesRef.current;
                    samples.push(speedKmh);
                    if (samples.length > 25) samples.shift();
                    if (samples.length >= 2) {
                      let deltaSum = 0;
                      for (let i = 1; i < samples.length; i++) {
                        deltaSum += Math.abs(samples[i] - samples[i - 1]);
                      }
                      const avgDelta = deltaSum / (samples.length - 1);
                      setSmoothScore(Math.max(0, Math.min(100, Math.round(100 - avgDelta * 6))));
                    }
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
                  // Auto-stop — dispatch with a small delay to let state settle.
                  // Goes through the same completion flow as the manual STOP
                  // button so XP is awarded and the trip is saved either way.
                  setTimeout(() => {
                    stopRecordingRef.current();
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

  // --- Recording timer --- (stops ticking while paused; pausedAccumRef keeps the
  // elapsed clock continuous across a pause/resume cycle)
  useEffect(() => {
    if (isRecording && !isPaused && tripStartMs != null) {
      recordTimerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - tripStartMs - pausedAccumRef.current);
      }, 200);
    } else {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [isRecording, isPaused, tripStartMs]);

  // --- Pause / resume handler ---
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        pauseStartRef.current = Date.now();
      } else {
        pausedAccumRef.current += Date.now() - pauseStartRef.current;
      }
      return next;
    });
  }, []);

  // --- Record button: snap a quick photo of the drive ---
  const captureDrivePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePickerExpo.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Camera permission needed", "Allow camera access to capture drive photos.");
        return;
      }
      const result = await ImagePickerExpo.launchCameraAsync({
        mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]) {
        if (photoToastTimerRef.current) clearTimeout(photoToastTimerRef.current);
        setPhotoToast("Photo captured!");
        photoToastTimerRef.current = setTimeout(() => setPhotoToast(null), 2200);
      }
    } catch {
      Alert.alert("Camera error", "Could not open the camera.");
    }
  }, []);

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

  // --- Invite an online friend to my convoy ---
  const handleInviteToPartyFromMap = useCallback(async (friendId: string, friendName: string) => {
    if (!party) {
      Alert.alert(
        "No Convoy Yet",
        "Start a convoy first, then invite friends from the map.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Start a Convoy", onPress: () => router.push("/convoy" as any) },
        ]
      );
      return;
    }
    setInvitingToParty(true);
    try {
      const result = await inviteFriend(friendId);
      if (result.ok) {
        Alert.alert("Invite Sent!", `${friendName} was invited to join ${party.name}.`);
      } else {
        Alert.alert("Couldn't Invite", result.message ?? "You can only invite accepted friends.");
      }
    } finally {
      setInvitingToParty(false);
    }
  }, [party, inviteFriend, router]);

  // --- Ask a meetup from map marker ---
  const handleAskMeetupFromMap = useCallback(async (friendId: string, friendName: string) => {
    if (!user) return;
    setAskingMeetup(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: friendId,
        content: `👋 ${user.name ?? "A driver"} wants to meet up nearby! Are you free to link up?`,
      });
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert("Meetup Request Sent!", `${friendName} will see your message in their inbox.`);
      }
    } catch {
      // Silent
    } finally {
      setAskingMeetup(false);
    }
  }, [user]);

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
    if (!coords) return;
    if (!userLocation) {
      Alert.alert("Location Needed", "We can't find your current location yet. Make sure location services are on and try again.");
      return;
    }
    setNavigating(true);
    fetchDirections(userLocation, coords);
  }, [userLocation, destCoords, fetchDirections]);

  const clearRoute = useCallback(() => {
    setRouteInfo(null);
    setNavigating(false);
    setSelectedDestination(null);
    setLocationChosen(false);
    estimatedDurationRef.current = null;
    // Also clear any leftover trip state from a cancelled navigation
    // (e.g. STOP tapped before the trip qualified for the Trip Summary
    // card), otherwise recordedPath stays non-empty and permanently
    // hides the Drive/Convoy/Chat stack and online banner.
    setRecordedPath([]);
    setTripDistance(0);
    setElapsedMs(0);
    setTripStartMs(null);
    setRouteSplitIdx(null);
    setXpEarned(null);
    setRouteSteps([]);
  }, []);

  // --- Event handlers ---
  const openCreateEvent = useCallback(() => {
    if (!user) {
      Alert.alert("Sign In Required", "Create an account to build events on the map");
      return;
    }
    router.push({ pathname: "/community", params: { tab: "events" } } as any);
  }, [user, router]);

  // --- Drive: toggles drop-pin mode only. Fully independent of online/offline
  // status, which is controlled separately by the online banner's Visibility
  // switch. ---
  const toggleDrive = useCallback(() => {
    if (!user) {
      Alert.alert("Sign In Required", "Create an account to start driving");
      return;
    }
    setShowDropPinHint((v) => !v);
  }, [user]);

  // --- Drop a destination pin wherever the driver taps the map, while drive mode is active ---
  const handleMapPress = useCallback((event: any) => {
    if (!showDropPinHint) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setSelectedDestination({ type: "location", lat: latitude, lng: longitude });
    setLocationChosen(true);
    setRouteInfo(null);
    setShowDropPinHint(false);
  }, [showDropPinHint]);

  // --- Nearby places (OSM + community): fetch on category change or map pan ---
  useEffect(() => {
    if (!placesLayerOpen || !userLocation) return;
    places.fetchForRegion(userLocation.latitude, userLocation.longitude, places.category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLayerOpen, places.category, userLocation]);

  const handlePlacesRegionChange = useCallback((region: { latitude: number; longitude: number }) => {
    if (!placesLayerOpen) return;
    places.fetchForRegion(region.latitude, region.longitude, places.category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLayerOpen, places.category]);

  // --- Long-press the map (while the Places layer is open) to drop a pin and submit a new place ---
  const handleMapLongPress = useCallback((event: any) => {
    if (!placesLayerOpen) return;
    if (!user) {
      Alert.alert("Sign In Required", "Create an account to submit a place");
      return;
    }
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setSubmitPlaceCoord({ latitude, longitude });
    setShowSubmitPlaceModal(true);
  }, [placesLayerOpen, user]);

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
    if (!userLocation) {
      Alert.alert("Location Needed", "We can't find your current location yet. Make sure location services are on and try again.");
      return;
    }
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
    setIsPaused(false);
    setSmoothScore(100);
    setScenicBonusAwarded(false);
    setShowScenicToast(false);
    setPhotoToast(null);
    isPausedRef.current = false;
    pauseStartRef.current = 0;
    pausedAccumRef.current = 0;
    speedSamplesRef.current = [];
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
        : selectedDestination?.name
        ? selectedDestination.name
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
        top_speed_kmh: tripTopSpeed,
        estimated_duration_seconds: Math.round(estSec),
        xp_earned: xpEarned ?? 10,
        was_faster_than_estimation: wasFaster,
        car_id: activeCar?.id ?? null,
        started_at: new Date(tripStartMs ?? now).toISOString(),
        completed_at: new Date(now).toISOString(),
      }).then(({ error }) => {
        if (error) console.error("Failed to save trip:", error);
      });
    }

    // Keep path visible after stopping
  }, [recordedPath, tripDistance, tripStartMs, level, addXP, user, selectedDestination, destCoords, currentSpeed, tripTopSpeed, xpEarned, wasFaster, activeCar]);

  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  // --- Map region ---
  const initialRegion = userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : { latitude: -6.2088, longitude: 106.8456, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const RECORD_RED = "#FF2D55";
  const RECORD_GLOW = "#FF6482";
  const ROUTE_RED = "#E53935";
  const ROUTE_GLOW = "#FF5252";
  const RECORDED_PATH_COLOR = "#FF2D55";

  // A just-finished trip owns the bottom card slot — the stale POI/route
  // cards must yield to it instead of stacking on top and burying its
  // Save & Share / XP buttons.
  const showTripSummary = !isRecording && recordedPath.length > 1 && tripDistance > 0;

  // ─── Driving-mode HUD derived data ───────────────────────
  // Which turn-by-turn step is the driver currently on, found by comparing
  // the trip odometer against each step's cumulative distance-from-start.
  const activeStepIdx = (() => {
    if (routeSteps.length === 0) return 0;
    for (let i = 0; i < routeSteps.length; i++) {
      if (tripDistance < routeSteps[i].cumulativeMeters) return i;
    }
    return routeSteps.length - 1;
  })();
  const activeStep: RouteStep | null = routeSteps[activeStepIdx] ?? null;
  const stepDistanceRemaining = activeStep ? Math.max(0, activeStep.cumulativeMeters - tripDistance) : 0;
  const stepProgress = activeStep && activeStep.distanceMeters > 0
    ? Math.min(1, Math.max(0, 1 - stepDistanceRemaining / activeStep.distanceMeters))
    : 0;
  const stepDurationRemaining = activeStep && activeStep.distanceMeters > 0
    ? activeStep.durationSeconds * (stepDistanceRemaining / activeStep.distanceMeters)
    : 0;

  // Live average speed so far this trip
  const liveAvgSpeed = elapsedMs > 0 ? (tripDistance / 1000) / ((elapsedMs / 1000) / 3600) : 0;

  // Live projected XP: applies the same faster-than-estimate formula stopRecording()
  // uses at the end, but against a projected finish time based on progress so far —
  // a real (if approximate) running total rather than a placeholder number.
  const liveXpEarned = (() => {
    if (!routeInfo || tripDistance <= 0 || elapsedMs <= 0) return 0;
    const fractionDone = Math.min(1, tripDistance / routeInfo.distanceMeters);
    if (fractionDone <= 0) return 0;
    const projectedTotalSec = (elapsedMs / 1000) / fractionDone;
    const estimatedSec = routeInfo.durationSeconds;
    if (projectedTotalSec < estimatedSec) {
      const timeDiff = estimatedSec - projectedTotalSec;
      const ratio = Math.min(timeDiff / estimatedSec, 1);
      return 50 + Math.round(ratio * 200);
    }
    return 25;
  })();

  // Nearest POI per category — same haversine approach as `nearestPoi` below,
  // fixed to the 4 categories the driving HUD's "Nearby" card shows.
  const nearestOfCategory = (cat: LandmarkCategory): (CafePOI & { dist: number }) | null => {
    if (!userLocation) return null;
    let best: (CafePOI & { dist: number }) | null = null;
    for (const c of cafes) {
      if (c.category !== cat) continue;
      const d = haversineMeters(userLocation, { latitude: c.lat, longitude: c.lng });
      if (!best || d < best.dist) best = { ...c, dist: d };
    }
    return best;
  };
  const nearbyCafe = nearestOfCategory("cafe") ?? nearestOfCategory("restaurant");
  const nearbyWorkshop = nearestOfCategory("workshop");
  const nearbyFuel = nearestOfCategory("spbu");
  let nearbyMeet: (DriveEvent & { dist: number }) | null = null;
  if (userLocation) {
    for (const e of events) {
      const d = haversineMeters(userLocation, { latitude: e.latitude, longitude: e.longitude });
      if (!nearbyMeet || d < nearbyMeet.dist) nearbyMeet = { ...e, dist: d };
    }
  }

  // Nearest other online player (for the "Jason Lv.34 600m" style card)
  let nearestFriend: (OnlineUser & { dist: number }) | null = null;
  if (userLocation) {
    for (const ou of onlineUsers) {
      const d = haversineMeters(userLocation, { latitude: ou.latitude, longitude: ou.longitude });
      if (!nearestFriend || d < nearestFriend.dist) nearestFriend = { ...ou, dist: d };
    }
  }

  // One-time "Scenic Road" bonus toast partway through a sufficiently long
  // drive. There's no real scenic-route detection in this app (no terrain/
  // greenery signal to draw on) — this is a lightweight gamification flourish,
  // not a claim about the actual road. The XP it awards is real (via addXP).
  useEffect(() => {
    if (isRecording && !isPaused && !scenicBonusAwarded && tripDistance > 3000) {
      setScenicBonusAwarded(true);
      setShowScenicToast(true);
      addXP(40);
      if (scenicToastTimerRef.current) clearTimeout(scenicToastTimerRef.current);
      scenicToastTimerRef.current = setTimeout(() => setShowScenicToast(false), 4000);
    }
  }, [isRecording, isPaused, scenicBonusAwarded, tripDistance, addXP]);

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
        customMapStyle={isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        followsUserLocation={false}
        onPress={handleMapPress}
        onLongPress={handleMapLongPress}
        onRegionChangeComplete={handlePlacesRegionChange}
      >
        <MapboxTileLayer dark={isDark} />

        {placesLayerOpen && (
          <PlacesMarkers places={places.places} onSelect={setSelectedPlace} />
        )}

        {/* Landmark Markers — neon badge image + name + distance label (design spec).
            Always rendered, regardless of recording/online/party/chat state, so the
            map's POI layer never disappears mid-session. */}
        {cafes.filter((poi) => visibleCats[poi.category]).map((poi) => {
          const isSelected = selectedDestination?.type === "cafe" && selectedDestination.data.id === poi.id;
          const cat = poi.category;
          const catColor = CAT_COLORS[cat];
          const badgeSrc = CAT_ICONS[cat];
          const catIcon = (s: number, c: string) => {
            switch (cat) {
              case "cafe": return <Coffee size={s} color={c} strokeWidth={2.2} />;
              case "spbu": return <Fuel size={s} color={c} strokeWidth={2.2} />;
              case "shopping": return <ShoppingBag size={s} color={c} strokeWidth={2.2} />;
              case "carwash": return <Car size={s} color={c} strokeWidth={2.2} />;
              case "charging": return <Zap size={s} color={c} strokeWidth={2.2} />;
              case "workshop": return <Wrench size={s} color={c} strokeWidth={2.2} />;
              default: return <UtensilsCrossed size={s} color={c} strokeWidth={2.2} />;
            }
          };
          const isChosen = isSelected && locationChosen;
          const distLabel = userLocation
            ? fmtMeters(Math.round(haversineMeters(userLocation, { latitude: poi.lat, longitude: poi.lng })))
            : null;
          return (
            <SettledMarker
              key={poi.id}
              coordinate={{ latitude: poi.lat, longitude: poi.lng }}
              onPress={() => handleCafePress(poi)}
              settleKey={`${isSelected}-${isChosen}-${poi.name}-${distLabel ?? ""}`}
              ready={!badgeSrc || loadedBadgeIds.has(poi.id)}
              anchor={{ x: 0.5, y: 0.37 }}
            >
              <View style={styles.poiMarkerWrap} collapsable={false}>
                {/* Fixed-size box: the marker's outer bounds stay constant across
                    normal/selected/chosen states so the native snapshot never
                    clips a badge that grew after capture. */}
                <View style={styles.poiBadgeBox}>
                  {badgeSrc ? (
                    <Image
                      source={badgeSrc}
                      style={[
                        styles.poiBadge,
                        isSelected && styles.poiBadgeSelected,
                        isChosen && styles.poiBadgeChosen,
                      ]}
                      resizeMode="contain"
                      fadeDuration={0}
                      onLoadEnd={() => handleBadgeLoaded(poi.id)}
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
                </View>
                <Text style={styles.poiMarkerName} numberOfLines={1}>{poi.name}</Text>
                {distLabel && <Text style={styles.poiMarkerDist}>{distLabel}</Text>}
              </View>
            </SettledMarker>
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
          <SettledMarker
            coordinate={{ latitude: selectedDestination.lat, longitude: selectedDestination.lng }}
            anchor={{ x: 0.5, y: 1 }}
            settleKey={`chosen-${locationChosen}`}
          >
            <View style={styles.customPin} collapsable={false}>
              <MapPin size={locationChosen ? 36 : 28} color="#FF6B35" fill="#FF6B35" />
            </View>
          </SettledMarker>
        )}

        {/* Online player markers — neon ring + car + name/level (design spec) */}
        {isUserOnline && showDriversLayer && onlineUsers.length > 0 && onlineUsers.map((onlineUser) => {
          const isPartyMate = partyMemberIds.has(onlineUser.user_id);
          const ringColor = isPartyMate && party ? party.color : playerColor(onlineUser.user_id);
          return (
            <SettledMarker
              key={`online-${onlineUser.user_id}`}
              coordinate={{ latitude: onlineUser.latitude, longitude: onlineUser.longitude }}
              anchor={{ x: 0.5, y: 0.36 }}
              onPress={() => setSelectedOnlineUser(onlineUser)}
              settleKey={`${onlineUser.name}-${onlineUser.level}-${ringColor}-${isPartyMate}-${onlineUser.avatar ?? ""}`}
              ready={!onlineUser.avatar || loadedAvatarIds.has(onlineUser.user_id)}
            >
              <View style={styles.playerMarkerWrap} collapsable={false}>
                {/* Ring box gives the badges room inside the marker bounds —
                    absolutely-positioned children with negative offsets get
                    clipped out of the native marker snapshot. */}
                <View style={styles.playerRingBox}>
                  {isPartyMate && (
                    <View style={[styles.partyOuterRing, { borderColor: ringColor }]} />
                  )}
                  <View style={[
                    styles.playerRing,
                    { borderColor: ringColor, shadowColor: ringColor },
                    isPartyMate && styles.playerRingParty,
                  ]}>
                    {onlineUser.avatar ? (
                      <Image
                        source={{ uri: onlineUser.avatar }}
                        style={styles.playerAvatarImg}
                        fadeDuration={0}
                        onLoadEnd={() => handleAvatarLoaded(onlineUser.user_id)}
                      />
                    ) : (
                      <Text style={styles.playerAvatarInitial}>
                        {(onlineUser.name?.[0] ?? "D").toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.playerLevelBadge, { borderColor: ringColor }]}>
                    <Text style={styles.playerLevelBadgeText}>{onlineUser.level}</Text>
                  </View>
                  {isPartyMate && (
                    <View style={[styles.partyBadge, { backgroundColor: ringColor }]}>
                      <Users size={9} color="#0A0A0F" strokeWidth={3} />
                    </View>
                  )}
                </View>
                <Text style={styles.playerName} numberOfLines={1}>{onlineUser.name}</Text>
              </View>
            </SettledMarker>
          );
        })}

        {/* Event markers — pin + mini info card (design spec) */}
        {!isRecording && showEventsLayer && events.map((ev) => {
          const evColor = eventTypeColor(ev.event_type);
          const isSelected = selectedEventId === ev.id;
          const timeLabel = fmtEventTime(ev.starts_at, ev.is_live);
          return (
            <SettledMarker
              key={`event-${ev.id}`}
              coordinate={{ latitude: ev.latitude, longitude: ev.longitude }}
              anchor={{ x: 0.5, y: 0.22 }}
              onPress={() => setSelectedEventId(ev.id)}
              settleKey={`${isSelected}-${ev.is_live}-${evColor}-${ev.participant_count}-${ev.title}-${timeLabel}-${ev.location_name ?? ""}`}
            >
              <View style={styles.eventMarkerColumn} collapsable={false}>
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
                    {timeLabel}
                    {ev.location_name ? ` · ${ev.location_name}` : ""}
                  </Text>
                </View>
              </View>
            </SettledMarker>
          );
        })}

        {/* User marker — coded SVG puck (no bitmap asset) */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading}
            flat
          >
            <View style={styles.carMarkerBox} collapsable={false}>
              <Animated.View style={[styles.carMarker, { transform: [{ translateY: carFloat }] }]}>
                <PlayerPuck />
              </Animated.View>
            </View>
          </Marker>
        )}

        {/* "You · Lv." label rides in a separate non-rotating marker so it stays upright */}
        {userLocation && !isRecording && (
          <SettledMarker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: -0.35 }}
            settleKey={`you-${level}`}
          >
            <View style={styles.youLabelWrap} collapsable={false}>
              <Text style={styles.youLabelName}>You</Text>
              <Text style={styles.youLabelLevel}>Lv. {level}</Text>
            </View>
          </SettledMarker>
        )}
      </MapView>

      {/* ===================================================== */}
      {/*   NEARBY PLACES LAYER (OSM + community submissions)    */}
      {/* ===================================================== */}
      {placesLayerOpen && !isRecording && (
        <>
          <PlacesFilterBar
            active={places.category}
            onChange={(cat) => {
              places.setCategory(cat);
              setSelectedPlace(null);
            }}
            style={[styles.placesFilterBar, { top: insets.top + 10 }]}
          />
          {places.loading && (
            <View style={[styles.placesLoadingPill, { top: insets.top + 54 }]}>
              <ActivityIndicator size="small" color="#FF6B35" />
              <Text style={styles.placesLoadingText}>Loading nearby places…</Text>
            </View>
          )}
          {places.error && !places.loading && (
            <View style={[styles.placesLoadingPill, { top: insets.top + 54 }]}>
              <Text style={styles.placesLoadingText}>{places.error}</Text>
            </View>
          )}
          <SubmitPlaceFab
            onPress={() => {
              if (!user) {
                Alert.alert("Sign In Required", "Create an account to submit a place");
                return;
              }
              setSubmitPlaceCoord(userLocation);
              setShowSubmitPlaceModal(true);
            }}
            style={styles.placesFab}
          />
        </>
      )}

      <PlaceDetailSheet place={selectedPlace} onClose={() => setSelectedPlace(null)} />

      <SubmitPlaceModal
        visible={showSubmitPlaceModal}
        onClose={() => setShowSubmitPlaceModal(false)}
        coordinate={submitPlaceCoord}
        onSubmit={places.submitPlace}
      />

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
        <>
          {/* --- Top-left: profile pill (avatar, level, lifetime XP) --- */}
          <View style={[styles.drivingProfilePill, { top: insets.top + 10 }]} pointerEvents="none">
            {user?.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.drivingProfileAvatar} />
            ) : (
              <View style={styles.drivingProfileAvatarFallback}>
                <Text style={styles.drivingProfileAvatarText}>{firstName[0]?.toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={styles.drivingProfileLevel}>LV. {level}</Text>
              <Text style={styles.drivingProfileXp}>{fmtThousands(totalXp)} XP</Text>
            </View>
          </View>

          {/* --- Top-left: turn-by-turn instruction card --- */}
          {activeStep && (() => {
            const { Icon: TurnIcon, label } = maneuverMeta(activeStep.maneuver);
            return (
              <View style={[styles.turnCard, { top: insets.top + 54 }]}>
                <View style={styles.turnCardTopRow}>
                  <View style={styles.turnIconBox}>
                    <TurnIcon size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.turnTextCol}>
                    <View style={styles.turnDistanceRow}>
                      <Text style={styles.turnDistanceText}>
                        {stepDistanceRemaining < 1000 ? Math.round(stepDistanceRemaining) : (stepDistanceRemaining / 1000).toFixed(1)}
                      </Text>
                      <Text style={styles.turnMetersUnit}>{stepDistanceRemaining < 1000 ? "m" : "km"}</Text>
                    </View>
                    <Text style={styles.turnInstructionText} numberOfLines={1}>{label}</Text>
                    {!!activeStep.street && (
                      <Text style={styles.turnStreetText} numberOfLines={1}>{activeStep.street}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.turnProgressTrack}>
                  <View style={[styles.turnProgressFill, { width: `${Math.round(stepProgress * 100)}%` }]} />
                </View>
                <View style={styles.turnBottomRow}>
                  <Text style={styles.turnBottomText}>{fmtMeters(stepDistanceRemaining)}</Text>
                  <Text style={styles.turnBottomText}>{fmtDuration(Math.round(stepDurationRemaining))}</Text>
                </View>
              </View>
            );
          })()}

          {/* --- Top-right: speed limit sign + compass --- */}
          <View style={[styles.topRightCluster, { top: insets.top + 10 }]}>
            <View style={styles.speedLimitSign}>
              <Text style={styles.speedLimitNumber}>{PLACEHOLDER_SPEED_LIMIT_KMH}</Text>
              <Text style={styles.speedLimitUnit}>km/h</Text>
            </View>
            <TouchableOpacity
              style={styles.compassBtn}
              activeOpacity={0.7}
              onPress={() => {
                if (userLocation) {
                  mapRef.current?.animateCamera({ center: userLocation, heading: 0 }, { duration: 500 });
                }
              }}
            >
              <Navigation size={16} color="#FF6B35" style={{ transform: [{ rotate: `${-heading}deg` }] }} />
            </TouchableOpacity>
          </View>

          {/* --- Top-right: Nearby card --- */}
          <View style={[styles.nearbyCard, { top: insets.top + 60 }]}>
            <Text style={styles.nearbyHeaderText}>NEARBY</Text>
            {nearbyCafe && (
              <View style={styles.nearbyRow}>
                <View style={[styles.nearbyIconBox, { backgroundColor: `${CAT_COLORS.cafe}22` }]}>
                  <Coffee size={11} color={CAT_COLORS.cafe} />
                </View>
                <View>
                  <Text style={styles.nearbyLabel}>Coffee</Text>
                  <Text style={styles.nearbyDist}>{fmtMeters(nearbyCafe.dist)}</Text>
                </View>
              </View>
            )}
            {nearbyWorkshop && (
              <View style={styles.nearbyRow}>
                <View style={[styles.nearbyIconBox, { backgroundColor: `${CAT_COLORS.workshop}22` }]}>
                  <Wrench size={11} color={CAT_COLORS.workshop} />
                </View>
                <View>
                  <Text style={styles.nearbyLabel}>Workshop</Text>
                  <Text style={styles.nearbyDist}>{fmtMeters(nearbyWorkshop.dist)}</Text>
                </View>
              </View>
            )}
            {nearbyMeet && (
              <View style={styles.nearbyRow}>
                <View style={[styles.nearbyIconBox, { backgroundColor: "#3B82F622" }]}>
                  <Car size={11} color="#3B82F6" />
                </View>
                <View>
                  <Text style={styles.nearbyLabel}>Car Meet</Text>
                  <Text style={styles.nearbyDist}>{fmtMeters(nearbyMeet.dist)}</Text>
                </View>
              </View>
            )}
            {nearbyFuel && (
              <View style={styles.nearbyRow}>
                <View style={[styles.nearbyIconBox, { backgroundColor: `${CAT_COLORS.spbu}22` }]}>
                  <Fuel size={11} color={CAT_COLORS.spbu} />
                </View>
                <View>
                  <Text style={styles.nearbyLabel}>Fuel</Text>
                  <Text style={styles.nearbyDist}>{fmtMeters(nearbyFuel.dist)}</Text>
                </View>
              </View>
            )}
            {nearbyExpanded && (
              <>
                {(() => {
                  const second = nearestOfCategory("restaurant");
                  return second && second.id !== nearbyCafe?.id ? (
                    <View style={styles.nearbyRow}>
                      <View style={[styles.nearbyIconBox, { backgroundColor: `${CAT_COLORS.restaurant}22` }]}>
                        <UtensilsCrossed size={11} color={CAT_COLORS.restaurant} />
                      </View>
                      <View>
                        <Text style={styles.nearbyLabel}>Food</Text>
                        <Text style={styles.nearbyDist}>{fmtMeters(second.dist)}</Text>
                      </View>
                    </View>
                  ) : null;
                })()}
                {(() => {
                  const charging = nearestOfCategory("charging");
                  return charging ? (
                    <View style={styles.nearbyRow}>
                      <View style={[styles.nearbyIconBox, { backgroundColor: `${CAT_COLORS.charging}22` }]}>
                        <Zap size={11} color={CAT_COLORS.charging} />
                      </View>
                      <View>
                        <Text style={styles.nearbyLabel}>Charging</Text>
                        <Text style={styles.nearbyDist}>{fmtMeters(charging.dist)}</Text>
                      </View>
                    </View>
                  ) : null;
                })()}
              </>
            )}
            <TouchableOpacity
              style={styles.nearbyChevronBtn}
              onPress={() => setNearbyExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              {nearbyExpanded ? <ChevronUp size={13} color="#6A6A7E" /> : <ChevronDown size={13} color="#6A6A7E" />}
            </TouchableOpacity>
          </View>

          {/* --- Left column: gamification stack --- */}
          <View style={[styles.achievementStack, { top: insets.top + 178 }]} pointerEvents="box-none">
            <View style={styles.achievementCard}>
              <View style={styles.achievementIconBox}>
                <Leaf size={13} color="#22C55E" />
              </View>
              <View style={styles.achievementTextCol}>
                <Text style={styles.achievementTitle}>Smooth Drive</Text>
                <Text style={styles.achievementValue}>{smoothScore} Score</Text>
                <View style={styles.achievementProgressTrack}>
                  <View style={[styles.achievementProgressFill, { width: `${smoothScore}%` }]} />
                </View>
              </View>
            </View>

            {liveXpEarned > 0 && (
              <View style={styles.achievementCard}>
                <View style={[styles.achievementIconBox, { backgroundColor: "rgba(250, 204, 21, 0.12)" }]}>
                  <Star size={13} color="#FACC15" fill="#FACC15" />
                </View>
                <Text style={styles.achievementInlineText}>XP +{liveXpEarned}</Text>
              </View>
            )}

            {showScenicToast && (
              <View style={styles.achievementCard}>
                <View style={[styles.achievementIconBox, { backgroundColor: "rgba(167, 139, 250, 0.12)" }]}>
                  <Mountain size={13} color="#A78BFA" />
                </View>
                <View>
                  <Text style={styles.achievementTitle}>Scenic Road</Text>
                  <Text style={[styles.achievementValue, { color: "#A78BFA" }]}>+40 XP</Text>
                </View>
              </View>
            )}

            {nearestFriend && (
              <View style={styles.friendCard}>
                {nearestFriend.avatar ? (
                  <Image source={{ uri: nearestFriend.avatar }} style={styles.friendAvatar} />
                ) : (
                  <View style={[styles.friendAvatarFallback, { backgroundColor: playerColor(nearestFriend.user_id) }]}>
                    <Text style={styles.drivingProfileAvatarText}>{nearestFriend.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.friendName}>{nearestFriend.name}</Text>
                  <Text style={styles.friendMeta}>Lv. {nearestFriend.level} · {fmtMeters(nearestFriend.dist)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* --- Photo captured toast --- */}
          {photoToast && (
            <View style={[styles.photoToastPill, { top: insets.top + 10 }]} pointerEvents="none">
              <Camera size={14} color="#FFFFFF" />
              <Text style={styles.photoToastText}>{photoToast}</Text>
            </View>
          )}

          {/* --- Bottom sheet: speedometer, progress, actions, stats --- */}
          <Animated.View
            style={[
              styles.recordingCard,
              { paddingBottom: insets.bottom + 90, transform: [{ translateY: recSlide }] },
            ]}
          >
            {/* Floating speedometer, overlaps the map above the sheet */}
            <View style={styles.speedometerWrap}>
              <View style={styles.speedometerRing}>
                <Text style={styles.speedometerValue}>{currentSpeed.toFixed(0)}</Text>
                <Text style={styles.speedometerUnit}>km/h</Text>
                <View style={styles.speedometerGearRow}>
                  <Circle size={8} color="#22C55E" fill="#22C55E" />
                  <Text style={styles.speedometerGearText}>D</Text>
                </View>
              </View>
              {isPaused && (
                <View style={styles.pausedBadge}>
                  <Text style={styles.pausedBadgeText}>PAUSED</Text>
                </View>
              )}
            </View>

            {/* Action row: Pause / End Drive / Record */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.drivingActionBtn} onPress={togglePause} activeOpacity={0.7}>
                <View style={styles.actionBtnCircle}>
                  {isPaused ? <Play size={20} color="#FFFFFF" fill="#FFFFFF" /> : <Pause size={20} color="#FFFFFF" fill="#FFFFFF" />}
                </View>
                <Text style={styles.drivingActionBtnLabel}>{isPaused ? "RESUME" : "PAUSE"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.drivingActionBtn} onPress={stopRecording} activeOpacity={0.7}>
                <View style={styles.actionBtnCircleBig}>
                  <Square size={22} color="#FFFFFF" fill="#FFFFFF" />
                </View>
                <Text style={styles.drivingActionBtnLabel}>END DRIVE</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.drivingActionBtn} onPress={captureDrivePhoto} activeOpacity={0.7}>
                <View style={styles.actionBtnCircle}>
                  <Camera size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.drivingActionBtnLabel}>RECORD</Text>
              </TouchableOpacity>
            </View>

            {/* Stats row */}
            <View style={styles.drivingStatsRow}>
              <View style={styles.drivingStatCol}>
                <Text style={styles.drivingStatLabel}>Distance</Text>
                <Text style={styles.drivingStatValue}>{fmtMeters(tripDistance)}</Text>
              </View>
              <View style={styles.drivingStatCol}>
                <Text style={styles.drivingStatLabel}>Time</Text>
                <Text style={styles.drivingStatValue}>{fmtTimer(elapsedMs)}</Text>
              </View>
              <View style={styles.drivingStatCol}>
                <Text style={styles.drivingStatLabel}>Avg Speed</Text>
                <Text style={styles.drivingStatValue}>{liveAvgSpeed.toFixed(0)}</Text>
              </View>
              <View style={styles.drivingStatCol}>
                <Text style={styles.drivingStatLabel}>Max Speed</Text>
                <Text style={styles.drivingStatValue}>{tripTopSpeed.toFixed(0)}</Text>
              </View>
              <View style={styles.drivingStatCol}>
                <Text style={styles.drivingStatLabel}>XP Earned</Text>
                <Text style={[styles.drivingStatValue, { color: "#FACC15" }]}>+{liveXpEarned}</Text>
              </View>
            </View>
          </Animated.View>
        </>
      )}

      {/* Trip Summary */}
      {showTripSummary && (() => {
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
      {!isRecording && !searchOpen && (
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
              style={styles.actionBtn}
              onPress={openCreateEvent}
              activeOpacity={0.7}
            >
              <MapPin size={18} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>Event</Text>
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
          <Text style={styles.filtersTitle}>Map Style</Text>
          <View style={styles.mapStyleToggle}>
            <TouchableOpacity
              style={[styles.mapStyleOption, !isDark && styles.mapStyleOptionActive]}
              activeOpacity={0.7}
              onPress={() => { if (isDark) toggleTheme(); }}
            >
              <Sun size={16} color={!isDark ? "#0A0A14" : "#8A8A9A"} strokeWidth={2.2} />
              <Text style={[styles.mapStyleOptionText, !isDark && styles.mapStyleOptionTextActive]}>Light</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mapStyleOption, isDark && styles.mapStyleOptionActive]}
              activeOpacity={0.7}
              onPress={() => { if (!isDark) toggleTheme(); }}
            >
              <Moon size={16} color={isDark ? "#0A0A14" : "#8A8A9A"} strokeWidth={2.2} />
              <Text style={[styles.mapStyleOptionText, isDark && styles.mapStyleOptionTextActive]}>Dark</Text>
            </TouchableOpacity>
          </View>

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
      {hudIdle && !searchOpen && (
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

      {/* Hint shown while drive/drop-pin mode is active, prompting the driver to tap the map */}
      {showDropPinHint && (
        <Animated.View style={[styles.dropPinHint, { top: insets.top + 16, opacity: fadeIn }]} pointerEvents="none">
          <MapPin size={18} color="#FF6B35" fill="#FF6B35" />
          <Text style={styles.dropPinHintText}>Drop the pin anywhere</Text>
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   ACTION STACK — Drive / Convoy / Chat                 */}
      {/* ===================================================== */}
      {hudIdle && !searchOpen && (
        <Animated.View
          style={[styles.actionStack, { bottom: insets.bottom + 168, opacity: fadeIn }]}
        >
          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={[styles.driveBtn, showDropPinHint && styles.driveBtnActive]}
              onPress={toggleDrive}
              activeOpacity={0.8}
            >
              <Car size={26} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>{showDropPinHint ? "Tap Map" : "Drive"}</Text>
          </View>

          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={styles.stackBtn}
              onPress={() => router.push({ pathname: "/community", params: { tab: "convoy" } } as any)}
              activeOpacity={0.7}
            >
              <Users size={20} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.actionBtnLabel}>Convoy</Text>
          </View>

          <View style={styles.labeledBtn}>
            <TouchableOpacity
              style={styles.stackBtn}
              onPress={() => router.push("/messages" as any)}
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
              /* VISIBILITY OFF — compact banner with Visibility switch */
              <View style={[styles.onlineBanner, styles.onlineBannerOffline]}>
                <View style={styles.onlineBannerLeft}>
                  <View style={[styles.onlineBannerDot, { backgroundColor: "#6A6A7E" }]} />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={[styles.onlineBannerTitle, { color: "#C0C0CE" }]}>Visibility Off</Text>
                    <Text style={styles.onlineBannerSub}>
                      You're hidden from the map. Turn on visibility to be seen.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.visibilitySwitchTrack}
                  onPress={goOnline}
                  activeOpacity={0.85}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: false }}
                  accessibilityLabel="Turn visibility on"
                >
                  <View style={styles.visibilitySwitchKnob}>
                    <EyeIcon visible={false} color="#6A6A7E" size={13} />
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              /* VISIBILITY ON — glowing green banner (design spec) */
              <View style={styles.onlineBanner}>
                <View style={styles.onlineBannerLeft}>
                  <Animated.View
                    style={[
                      styles.onlineBannerDot,
                      { backgroundColor: "#22C55E", transform: [{ scale: onlinePulse }] },
                    ]}
                  />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={styles.onlineBannerTitle}>Visibility On</Text>
                    <Text style={styles.onlineBannerSub}>
                      {onlineCount > 0
                        ? `Your location is visible to others. ${onlineCount} driver${onlineCount !== 1 ? "s" : ""} on the map.`
                        : "Your location is visible to others.\nTap to change privacy settings."}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.visibilitySwitchTrack, styles.visibilitySwitchTrackOn]}
                  onPress={goOffline}
                  activeOpacity={0.85}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: true }}
                  accessibilityLabel="Turn visibility off"
                >
                  <View style={[styles.visibilitySwitchKnob, styles.visibilitySwitchKnobOn]}>
                    <EyeIcon visible={true} color="#0E7A3C" size={13} />
                  </View>
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
                  Level {selectedOnlineUser.level}
                  {userLocation
                    ? ` · ${fmtMeters(Math.round(haversineMeters(userLocation, selectedOnlineUser)))} away`
                    : " · Online now"}
                </Text>
              </View>
              <ChevronRight size={22} color="#8A8A9A" />
            </TouchableOpacity>
            <View style={styles.onlineUserCardActions}>
              <TouchableOpacity
                style={styles.onlineUserActionRow}
                onPress={() => {
                  const uid = selectedOnlineUser.user_id;
                  setSelectedOnlineUser(null);
                  router.push(`/user/${uid}` as any);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.onlineUserActionIcon}>
                  <User size={18} color="#38BDF8" strokeWidth={2.2} />
                </View>
                <Text style={styles.onlineUserActionLabel}>See Profile</Text>
                <ChevronRight size={20} color="#6B6B7D" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.onlineUserActionRow, askingMeetup && { opacity: 0.5 }]}
                onPress={() => handleAskMeetupFromMap(selectedOnlineUser.user_id, selectedOnlineUser.name)}
                disabled={askingMeetup}
                activeOpacity={0.75}
              >
                <View style={styles.onlineUserActionIcon}>
                  <Handshake size={18} color="#38BDF8" strokeWidth={2.2} />
                </View>
                <Text style={styles.onlineUserActionLabel}>
                  {askingMeetup ? "Sending..." : "Ask a Meetup"}
                </Text>
                <ChevronRight size={20} color="#6B6B7D" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.onlineUserActionRow, addingFriend && { opacity: 0.5 }]}
                onPress={() => handleAddFriendFromMap(selectedOnlineUser.user_id, selectedOnlineUser.name)}
                disabled={addingFriend}
                activeOpacity={0.75}
              >
                <View style={styles.onlineUserActionIcon}>
                  <UserPlus size={18} color="#38BDF8" strokeWidth={2.2} />
                </View>
                <Text style={styles.onlineUserActionLabel}>
                  {addingFriend ? "Sending..." : "Add Friend"}
                </Text>
                <ChevronRight size={20} color="#6B6B7D" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.onlineUserActionRow}
                onPress={() => {
                  const uid = selectedOnlineUser.user_id;
                  setSelectedOnlineUser(null);
                  router.push(`/messages/${uid}` as any);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.onlineUserActionIcon}>
                  <MessageCircle size={18} color="#38BDF8" strokeWidth={2.2} />
                </View>
                <Text style={styles.onlineUserActionLabel}>Message</Text>
                <ChevronRight size={20} color="#6B6B7D" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.onlineUserActionRow,
                  (invitingToParty || partyMemberIds.has(selectedOnlineUser.user_id)) && { opacity: 0.5 },
                ]}
                onPress={() => handleInviteToPartyFromMap(selectedOnlineUser.user_id, selectedOnlineUser.name)}
                disabled={invitingToParty || partyMemberIds.has(selectedOnlineUser.user_id)}
                activeOpacity={0.75}
              >
                <View style={styles.onlineUserActionIcon}>
                  <Crown size={18} color="#38BDF8" strokeWidth={2.2} />
                </View>
                <Text style={styles.onlineUserActionLabel}>
                  {invitingToParty
                    ? "Inviting..."
                    : partyMemberIds.has(selectedOnlineUser.user_id)
                    ? "Already in Convoy"
                    : "Invite to Convoy"}
                </Text>
                <ChevronRight size={20} color="#6B6B7D" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* --- Selected destination card (cafe or custom location) --- */}
      {selectedDestination && !routeInfo && !isRecording && !showTripSummary && (() => {
        const isCafe = selectedDestination.type === "cafe";
        const destName = isCafe
          ? (selectedDestination as { type: "cafe"; data: CafePOI }).data.name
          : (selectedDestination as { type: "location"; name?: string }).name ?? "Selected Location";
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
                  return (
                    <View style={[styles.categoryDot, { backgroundColor: CAT_COLORS[catData.category] }]} />
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
      {routeInfo && !isRecording && !showTripSummary && (
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
                : (selectedDestination as { type: "location"; name?: string } | undefined)?.name ?? "Selected Location";
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
        carId={activeCar?.id ?? null}
        originName="Current Location"
        destinationName={
          selectedDestination?.type === "cafe"
            ? selectedDestination.data.name
            : selectedDestination?.type === "location"
            ? selectedDestination.name ?? "Dropped Pin"
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
  // Nearby places layer (OSM + community)
  placesFilterBar: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 5,
    justifyContent: "center",
  },
  placesLoadingPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(20,20,28,0.9)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 5,
  },
  placesLoadingText: {
    color: "#EAEAEA",
    fontSize: 12,
    fontWeight: "600",
  },
  placesFab: {
    position: "absolute",
    right: 16,
    bottom: 140,
    zIndex: 5,
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
  // POI marker label column (icon chip + name + distance).
  // Fixed width: the native marker bitmap is sized at capture time, so an
  // auto-width wrap that grows when the name text lays out gets its icon
  // cropped. Deterministic bounds = full-size render every time.
  poiMarkerWrap: {
    alignItems: "center",
    width: 110,
  },
  // Constant outer box for the badge across normal (44) / selected (58) /
  // chosen (66) sizes so the marker bounds never change after capture.
  poiBadgeBox: {
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
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
    // Pulls the label back up toward the badge: the fixed 66px badge box
    // leaves 11px of empty space below a normal-size (44px) badge.
    marginTop: -4,
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
  // Car marker — outer box leaves headroom for the ±4px float animation so
  // the icon never translates outside the marker bounds (which would clip it).
  carMarkerBox: {
    width: 40,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  carMarker: {
    alignItems: "center",
    justifyContent: "center",
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
    width: 190,
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
  mapStyleToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 10,
    padding: 3,
    gap: 3,
    marginBottom: 14,
  },
  mapStyleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
  },
  mapStyleOptionActive: {
    backgroundColor: "#FFFFFF",
  },
  mapStyleOptionText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#8A8A9A",
  },
  mapStyleOptionTextActive: {
    color: "#0A0A14",
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
  //  ACTION STACK (Drive / Convoy / Chat)
  // ========================
  actionStack: {
    position: "absolute",
    right: 8,
    alignItems: "center",
    gap: 12,
    zIndex: 130,
  },
  driveBtn: {
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
  driveBtnActive: {
    backgroundColor: "#22C55E",
    shadowColor: "#22C55E",
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
  // --- Top-left profile pill ---
  drivingProfilePill: {
    position: "absolute",
    left: 12,
    zIndex: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(14, 14, 24, 0.9)",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  drivingProfileAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#FF6B35",
  },
  drivingProfileAvatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#FF6B35",
    backgroundColor: "#2A2A45",
    justifyContent: "center",
    alignItems: "center",
  },
  drivingProfileAvatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11,
  },
  drivingProfileLevel: {
    color: "#FF9F55",
    fontSize: 10,
    fontWeight: "800",
  },
  drivingProfileXp: {
    color: "#8A8A9A",
    fontSize: 9,
    fontWeight: "600",
  },
  // --- Turn-by-turn instruction card ---
  turnCard: {
    position: "absolute",
    left: 12,
    width: 168,
    zIndex: 155,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  turnCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  turnIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(255, 107, 53, 0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  turnTextCol: {
    flex: 1,
  },
  turnDistanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  turnDistanceText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  turnMetersUnit: {
    color: "#8A8A9A",
    fontSize: 10,
    fontWeight: "600",
  },
  turnInstructionText: {
    color: "#FF9F55",
    fontSize: 11,
    fontWeight: "700",
  },
  turnStreetText: {
    color: "#8A8A9A",
    fontSize: 9,
    fontWeight: "600",
  },
  turnProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginTop: 7,
    overflow: "hidden",
  },
  turnProgressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FF6B35",
  },
  turnBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  turnBottomText: {
    color: "#6A6A7E",
    fontSize: 9,
    fontWeight: "700",
  },
  // --- Speed limit + compass ---
  topRightCluster: {
    position: "absolute",
    right: 12,
    zIndex: 155,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  speedLimitSign: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#E53935",
    justifyContent: "center",
    alignItems: "center",
  },
  speedLimitNumber: {
    color: "#111111",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 15,
  },
  speedLimitUnit: {
    color: "#111111",
    fontSize: 6,
    fontWeight: "700",
  },
  compassBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(14, 14, 24, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  // --- Nearby POI card ---
  nearbyCard: {
    position: "absolute",
    right: 12,
    width: 106,
    zIndex: 150,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 7,
    gap: 5,
  },
  nearbyHeaderText: {
    color: "#6A6A7E",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nearbyIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  nearbyLabel: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  nearbyDist: {
    color: "#6A6A7E",
    fontSize: 8,
    fontWeight: "600",
  },
  nearbyChevronBtn: {
    alignSelf: "center",
    paddingTop: 1,
  },
  // --- Left column gamification stack ---
  achievementStack: {
    position: "absolute",
    left: 12,
    width: 114,
    zIndex: 150,
    gap: 6,
  },
  achievementCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 7,
  },
  achievementIconBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  achievementTextCol: {
    flex: 1,
  },
  achievementTitle: {
    color: "#8A8A9A",
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  achievementValue: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 1,
  },
  achievementProgressTrack: {
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginTop: 5,
    overflow: "hidden",
  },
  achievementProgressFill: {
    height: 2,
    borderRadius: 2,
    backgroundColor: "#22C55E",
  },
  achievementInlineText: {
    color: "#FACC15",
    fontSize: 11,
    fontWeight: "800",
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 6,
  },
  friendAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  friendAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  friendName: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  friendMeta: {
    color: "#8A8A9A",
    fontSize: 8,
    fontWeight: "600",
    marginTop: 1,
  },
  // --- Photo captured toast ---
  photoToastPill: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    zIndex: 200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 80,
    backgroundColor: "rgba(34, 197, 94, 0.95)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  photoToastText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  // --- Floating speedometer ---
  speedometerWrap: {
    position: "absolute",
    top: -66,
    right: 4,
    alignItems: "center",
  },
  speedometerRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderWidth: 3,
    borderColor: "#E53935",
    justifyContent: "center",
    alignItems: "center",
  },
  speedometerValue: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
    lineHeight: 28,
  },
  speedometerUnit: {
    color: "#6A6A7E",
    fontSize: 10,
    fontWeight: "700",
  },
  speedometerGearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  speedometerGearText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  pausedBadge: {
    marginTop: 6,
    backgroundColor: "#F59E0B",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pausedBadgeText: {
    color: "#141420",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  // --- Action row ---
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 12,
  },
  drivingActionBtn: {
    alignItems: "center",
    gap: 6,
  },
  actionBtnCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtnCircleBig: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: RECORD_RED,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: RECORD_RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  drivingActionBtnLabel: {
    color: "#8A8A9A",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  // --- Stats row ---
  drivingStatsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(14, 14, 24, 0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 12,
  },
  drivingStatCol: {
    flex: 1,
    alignItems: "center",
  },
  drivingStatLabel: {
    color: "#6A6A7E",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  drivingStatValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
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
  dropPinHint: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 16, 26, 0.94)",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255, 107, 53, 0.4)",
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  dropPinHintText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
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
  // Visibility on/off switch — replaces the old Go Online/Go Offline pill
  // with a single, self-explanatory iOS-style toggle.
  visibilitySwitchTrack: {
    flexDirection: "row",
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },
  visibilitySwitchTrackOn: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
    justifyContent: "flex-end",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  visibilitySwitchKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  visibilitySwitchKnobOn: {
    backgroundColor: "#FFFFFF",
  },
  // ─── Online player markers on map ────────────────────
  playerMarkerWrap: {
    alignItems: "center",
    width: 96,
  },
  // Box around the ring sized to contain the outer party ring and the
  // level/party badges — keeping them inside the marker bounds so the
  // native snapshot doesn't clip them.
  playerRingBox: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
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
  // Party members get a thicker, brighter ring so they stand out from
  // regular online players on the map.
  playerRingParty: {
    borderWidth: 3,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 12,
  },
  partyOuterRing: {
    position: "absolute",
    top: 2,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    opacity: 0.5,
  },
  partyBadge: {
    position: "absolute",
    top: 3,
    right: 20,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#0A0A0F",
  },
  playerAvatarImg: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  playerAvatarInitial: {
    fontSize: 13,
    fontWeight: "800",
    color: "#E8E8F0",
  },
  playerLevelBadge: {
    position: "absolute",
    top: 1,
    right: 1,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#12141C",
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  playerLevelBadgeText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  playerName: {
    marginTop: 0,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#E8E8F0",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    maxWidth: 92,
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
    borderColor: "rgba(56, 189, 248, 0.2)",
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
    gap: 10,
  },
  onlineUserActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.25)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  onlineUserActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(56, 189, 248, 0.14)",
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  onlineUserActionLabel: {
    flex: 1,
    fontSize: 15,
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
