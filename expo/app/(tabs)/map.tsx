/**
 * Driveverse — Map.
 *
 * The live screen: routing, GPS trip recording, the online-driver presence
 * layer, the OSM/community Places layer, and the events layer, all stacked
 * over one MapView.
 *
 * Rebuilt on the Phase 1 tokens (`constants/theme.ts`,
 * `components/CutCorner.tsx`, `components/MapGlyphs.tsx`) following the
 * pattern the Drive Hub set in Phase 2. MAP_SCREEN_REFERENCE.md records
 * every deviation and the self-critique; the short version of the rules
 * this file follows:
 *
 *   - No literal colours, sizes or spacings. Everything routes through the
 *     tokens, including opacity, via `alpha()`.
 *   - Numbers are JetBrains Mono; units are Inter beside them, never part
 *     of the mono readout.
 *   - Brand surfaces (sheets, cards, buttons, chips, markers) cut
 *     `topRight`. Utility surfaces (progress tracks, dividers, inputs)
 *     stay square.
 *   - Separation is hairlines and surface steps. Zero shadows, zero
 *     gradients, zero blur.
 *   - Red is the accent, not the theme. See the red budget in
 *     MAP_SCREEN_REFERENCE.md §3.
 *
 * Nothing about the routing, GPS or gesture behaviour changed in that
 * pass — the handlers, refs and effects below are the originals.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  TextInput,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import MapboxTileLayer from "@/components/MapboxTileLayer";
import { PlaceDetailSheet, SubmitPlaceFab, SubmitPlaceModal } from "@/components/PlacesLayer";
import { RankFrameRing } from "@/components/frames/AvatarFrame";
import { usePlaces } from "@/hooks/usePlaces";
import { useMapFilters } from "@/hooks/useMapFilters";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/constants/placesCategories";
import {
  boundsOf,
  clusterPlaceMarkers,
  type ClusterNode,
  type Region,
} from "@/lib/mapClustering";
import { allLayersVisible } from "@/lib/mapFilters";
import type { NormalizedPlace } from "@/lib/placesApi";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import {
  MapPin,
  X,
  Clock,
  Route,
  Square,
  Trophy,
  Users,
  UserPlus,
  Car,
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
  AlertTriangle,
  Wrench,
  Fuel,
  LifeBuoy,
} from "lucide-react-native";
import {
  CutCornerBadge,
  CutCornerButton,
  CutCornerSurface,
} from "@/components/CutCorner";
import {
  CHROME_ICON_STROKE,
  DestinationMark,
  DriverMark,
  HeadingChevron,
  MAP_GLYPHS,
  MAP_GLYPH_STROKE,
  PLACE_CATEGORY_GLYPHS,
  ProblemGlyph,
  VisibilityGlyph,
  type MapGlyphComponent,
} from "@/components/MapGlyphs";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  onRacingRed,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { useRouter } from "expo-router";
import * as ImagePickerExpo from "expo-image-picker";
import SaveRouteModal from "@/components/SaveRouteModal";
import ShareCardModal from "@/components/ShareCardModal";
import { encodePolyline, simplifyPath } from "@/lib/polyline";
import { calculateDriveXP } from "@/lib/tripStats";
import { rankForLevel } from "@/constants/ranks";
import { frameForLevel } from "@/constants/rankFrames";
import { useXP } from "@/hooks/useXPStore";
import { useOnlineUsers, OnlineUser, ProblemType } from "@/hooks/useOnlineUsers";
import { useParty } from "@/hooks/usePartyStore";
import { useEvents, DriveEvent } from "@/hooks/useEventsStore";
import { EventTypeIcon, eventTypeLabel } from "@/components/EventMeta";
import { useAuth } from "@/hooks/useAuthStore";
import { useActiveCar } from "@/hooks/useActiveCarStore";
import { useTheme } from "@/hooks/useThemeStore";
import { supabase } from "@/lib/supabase";
import { Alert } from "react-native";
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK, MAP_STYLE_LIGHT_PICK, MAP_STYLE_DARK_PICK } from "@/constants/mapStyles";
import { MAPBOX_ACCESS_TOKEN } from "@/constants/mapbox";
import { getDirectionsWithSteps } from "@/lib/mapboxApi";

const { width: SCREEN_WIDTH } = Dimensions.get("window");


/**
 * A POI marker on the map.
 *
 * The category ids are the shared taxonomy in
 * `constants/placesCategories.ts`, not a set of this screen's own. There
 * used to be two: `LandmarkCategory` here (cafe / restaurant / spbu /
 * shopping / carwash / charging / workshop, populated by seven Mapbox
 * Geocoding keyword searches per city across 24 cities — 168 requests on
 * every cold start, capped at 200 results nationwide) and `PlaceCategory`
 * in the Places layer (populated by Overpass, server-cached, with a
 * community submission flow, and unreachable in the shipping build).
 *
 * They are one taxonomy now, on the Overpass ids, and this layer is fed by
 * `usePlaces` — nine cached requests around the driver instead of 168
 * keyword searches across the country, and the community submissions land
 * on the same markers.
 *
 * `rating` and `types` are kept because the destination card reads them;
 * neither Overpass nor the community table supplies a rating today, so it
 * is always undefined and the card already handles that.
 */
interface CafePOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  vicinity?: string;
  types: string[];
  category: PlaceCategory;
  source?: "osm" | "user";
}

/** Street/area line for the destination card, from whatever OSM tags exist. */
function vicinityFromTags(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  return tags["addr:full"] ?? (street || undefined) ?? tags["addr:city"] ?? tags.operator;
}

function placeToPoi(place: NormalizedPlace): CafePOI {
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    vicinity: vicinityFromTags(place.tags),
    types: [],
    category: place.category,
    source: place.source,
  };
}

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

/**
 * Duration split into a mono value and an Inter unit, so a readout never
 * mixes letters into JetBrains Mono. `28 min`, `1:05 h:m`.
 */
function splitDuration(seconds: number): { value: string; unit: string } {
  const total = Math.max(0, Math.round(seconds));
  if (total < 3600) return { value: String(Math.round(total / 60)), unit: "min" };
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return { value: `${h}:${String(m).padStart(2, "0")}`, unit: "h:m" };
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

/**
 * Open-Meteo WMO weather code → icon.
 *
 * The six conditions used to carry six colours — a pastel sky blue, a
 * pastel slate, a butter yellow. That is five hues the palette has no room
 * for, spent on a decoration in a 16pt pill. Weather is supporting
 * information on this screen, so every condition now draws in
 * `textSecondary` and the shape alone carries the meaning.
 */
function WeatherGlyph({ code, size }: { code: number; size: number }) {
  const c = colors.textSecondary;
  const w = CHROME_ICON_STROKE;
  if (code >= 95) return <CloudLightning size={size} color={c} strokeWidth={w} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow size={size} color={c} strokeWidth={w} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain size={size} color={c} strokeWidth={w} />;
  if (code >= 45 && code <= 48) return <CloudFog size={size} color={c} strokeWidth={w} />;
  if (code >= 2) return <Cloud size={size} color={c} strokeWidth={w} />;
  return <Sun size={size} color={c} strokeWidth={w} />;
}

/**
 * Identity ring colours for other drivers on the map.
 *
 * This is the one place the screen is allowed more than the six palette
 * values (DESIGN_SYSTEM_AUDIT §3c): people in a convoy have to be
 * distinguishable from one another, and a name label alone does not do
 * that at a glance while driving. The audit's instruction was to re-pick
 * them "against voidBlack in a motorsport register (livery colours, not
 * pastels)" — so the old neon set (cyan / lilac / peach / pink / butter /
 * mint) is replaced by six racing liveries. None of them is red: red stays
 * the accent, and a driver marker is not an accent.
 */
const PLAYER_COLORS = [
  "#D9DCE1", // silver
  "#F2B705", // works gold
  "#3FA34D", // racing green
  "#2D7DD2", // works blue
  "#E8631B", // gulf orange
  "#A63A3A", // maroon
];
function playerColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

/**
 * Rounds a driver's bearing to a 15° step, or returns null when there is no
 * usable heading.
 *
 * Two reasons for the bucketing. A stationary phone reports a heading that
 * wanders by a few degrees on every fix, and a marker that re-renders on
 * every wander is a marker Android re-snapshots to a bitmap on every wander.
 * And a chevron on a 46pt marker cannot express finer than about 15°
 * anyway — the extra precision is invisible and costs a redraw.
 *
 * `expo-location` reports -1 when it has no course; presence payloads from
 * older clients may omit the field entirely.
 */
const HEADING_BUCKET_DEGREES = 15;
function headingBucket(heading: number | null | undefined): number | null {
  if (typeof heading !== "number" || !Number.isFinite(heading) || heading < 0) return null;
  return (Math.round((heading % 360) / HEADING_BUCKET_DEGREES) * HEADING_BUCKET_DEGREES) % 360;
}

/**
 * Problem-signal catalogue. Four kinds, each mapping to a different sort of
 * help — a tow, the emergency services, fuel, or "anyone at all". The label
 * is what the raiser picks; `alert` is the terse verb that lands on other
 * drivers' screens ("<name> broke down"). The glyph is a lucide icon here
 * (chrome), while the marker itself carries the single `ProblemGlyph`
 * warning triangle so category is one shape and never a hue-per-type.
 *
 * A problem signal is the one thing on the map allowed to spend the accent
 * on someone else's marker: a driver in trouble is exactly the "live, act on
 * this now" state red is reserved for (MAP_SCREEN_REFERENCE §3).
 */
const PROBLEM_TYPES: {
  key: ProblemType;
  label: string;
  sub: string;
  alert: string;
  Icon: typeof Wrench;
}[] = [
  { key: "breakdown", label: "Broke down", sub: "Mechanical fault — stopped", alert: "broke down", Icon: Wrench },
  { key: "accident", label: "Accident", sub: "Crash or collision", alert: "had an accident", Icon: AlertTriangle },
  { key: "fuel", label: "Out of fuel", sub: "Need a top-up to move", alert: "is out of fuel", Icon: Fuel },
  { key: "sos", label: "Need help", sub: "Urgent — send anyone near", alert: "needs help", Icon: LifeBuoy },
];

function problemMeta(type: ProblemType) {
  return PROBLEM_TYPES.find((p) => p.key === type) ?? PROBLEM_TYPES[0];
}

/** "3 min ago" style age for a raised signal. */
function problemAge(since: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

// NOTE: no speed-limit data source is wired up anywhere in this app (no Roads
// API, no OSM tags) — this is a fixed placeholder purely to match the driving
// HUD mockup visually. Do not treat it as a real regulatory speed limit.
const PLACEHOLDER_SPEED_LIMIT_KMH = 50;

// Labels and glyphs come from the shared taxonomy so this screen, the
// Filters panel, the Places callout and the submit flow can never disagree
// about what a category is called or what it looks like.
const CAT_LABELS = PLACE_CATEGORY_LABELS;

/**
 * Landmark category → glyph.
 *
 * This used to be seven pre-rendered neon PNG badges plus a seven-hue
 * `CAT_COLORS` map. Both are gone. The bitmaps baked their glow into the
 * asset, so they could not be restyled and forced a load-gating dance to
 * stop Android snapshotting a half-decoded image into the marker; and the
 * seven hues were seven values outside the palette doing the job a shape
 * should do. Now the category is the glyph and the state is the colour —
 * the same rule the Places layer follows.
 */
/**
 * Route line weights. Two polylines per route — a faint casing and a solid
 * core, both racingRed — matching `components/RouteLine.tsx`, which draws
 * the same trace on a trip card at `strokeWidth` 2. On the map the line
 * competes with tiles rather than a flat card, so it is one step heavier.
 */
/**
 * Vertical offsets for the floating HUD panels, measured down from the
 * safe-area inset. Each is a multiple of the 4pt spacing scale — the map
 * chrome cannot use the scale for its own positions the way a scrolling
 * layout can, because the panels overlap each other rather than stack.
 */
/** Below the driving-mode profile pill. */
const TURN_CARD_OFFSET = spacing.spacingXxxl + spacing.spacingSm; // 56
/** Below the speed-limit sign and compass. */
const NEARBY_CARD_OFFSET = spacing.spacingXxxl + spacing.spacingMd; // 60
/** Below the greeting card and the Signal button under it, so the
 *  landmark-loading pill never lands on either. */
const LANDMARK_STATUS_OFFSET = spacing.spacingXxxl * 3 + spacing.spacingXxxl / 2 + spacing.spacingLg; // 184
/** Below the turn card, which is the tallest panel in the left column. */
const ACHIEVEMENT_STACK_OFFSET = spacing.spacingXxxl * 3 + spacing.spacingXxxl / 2 + spacing.spacingLg; // 184
/** Clearance for the floating tab bar, matching the Drive Hub. */
const TAB_BAR_CLEARANCE = spacing.spacingXxxl * 2; // 96
/** Below the right-hand chrome column, which is four labelled buttons tall. */
const FILTERS_POPOVER_OFFSET = spacing.spacingXxxl * 3 + spacing.spacingXs; // 148
/** Cap on the scrolling toggle list inside the Filters popover, chosen so
 *  the popover still clears the bottom stack on a 390×844 screen. */
const FILTERS_LIST_MAX_HEIGHT = spacing.spacingXxxl * 7 + spacing.spacingXl; // 360
/** Clears the top chrome so the hint never lands on the greeting card or the
 *  Signal button under it. */
const DROP_PIN_HINT_OFFSET = spacing.spacingXxxl * 3 + spacing.spacingXxxl / 2 + spacing.spacingLg; // 184
/** Where the idle bottom stack (live feed, action stack) sits above the bar. */
const BOTTOM_STACK_OFFSET = spacing.spacingXxxl * 4; // 192

const ROUTE_CASING_WIDTH = 8;
const ROUTE_CORE_WIDTH = 4;

const CAT_GLYPHS: Record<PlaceCategory, MapGlyphComponent> = PLACE_CATEGORY_GLYPHS;

/**
 * The rank frame on a driver marker fills the same 42pt outer slot the
 * convoy and distress rings use, inside the 46pt `playerRingBox`. Keeping
 * all three on one diameter means the marker's bounds never change with
 * rank — which matters because the native marker snapshot is taken from
 * those bounds, and a taller marker would clip.
 */
const PLAYER_RANK_RING_SIZE = 42;

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

/**
 * A list row in a bottom sheet: icon, Inter label, chevron. A utility
 * surface — plain rectangle, hairline outline — so it does not compete
 * with the cut-corner sheet holding it.
 */
function ActionRow({
  label,
  icon,
  busy = false,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  /** Disables the row and dims it, for in-flight or already-done actions. */
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRowItem,
        busy && styles.actionRowItemBusy,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.actionRowIcon}>{icon}</View>
      <Text style={styles.actionRowLabel} numberOfLines={1}>{label}</Text>
      <ChevronRight size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
    </Pressable>
  );
}

/**
 * One toggle row in the Filters popover: category glyph, Inter label, and
 * a square tick box that fills racingRed when the layer is on.
 */
function FilterRow({
  label,
  checked,
  onToggle,
  children,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${label} layer`}
      style={({ pressed }) => [styles.filterRow, pressed && styles.pressed]}
      onPress={onToggle}
    >
      {children}
      <Text style={styles.filterLabel} numberOfLines={1}>{label}</Text>
      {/* The tick is `textPrimary`, not the accent. Every layer is on by
          default, so an accent-coloured tick meant nine red squares in one
          popover — which is the opposite of a sparingly-used accent. */}
      <View style={[styles.filterCheck, checked && styles.filterCheckOn]}>
        {checked && (
          <Check size={spacing.spacingMd} color={colors.voidBlack} strokeWidth={MAP_GLYPH_STROKE} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * A labelled icon button in the map's floating chrome (search, locate,
 * filters, event, clear). Square utility surface at `radius.sharp` — these
 * are not brand surfaces, so they do not take the corner cut; the cut is
 * reserved for the sheets, cards and primary actions.
 */
function MapChromeButton({
  label,
  accessibilityLabel,
  active = false,
  onPress,
  children,
}: {
  label: string;
  accessibilityLabel: string;
  active?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.labeledBtn}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionBtn,
          active && styles.actionBtnActive,
          pressed && styles.pressed,
        ]}
      >
        {children}
      </Pressable>
      <Text style={styles.actionBtnLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * One column of the driving-mode stats row: Rajdhani label, mono value,
 * Inter unit. Splitting the unit out of the readout is what keeps the five
 * columns aligned as the numbers change width.
 */
function DriveStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.drivingStatCol}>
      <Text style={styles.drivingStatLabel}>{label}</Text>
      <View style={styles.drivingStatValueRow}>
        <Text style={styles.drivingStatValue}>{value}</Text>
        {unit ? <Text style={styles.drivingStatUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/**
 * One row of the driving-mode "Nearby" card: category glyph, Inter label,
 * mono distance. Renders nothing when there is no such place in range, so
 * the card shrinks instead of showing an empty slot.
 */
function NearbyRow({
  glyph: Glyph,
  label,
  meters,
}: {
  glyph: MapGlyphComponent;
  label: string;
  meters?: number | null;
}) {
  if (meters == null) return null;
  return (
    <View style={styles.nearbyRow}>
      <View style={styles.nearbyIconBox}>
        <Glyph size={spacing.spacingMd} color={colors.textSecondary} />
      </View>
      <View style={styles.nearbyRowText}>
        <Text style={styles.nearbyLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.nearbyDist}>{fmtMeters(Math.round(meters))}</Text>
      </View>
    </View>
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const { isDark } = useTheme();

  // Map tile/style preference — intentionally separate from the app-wide theme so that
  // switching the map's Light/Dark style doesn't flip the rest of the app's UI theme.
  const [mapStyleDark, setMapStyleDark] = useState<boolean>(isDark);
  useEffect(() => {
    AsyncStorage.getItem("mapStyleDark").then((stored) => {
      if (stored === "true" || stored === "false") setMapStyleDark(stored === "true");
    }).catch(() => {});
  }, []);
  const setMapStyle = useCallback((dark: boolean) => {
    setMapStyleDark(dark);
    AsyncStorage.setItem("mapStyleDark", String(dark)).catch(() => {});
  }, []);

  // GPS state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [locating, setLocating] = useState(true);
  const [locError, setLocError] = useState<string | null>(null);

  // POI markers, derived from the shared Places source rather than held in
  // their own state — one fetch feeds the markers, the nearby cards, the
  // search results and the destination card.
  //
  // The nine OSM + community categories, via Overpass behind the
  // /places-nearby edge function (7-day server cache, ~1km buckets).
  const places = usePlaces();
  // The GPS watcher effect is mount-once and reads live state through refs
  // so it never restarts; the first-fix POI fetch needs the same treatment.
  // Assigned in an effect rather than during render — this effect is
  // declared above the GPS one, so it has already run by the time that
  // effect's async body reaches the fetch.
  const placesRef = useRef(places);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);
  const cafes = useMemo<CafePOI[]>(() => places.places.map(placeToPoi), [places.places]);
  const loadingCafes = places.loading;
  // The Places *mode* — the long-press-to-submit affordance and the submit
  // FAB. The markers themselves are no longer gated on it: they are the
  // map's POI layer now, always drawn, filtered by the Filters panel.
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
  // Id of the just-recorded drive once it has been saved to the profile.
  // Drives the Save button's "Saved" state and unlocks the Share button.
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);
  // Trip share-card sheet (only reachable after the drive is saved).
  const [showShareTrip, setShowShareTrip] = useState(false);
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
  // Rank-up celebration is a moment worth sharing — offered right where the
  // level-up lands, in the trip-summary card.
  const [showShareRank, setShowShareRank] = useState(false);

  // XP system
  const { level, totalXp, xpCurrentLevel, xpRequired, xpProgress, addXP } = useXP();

  // Online users system
  const { onlineUsers, isOnline: isUserOnline, goOnline, goOffline, myProblem, raiseProblem, clearProblem } = useOnlineUsers();
  const { user } = useAuth();
  const { activeCar } = useActiveCar();
  const { party, partyMemberIds, inviteFriend } = useParty();
  const [selectedOnlineUser, setSelectedOnlineUser] = useState<OnlineUser | null>(null);
  const [invitingToParty, setInvitingToParty] = useState(false);
  // The raise-a-signal chooser sheet, and a tick that re-renders the age
  // labels ("3 min ago") on active signals once a minute.
  const [problemChooserOpen, setProblemChooserOpen] = useState(false);
  // Opened from the body of the status card. See the sheet's own note for
  // why it explains the current audience rather than letting you pick one.
  const [visibilitySettingsOpen, setVisibilitySettingsOpen] = useState(false);
  const [, setProblemClock] = useState(0);
  const [addingFriend, setAddingFriend] = useState(false);
  const [askingMeetup, setAskingMeetup] = useState(false);

  // ─── HUD chrome state (GTA-style homepage) ───────────────
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [greetingExpanded, setGreetingExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Layer toggles, persisted to AsyncStorage: a driver who hides parking
  // and shopping every session should not have to redo it. All eleven
  // toggles are render-time only — every category's data is already
  // fetched, so flipping one never waits on the network.
  const { filters, toggleCategory, toggleEvents, toggleDrivers, resetFilters } = useMapFilters();
  const visibleCats = filters.categories;
  const showEventsLayer = filters.events;
  const showDriversLayer = filters.drivers;
  // The visible region, kept for the marker clusterer. Set from
  // onRegionChangeComplete, which the Places fetch already listens to.
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const weatherFetchedRef = useRef(false);

  // POI badges no longer load a bitmap — the category glyphs are drawn in
  // code (components/MapGlyphs.tsx), which lays out synchronously, so the
  // per-marker image load-gating that used to guard the Android marker
  // snapshot is not needed for them any more. `SettledMarker`'s grace
  // period still covers text layout and select/deselect size changes.

  // Load-gating is still needed for online player avatars (network images) so their
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

  // --- POI markers ---
  // The nationwide Mapbox-Geocoding crawl this replaced ran seven keyword
  // searches per city across 24 cities on every cold start — 168 requests
  // to fill a list capped at 200 markers for the whole country, which meant
  // a driver outside a listed city saw nothing nearby. `usePlaces` asks the
  // /places-nearby edge function for the nine categories around wherever
  // the driver actually is, served from a 7-day server-side cache and
  // merged with community submissions. See hooks/usePlaces.ts.

  // --- Fetch directions from user location to destination ---
  const fetchDirections = useCallback(async (origin: { latitude: number; longitude: number }, dest: { latitude: number; longitude: number }) => {
    if (!MAPBOX_ACCESS_TOKEN) {
      // Voice rule: name what happened and what fixes it. "Route
      // Unavailable" on its own told the driver nothing they could act on.
      Alert.alert(
        "Routing is switched off in this build",
        "This copy of Driveverse shipped without a Mapbox access token, so it can't calculate routes. Update to the latest version from the store — if the newest version does the same, send us the build number from Profile → About."
      );
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
        Alert.alert(
          "No road route to that point",
          "There's no drivable road connecting you to the pin — it may be offshore, inside a closed area, or on the far side of a water crossing. Drag the pin onto a road and tap Route again."
        );
      }
    } catch {
      setNavigating(false);
      Alert.alert(
        "Couldn't reach the routing service",
        "The request to Mapbox didn't get through, so there's no route yet. Check your connection and tap Route again."
      );
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
            setLocError(
              "Location is off for Driveverse, so the map can't follow you. Turn it on in your device Settings, then tap Retry."
            );
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

        // Load the POI layer around the first fix. Panning keeps it topped
        // up via onRegionChangeComplete; `usePlaces` skips buckets it has
        // already fetched, so neither path refetches ground already covered.
        placesRef.current.fetchForRegion(coords.latitude, coords.longitude);

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
          setLocError(
            "No GPS fix yet — the map is showing a default view. Move somewhere with a clearer view of the sky and tap Retry."
          );
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
        Alert.alert(
          "Camera access is off",
          "Driveverse can't open the camera to snap a drive photo. Turn the camera permission on in your device Settings, then tap RECORD again."
        );
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
      Alert.alert(
        "The camera didn't open",
        "Something else on the phone may be holding the camera. Close any other camera app and tap RECORD again."
      );
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
        "You're not in a convoy yet",
        "An invite has to point at a convoy, and you don't have one running. Start one, then invite drivers straight from their map marker.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Start a Convoy", onPress: () => router.push("/convoy" as any) },
        ]
      );
      return;
    }
    setInvitingToParty(true);
    try {
      const result = await inviteFriend(friendId);
      if (result.ok) {
        Alert.alert("Invite sent", `${friendName} was invited to join ${party.name}.`);
      } else {
        Alert.alert(
          "Invite not sent",
          result.message ??
            `${friendName} isn't on your friends list yet, and convoy invites only go to friends. Send a friend request first, then invite them.`
        );
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
        Alert.alert(
          "Meetup request not sent",
          `The message to ${friendName} didn't reach the server: ${error.message} Check your connection and tap Ask a Meetup again.`
        );
      } else {
        Alert.alert("Meetup request sent", `${friendName} will see it in their inbox.`);
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
          Alert.alert(
            "Already connected",
            `You and ${friendName} are already friends — no second request needed.`
          );
        } else {
          Alert.alert(
            "Friend request not sent",
            `The request to ${friendName} didn't reach the server: ${error.message} Check your connection and tap Add Friend again.`
          );
        }
      } else {
        Alert.alert("Friend request sent", `${friendName} will see it on their profile.`);
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

  /**
   * The POI markers actually handed to the MapView: filtered by the Filters
   * panel, then clustered for the visible region.
   *
   * Filtering happens here rather than in the fetch so a toggle is a
   * re-render and never a network round-trip — the panel's whole promise.
   */
  const poiNodes = useMemo<ClusterNode<CafePOI>[]>(() => {
    const selectedId =
      selectedDestination?.type === "cafe" ? selectedDestination.data.id : null;
    const visible = cafes.filter(
      (poi) => visibleCats[poi.category] && poi.id !== selectedId
    );
    const nodes = clusterPlaceMarkers(visible, mapRegion);
    // The chosen destination is never clustered. It is the one marker the
    // driver is actively looking at, and letting it vanish into a badge on
    // zoom-out would hide the thing they just picked.
    const selected = selectedId ? cafes.find((poi) => poi.id === selectedId) : null;
    if (selected) {
      nodes.push({
        kind: "leaf",
        id: selected.id,
        latitude: selected.lat,
        longitude: selected.lng,
        item: selected,
      });
    }
    return nodes;
  }, [cafes, visibleCats, mapRegion, selectedDestination]);

  const openVisibilitySettings = useCallback(() => {
    setVisibilitySettingsOpen(true);
  }, []);

  /** Drives whether the Filters popover offers a "Show all" action. */
  const allLayersOn = useMemo(() => allLayersVisible(filters), [filters]);

  /** Tapping a cluster zooms the camera to fit what is inside it. */
  const handleClusterPress = useCallback((node: ClusterNode<CafePOI>) => {
    if (node.kind !== "cluster") return;
    const bounds = boundsOf(node.items);
    if (!bounds) return;
    mapRef.current?.animateToRegion(bounds, 400);
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
      Alert.alert(
        "No GPS fix yet",
        "A route starts from where you are, and Driveverse doesn't have your position. Check location is on for the app, wait for the driver marker to appear, then tap Route again."
      );
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
      Alert.alert(
        "Events need an account",
        "An event is posted under your driver name, so it can't be created while signed out. Sign in from the banner above the tab bar, then tap Event again."
      );
      return;
    }
    router.push({ pathname: "/community", params: { tab: "events" } } as any);
  }, [user, router]);

  // --- Drive: toggles drop-pin mode only. Fully independent of online/offline
  // status, which is controlled separately by the online banner's Visibility
  // switch. ---
  const toggleDrive = useCallback(() => {
    if (!user) {
      Alert.alert(
        "Drives need an account",
        "A drive is recorded to your trip log and awards XP, so it can't start while signed out. Sign in from the banner above the tab bar, then tap DRIVE again."
      );
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

  /**
   * Region changes drive two things: the POI top-up and the clusterer.
   *
   * The fetch is not gated on the Places mode any more — POIs are the map's
   * own layer now, so they load wherever the driver is. `fetchForRegion`
   * de-dupes by ~1km bucket, so a pan inside one bucket costs nothing and
   * only crossing into new ground spends a request.
   */
  const handlePlacesRegionChange = useCallback(
    (region: Region) => {
      // Only the *span* is stored, and only when it actually changes.
      //
      // Cluster cells are absolute (`floor(lat / cellSize)`), not relative
      // to the camera, so panning at a fixed zoom cannot change which
      // markers group together — only zooming can. Storing the centre too
      // would re-render this screen and recompute the whole cluster set on
      // every frame of a pan, for an identical result.
      setMapRegion((prev) => {
        if (
          prev &&
          Math.abs(prev.latitudeDelta - region.latitudeDelta) < prev.latitudeDelta * 0.02
        ) {
          return prev;
        }
        return region;
      });
      placesRef.current.fetchForRegion(region.latitude, region.longitude);
    },
    []
  );

  // --- Long-press the map (while the Places layer is open) to drop a pin and submit a new place ---
  const handleMapLongPress = useCallback((event: any) => {
    if (!placesLayerOpen) return;
    if (!user) {
      Alert.alert(
        "Submitting a place needs an account",
        "Community places are credited to the driver who added them, so this can't be done while signed out. Sign in from the banner above the tab bar, then try again."
      );
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
    if (error) {
      Alert.alert(
        "Couldn't join the event",
        `${error} Tap Join Event again once you're back online.`
      );
    }
  }, [joinEvent]);

  const handleLeaveEvent = useCallback(async (ev: DriveEvent) => {
    setEventActionBusy(true);
    const { error } = await leaveEvent(ev.id);
    setEventActionBusy(false);
    if (error) {
      Alert.alert(
        "Couldn't leave the event",
        `${error} You're still listed as attending. Tap Leave again once you're back online.`
      );
    }
  }, [leaveEvent]);

  const handleCancelEvent = useCallback((ev: DriveEvent) => {
    Alert.alert("Cancel this event?", `"${ev.title}" will be removed from the map and everyone who joined will be told it's off. This can't be undone.`, [
      { text: "Keep Event", style: "cancel" },
      {
        text: "Cancel Event",
        style: "destructive",
        onPress: async () => {
          setEventActionBusy(true);
          const { error } = await cancelEvent(ev.id);
          setEventActionBusy(false);
          setSelectedEventId(null);
          if (error) {
            Alert.alert(
              "Event not cancelled",
              `${error} It's still live on the map. Try again once you're back online.`
            );
          }
        },
      },
    ]);
  }, [cancelEvent]);

  const handleRouteToEvent = useCallback((ev: DriveEvent) => {
    if (!userLocation) {
      Alert.alert(
        "No GPS fix yet",
        "A route starts from where you are, and Driveverse doesn't have your position. Check location is on for the app, wait for the driver marker to appear, then tap Route again."
      );
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
    setSavedRouteId(null);
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
    // Scaled off distance covered, time driven and the pace that implies,
    // not a flat per-trip number — see calculateDriveXP in lib/tripStats.
    const estimatedSec = estimatedDurationRef.current;
    const oldLevel = level;
    const faster = !!estimatedSec && estimatedSec > 0 && actualDurationSec < estimatedSec;
    setWasFaster(faster);
    const earned = calculateDriveXP({
      distanceMeters: tripDistance,
      durationSeconds: actualDurationSec,
      estimatedDurationSeconds: estimatedSec,
    });
    setXpEarned(earned);
    const newLvl = addXP(earned);
    setLeveledUp(newLvl > oldLevel);

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
        xp_earned: earned,
        was_faster_than_estimation: faster,
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
    if (tripDistance <= 0 || elapsedMs <= 0) return 0;
    const elapsedSec = elapsedMs / 1000;
    if (!routeInfo) {
      return calculateDriveXP({ distanceMeters: tripDistance, durationSeconds: elapsedSec });
    }
    const fractionDone = Math.min(1, tripDistance / routeInfo.distanceMeters);
    if (fractionDone <= 0) return 0;
    // Estimated time for the distance covered so far, not the full route —
    // so the ETA-beating bonus reflects pace, not how much trip is left.
    const estimatedSecSoFar = routeInfo.durationSeconds * fractionDone;
    return calculateDriveXP({
      distanceMeters: tripDistance,
      durationSeconds: elapsedSec,
      estimatedDurationSeconds: estimatedSecSoFar,
    });
  })();

  // Nearest POI per category — same haversine approach as `nearestPoi` below,
  // fixed to the 4 categories the driving HUD's "Nearby" card shows.
  const nearestOfCategory = (cat: PlaceCategory): (CafePOI & { dist: number }) | null => {
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
  const nearbyFuel = nearestOfCategory("gas_station");
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

  // ─── Drivers in distress ─────────────────────────────────
  // Every online user who has a problem signal up. Convoy-mates come first
  // (the request's headline case — signal the others in your convoy), then
  // by distance, so the alert banner always leads with the person you're
  // most likely able to reach. This is what makes a problem visible to
  // everyone on the map, in a convoy or not.
  const distressUsers = useMemo(() => {
    const flagged = onlineUsers.filter((u) => u.problem);
    return flagged.sort((a, b) => {
      const am = partyMemberIds.has(a.user_id) ? 0 : 1;
      const bm = partyMemberIds.has(b.user_id) ? 0 : 1;
      if (am !== bm) return am - bm;
      if (userLocation) {
        return haversineMeters(userLocation, a) - haversineMeters(userLocation, b);
      }
      return 0;
    });
  }, [onlineUsers, partyMemberIds, userLocation]);

  // Re-render the age labels ("3 min ago") on live signals once a minute,
  // but only while there's a signal on screen to keep fresh.
  const hasLiveSignals = distressUsers.length > 0 || !!myProblem;
  useEffect(() => {
    if (!hasLiveSignals) return;
    const id = setInterval(() => setProblemClock((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [hasLiveSignals]);

  // ─── Raise / clear my own signal ─────────────────────────
  const handleRaiseProblem = useCallback(
    async (type: ProblemType) => {
      if (!user) {
        Alert.alert(
          "Signalling a problem needs an account",
          "A problem signal is tied to your driver profile so others know who to help. Sign in from the banner above the tab bar, then raise it again."
        );
        return;
      }
      setProblemChooserOpen(false);
      await raiseProblem(type);
      const meta = problemMeta(type);
      Alert.alert(
        "Signal raised",
        `Every driver on the map can now see that you ${meta.alert}. Tap the red Signal button again to stand it down once you're sorted.`
      );
    },
    [user, raiseProblem]
  );

  const handleClearProblem = useCallback(async () => {
    await clearProblem();
  }, [clearProblem]);

  const handleSignalPress = useCallback(() => {
    if (myProblem) {
      handleClearProblem();
    } else {
      setProblemChooserOpen(true);
    }
  }, [myProblem, handleClearProblem]);

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
    // A tapped OSM/community place owns the bottom slot too — without this
    // the callout renders underneath the Drive/Convoy/Chat stack and its
    // close control sits behind a button.
    !selectedPlace &&
    // Same reason for the two sheets that open from the status card and
    // the Signal button — both own the bottom slot while they are up.
    !visibilitySettingsOpen &&
    !problemChooserOpen &&
    recordedPath.length === 0;

  const firstName = (user?.name ?? "Driver").split(" ")[0];
  const greeting = greetingForHour(new Date().getHours());

  /**
   * The event pinned to the top of the screen — the "nearby/upcoming"
   * highlight the reference design shows above the map, alongside the
   * in-place marker+card every other event gets.
   *
   * Was `events.find(is_live) ?? events[0]`, which took whatever the store
   * happened to list first. Relevance is now explicit and in priority
   * order: something happening now beats something happening later, and
   * between two events at the same stage the nearer one wins. A driver
   * three cities away from the soonest meet is not the audience for it.
   *
   * Hidden when the Events layer is filtered off — a pinned card for a
   * layer the driver has switched off is the toggle not working.
   */
  const featuredEvent = useMemo<DriveEvent | null>(() => {
    if (!showEventsLayer || events.length === 0) return null;
    const distanceTo = (ev: DriveEvent) =>
      userLocation
        ? haversineMeters(userLocation, { latitude: ev.latitude, longitude: ev.longitude })
        : 0;
    return [...events].sort((a, b) => {
      if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
      const startDelta = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      if (startDelta !== 0) return startDelta;
      return distanceTo(a) - distanceTo(b);
    })[0];
  }, [events, showEventsLayer, userLocation]);

  // Nearest landmark (fills the "trending" slot of the live feed)
  let nearestPoi: (CafePOI & { dist: number }) | null = null;
  if (userLocation && cafes.length > 0) {
    for (const c of cafes) {
      const d = haversineMeters(userLocation, { latitude: c.lat, longitude: c.lng });
      if (!nearestPoi || d < nearestPoi.dist) nearestPoi = { ...c, dist: d };
    }
  }

  // Live feed rows: live meets → upcoming events → nearest landmark.
  // `live` replaces the per-row `color` the rows used to carry: the one
  // thing worth colouring in the feed is whether a row is happening now.
  type FeedItem = {
    id: string;
    live: boolean;
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
    feedItems.push({
      id: `feed-ev-${ev.id}`,
      live: ev.is_live,
      title: ev.is_live ? `${ev.host_name} started a meet` : `New event by ${ev.host_name}`,
      sub: ev.title,
      time: ev.is_live ? fmtAgo(ev.starts_at) : fmtEventTime(ev.starts_at, false),
      count: ev.participant_count,
      icon: (
        <EventTypeIcon
          type={ev.event_type}
          size={spacing.spacingLg}
          color={ev.is_live ? colors.racingRed : colors.textSecondary}
        />
      ),
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
    const PoiGlyph = CAT_GLYPHS[poi.category];
    feedItems.push({
      id: `feed-poi-${poi.id}`,
      live: false,
      title: `${poi.name}`,
      sub: `Nearest ${CAT_LABELS[poi.category].toLowerCase()}`,
      time: fmtMeters(Math.round(poi.dist)),
      icon: <PoiGlyph size={spacing.spacingLg} color={colors.textSecondary} />,
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
        mapType={Platform.OS === "web" ? undefined : "none"}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        zoomEnabled
        scrollEnabled
        pitchEnabled
        rotateEnabled
        customMapStyle={
          showDropPinHint
            ? (mapStyleDark ? MAP_STYLE_DARK_PICK : MAP_STYLE_LIGHT_PICK)
            : (mapStyleDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT)
        }
        followsUserLocation={false}
        onPress={handleMapPress}
        onLongPress={handleMapLongPress}
        onRegionChangeComplete={handlePlacesRegionChange}
      >
        <MapboxTileLayer dark={mapStyleDark} />

        {/* POI markers — cut-corner badge + hand-drawn category glyph +
            name + distance, the anatomy the reference design shows. Always
            rendered, regardless of recording/online/party/chat state, so
            the map's POI layer never disappears mid-session.

            Category is carried by the glyph; colour only says whether the
            marker is idle, selected, or the confirmed destination
            (MAP_SCREEN_REFERENCE rule 10). Nine categories therefore cost
            the palette nothing.

            The list is clustered before it gets here: a city centre with
            every category on is several hundred markers, and on Android
            each one is a view snapshotted into a bitmap. See
            lib/mapClustering.ts for the two clustering modes and which
            reads better where. */}
        {poiNodes.map((node) => {
          if (node.kind === "cluster") {
            // A cluster keeps its category glyph while one is shared, so it
            // still reads as "twelve fuel stations here" rather than as an
            // anonymous count. Past the wide-zoom threshold the clusterer
            // merges categories and `groupKey` is null, and the badge
            // becomes the count alone.
            const ClusterGlyph = node.groupKey ? CAT_GLYPHS[node.groupKey as PlaceCategory] : null;
            return (
              <SettledMarker
                key={node.id}
                coordinate={{ latitude: node.latitude, longitude: node.longitude }}
                onPress={() => handleClusterPress(node)}
                settleKey={`cluster-${node.count}-${node.groupKey ?? ""}`}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.poiBadgeBox} collapsable={false}>
                  <CutCornerSurface
                    fill={colors.carbonSurface}
                    borderColor={colors.hairline}
                    borderWidth={borderWidth.hairline}
                    cutSize={spacing.spacingSm}
                    corners="topRight"
                    style={styles.clusterMarker}
                    contentStyle={styles.clusterMarkerContent}
                  >
                    {ClusterGlyph && (
                      <ClusterGlyph size={spacing.spacingMd} color={colors.textSecondary} />
                    )}
                    <Text style={styles.clusterCount}>{node.count}</Text>
                  </CutCornerSurface>
                </View>
              </SettledMarker>
            );
          }

          const poi = node.item;
          const isSelected = selectedDestination?.type === "cafe" && selectedDestination.data.id === poi.id;
          const Glyph = CAT_GLYPHS[poi.category];
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
              anchor={{ x: 0.5, y: 0.37 }}
            >
              <View style={styles.poiMarkerWrap} collapsable={false}>
                {/* Fixed-size box: the marker's outer bounds stay constant across
                    normal/selected/chosen states so the native snapshot never
                    clips a badge that grew after capture. */}
                <View style={styles.poiBadgeBox}>
                  <CutCornerSurface
                    fill={isSelected ? colors.racingRed : colors.carbonSurface}
                    /* A community submission keeps the faint accent outline
                       the Places layer gave it, so "a driver put this here"
                       survives the merge into one POI layer. One bit of
                       information, one colour step — not a hue. */
                    borderColor={
                      isSelected
                        ? colors.racingRed
                        : poi.source === "user"
                          ? alpha(colors.racingRed, 0.55)
                          : colors.hairline
                    }
                    borderWidth={isChosen ? borderWidth.emphasis : borderWidth.hairline}
                    cutSize={spacing.spacingSm}
                    corners="topRight"
                    style={[
                      styles.landmarkMarker,
                      isSelected && styles.landmarkMarkerSelected,
                      isChosen && styles.landmarkMarkerChosen,
                    ]}
                    contentStyle={styles.landmarkMarkerContent}
                  >
                    <Glyph
                      size={isChosen ? spacing.spacingXl : isSelected ? spacing.spacingLg : spacing.spacingMd}
                      color={isSelected ? onRacingRed : colors.textPrimary}
                    />
                  </CutCornerSurface>
                </View>
                <Text style={styles.poiMarkerName} numberOfLines={1}>{poi.name}</Text>
                {distLabel && <Text style={styles.poiMarkerDist}>{distLabel}</Text>}
              </View>
            </SettledMarker>
          );
        })}

        {/* Recorded path — the trace of where the driver actually went.
            One casing plus one core, both racingRed, matching the trip-card
            trace in components/RouteLine.tsx. The old three-layer neon glow
            is gone: glow is not in the system, and three stacked polylines
            per GPS fix is three times the geometry to redraw. */}
        {recordedPath.length > 1 && (
          <>
            <Polyline
              coordinates={recordedPath}
              strokeWidth={ROUTE_CASING_WIDTH}
              strokeColor={alpha(colors.racingRed, 0.22)}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={recordedPath}
              strokeWidth={ROUTE_CORE_WIDTH}
              strokeColor={colors.racingRed}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Route polyline.
            The route is one colour — racingRed — and progress is carried by
            opacity, exactly as the trip card's RouteLine draws a ghost path
            under a solid trace. What is left to drive is the faint casing;
            what has been driven is solid. That replaces the old
            yellow-behind / red-ahead pair, which spent a second hue on
            something a value step already says.

            The split index and the slicing below are unchanged. */}
        {routeInfo && (() => {
          const splitIdx = isRecording ? routeSplitIdx : null;
          if (splitIdx != null && splitIdx > 0 && splitIdx < routeInfo.coordinates.length - 1) {
            const traversed = routeInfo.coordinates.slice(0, splitIdx + 1);
            const remaining = routeInfo.coordinates.slice(splitIdx);
            return (
              <>
                {/* Remaining — the faint casing, drawn first so the solid
                    traversed line sits on top of it at the join. */}
                {remaining.length > 1 && (
                  <Polyline
                    coordinates={remaining}
                    strokeWidth={ROUTE_CASING_WIDTH}
                    strokeColor={alpha(colors.racingRed, 0.28)}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
                {/* Traversed — solid. */}
                {traversed.length > 1 && (
                  <Polyline
                    coordinates={traversed}
                    strokeWidth={ROUTE_CORE_WIDTH}
                    strokeColor={colors.racingRed}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
              </>
            );
          }
          // No split yet — the whole route as casing plus core.
          return (
            <>
              <Polyline
                coordinates={routeInfo.coordinates}
                strokeWidth={ROUTE_CASING_WIDTH}
                strokeColor={alpha(colors.racingRed, 0.28)}
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={routeInfo.coordinates}
                strokeWidth={ROUTE_CORE_WIDTH}
                strokeColor={colors.racingRed}
                lineCap="round"
                lineJoin="round"
              />
            </>
          );
        })()}

        {/* Destination marker (when navigating) — a target reticle rather
            than a map pin, which is what every map provider's default looks
            like. Anchored on its centre because a reticle marks a point. */}
        {selectedDestination && routeInfo && destCoords() && (
          <Marker
            coordinate={destCoords()!}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.destPin} collapsable={false}>
              <DestinationMark size={spacing.spacingXl + spacing.spacingXs} />
            </View>
          </Marker>
        )}

        {/* Custom location marker (tapped, no route yet) */}
        {selectedDestination && selectedDestination.type === "location" && !routeInfo && (
          <SettledMarker
            coordinate={{ latitude: selectedDestination.lat, longitude: selectedDestination.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            settleKey={`chosen-${locationChosen}`}
          >
            <View style={styles.customPin} collapsable={false}>
              <DestinationMark
                size={locationChosen ? spacing.spacingXxl : spacing.spacingXl}
                color={locationChosen ? colors.racingRed : colors.textPrimary}
              />
            </View>
          </SettledMarker>
        )}

        {/* Online driver markers. The ring carries the driver's livery colour
            (see PLAYER_COLORS); everything else — level badge, convoy badge,
            name plate — is palette. The party ring stays thicker rather than
            brighter, because a shadow-based "glow" is not in the system. */}
        {isUserOnline && showDriversLayer && onlineUsers.length > 0 && onlineUsers.map((onlineUser) => {
          const isPartyMate = partyMemberIds.has(onlineUser.user_id);
          // A raised problem takes the accent and overrides the livery/party
          // colour: distress has to win the marker outright, or it competes
          // with an identity hue it's more important than. Static red (not an
          // animated pulse) because Android snapshots the marker to a bitmap
          // and would freeze mid-animation — the `eventMarkerLiveRing` does
          // "live" the same static way.
          const problem = onlineUser.problem ?? null;
          const ringColor = problem
            ? colors.racingRed
            : isPartyMate && party
              ? party.color
              : playerColor(onlineUser.user_id);
          // Rank colour comes from `frameForLevel` — the same table the
          // Profile Frame system reads (constants/rankFrames.ts, generated
          // from constants/ranks.ts). There is deliberately no second
          // rank→colour mapping on this screen.
          const rankColor = frameForLevel(onlineUser.level).color;
          // Bearing of travel. Bucketed to 15° so a marker re-snapshots on
          // a real change of direction rather than on every GPS jitter —
          // each re-snapshot is an Android bitmap capture.
          const bearing = headingBucket(onlineUser.heading);
          return (
            <SettledMarker
              key={`online-${onlineUser.user_id}`}
              coordinate={{ latitude: onlineUser.latitude, longitude: onlineUser.longitude }}
              anchor={{ x: 0.5, y: 0.36 }}
              onPress={() => setSelectedOnlineUser(onlineUser)}
              settleKey={`${onlineUser.name}-${onlineUser.level}-${ringColor}-${isPartyMate}-${problem?.type ?? ""}-${onlineUser.avatar ?? ""}-${bearing ?? "still"}`}
              ready={!onlineUser.avatar || loadedAvatarIds.has(onlineUser.user_id)}
            >
              <View style={styles.playerMarkerWrap} collapsable={false}>
                {/* Ring box gives the badges room inside the marker bounds —
                    absolutely-positioned children with negative offsets get
                    clipped out of the native marker snapshot. */}
                <View style={styles.playerRingBox}>
                  {/* Outer slot precedence: distress → convoy → rank frame.
                      The first two are live operational state and have to
                      win; rank is cosmetic and yields. The inner `playerRing`
                      keeps carrying the livery colour either way, so adding
                      rank never costs the marker its identity hue.

                      Marker frames are always static — see `RankFrameRing`.
                      Android snapshots markers to a bitmap, so an animated
                      frame would freeze mid-lap rather than animate. */}
                  {problem ? (
                    <View style={styles.problemOuterRing} />
                  ) : isPartyMate ? (
                    <View style={[styles.partyOuterRing, { borderColor: ringColor }]} />
                  ) : (
                    <RankFrameRing
                      box={PLAYER_RANK_RING_SIZE}
                      level={onlineUser.level}
                      style={styles.playerRankRing}
                    />
                  )}
                  <View style={[
                    styles.playerRing,
                    { borderColor: ringColor },
                    (isPartyMate || problem) && styles.playerRingParty,
                  ]}>
                    {onlineUser.avatar ? (
                      <Image
                        source={{ uri: onlineUser.avatar }}
                        style={styles.playerAvatarImg}
                        fadeDuration={0}
                        onLoadEnd={() => handleAvatarLoaded(onlineUser.user_id)}
                      />
                    ) : (
                      /* No photo — a car in the driver's rank colour rather
                         than an initial. The reference design asks for a car
                         symbol on driver markers; where a driver has a photo
                         the photo is strictly more identifying, so the car is
                         the fallback rather than a replacement. */
                      <MAP_GLYPHS.driver size={spacing.spacingLg} color={rankColor} />
                    )}
                  </View>
                  {/* Direction of travel. The chevron sits at the top of a
                      wrapper the size of the ring well and the wrapper is
                      rotated, so the mark orbits the ring and points the way
                      the driver is going. Static, like everything else on a
                      marker — Android snapshots the view to a bitmap, so an
                      animated version would freeze rather than animate. */}
                  {bearing != null && (
                    <View
                      pointerEvents="none"
                      style={[styles.playerHeadingOrbit, { transform: [{ rotate: `${bearing}deg` }] }]}
                    >
                      <HeadingChevron size={spacing.spacingMd} color={rankColor} />
                    </View>
                  )}
                  <View style={[styles.playerLevelBadge, { borderColor: ringColor }]}>
                    <Text style={styles.playerLevelBadgeText}>{onlineUser.level}</Text>
                  </View>
                  {/* Distress wins the badge slot from the convoy mark: a
                      driver in trouble is more urgent than the fact they're
                      in your convoy, which the alert banner still spells out. */}
                  {problem ? (
                    <View style={styles.problemBadge}>
                      <ProblemGlyph size={spacing.spacingSm} color={onRacingRed} />
                    </View>
                  ) : isPartyMate ? (
                    <View style={[styles.partyBadge, { backgroundColor: ringColor }]}>
                      <Users size={spacing.spacingSm} color={colors.voidBlack} strokeWidth={MAP_GLYPH_STROKE} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.playerName} numberOfLines={1}>{onlineUser.name}</Text>
                {problem && (
                  <Text style={styles.playerProblemLabel} numberOfLines={1}>
                    {problemMeta(problem.type).label}
                  </Text>
                )}
              </View>
            </SettledMarker>
          );
        })}

        {/* Event markers — cut-corner badge + head-count + a mini card.
            A live event is the one thing on the events layer that gets the
            accent; scheduled events stay neutral so "live" means something
            at a glance. */}
        {!isRecording && showEventsLayer && events.map((ev) => {
          const isSelected = selectedEventId === ev.id;
          const timeLabel = fmtEventTime(ev.starts_at, ev.is_live);
          const accented = ev.is_live || isSelected;
          const markerFill = isSelected ? colors.racingRed : colors.carbonSurface;
          const markerBorder = accented ? colors.racingRed : colors.hairline;
          const glyphColor = isSelected ? onRacingRed : colors.textPrimary;
          return (
            <SettledMarker
              key={`event-${ev.id}`}
              coordinate={{ latitude: ev.latitude, longitude: ev.longitude }}
              anchor={{ x: 0.5, y: 0.22 }}
              onPress={() => setSelectedEventId(ev.id)}
              settleKey={`${isSelected}-${ev.is_live}-${ev.participant_count}-${ev.title}-${timeLabel}-${ev.location_name ?? ""}`}
            >
              <View style={styles.eventMarkerColumn} collapsable={false}>
                <View style={styles.eventMarkerWrap}>
                  {ev.is_live && (
                    <View
                      style={[
                        styles.eventMarkerLiveRing,
                        { borderColor: alpha(colors.racingRed, 0.45) },
                      ]}
                    />
                  )}
                  <CutCornerSurface
                    fill={markerFill}
                    borderColor={markerBorder}
                    borderWidth={borderWidth.hairline}
                    cutSize={spacing.spacingSm}
                    corners="topRight"
                    style={[styles.eventMarker, isSelected && styles.eventMarkerSelected]}
                    contentStyle={styles.eventMarkerContent}
                  >
                    <EventTypeIcon
                      type={ev.event_type}
                      size={isSelected ? spacing.spacingLg : spacing.spacingMd}
                      color={glyphColor}
                    />
                  </CutCornerSurface>
                  <View
                    style={[
                      styles.eventMarkerBadge,
                      { backgroundColor: accented ? colors.racingRed : colors.hairline },
                    ]}
                  >
                    <Text
                      style={[
                        styles.eventMarkerBadgeText,
                        { color: accented ? onRacingRed : colors.textPrimary },
                      ]}
                    >
                      {ev.participant_count}
                    </Text>
                  </View>
                </View>
                <View style={[styles.eventMiniCard, accented && styles.eventMiniCardLive]}>
                  <Text style={styles.eventMiniTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.eventMiniMeta} numberOfLines={1}>
                    {timeLabel}
                    {ev.location_name ? ` · ${ev.location_name}` : ""}
                  </Text>
                </View>
              </View>
            </SettledMarker>
          );
        })}

        {/* The driver's own marker — coded SVG, no bitmap asset */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading}
            flat
          >
            <View style={styles.carMarkerBox} collapsable={false}>
              <Animated.View style={[styles.carMarker, { transform: [{ translateY: carFloat }] }]}>
                <DriverMark />
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
      {/* The category chips are gone: choosing what to show is the Filters
          panel's job now, and it does it for all nine categories with real
          on/off state instead of one active selection. What is left of the
          Places *mode* is the thing the panel cannot do — adding a place. */}
      {placesLayerOpen && !isRecording && (
        <>
          {/* Yields the bottom-left slot to the place callout. */}
          {!selectedPlace && (
          <SubmitPlaceFab
            onPress={() => {
              if (!user) {
                Alert.alert(
                  "Submitting a place needs an account",
                  "Community places are credited to the driver who added them, so this can't be done while signed out. Sign in from the banner above the tab bar, then try again."
                );
                return;
              }
              setSubmitPlaceCoord(userLocation);
              setShowSubmitPlaceModal(true);
            }}
            style={[styles.placesFabSlot, { bottom: insets.bottom + BOTTOM_STACK_OFFSET }]}
          />
          )}
        </>
      )}

      <PlaceDetailSheet
        place={selectedPlace}
        onClose={() => setSelectedPlace(null)}
        bottomInset={insets.bottom + TAB_BAR_CLEARANCE}
        distanceMeters={
          selectedPlace && userLocation
            ? haversineMeters(userLocation, {
                latitude: selectedPlace.lat,
                longitude: selectedPlace.lng,
              })
            : null
        }
      />

      <SubmitPlaceModal
        visible={showSubmitPlaceModal}
        onClose={() => setShowSubmitPlaceModal(false)}
        coordinate={submitPlaceCoord}
        onSubmit={places.submitPlace}
      />

      {/* --- Locating --- */}
      {locating && (
        <View style={[styles.loadingOverlay, { paddingTop: insets.top + spacing.spacingXl }]} pointerEvents="none">
          <View style={styles.statusPill}>
            <ActivityIndicator size="small" color={colors.racingRed} />
            <Text style={styles.statusPillText}>Waiting for a GPS fix…</Text>
          </View>
        </View>
      )}

      {/* --- Location error banner.
              The message itself is written at the point of failure (see the
              GPS effect) and always names the fix; this banner just carries
              it, with the control that message tells the driver to press. --- */}
      {locError && (
        <View style={[styles.errorBanner, { top: insets.top + spacing.spacingLg }]}>
          <View style={styles.errorTextWrap}>
            <Text style={styles.errorTitle}>LOCATION UNAVAILABLE</Text>
            <Text style={styles.errorText}>{locError}</Text>
          </View>
          <CutCornerButton
            title="Retry"
            variant="outline"
            size="sm"
            corners="topRight"
            onPress={() => {
              setLocError(null);
              setLocating(true);
            }}
          />
        </View>
      )}

      {/* --- POI layer progress ---
              The copy no longer says "across Indonesia": the layer used to
              crawl a fixed list of 24 cities, and now loads whatever is
              around the driver, wherever that is. --- */}
      {loadingCafes && !locating && !isRecording && (
        <Animated.View style={[styles.cafeLoading, { top: insets.top + LANDMARK_STATUS_OFFSET, opacity: fadeIn }]}>
          <View style={styles.statusPill}>
            <ActivityIndicator size="small" color={colors.racingRed} />
            <Text style={styles.statusPillText}>Loading places near you…</Text>
          </View>
        </Animated.View>
      )}

      {/* --- POI layer failure.
              Only shown when nothing at all came back — one category
              failing out of nine leaves eight categories of markers on
              screen, which is not a state worth interrupting for. Names the
              control that fixes it, per the voice rule. --- */}
      {places.error && !loadingCafes && !locating && !isRecording && (
        <Animated.View style={[styles.cafeLoading, { top: insets.top + LANDMARK_STATUS_OFFSET, opacity: fadeIn }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading nearby places"
            onPress={() => {
              if (userLocation) places.retry(userLocation.latitude, userLocation.longitude);
            }}
            style={({ pressed }) => [styles.statusPill, pressed && styles.pressed]}
          >
            <Text style={styles.statusPillText}>
              {places.error} Tap to try this area again.
            </Text>
          </Pressable>
        </Animated.View>
      )}



      {/* ===================================================== */}
      {/*   RECORDING HUD — Live stats card                     */}
      {/* ===================================================== */}
      {isRecording && (
        <>
          {/* --- Top-left: profile pill (avatar, level, lifetime XP) --- */}
          <View style={[styles.drivingProfilePill, { top: insets.top + spacing.spacingMd }]} pointerEvents="none">
            {user?.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.drivingProfileAvatar} />
            ) : (
              <View style={styles.drivingProfileAvatarFallback}>
                <Text style={styles.avatarInitial}>{firstName[0]?.toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={styles.drivingProfileLevel}>LV. {level}</Text>
              <View style={styles.drivingProfileXpRow}>
                <Text style={styles.drivingProfileXp}>{fmtThousands(totalXp)}</Text>
                <Text style={styles.drivingProfileXpUnit}>xp</Text>
              </View>
            </View>
          </View>

          {/* --- Top-left: turn-by-turn instruction card --- */}
          {activeStep && (() => {
            const { Icon: TurnIcon, label } = maneuverMeta(activeStep.maneuver);
            const nearMetres = stepDistanceRemaining < 1000;
            return (
              <View style={[styles.turnCard, { top: insets.top + TURN_CARD_OFFSET }]}>
                <View style={styles.turnCardTopRow}>
                  <View style={styles.turnIconBox}>
                    <TurnIcon
                      size={spacing.spacingXl}
                      color={colors.textPrimary}
                      strokeWidth={MAP_GLYPH_STROKE}
                    />
                  </View>
                  <View style={styles.turnTextCol}>
                    <View style={styles.turnDistanceRow}>
                      <Text style={styles.turnDistanceText}>
                        {nearMetres ? Math.round(stepDistanceRemaining) : (stepDistanceRemaining / 1000).toFixed(1)}
                      </Text>
                      <Text style={styles.turnMetersUnit}>{nearMetres ? "m" : "km"}</Text>
                    </View>
                    <Text style={styles.turnInstructionText} numberOfLines={1}>{label}</Text>
                    {!!activeStep.street && (
                      <Text style={styles.turnStreetText} numberOfLines={1}>{activeStep.street}</Text>
                    )}
                  </View>
                </View>
                {/* Utility surface: a progress track is not a brand shape, so
                    it stays a plain rectangle. */}
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

          {/* --- Top-right: speed limit sign + compass ---
                 The sign keeps its white disc and red annulus on purpose: it
                 is a reproduction of a road sign, not a UI surface, and a
                 driver has to read it as one. See MAP_SCREEN_REFERENCE D-3. */}
          <View style={[styles.topRightCluster, { top: insets.top + spacing.spacingMd }]}>
            <View style={styles.speedLimitSign}>
              <Text style={styles.speedLimitNumber}>{PLACEHOLDER_SPEED_LIMIT_KMH}</Text>
              <Text style={styles.speedLimitUnit}>km/h</Text>
            </View>
            <TouchableOpacity
              style={styles.compassBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Point the map north"
              onPress={() => {
                if (userLocation) {
                  mapRef.current?.animateCamera({ center: userLocation, heading: 0 }, { duration: 500 });
                }
              }}
            >
              <Navigation
                size={spacing.spacingLg}
                color={colors.textPrimary}
                strokeWidth={CHROME_ICON_STROKE}
                style={{ transform: [{ rotate: `${-heading}deg` }] }}
              />
            </TouchableOpacity>
          </View>

          {/* --- Top-right: Nearby card ---
                 Six near-identical blocks collapsed onto one `NearbyRow`.
                 Distances are mono; the labels beside them are Inter. --- */}
          {(nearbyCafe || nearbyWorkshop || nearbyMeet || nearbyFuel) && (
          <View style={[styles.nearbyCard, { top: insets.top + NEARBY_CARD_OFFSET }]}>
            <Text style={styles.nearbyHeaderText}>NEARBY</Text>
            <NearbyRow glyph={MAP_GLYPHS.cafe} label="Coffee" meters={nearbyCafe?.dist} />
            <NearbyRow glyph={MAP_GLYPHS.workshop} label="Workshop" meters={nearbyWorkshop?.dist} />
            <NearbyRow glyph={MAP_GLYPHS.hangout} label="Car meet" meters={nearbyMeet?.dist} />
            <NearbyRow glyph={MAP_GLYPHS.fuel} label="Fuel" meters={nearbyFuel?.dist} />
            {nearbyExpanded && (
              <>
                {(() => {
                  const second = nearestOfCategory("restaurant");
                  return second && second.id !== nearbyCafe?.id ? (
                    <NearbyRow glyph={MAP_GLYPHS.food} label="Food" meters={second.dist} />
                  ) : null;
                })()}
                <NearbyRow
                  glyph={MAP_GLYPHS.charging}
                  label="Charging"
                  meters={nearestOfCategory("ev_charger")?.dist}
                />
              </>
            )}
            <TouchableOpacity
              style={styles.nearbyChevronBtn}
              onPress={() => setNearbyExpanded((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={nearbyExpanded ? "Show fewer nearby places" : "Show more nearby places"}
            >
              {nearbyExpanded ? (
                <ChevronUp size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              ) : (
                <ChevronDown size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              )}
            </TouchableOpacity>
          </View>
          )}

          {/* --- Left column: live achievements.
                  All three cards carried their own hue (green leaf, yellow
                  star, lilac mountain). They now share the neutral card and
                  are told apart by their glyph and their label. --- */}
          <View
            style={[styles.achievementStack, { top: insets.top + ACHIEVEMENT_STACK_OFFSET }]}
            pointerEvents="box-none"
          >
            <View style={styles.achievementCard}>
              <View style={styles.achievementIconBox}>
                <Leaf size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              </View>
              <View style={styles.achievementTextCol}>
                <Text style={styles.achievementTitle}>SMOOTH DRIVE</Text>
                <View style={styles.achievementValueRow}>
                  <Text style={styles.achievementValue}>{smoothScore}</Text>
                  <Text style={styles.achievementUnit}>score</Text>
                </View>
                <View style={styles.achievementProgressTrack}>
                  <View style={[styles.achievementProgressFill, { width: `${smoothScore}%` }]} />
                </View>
              </View>
            </View>

            {liveXpEarned > 0 && (
              <View style={styles.achievementCard}>
                <View style={styles.achievementIconBox}>
                  <Star size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                </View>
                <View style={styles.achievementTextCol}>
                  <Text style={styles.achievementTitle}>XP THIS DRIVE</Text>
                  <View style={styles.achievementValueRow}>
                    <Text style={styles.achievementValue}>+{liveXpEarned}</Text>
                  </View>
                </View>
              </View>
            )}

            {showScenicToast && (
              <View style={styles.achievementCard}>
                <View style={styles.achievementIconBox}>
                  <Mountain size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                </View>
                <View style={styles.achievementTextCol}>
                  <Text style={styles.achievementTitle}>SCENIC ROAD</Text>
                  <View style={styles.achievementValueRow}>
                    <Text style={styles.achievementValue}>+40</Text>
                    <Text style={styles.achievementUnit}>xp</Text>
                  </View>
                </View>
              </View>
            )}

            {nearestFriend && (
              <View style={styles.friendCard}>
                {nearestFriend.avatar ? (
                  <Image source={{ uri: nearestFriend.avatar }} style={styles.friendAvatar} />
                ) : (
                  <View
                    style={[
                      styles.friendAvatarFallback,
                      { borderColor: playerColor(nearestFriend.user_id) },
                    ]}
                  >
                    <Text style={styles.avatarInitial}>{nearestFriend.name[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.friendTextCol}>
                  <Text style={styles.friendName} numberOfLines={1}>{nearestFriend.name}</Text>
                  <Text style={styles.friendMeta}>
                    Lv. {nearestFriend.level} · {fmtMeters(Math.round(nearestFriend.dist))}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* --- Photo captured toast --- */}
          {photoToast && (
            <View style={[styles.photoToastPill, { top: insets.top + spacing.spacingMd }]} pointerEvents="none">
              <Camera size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
              <Text style={styles.photoToastText}>{photoToast}</Text>
            </View>
          )}

          {/* --- Bottom sheet: speedometer, actions, stats ---
                  The recording controls. END DRIVE is the one primary action
                  in this viewport, so it is the only red thing here: a
                  cut-corner primary slab. PAUSE/RESUME and RECORD are
                  outline controls beside it — same shape, no fill — which is
                  what stops three equally-loud buttons from competing while
                  the driver is moving.

                  Every handler below is unchanged: togglePause,
                  stopRecording and captureDrivePhoto are the same functions
                  wired to the same controls. --- */}
          <Animated.View
            style={[
              styles.recordingCard,
              {
                paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
                transform: [{ translateY: recSlide }],
              },
            ]}
          >
            {/* Floating speedometer, overlaps the map above the sheet */}
            <View style={styles.speedometerWrap}>
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.emphasis}
                cutSize={cut.lg}
                corners="topRight"
                style={styles.speedometerBox}
                contentStyle={styles.speedometerContent}
              >
                <Text style={styles.speedometerValue}>{currentSpeed.toFixed(0)}</Text>
                <Text style={styles.speedometerUnit}>km/h</Text>
                <View style={styles.speedometerGearRow}>
                  <View style={styles.speedometerGearDot} />
                  <Text style={styles.speedometerGearText}>D</Text>
                </View>
              </CutCornerSurface>
              {isPaused && (
                <CutCornerBadge
                  label="Paused"
                  color={colors.textSecondary}
                  textColor={colors.textPrimary}
                  corners="topRight"
                  style={styles.pausedBadge}
                />
              )}
            </View>

            {/* Action row: Pause / End Drive / Record */}
            <View style={styles.actionRow}>
              <CutCornerButton
                title={isPaused ? "Resume" : "Pause"}
                variant="ghost"
                size="sm"
                corners="topRight"
                onPress={togglePause}
                style={styles.drivingSecondaryBtn}
                icon={
                  isPaused ? (
                    <Play size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
                  ) : (
                    <Pause size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
                  )
                }
              />

              <CutCornerButton
                title="End Drive"
                variant="primary"
                size="md"
                corners="topRight"
                onPress={stopRecording}
                style={styles.drivingPrimaryBtn}
                icon={<Square size={spacing.spacingLg} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
              />

              <CutCornerButton
                title="Photo"
                variant="ghost"
                size="sm"
                corners="topRight"
                onPress={captureDrivePhoto}
                style={styles.drivingSecondaryBtn}
                icon={<Camera size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
              />
            </View>

            {/* Stats row — every value mono, every unit Inter beside it. */}
            <View style={styles.drivingStatsRow}>
              <DriveStat label="DIST" value={fmtMeters(tripDistance)} />
              <DriveStat label="TIME" value={fmtTimer(elapsedMs)} />
              <DriveStat label="AVG" value={liveAvgSpeed.toFixed(0)} unit="km/h" />
              <DriveStat label="MAX" value={tripTopSpeed.toFixed(0)} unit="km/h" />
              <DriveStat label="XP" value={`+${liveXpEarned}`} />
            </View>
          </Animated.View>
        </>
      )}

      {/* Trip Summary — the finished drive, in the same slab as a trip card
          on the Drive Hub. Distance is the hero readout (dataLg); time, avg
          speed and XP sit under it in dataSm with Inter units. */}
      {showTripSummary && (() => {
        const actualSec = elapsedMs / 1000;
        const avgSpeed = actualSec > 0 ? (tripDistance / 1000) / (actualSec / 3600) : 0;
        const deltaSeconds = routeInfo
          ? Math.abs(routeInfo.durationSeconds - elapsedMs / 1000)
          : 0;
        return (
        <View style={[styles.bottomSheetSlot, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.sheetBody}
          >
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitleFlex}>
                {wasFaster ? "AHEAD OF ESTIMATE" : "DRIVE RECORDED"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss trip summary"
                hitSlop={spacing.spacingSm}
                onPress={() => {
                  setRecordedPath([]);
                  setTripDistance(0);
                  setElapsedMs(0);
                  setXpEarned(null);
                  setSavedRouteId(null);
                  clearRoute();
                }}
              >
                <X size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              </Pressable>
            </View>

            <View style={styles.heroRow}>
              <View style={styles.heroValueRow}>
                <Text style={styles.heroValue}>{(tripDistance / 1000).toFixed(2)}</Text>
                <Text style={styles.heroUnit}>km</Text>
              </View>
              {xpEarned != null && (
                <CutCornerBadge
                  label={`+${xpEarned} XP`}
                  numeric
                  color={colors.hairline}
                  textColor={colors.textPrimary}
                  corners="topRight"
                />
              )}
            </View>

            <View style={styles.statsRow}>
              <DriveStat label="TIME" value={fmtTimer(elapsedMs)} unit="h:m:s" />
              <View style={styles.statDivider} />
              <DriveStat label="AVG" value={avgSpeed.toFixed(1)} unit="km/h" />
              <View style={styles.statDivider} />
              <DriveStat label="TOP" value={tripTopSpeed.toFixed(0)} unit="km/h" />
            </View>

            {xpEarned != null && routeInfo && (
              <View style={styles.comparisonRow}>
                <Text style={styles.comparisonLabel}>
                  {wasFaster ? "Faster than the estimate by" : "Slower than the estimate by"}
                </Text>
                <Text style={styles.comparisonValue}>{fmtDuration(Math.round(deltaSeconds))}</Text>
              </View>
            )}

            {leveledUp && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Level ${level} reached. Share your rank.`}
                onPress={() => setShowShareRank(true)}
                style={styles.levelUpBanner}
              >
                <Trophy size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
                <Text style={styles.levelUpText}>Level {level} reached</Text>
                <View style={styles.levelUpShare}>
                  <Share2 size={spacing.spacingLg - 2} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
                  <Text style={styles.levelUpShareText}>SHARE</Text>
                </View>
              </Pressable>
            )}

            {/* Utility surface: a progress track stays a plain rectangle. */}
            <View style={styles.levelBarContainer}>
              <View style={styles.levelBarHeader}>
                <Text style={styles.levelBarLabel}>LEVEL {level}</Text>
                <Text style={styles.levelBarXp}>{xpCurrentLevel} / {xpRequired} XP</Text>
              </View>
              <View style={styles.levelBarTrack}>
                <View style={[styles.levelBarFill, { width: `${Math.min(xpProgress * 100, 100)}%` }]} />
              </View>
            </View>

            {/* Save first, then Share. The route must be stored to the
                driver's profile before it can be shared, so the Save button
                flips to a locked-in "Saved" state on success and only then
                does the Share button come alive. */}
            <View style={styles.sheetActions}>
              <CutCornerButton
                title={savedRouteId ? "Saved" : "Save"}
                corners="topRight"
                disabled={savedRouteId != null}
                onPress={() => setShowSaveRoute(true)}
                style={styles.sheetPrimaryAction}
                accessibilityLabel={savedRouteId ? "Route saved to your profile" : "Save this route to your profile"}
                icon={
                  savedRouteId ? (
                    <Check size={spacing.spacingLg} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />
                  ) : (
                    <Bookmark size={spacing.spacingLg} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />
                  )
                }
              />
              <CutCornerButton
                title="Share"
                variant="ghost"
                corners="topRight"
                disabled={savedRouteId == null}
                onPress={() => setShowShareTrip(true)}
                style={styles.sheetPrimaryAction}
                accessibilityLabel={savedRouteId ? "Share this drive" : "Save the route before sharing"}
                icon={<Share2 size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
              />
            </View>
          </CutCornerSurface>
        </View>
        );
      })()}

      {/* ===================================================== */}
      {/*   TOP CHROME — greeting pill + featured event banner   */}
      {/* ===================================================== */}
      {!isRecording && !searchOpen && !placesLayerOpen && (
        <Animated.View
          style={[styles.topChrome, { top: insets.top + spacing.spacingMd, opacity: fadeIn }]}
          pointerEvents="box-none"
        >
          {/* Weather / greeting card.
              Rajdhani carries the greeting and the driver's name; Inter
              carries the supporting date line; the temperature is a
              measurement, so it is JetBrains Mono with the degree sign
              split out into Inter beside it. */}
          <View style={styles.greetingColumn}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={greetingExpanded ? "Hide today's date" : "Show today's date"}
              onPress={() => setGreetingExpanded((v) => !v)}
            >
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                style={styles.greetingCard}
                contentStyle={styles.greetingCardContent}
              >
                <View style={styles.greetingTempRow}>
                  <WeatherGlyph code={weather?.code ?? 0} size={spacing.spacingLg} />
                  {weather && (
                    <View style={styles.greetingTempValueRow}>
                      <Text style={styles.greetingTemp}>{weather.temp}</Text>
                      <Text style={styles.greetingTempUnit}>°C</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.greetingLabel}>{greeting}</Text>
                <View style={styles.greetingNameRow}>
                  <Text style={styles.greetingName} numberOfLines={1}>{firstName}</Text>
                  <ChevronDown
                    size={spacing.spacingMd}
                    color={colors.textSecondary}
                    strokeWidth={CHROME_ICON_STROKE}
                    style={greetingExpanded ? { transform: [{ rotate: "180deg" }] } : undefined}
                  />
                </View>
                {greetingExpanded && (
                  <Text style={styles.greetingDate}>
                    {fmtFeaturedDate(new Date().toISOString())}
                  </Text>
                )}
              </CutCornerSurface>
            </Pressable>

            {/* Signal a problem to every driver on the map. Neutral until my
                own signal is up, then it takes the accent border and label —
                the one live-state that earns red here — so standing it down
                is one obvious tap. Sits under the greeting card so it's the
                first thing reachable from the upper-left, not buried in the
                bottom-right action stack. */}
            <MapChromeButton
              label={myProblem ? "Clear" : "Signal"}
              accessibilityLabel={myProblem ? "Stand down your problem signal" : "Signal a problem to nearby drivers"}
              active={!!myProblem}
              onPress={handleSignalPress}
            >
              <ProblemGlyph
                size={spacing.spacingLg}
                color={myProblem ? colors.racingRed : colors.textPrimary}
              />
            </MapChromeButton>
          </View>

          {/* Featured event banner */}
          {featuredEvent && (() => {
            const fe = featuredEvent;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${fe.title} on the map`}
                style={styles.featuredCardHit}
                onPress={() => {
                  setSelectedEventId(fe.id);
                  mapRef.current?.animateCamera(
                    { center: { latitude: fe.latitude, longitude: fe.longitude }, zoom: 15, pitch: 40 },
                    { duration: 600 }
                  );
                }}
              >
                <CutCornerSurface
                  fill={colors.carbonSurface}
                  borderColor={fe.is_live ? colors.racingRed : colors.hairline}
                  borderWidth={borderWidth.hairline}
                  cutSize={cut.md}
                  corners="topRight"
                  contentStyle={styles.featuredCard}
                >
                  <View style={styles.featuredThumb}>
                    <EventTypeIcon
                      type={fe.event_type}
                      size={spacing.spacingLg}
                      color={fe.is_live ? colors.racingRed : colors.textPrimary}
                    />
                  </View>
                  <View style={styles.featuredInfo}>
                    <Text style={styles.featuredTitle} numberOfLines={1}>{fe.title}</Text>
                    <Text style={styles.featuredMeta} numberOfLines={1}>
                      {fmtFeaturedDate(fe.starts_at)}
                    </Text>
                    <View style={styles.featuredLocRow}>
                      <MapPin size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                      <Text style={styles.featuredLoc} numberOfLines={1}>
                        {fe.location_name || "Dropped on the map"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.featuredBadge}>
                    <Users size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                    <Text style={styles.featuredBadgeText}>{fe.participant_count}</Text>
                  </View>
                </CutCornerSurface>
              </Pressable>
            );
          })()}
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   RIGHT COLUMN — Search / My Location / Filters        */}
      {/* ===================================================== */}
      {!isRecording && !searchOpen && (
        <Animated.View style={[styles.rightButtons, { top: insets.top + spacing.spacingMd, opacity: fadeIn }]}>
          <MapChromeButton
            label="Search"
            active={searchOpen}
            accessibilityLabel="Search places"
            onPress={() => {
              if (searchOpen) {
                closeSearch();
              } else {
                setSearchOpen(true);
                setFiltersOpen(false);
              }
            }}
          >
            <Search
              size={spacing.spacingLg}
              color={colors.textPrimary}
              strokeWidth={CHROME_ICON_STROKE}
            />
          </MapChromeButton>

          <MapChromeButton
            label="My Location"
            accessibilityLabel="Centre the map on me"
            onPress={centerOnUser}
          >
            <LocateFixed
              size={spacing.spacingLg}
              color={colors.textPrimary}
              strokeWidth={CHROME_ICON_STROKE}
            />
          </MapChromeButton>

          <MapChromeButton
            label="Filters"
            active={filtersOpen}
            accessibilityLabel="Map layers and style"
            onPress={() => { setFiltersOpen((v) => !v); if (searchOpen) closeSearch(); }}
          >
            <SlidersHorizontal
              size={spacing.spacingLg}
              color={filtersOpen ? colors.racingRed : colors.textPrimary}
              strokeWidth={CHROME_ICON_STROKE}
            />
          </MapChromeButton>

          <MapChromeButton
            label="Event"
            accessibilityLabel="Create an event"
            onPress={openCreateEvent}
          >
            <MapPin
              size={spacing.spacingLg}
              color={colors.textPrimary}
              strokeWidth={CHROME_ICON_STROKE}
            />
          </MapChromeButton>

          {routeInfo && (
            <MapChromeButton
              label="Clear"
              accessibilityLabel="Clear the route"
              onPress={clearRoute}
            >
              <X
                size={spacing.spacingLg}
                color={colors.textPrimary}
                strokeWidth={CHROME_ICON_STROKE}
              />
            </MapChromeButton>
          )}
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   SEARCH OVERLAY                                       */}
      {/* ===================================================== */}
      {searchOpen && !isRecording && (
        <View style={[styles.searchOverlay, { top: insets.top + spacing.spacingMd }]}>
          {/* Utility surface: a text field is a plain rectangle, per the
              corner policy in constants/theme.ts. */}
          <View style={styles.searchBar}>
            <Search size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search landmarks"
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close search"
              onPress={closeSearch}
              hitSlop={spacing.spacingSm}
            >
              <X size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            </Pressable>
          </View>
          {searchResults.length > 0 ? (
            <View style={styles.searchResults}>
              {searchResults.map((res, i) => {
                const Glyph = CAT_GLYPHS[res.category];
                return (
                  <Pressable
                    key={res.id}
                    accessibilityRole="button"
                    style={[styles.searchResultRow, i > 0 && styles.searchResultRowBorder]}
                    onPress={() => {
                      closeSearch();
                      handleCafePress(res);
                    }}
                  >
                    <View style={styles.searchResultIcon}>
                      <Glyph size={spacing.spacingLg} color={colors.textPrimary} />
                    </View>
                    <View style={styles.searchResultText}>
                      <Text style={styles.searchResultName} numberOfLines={1}>{res.name}</Text>
                      {res.vicinity && (
                        <Text style={styles.searchResultVicinity} numberOfLines={1}>{res.vicinity}</Text>
                      )}
                    </View>
                    {res.dist < Number.MAX_SAFE_INTEGER && (
                      <Text style={styles.searchResultDist}>{fmtMeters(Math.round(res.dist))}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : searchQuery.trim().length > 0 ? (
            <View style={styles.searchResults}>
              <Text style={styles.searchEmpty}>
                No landmark here matches “{searchQuery.trim()}”. Landmarks load per city — pan the map to the
                area you mean, then search again.
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ===================================================== */}
      {/*   FILTERS POPOVER                                      */}
      {/* ===================================================== */}
      {filtersOpen && !isRecording && (
        <CutCornerSurface
          fill={colors.carbonSurface}
          borderColor={colors.hairline}
          borderWidth={borderWidth.hairline}
          cutSize={cut.md}
          corners="topRight"
          style={[styles.filtersPopover, { top: insets.top + FILTERS_POPOVER_OFFSET }]}
          contentStyle={styles.filtersContent}
        >
          <Text style={styles.filtersTitle}>MAP STYLE</Text>
          {/* Utility surface: a segmented control is a plain rectangle. */}
          <View style={styles.mapStyleToggle}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !mapStyleDark }}
              accessibilityLabel="Light map tiles"
              style={[styles.mapStyleOption, !mapStyleDark && styles.mapStyleOptionActive]}
              onPress={() => setMapStyle(false)}
            >
              <Sun
                size={spacing.spacingLg}
                color={!mapStyleDark ? colors.voidBlack : colors.textSecondary}
                strokeWidth={CHROME_ICON_STROKE}
              />
              <Text style={[styles.mapStyleOptionText, !mapStyleDark && styles.mapStyleOptionTextActive]}>
                LIGHT
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mapStyleDark }}
              accessibilityLabel="Dark map tiles"
              style={[styles.mapStyleOption, mapStyleDark && styles.mapStyleOptionActive]}
              onPress={() => setMapStyle(true)}
            >
              <Moon
                size={spacing.spacingLg}
                color={mapStyleDark ? colors.voidBlack : colors.textSecondary}
                strokeWidth={CHROME_ICON_STROKE}
              />
              <Text style={[styles.mapStyleOptionText, mapStyleDark && styles.mapStyleOptionTextActive]}>
                DARK
              </Text>
            </Pressable>
          </View>

          <View style={styles.filtersHeadingRow}>
            <Text style={styles.filtersTitle}>PLACES</Text>
            {/* Only offered once something is off, so the row is not a
                permanent control that does nothing most of the time. */}
            {!allLayersOn && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Turn every layer back on"
                onPress={resetFilters}
                hitSlop={spacing.spacingSm}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Text style={styles.filtersReset}>Show all</Text>
              </Pressable>
            )}
          </View>
          {/* Nine categories plus events plus drivers overflow a phone
              screen, so the list scrolls inside the popover rather than
              running off the bottom of it — a filter the driver cannot
              reach is not a filter.

              The coloured dot per row is gone — it repeated the seven POI
              hues the marker set dropped. The category glyph says which
              layer it is; the tick says whether it is on. */}
          <ScrollView
            style={styles.filtersScroll}
            contentContainerStyle={styles.filtersScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {PLACE_CATEGORIES.map((cat) => {
              const Glyph = CAT_GLYPHS[cat];
              return (
                <FilterRow
                  key={cat}
                  label={CAT_LABELS[cat]}
                  checked={visibleCats[cat]}
                  onToggle={() => toggleCategory(cat)}
                >
                  <Glyph size={spacing.spacingLg} color={colors.textSecondary} />
                </FilterRow>
              );
            })}

            <Text style={[styles.filtersTitle, styles.filtersTitleSpaced]}>PEOPLE & EVENTS</Text>
            <FilterRow label="Events" checked={showEventsLayer} onToggle={toggleEvents}>
              <MAP_GLYPHS.event size={spacing.spacingLg} color={colors.textSecondary} />
            </FilterRow>
            {/* Kept apart from the place categories because it is not the
                same kind of switch. Hiding other drivers is how you get a
                quiet map; it does not hide *you*, which is the visibility
                switch on the status card and has real consequences. The
                note below says so, because the two are easy to confuse. */}
            <FilterRow label="Other drivers" checked={showDriversLayer} onToggle={toggleDrivers}>
              <MAP_GLYPHS.driver size={spacing.spacingLg} color={colors.textSecondary} />
            </FilterRow>
            <Text style={styles.filtersNote}>
              This only clears your map. To hide yourself, use the visibility switch on
              the status card.
            </Text>
          </ScrollView>
        </CutCornerSurface>
      )}

      {/* ===================================================== */}
      {/*   LIVE FEED — bottom-left panel                        */}
      {/* ===================================================== */}
      {hudIdle && !searchOpen && !placesLayerOpen && (
        <Animated.View
          style={[styles.liveFeedSlot, { bottom: insets.bottom + BOTTOM_STACK_OFFSET, opacity: fadeIn }]}
        >
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.liveFeedContent}
          >
            <View style={styles.liveFeedHeader}>
              <View style={styles.liveFeedTitleRow}>
                <View style={styles.liveFeedDot} />
                <Text style={styles.liveFeedTitle}>LIVE FEED</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fit every event on the map"
                onPress={() => {
                  if (events.length > 0) {
                    mapRef.current?.fitToCoordinates(
                      events.map((e) => ({ latitude: e.latitude, longitude: e.longitude })),
                      { edgePadding: { top: 140, right: 100, bottom: 320, left: 60 }, animated: true }
                    );
                  }
                }}
                hitSlop={spacing.spacingSm}
              >
                <Text style={styles.liveFeedSeeAll}>See all</Text>
              </Pressable>
            </View>
            {feedItems.length === 0 ? (
              <Text style={styles.liveFeedEmpty}>
                Nothing is running near you yet. Tap Event on the right to put the first one on the map.
              </Text>
            ) : (
              feedItems.map((item, i) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  style={[styles.liveFeedRow, i > 0 && styles.liveFeedRowBorder]}
                  onPress={item.onPress}
                >
                  <View style={[styles.liveFeedIcon, item.live && styles.liveFeedIconLive]}>
                    {item.icon}
                  </View>
                  <View style={styles.liveFeedTextWrap}>
                    <Text style={styles.liveFeedRowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.liveFeedRowSub} numberOfLines={1}>{item.sub}</Text>
                    <Text style={styles.liveFeedRowTime}>{item.time}</Text>
                  </View>
                  {item.count != null && item.count > 0 && (
                    <View style={styles.liveFeedCount}>
                      <Users size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                      <Text style={styles.liveFeedCountText}>{item.count}</Text>
                    </View>
                  )}
                </Pressable>
              ))
            )}
          </CutCornerSurface>
        </Animated.View>
      )}

      {/* Hint shown while drive/drop-pin mode is active, prompting the driver to tap the map */}
      {showDropPinHint && (
        <Animated.View
          style={[styles.dropPinHint, { top: insets.top + DROP_PIN_HINT_OFFSET, opacity: fadeIn }]}
          pointerEvents="none"
        >
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.racingRed}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.dropPinHintContent}
          >
            <DestinationMark size={spacing.spacingXl} />
            <Text style={styles.dropPinHintText}>Tap anywhere to drop your destination</Text>
          </CutCornerSurface>
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   ACTION STACK — Drive / Convoy / Chat                 */}
      {/* ===================================================== */}
      {hudIdle && !searchOpen && (
        <Animated.View
          style={[styles.actionStack, { bottom: insets.bottom + BOTTOM_STACK_OFFSET, opacity: fadeIn }]}
        >
          {/* DRIVE is the screen's primary action, so it is the one solid
              red slab in the idle viewport. */}
          <View style={styles.labeledBtn}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: showDropPinHint }}
              accessibilityLabel={showDropPinHint ? "Cancel dropping a pin" : "Start a drive"}
              onPress={toggleDrive}
            >
              <CutCornerSurface
                fill={showDropPinHint ? colors.carbonSurface : colors.racingRed}
                borderColor={colors.racingRed}
                borderWidth={showDropPinHint ? borderWidth.emphasis : borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                style={styles.driveBtn}
                contentStyle={styles.driveBtnContent}
              >
                <Car
                  size={spacing.spacingXl}
                  color={showDropPinHint ? colors.racingRed : onRacingRed}
                  strokeWidth={MAP_GLYPH_STROKE}
                />
              </CutCornerSurface>
            </Pressable>
            <Text style={styles.actionBtnLabel}>{showDropPinHint ? "Tap Map" : "Drive"}</Text>
          </View>

          <MapChromeButton
            label="Convoy"
            accessibilityLabel="Open convoys"
            onPress={() => router.push({ pathname: "/community", params: { tab: "convoy" } } as any)}
          >
            <Users size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
          </MapChromeButton>

          <MapChromeButton
            label="Chat"
            accessibilityLabel="Open messages"
            onPress={() => router.push("/messages" as any)}
          >
            <MessageCircle size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
          </MapChromeButton>
        </Animated.View>
      )}

      {/* ===================================================== */}
      {/*   DISTRESS ALERT — a driver near you needs help        */}
      {/* ===================================================== */}
      {/* Kept off the driving HUD (`!isRecording`): while navigating, the
          marker carries distress and a top banner would fight the turn card.
          Idle, it's the loudest thing on screen — which for "someone needs
          help" is the point. Leads with convoy-mates, then the nearest. */}
      {!isRecording && !searchOpen && !placesLayerOpen && distressUsers.length > 0 && (() => {
        const top = distressUsers[0];
        const meta = problemMeta(top.problem!.type);
        const mate = partyMemberIds.has(top.user_id);
        const extra = distressUsers.length - 1;
        const dist = userLocation ? Math.round(haversineMeters(userLocation, top)) : null;
        return (
          <View style={[styles.distressBannerSlot, { top: insets.top + spacing.spacingMd }]} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${top.name} ${meta.alert}. Open their card.`}
              onPress={() => setSelectedOnlineUser(top)}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.racingRed}
                borderWidth={borderWidth.emphasis}
                cutSize={cut.md}
                corners="topRight"
                contentStyle={styles.distressBanner}
              >
                <View style={styles.distressBadge}>
                  <ProblemGlyph size={spacing.spacingLg} color={onRacingRed} />
                </View>
                <View style={styles.distressTextWrap}>
                  <Text style={styles.distressTitle} numberOfLines={1}>
                    {top.name} {meta.alert}
                    {extra > 0 ? ` +${extra} more` : ""}
                  </Text>
                  <Text style={styles.distressSub} numberOfLines={1}>
                    {mate ? "Convoy · " : ""}
                    {dist !== null ? `${fmtMeters(dist)} away · ` : ""}
                    {problemAge(top.problem!.since)}
                  </Text>
                </View>
                <ChevronRight size={spacing.spacingXl} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
              </CutCornerSurface>
            </Pressable>
          </View>
        );
      })()}

      {/* ===================================================== */}
      {/*   PROBLEM SIGNAL CHOOSER — pick what's wrong           */}
      {/* ===================================================== */}
      {problemChooserOpen && !isRecording && !selectedOnlineUser && !visibilitySettingsOpen && (
        <View style={[styles.bottomSheetSlot, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.sheetBody}
          >
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetGlyphBox}>
                <ProblemGlyph size={spacing.spacingLg} color={colors.racingRed} />
              </View>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>What's wrong?</Text>
                <Text style={styles.sheetBodyText}>
                  Every driver on the map — in your convoy or not — will see it until you stand it down.
                </Text>
              </View>
            </View>

            <View style={styles.driverSheetActions}>
              {PROBLEM_TYPES.map((p) => (
                <ActionRow
                  key={p.key}
                  label={p.label}
                  icon={<p.Icon size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
                  onPress={() => handleRaiseProblem(p.key)}
                />
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel raising a signal"
              style={styles.sheetDismiss}
              onPress={() => setProblemChooserOpen(false)}
            >
              <Text style={styles.sheetDismissText}>Cancel</Text>
            </Pressable>
          </CutCornerSurface>
        </View>
      )}

      {/* ===================================================== */}
      {/*   VISIBILITY SETTINGS SHEET                            */}
      {/* ===================================================== */}
      {/* Opened by tapping the body of the status card, as distinct from
          its switch, which goes offline outright.

          KNOWN GAP — there is no per-audience visibility in the app. Live
          position is broadcast on one Supabase Realtime Presence channel
          (`online-players`, hooks/useOnlineUsers.ts), which every signed-in
          client subscribes to; there is no server-side filter that could
          enforce "friends only", so offering that switch here would be a
          promise the transport cannot keep. This sheet therefore states
          exactly what is shared and with whom, and offers only the two
          controls that are real. Audience granularity is a follow-up and
          needs a presence-layer change, not a UI one. */}
      {visibilitySettingsOpen && !isRecording && !selectedOnlineUser && (
        <View style={[styles.bottomSheetSlot, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.sheetBody}
          >
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetGlyphBox}>
                <VisibilityGlyph
                  visible={isUserOnline}
                  size={spacing.spacingLg}
                  color={colors.textPrimary}
                />
              </View>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Who can see you</Text>
                <Text style={styles.sheetBodyText}>
                  {isUserOnline
                    ? "While you're online, every signed-in driver can see your position, name and level on the map. Your trips, garage and messages are not shared here."
                    : "You're offline, so no one can see your position. You also can't see other drivers."}
                </Text>
              </View>
            </View>

            <View style={styles.driverSheetActions}>
              <ActionRow
                label={isUserOnline ? "Go offline" : "Go online"}
                icon={
                  <VisibilityGlyph
                    visible={!isUserOnline}
                    size={spacing.spacingLg}
                    color={colors.textPrimary}
                  />
                }
                onPress={() => {
                  if (isUserOnline) goOffline();
                  else goOnline();
                  setVisibilitySettingsOpen(false);
                }}
              />
              <ActionRow
                label={showDriversLayer ? "Hide other drivers" : "Show other drivers"}
                icon={<MAP_GLYPHS.driver size={spacing.spacingLg} color={colors.textPrimary} />}
                onPress={toggleDrivers}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close visibility settings"
              style={styles.sheetDismiss}
              onPress={() => setVisibilitySettingsOpen(false)}
            >
              <Text style={styles.sheetDismissText}>Done</Text>
            </Pressable>
          </CutCornerSurface>
        </View>
      )}

      {/* ===================================================== */}
      {/*   ONLINE STATUS BANNER — compact, above the tab bar    */}
      {/* ===================================================== */}
      {/* Yields the bottom slot to the visibility sheet the card itself
          opens — otherwise the sheet lands on top of its own trigger. */}
      {!isRecording && !routeInfo && !selectedDestination && !selectedPlace
        && !visibilitySettingsOpen && !problemChooserOpen && recordedPath.length === 0 && (() => {
        const onlineCount = onlineUsers.length;
        return (
          <Animated.View
            style={[
              styles.onlineBannerSlot,
              {
                paddingBottom: insets.bottom + TAB_BAR_CLEARANCE - spacing.spacingLg,
                transform: [{ translateY: onlineSlide }],
              },
            ]}
            pointerEvents="box-none"
          >
            {!user ? (
              /* NOT SIGNED IN */
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                contentStyle={styles.onlineBanner}
              >
                <View style={styles.onlineBannerLeft}>
                  <View style={styles.onlineBannerDot} />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={styles.onlineBannerTitle}>YOU'RE SIGNED OUT</Text>
                    <Text style={styles.onlineBannerSub}>
                      You can't be seen and can't see others. Sign in to join the map.
                    </Text>
                  </View>
                </View>
                <CutCornerButton
                  title="Sign In"
                  size="sm"
                  corners="topRight"
                  onPress={() => router.push("/login" as any)}
                />
              </CutCornerSurface>
            ) : !isUserOnline ? (
              /* VISIBILITY OFF */
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                contentStyle={styles.onlineBanner}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open visibility settings"
                  onPress={openVisibilitySettings}
                  style={({ pressed }) => [styles.onlineBannerLeft, pressed && styles.pressed]}
                >
                  <View style={styles.onlineBannerDot} />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={styles.onlineBannerTitle}>YOU'RE OFFLINE</Text>
                    <Text style={styles.onlineBannerSub}>
                      Your location isn't visible to anyone. Tap for visibility settings.
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.visibilitySwitchTrack}
                  onPress={goOnline}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: false }}
                  accessibilityLabel="Go online"
                >
                  <View style={styles.visibilitySwitchKnob}>
                    <VisibilityGlyph visible={false} color={colors.voidBlack} size={spacing.spacingMd} />
                  </View>
                </Pressable>
              </CutCornerSurface>
            ) : (
              /* VISIBILITY ON.
                 The live state used to be a green banner with a green glow.
                 Green is not in the palette, and red is already spent on the
                 DRIVE button in this same viewport — so "on" is carried by
                 the switch filling with `textPrimary` and the count being
                 there at all, not by a second accent hue. */
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                contentStyle={styles.onlineBanner}
              >
                {/* Tapping the card body opens visibility settings;
                    the control on the right goes offline. Two different
                    actions, so they are two different hit areas — the
                    reference design's pattern, and the reason the body is a
                    Pressable rather than the whole card being one. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open visibility settings"
                  onPress={openVisibilitySettings}
                  style={({ pressed }) => [styles.onlineBannerLeft, pressed && styles.pressed]}
                >
                  <Animated.View
                    style={[
                      styles.onlineBannerDot,
                      styles.onlineBannerDotOn,
                      { transform: [{ scale: onlinePulse }] },
                    ]}
                  />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={styles.onlineBannerTitle}>YOU'RE ONLINE</Text>
                    {/* Says what is being shared and with whom, not just
                        that a switch is on — this card is the only place a
                        driver is told their position is public. */}
                    <Text style={styles.onlineBannerSub}>
                      Your location is visible to other drivers.
                      {onlineCount > 0
                        ? ` ${onlineCount} nearby right now.`
                        : " None nearby right now."}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.visibilitySwitchTrack, styles.visibilitySwitchTrackOn]}
                  onPress={goOffline}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: true }}
                  accessibilityLabel="Go offline"
                >
                  <View style={styles.visibilitySwitchKnob}>
                    <VisibilityGlyph visible color={colors.voidBlack} size={spacing.spacingMd} />
                  </View>
                </Pressable>
              </CutCornerSurface>
            )}
          </Animated.View>
        );
      })()}

      {/* --- Online driver card (tapped on the map) ---
              One sheet, five actions. The action rows were five identical
              blocks differing only in icon, label and handler, so they now
              come from one `ActionRow`. The sky-blue they all carried is
              gone: these are neutral list rows, not accents. --- */}
      {selectedOnlineUser && !isRecording && (
        <View style={[styles.bottomSheetSlot, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.sheetBody}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${selectedOnlineUser.name}'s profile`}
              style={styles.driverSheetHeader}
              onPress={() => {
                const uid = selectedOnlineUser.user_id;
                setSelectedOnlineUser(null);
                router.push(`/user/${uid}` as any);
              }}
            >
              <View
                style={[
                  styles.driverSheetAvatar,
                  { borderColor: playerColor(selectedOnlineUser.user_id) },
                ]}
              >
                {selectedOnlineUser.avatar ? (
                  <Image source={{ uri: selectedOnlineUser.avatar }} style={styles.driverSheetAvatarImg} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {(selectedOnlineUser.name?.[0] ?? "D").toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.driverSheetText}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {selectedOnlineUser.name}
                </Text>
                <View style={styles.driverSheetMetaRow}>
                  <Text style={styles.driverSheetMeta}>LV. {selectedOnlineUser.level}</Text>
                  {userLocation ? (
                    <>
                      <Text style={styles.driverSheetMetaSep}>·</Text>
                      <Text style={styles.driverSheetMeta}>
                        {fmtMeters(Math.round(haversineMeters(userLocation, selectedOnlineUser)))}
                      </Text>
                      <Text style={styles.driverSheetMetaUnit}>away</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.driverSheetMetaSep}>·</Text>
                      <Text style={styles.driverSheetMetaUnit}>online now</Text>
                    </>
                  )}
                </View>
              </View>
              <ChevronRight size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            </Pressable>

            {/* Distress notice — leads the card when this driver has a signal
                up, so "they need help, here's what and how long" is read
                before any of the routine social actions below it. */}
            {(() => {
              const problem = selectedOnlineUser.problem;
              if (!problem) return null;
              const meta = problemMeta(problem.type);
              return (
                <View style={styles.driverDistressNotice}>
                  <View style={styles.distressBadge}>
                    <ProblemGlyph size={spacing.spacingLg} color={onRacingRed} />
                  </View>
                  <View style={styles.distressTextWrap}>
                    <Text style={styles.driverDistressTitle} numberOfLines={1}>{meta.label}</Text>
                    <Text style={styles.distressSub} numberOfLines={1}>
                      {meta.sub} · {problemAge(problem.since)}
                    </Text>
                  </View>
                </View>
              );
            })()}

            <View style={styles.driverSheetActions}>
              <ActionRow
                label="See profile"
                icon={<User size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
                onPress={() => {
                  const uid = selectedOnlineUser.user_id;
                  setSelectedOnlineUser(null);
                  router.push(`/user/${uid}` as any);
                }}
              />
              <ActionRow
                label={askingMeetup ? "Sending…" : "Ask a meetup"}
                busy={askingMeetup}
                icon={<Handshake size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
                onPress={() => handleAskMeetupFromMap(selectedOnlineUser.user_id, selectedOnlineUser.name)}
              />
              <ActionRow
                label={addingFriend ? "Sending…" : "Add friend"}
                busy={addingFriend}
                icon={<UserPlus size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
                onPress={() => handleAddFriendFromMap(selectedOnlineUser.user_id, selectedOnlineUser.name)}
              />
              <ActionRow
                label="Message"
                icon={<MessageCircle size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
                onPress={() => {
                  const uid = selectedOnlineUser.user_id;
                  setSelectedOnlineUser(null);
                  router.push(`/messages/${uid}` as any);
                }}
              />
              <ActionRow
                label={
                  invitingToParty
                    ? "Inviting…"
                    : partyMemberIds.has(selectedOnlineUser.user_id)
                      ? "Already in your convoy"
                      : "Invite to convoy"
                }
                busy={invitingToParty || partyMemberIds.has(selectedOnlineUser.user_id)}
                icon={<Crown size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
                onPress={() => handleInviteToPartyFromMap(selectedOnlineUser.user_id, selectedOnlineUser.name)}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close driver card"
              style={styles.sheetDismiss}
              onPress={() => setSelectedOnlineUser(null)}
            >
              <Text style={styles.sheetDismissText}>Close</Text>
            </Pressable>
          </CutCornerSurface>
        </View>
      )}

      {/* --- Selected destination callout (landmark or dropped pin) ---
              Rajdhani for the place name, Inter for the address line,
              JetBrains Mono for the coordinates and the distance. --- */}
      {selectedDestination && !routeInfo && !isRecording && !showTripSummary && (() => {
        const isCafe = selectedDestination.type === "cafe";
        const cafeData = isCafe
          ? (selectedDestination as { type: "cafe"; data: CafePOI }).data
          : null;
        const pin = !isCafe
          ? (selectedDestination as { type: "location"; lat: number; lng: number; name?: string })
          : null;
        const destName = cafeData ? cafeData.name : pin?.name ?? "Dropped pin";
        const destVicinity = cafeData?.vicinity;
        const destRating = cafeData?.rating;
        const lat = cafeData ? cafeData.lat : pin!.lat;
        const lng = cafeData ? cafeData.lng : pin!.lng;
        const DestGlyph = cafeData ? CAT_GLYPHS[cafeData.category] : null;
        const distMeters = userLocation
          ? haversineMeters(userLocation, { latitude: lat, longitude: lng })
          : null;
        return (
        <View style={[styles.bottomSheetSlot, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.sheetBody}
          >
            <View style={styles.sheetHeaderRow}>
              {DestGlyph ? (
                <View style={styles.sheetGlyphBox}>
                  <DestGlyph size={spacing.spacingLg} color={colors.textPrimary} />
                </View>
              ) : null}
              <Text style={styles.sheetTitleFlex} numberOfLines={2}>{destName}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close place details"
                hitSlop={spacing.spacingSm}
                onPress={() => { setSelectedDestination(null); setLocationChosen(false); }}
              >
                <X size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              </Pressable>
            </View>

            {destVicinity ? (
              <Text style={styles.sheetBodyText} numberOfLines={2}>{destVicinity}</Text>
            ) : null}

            <View style={styles.sheetReadouts}>
              {distMeters != null ? (
                <View style={styles.sheetReadout}>
                  <Text style={styles.sheetReadoutLabel}>AWAY</Text>
                  <Text style={styles.sheetReadoutValue}>{fmtMeters(Math.round(distMeters))}</Text>
                </View>
              ) : null}
              <View style={styles.sheetReadout}>
                <Text style={styles.sheetReadoutLabel}>COORDS</Text>
                <Text style={styles.sheetReadoutValue}>
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </Text>
              </View>
              {destRating ? (
                <View style={styles.sheetReadout}>
                  <Text style={styles.sheetReadoutLabel}>RATING</Text>
                  <Text style={styles.sheetReadoutValue}>{destRating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>

            <CutCornerButton
              title="Route Here"
              corners="topRight"
              onPress={handleNavigate}
              icon={<Route size={spacing.spacingLg} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
            />
          </CutCornerSurface>
        </View>
        );
      })()}

      {/* --- Navigation route card (distance + ETA) — hidden while recording --- */}
      {routeInfo && !isRecording && !showTripSummary && (
        <Animated.View
          style={[
            styles.bottomSheetSlot,
            { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, transform: [{ translateY: cardSlide }] },
          ]}
        >
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.sheetBody}
          >
            {loadingRoute && (
              <View style={styles.routeLoader}>
                <ActivityIndicator size="small" color={colors.racingRed} />
                <Text style={styles.routeLoaderText}>Asking Mapbox for a road route…</Text>
              </View>
            )}

            {!loadingRoute && (
              <>
                <View style={styles.sheetHeaderRow}>
                  <Text style={styles.sheetTitleFlex}>ROUTE READY</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear the route"
                    hitSlop={spacing.spacingSm}
                    onPress={clearRoute}
                  >
                    <X size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                  </Pressable>
                </View>

                <View style={styles.heroRow}>
                  <View style={styles.heroValueRow}>
                    <Text style={styles.heroValue}>
                      {(routeInfo.distanceMeters / 1000).toFixed(1)}
                    </Text>
                    <Text style={styles.heroUnit}>km</Text>
                  </View>
                  <View style={styles.etaBlock}>
                    <Text style={styles.sheetReadoutLabel}>ETA</Text>
                    {(() => {
                      const eta = splitDuration(routeInfo.durationSeconds);
                      return (
                        <View style={styles.heroValueRow}>
                          <Text style={styles.sheetReadoutValue}>{eta.value}</Text>
                          <Text style={styles.heroUnit}>{eta.unit}</Text>
                        </View>
                      );
                    })()}
                  </View>
                </View>

                {(() => {
                  const destName = selectedDestination?.type === "cafe"
                    ? (selectedDestination as { type: "cafe"; data: CafePOI }).data.name
                    : (selectedDestination as { type: "location"; name?: string } | undefined)?.name ?? "Dropped pin";
                  return selectedDestination ? (
                    <View style={styles.routeDest}>
                      <Clock size={spacing.spacingMd} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                      <Text style={styles.routeDestText} numberOfLines={1}>Heading to {destName}</Text>
                    </View>
                  ) : null;
                })()}

                {/* Start the trip. The one primary action in this viewport,
                    and the control the whole recording flow hangs off —
                    `startRecording` is unchanged. */}
                {!isRecording && (
                  <Animated.View style={{ transform: [{ scale: recPulse }] }}>
                    <CutCornerButton
                      title="Start Navigation"
                      size="lg"
                      corners="topRight"
                      onPress={startRecording}
                    />
                  </Animated.View>
                )}
              </>
            )}
          </CutCornerSurface>
        </Animated.View>
      )}

      {/* --- Selected event card ---
              Rajdhani for the title, Inter for the description, mono for
              the head-count. The event-type hue is gone: the type is
              already spelled out in the badge next to the glyph. --- */}
      {selectedEvent && !isRecording && (() => {
        const ev = selectedEvent;
        const isFull =
          ev.max_participants > 0 && ev.participant_count >= ev.max_participants && !ev.is_joined;
        return (
          <View style={[styles.bottomSheetSlot, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={ev.is_live ? colors.racingRed : colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.md}
              corners="topRight"
              contentStyle={styles.sheetBody}
            >
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetGlyphBox}>
                  <EventTypeIcon
                    type={ev.event_type}
                    size={spacing.spacingLg}
                    color={ev.is_live ? colors.racingRed : colors.textPrimary}
                  />
                </View>
                <View style={styles.sheetHeaderText}>
                  <Text style={styles.sheetTitle} numberOfLines={2}>{ev.title}</Text>
                  <View style={styles.eventCardMetaRow}>
                    <CutCornerBadge
                      label={eventTypeLabel(ev.event_type)}
                      color={colors.hairline}
                      textColor={colors.textSecondary}
                      corners="topRight"
                    />
                    {ev.is_live && (
                      <CutCornerBadge label="Live" solid corners="topRight" />
                    )}
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close event details"
                  hitSlop={spacing.spacingSm}
                  onPress={() => setSelectedEventId(null)}
                >
                  <X size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                </Pressable>
              </View>

              {ev.description ? (
                <Text style={styles.sheetBodyText} numberOfLines={3}>{ev.description}</Text>
              ) : null}

              <View style={styles.sheetReadouts}>
                <View style={styles.sheetReadout}>
                  <Text style={styles.sheetReadoutLabel}>STARTS</Text>
                  <Text style={styles.sheetReadoutValue}>{fmtEventTime(ev.starts_at, ev.is_live)}</Text>
                </View>
                <View style={styles.sheetReadout}>
                  <Text style={styles.sheetReadoutLabel}>JOINED</Text>
                  <Text style={styles.sheetReadoutValue}>
                    {ev.participant_count}
                    {ev.max_participants > 0 ? ` / ${ev.max_participants}` : ""}
                  </Text>
                </View>
                <View style={styles.sheetReadout}>
                  <Text style={styles.sheetReadoutLabel}>HOST</Text>
                  <Text style={styles.sheetHostName} numberOfLines={1}>{ev.host_name}</Text>
                </View>
              </View>

              <View style={styles.sheetActions}>
                {ev.is_host ? (
                  <CutCornerButton
                    title="Cancel Event"
                    variant="outline"
                    corners="topRight"
                    disabled={eventActionBusy}
                    onPress={() => handleCancelEvent(ev)}
                    style={styles.sheetPrimaryAction}
                    icon={<X size={spacing.spacingLg} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />}
                  />
                ) : ev.is_joined ? (
                  <CutCornerButton
                    title="Leave"
                    variant="outline"
                    corners="topRight"
                    disabled={eventActionBusy}
                    onPress={() => handleLeaveEvent(ev)}
                    style={styles.sheetPrimaryAction}
                    icon={<LogOut size={spacing.spacingLg} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />}
                  />
                ) : (
                  <CutCornerButton
                    title={isFull ? "Event Full" : eventActionBusy ? "Joining…" : "Join Event"}
                    corners="topRight"
                    disabled={eventActionBusy || isFull || !user}
                    onPress={() => handleJoinEvent(ev)}
                    style={styles.sheetPrimaryAction}
                    icon={<UserPlus size={spacing.spacingLg} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Route to this event"
                  onPress={() => handleRouteToEvent(ev)}
                >
                  <CutCornerSurface
                    fill={colors.voidBlack}
                    borderColor={colors.hairline}
                    borderWidth={borderWidth.hairline}
                    cutSize={cut.md}
                    corners="topRight"
                    style={styles.iconAction}
                    contentStyle={styles.iconActionContent}
                  >
                    <Route size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
                  </CutCornerSurface>
                </Pressable>
              </View>
            </CutCornerSurface>
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
        onSaved={(routeId) => setSavedRouteId(routeId)}
      />

      {/* --- Share the just-saved drive as a trip card --- */}
      <ShareCardModal
        visible={showShareTrip}
        onClose={() => setShowShareTrip(false)}
        type="trip"
        payload={{
          trip: {
            id: savedRouteId ?? "recorded",
            destination_name:
              selectedDestination?.type === "cafe"
                ? selectedDestination.data.name
                : selectedDestination?.type === "location"
                ? selectedDestination.name ?? "Dropped Pin"
                : null,
            origin_name: "Current Location",
            route_polyline:
              recordedPath.length > 1
                ? encodePolyline(simplifyPath(recordedPath, 400))
                : null,
            distance_km: tripDistance / 1000,
            duration_seconds: Math.round(elapsedMs / 1000),
            avg_speed_kmh:
              elapsedMs > 0 ? (tripDistance / 1000) / (elapsedMs / 1000 / 3600) : 0,
            top_speed_kmh: tripTopSpeed,
            xp_earned: xpEarned ?? 0,
            completed_at: new Date().toISOString(),
          },
        }}
        caption="Just recorded a drive on Driveverse"
      />

      {/* --- Rank-up share (from the level-up moment) --- */}
      <ShareCardModal
        visible={showShareRank}
        onClose={() => setShowShareRank(false)}
        type="rank"
        payload={{ rank: rankForLevel(level), level, totalXp }}
        caption={`Just reached ${rankForLevel(level).name} on Driveverse`}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 *
 * Every value below comes from `constants/theme.ts`. The four exceptions
 * are marked inline with the reason: the marker geometry that has to stay
 * fixed for the Android snapshot, the speed-limit sign (a road-sign
 * reproduction, not a UI surface), the visibility switch track, and the
 * screen-chrome text shadows that keep labels legible over map tiles.
 * ------------------------------------------------------------------ */

/** Screen-edge margin for the floating chrome, matching the Drive Hub. */
const SCREEN_MARGIN = spacing.spacingLg;

/**
 * Labels that sit directly on the map — marker names, button captions —
 * have no surface behind them, so they need a scrim of their own or they
 * disappear over light tiles. This is the one place the screen uses a
 * shadow, and it is a legibility device rather than an elevation one.
 */
const mapLabelShadow = {
  textShadowColor: alpha(colors.voidBlack, 0.9),
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidBlack,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  /* ---------------- Places layer (OSM + community) ---------------- */
  // The submit-a-place action takes the bottom-left slot the live feed
  // vacates while this layer is open.
  placesFabSlot: {
    position: "absolute",
    left: SCREEN_MARGIN,
    zIndex: 5,
  },

  /* ---------------- Status pills and banners ---------------- */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    // Shrink-wraps the label instead of spanning the screen edge to edge,
    // which is what let the old pill run under the chrome column.
    alignSelf: "center",
    maxWidth: "100%",
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
  },
  statusPillText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    flexShrink: 1,
  },
  cafeLoading: {
    position: "absolute",
    left: SCREEN_MARGIN,
    right: spacing.spacingXxxl + spacing.spacingXl,
    alignItems: "center",
    zIndex: 100,
  },
  errorBanner: {
    position: "absolute",
    left: SCREEN_MARGIN,
    right: SCREEN_MARGIN,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.racingRed,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
    zIndex: 200,
  },
  errorTextWrap: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  errorTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
    color: colors.racingRed,
  },
  errorText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },

  /* ---------------- Landmark markers ---------------- */
  // Deliberate exception: the marker's outer bounds must not change when
  // the badge inside it grows, because Android snapshots the view into a
  // bitmap and a later size change gets clipped. These four sizes are
  // therefore fixed pixel geometry, not spacing tokens.
  poiMarkerWrap: {
    alignItems: "center",
    width: 110,
  },
  poiBadgeBox: {
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
  },
  landmarkMarker: {
    width: 34,
    height: 34,
  },
  landmarkMarkerSelected: {
    width: 44,
    height: 44,
  },
  landmarkMarkerChosen: {
    width: 56,
    height: 56,
  },
  landmarkMarkerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Cluster badge. Fixed bounds like every other marker (D-5): the count
     changes as the driver pans, and a marker that grows after the native
     snapshot is taken is the "icons cropped to half size" bug. Wide enough
     for a glyph plus three digits — past 999 in one cell the map is far
     enough out that the clusterer has already merged categories. */
  clusterMarker: {
    width: 58,
    height: 34,
  },
  clusterMarkerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingXs,
  },
  clusterCount: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  poiMarkerName: {
    ...textStyle("caption"),
    ...mapLabelShadow,
    color: colors.textPrimary,
    textAlign: "center",
    maxWidth: 108,
  },
  poiMarkerDist: {
    ...textStyle("dataSm"),
    ...mapLabelShadow,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },

  /* ---------------- Driver's own marker ---------------- */
  // Fixed box with headroom for the ±4px float animation, so the icon
  // never translates outside the snapshot bounds.
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
  youLabelWrap: {
    alignItems: "center",
  },
  youLabelName: {
    ...textStyle("caption"),
    ...mapLabelShadow,
    fontFamily: fontFamily.displaySemiBold,
    color: colors.textPrimary,
  },
  youLabelLevel: {
    ...textStyle("dataSm"),
    ...mapLabelShadow,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  destPin: {
    alignItems: "center",
    justifyContent: "center",
  },
  customPin: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ---------------- Floating chrome buttons ---------------- */
  rightButtons: {
    position: "absolute",
    right: spacing.spacingSm,
    gap: spacing.spacingMd,
    zIndex: 100,
    alignItems: "center",
  },
  // Utility surface: square, `radius.sharp`. The corner cut is reserved
  // for brand surfaces (sheets, cards, the primary action).
  /** Press feedback for the Pressables that replaced TouchableOpacity. */
  pressed: {
    opacity: 0.7,
  },
  actionBtn: {
    width: spacing.spacingXxl + spacing.spacingSm,
    height: spacing.spacingXxl + spacing.spacingSm,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  actionBtnActive: {
    borderColor: colors.racingRed,
  },
  labeledBtn: {
    alignItems: "center",
    width: spacing.spacingXxxl + spacing.spacingLg,
    gap: spacing.spacingXs,
  },
  actionBtnLabel: {
    ...textStyle("caption"),
    ...mapLabelShadow,
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
  actionStack: {
    position: "absolute",
    right: spacing.spacingSm,
    alignItems: "center",
    gap: spacing.spacingMd,
    zIndex: 130,
  },
  driveBtn: {
    width: spacing.spacingXxxl + spacing.spacingSm,
    height: spacing.spacingXxxl + spacing.spacingSm,
  },
  driveBtnContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ---------------- Top chrome: greeting + featured event ---------------- */
  topChrome: {
    position: "absolute",
    left: SCREEN_MARGIN,
    right: spacing.spacingXxxl + spacing.spacingXl,
    flexDirection: "row",
    gap: spacing.spacingMd,
    zIndex: 120,
    alignItems: "flex-start",
  },
  greetingColumn: {
    alignItems: "flex-start",
    gap: spacing.spacingMd,
  },
  greetingCard: {
    minWidth: spacing.spacingXxxl * 2 + spacing.spacingMd,
    maxWidth: spacing.spacingXxxl * 3,
  },
  greetingCardContent: {
    padding: spacing.spacingMd,
    gap: spacing.spacingXs,
  },
  greetingTempRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  greetingTempValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 1,
  },
  greetingTemp: {
    ...textStyle("dataSm"),
    fontSize: 17,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  greetingTempUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  greetingLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  greetingNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  greetingName: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flexShrink: 1,
  },
  greetingDate: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  featuredCardHit: {
    flex: 1,
  },
  featuredCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingMd,
  },
  featuredThumb: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.voidBlack,
    justifyContent: "center",
    alignItems: "center",
  },
  featuredInfo: {
    flex: 1,
    gap: 1,
  },
  featuredTitle: {
    ...textStyle("displayMd"),
    fontSize: 16,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  featuredMeta: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  featuredLocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  featuredLoc: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    flexShrink: 1,
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    alignSelf: "flex-start",
  },
  featuredBadgeText: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },

  /* ---------------- Search ---------------- */
  searchOverlay: {
    position: "absolute",
    left: SCREEN_MARGIN,
    right: SCREEN_MARGIN,
    zIndex: 250,
    gap: spacing.spacingSm,
  },
  // Utility surface: text inputs stay plain rectangles.
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingLg,
    height: spacing.spacingXxxl,
  },
  searchInput: {
    ...textStyle("body"),
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  searchResults: {
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
  },
  searchResultRowBorder: {
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  searchResultIcon: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  searchResultVicinity: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  searchResultDist: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  searchEmpty: {
    ...textStyle("body"),
    color: colors.textSecondary,
    padding: spacing.spacingLg,
  },

  /* ---------------- Filters popover ---------------- */
  filtersPopover: {
    position: "absolute",
    right: spacing.spacingXxxl + spacing.spacingXl + spacing.spacingSm,
    /* Widened from 192 when the panel went from seven rows to eleven:
       "Other drivers" and "Car Wash" clipped their labels at the old width
       once the glyph and the tick had taken their columns. */
    width: spacing.spacingXxxl * 4 + spacing.spacingXl, // 216
    zIndex: 240,
  },
  filtersContent: {
    padding: spacing.spacingLg,
    gap: spacing.spacingXs,
  },
  filtersTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginTop: spacing.spacingSm,
    marginBottom: spacing.spacingXs,
  },
  filtersTitleSpaced: {
    marginTop: spacing.spacingLg,
  },
  filtersHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  filtersReset: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textDecorationLine: "underline",
    marginBottom: spacing.spacingXs,
  },
  /* Eleven toggles plus two section headers overflow the popover on a
     390pt screen once the top chrome is subtracted, so the list scrolls.
     The height is a named cap rather than a flex bound: the popover
     floats over the map with nothing to flex against. */
  filtersScroll: {
    maxHeight: FILTERS_LIST_MAX_HEIGHT,
  },
  filtersScrollContent: {
    paddingBottom: spacing.spacingXs,
  },
  filtersNote: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    marginTop: spacing.spacingSm,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
  },
  filterLabel: {
    flex: 1,
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  filterCheck: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  filterCheckOn: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  // Utility surface: a segmented control is a plain rectangle.
  mapStyleToggle: {
    flexDirection: "row",
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    padding: spacing.spacingXs,
    gap: spacing.spacingXs,
    marginBottom: spacing.spacingSm,
  },
  mapStyleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingXs,
    paddingVertical: spacing.spacingSm,
    borderRadius: radius.sharp,
  },
  mapStyleOptionActive: {
    backgroundColor: colors.textPrimary,
  },
  mapStyleOptionText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  mapStyleOptionTextActive: {
    color: colors.voidBlack,
  },

  /* ---------------- Live feed ---------------- */
  liveFeedSlot: {
    position: "absolute",
    left: SCREEN_MARGIN,
    width: SCREEN_WIDTH * 0.62,
    maxWidth: spacing.spacingXxxl * 6 + spacing.spacingMd,
    zIndex: 130,
  },
  liveFeedContent: {
    paddingHorizontal: spacing.spacingMd,
    paddingTop: spacing.spacingMd,
    paddingBottom: spacing.spacingSm,
  },
  liveFeedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.spacingSm,
  },
  liveFeedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  liveFeedDot: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    borderRadius: radius.circle,
    backgroundColor: colors.racingRed,
  },
  liveFeedTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  liveFeedSeeAll: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  liveFeedEmpty: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    paddingBottom: spacing.spacingSm,
  },
  liveFeedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
  },
  liveFeedRowBorder: {
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  liveFeedIcon: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  liveFeedIconLive: {
    borderColor: colors.racingRed,
  },
  liveFeedTextWrap: {
    flex: 1,
  },
  liveFeedRowTitle: {
    ...textStyle("caption"),
    color: colors.textPrimary,
  },
  liveFeedRowSub: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  liveFeedRowTime: {
    ...textStyle("dataSm"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  liveFeedCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  liveFeedCountText: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },

  /* ---------------- Drop-pin hint ---------------- */
  dropPinHint: {
    position: "absolute",
    left: SCREEN_MARGIN,
    // Stops short of the right-hand chrome column, same gutter the top
    // chrome uses, so the hint never sits under a button label.
    right: spacing.spacingXxxl + spacing.spacingXl,
    zIndex: 140,
  },
  dropPinHintContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
  },
  dropPinHintText: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },

  /* ---------------- Driving HUD: profile pill ---------------- */
  drivingProfilePill: {
    position: "absolute",
    left: spacing.spacingMd,
    zIndex: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs,
  },
  drivingProfileAvatar: {
    width: spacing.spacingXl + spacing.spacingXs,
    height: spacing.spacingXl + spacing.spacingXs,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  drivingProfileAvatarFallback: {
    width: spacing.spacingXl + spacing.spacingXs,
    height: spacing.spacingXl + spacing.spacingXs,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.voidBlack,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 13,
    lineHeight: 16,
    color: colors.textPrimary,
  },
  drivingProfileLevel: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.8,
    color: colors.textPrimary,
  },
  drivingProfileXpRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  drivingProfileXp: {
    ...textStyle("dataSm"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  drivingProfileXpUnit: {
    ...textStyle("caption"),
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
  },

  /* ---------------- Driving HUD: turn card ---------------- */
  turnCard: {
    position: "absolute",
    left: spacing.spacingMd,
    width: spacing.spacingXxxl * 3 + spacing.spacingXl,
    zIndex: 155,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    padding: spacing.spacingMd,
    gap: spacing.spacingSm,
  },
  turnCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  turnIconBox: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  turnTextCol: {
    flex: 1,
  },
  turnDistanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  turnDistanceText: {
    ...textStyle("dataSm"),
    fontSize: 18,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  turnMetersUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  turnInstructionText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.4,
    color: colors.racingRed,
  },
  turnStreetText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  // Utility surface: progress tracks stay square.
  turnProgressTrack: {
    height: spacing.spacingXs,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  turnProgressFill: {
    height: "100%",
    backgroundColor: colors.textPrimary,
  },
  turnBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  turnBottomText: {
    ...textStyle("dataSm"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },

  /* ---------------- Driving HUD: speed limit + compass ---------------- */
  topRightCluster: {
    position: "absolute",
    right: spacing.spacingMd,
    zIndex: 155,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  // Deliberate exception: this is a reproduction of a regulatory speed
  // limit sign. Restyling it into the palette would make it stop reading
  // as a road sign, which is the entire point of the element.
  speedLimitSign: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: colors.racingRed,
    justifyContent: "center",
    alignItems: "center",
  },
  speedLimitNumber: {
    fontFamily: fontFamily.dataBold,
    fontSize: 14,
    lineHeight: 16,
    color: "#000000",
  },
  speedLimitUnit: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 7,
    lineHeight: 9,
    color: "#000000",
  },
  compassBtn: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },

  /* ---------------- Driving HUD: nearby card ---------------- */
  nearbyCard: {
    position: "absolute",
    right: spacing.spacingMd,
    width: spacing.spacingXxxl * 2 + spacing.spacingLg,
    zIndex: 150,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    padding: spacing.spacingSm,
    gap: spacing.spacingSm,
  },
  nearbyHeaderText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  nearbyIconBox: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    justifyContent: "center",
    alignItems: "center",
  },
  nearbyRowText: {
    flex: 1,
  },
  nearbyLabel: {
    ...textStyle("caption"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textPrimary,
  },
  nearbyDist: {
    ...textStyle("dataSm"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  nearbyChevronBtn: {
    alignSelf: "center",
    paddingTop: spacing.spacingXs,
  },

  /* ---------------- Driving HUD: achievements ---------------- */
  achievementStack: {
    position: "absolute",
    left: spacing.spacingMd,
    width: spacing.spacingXxxl * 2 + spacing.spacingXl,
    zIndex: 150,
    gap: spacing.spacingSm,
  },
  achievementCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    padding: spacing.spacingSm,
  },
  achievementIconBox: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    justifyContent: "center",
    alignItems: "center",
  },
  achievementTextCol: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  achievementTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  achievementValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  achievementValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  achievementUnit: {
    ...textStyle("caption"),
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
  },
  // Utility surface: progress tracks stay square.
  achievementProgressTrack: {
    height: 2,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  achievementProgressFill: {
    height: "100%",
    backgroundColor: colors.textSecondary,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    padding: spacing.spacingSm,
  },
  friendAvatar: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.circle,
  },
  friendAvatarFallback: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    backgroundColor: colors.voidBlack,
    justifyContent: "center",
    alignItems: "center",
  },
  friendTextCol: {
    flex: 1,
  },
  friendName: {
    ...textStyle("caption"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textPrimary,
  },
  friendMeta: {
    ...textStyle("dataSm"),
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
  },
  photoToastPill: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    zIndex: 200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingSm,
    marginHorizontal: spacing.spacingXxxl + spacing.spacingXxl,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
  },
  photoToastText: {
    ...textStyle("caption"),
    color: colors.textPrimary,
  },

  /* ---------------- Driving HUD: bottom sheet ---------------- */
  recordingCard: {
    position: "absolute",
    bottom: 0,
    left: spacing.spacingMd,
    right: spacing.spacingMd,
    zIndex: 150,
    gap: spacing.spacingMd,
  },
  speedometerWrap: {
    position: "absolute",
    top: -(spacing.spacingXxxl * 2 + spacing.spacingSm),
    right: spacing.spacingXs,
    alignItems: "flex-end",
    gap: spacing.spacingSm,
  },
  speedometerBox: {
    width: spacing.spacingXxxl * 2,
    height: spacing.spacingXxxl * 2,
  },
  speedometerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  speedometerValue: {
    ...textStyle("dataLg"),
    color: colors.textPrimary,
  },
  speedometerUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  speedometerGearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    marginTop: spacing.spacingXs,
  },
  speedometerGearDot: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    borderRadius: radius.circle,
    backgroundColor: colors.textSecondary,
  },
  speedometerGearText: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  pausedBadge: {
    alignSelf: "flex-end",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.spacingSm,
  },
  drivingPrimaryBtn: {
    flex: 1.4,
  },
  drivingSecondaryBtn: {
    flex: 1,
  },
  drivingStatsRow: {
    flexDirection: "row",
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingVertical: spacing.spacingMd,
  },
  drivingStatCol: {
    flex: 1,
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  drivingStatLabel: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  drivingStatValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  drivingStatValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  drivingStatUnit: {
    ...textStyle("caption"),
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
  },

  /* ---------------- Bottom sheets (shared) ---------------- */
  bottomSheetSlot: {
    position: "absolute",
    bottom: 0,
    left: spacing.spacingMd,
    right: spacing.spacingMd,
    zIndex: 160,
  },
  sheetBody: {
    padding: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
  },
  sheetHeaderText: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  sheetGlyphBox: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  sheetTitleFlex: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flex: 1,
  },
  sheetBodyText: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  sheetReadouts: {
    flexDirection: "row",
    gap: spacing.spacingXl,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingMd,
  },
  sheetReadout: {
    gap: spacing.spacingXs,
    flexShrink: 1,
  },
  sheetReadoutLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  sheetReadoutValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  // The host's name is a name, not a measurement, so it stays in Inter
  // even though it sits in the readout row beside two mono values.
  sheetHostName: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  sheetActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.spacingMd,
  },
  sheetPrimaryAction: {
    flex: 1,
  },
  iconAction: {
    width: spacing.spacingXxxl,
    height: "100%",
    minHeight: spacing.spacingXxxl,
  },
  iconActionContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDismiss: {
    alignItems: "center",
    paddingTop: spacing.spacingSm,
  },
  sheetDismissText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  heroValue: {
    ...textStyle("dataLg"),
    color: colors.textPrimary,
  },
  heroUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  etaBlock: {
    alignItems: "flex-end",
    gap: spacing.spacingXs,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingMd,
  },
  statDivider: {
    width: borderWidth.hairline,
    alignSelf: "stretch",
    marginHorizontal: spacing.spacingMd,
    backgroundColor: colors.hairline,
  },
  comparisonRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.spacingSm,
  },
  comparisonLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    flexShrink: 1,
  },
  comparisonValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  levelUpBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingSm,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
  },
  levelUpText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0.8,
    color: colors.textPrimary,
  },
  levelUpShare: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    marginLeft: "auto",
  },
  levelUpShareText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.racingRed,
  },
  levelBarContainer: {
    gap: spacing.spacingSm,
  },
  levelBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  levelBarLabel: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  levelBarXp: {
    ...textStyle("dataSm"),
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  // Utility surface: progress tracks stay square.
  levelBarTrack: {
    height: spacing.spacingXs,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  levelBarFill: {
    height: "100%",
    backgroundColor: colors.racingRed,
  },
  routeLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
  },
  routeLoaderText: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  routeDest: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    paddingTop: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  routeDestText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    flex: 1,
  },

  /* ---------------- Online status banner ---------------- */
  onlineBannerSlot: {
    position: "absolute",
    bottom: 0,
    left: spacing.spacingMd,
    right: spacing.spacingMd,
    zIndex: 155,
  },

  /* ---------------- Distress alert + notice ---------------- */
  // Occupies the greeting card's band (same right inset as `topChrome`) so it
  // outranks the greeting for attention without ever covering the top-right
  // search / filter / locate controls, which stay reachable during an alert.
  distressBannerSlot: {
    position: "absolute",
    left: SCREEN_MARGIN,
    right: spacing.spacingXxxl + spacing.spacingXl,
    zIndex: 200,
  },
  distressBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
  },
  distressBadge: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.circle,
    backgroundColor: colors.racingRed,
    alignItems: "center",
    justifyContent: "center",
  },
  distressTextWrap: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  distressTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0.5,
    color: colors.textPrimary,
  },
  distressSub: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  driverDistressNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    borderWidth: borderWidth.hairline,
    borderColor: colors.racingRed,
    borderRadius: radius.sharp,
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
  },
  driverDistressTitle: {
    ...textStyle("displayMd"),
    color: colors.racingRed,
  },
  onlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
  },
  onlineBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    flex: 1,
  },
  onlineBannerDot: {
    width: spacing.spacingMd,
    height: spacing.spacingMd,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.textSecondary,
  },
  onlineBannerDotOn: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  onlineBannerTextWrap: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  onlineBannerTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  onlineBannerSub: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  // Deliberate exception: a switch is one of the few controls whose
  // meaning is carried by its shape, and a squared-off switch reads as a
  // progress bar. It keeps `radius.circle`, like an avatar.
  visibilitySwitchTrack: {
    flexDirection: "row",
    width: spacing.spacingXxxl,
    height: spacing.spacingXl + spacing.spacingSm,
    borderRadius: radius.circle,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },
  visibilitySwitchTrackOn: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    justifyContent: "flex-end",
  },
  visibilitySwitchKnob: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.circle,
    backgroundColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ---------------- Online driver markers ---------------- */
  // Fixed geometry, same Android-snapshot reason as the POI markers.
  playerMarkerWrap: {
    alignItems: "center",
    width: 96,
  },
  playerRingBox: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  /* The heading chevron's orbit. Fills the ring well exactly so rotating it
     turns the chevron around the ring's centre; the chevron itself sits at
     the top edge. Stays inside `playerRingBox`'s fixed 46pt bounds, so the
     marker's snapshot size is unchanged whether a driver has a heading or
     not (D-5). */
  playerHeadingOrbit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
  },
  playerRing: {
    width: 34,
    height: 34,
    borderRadius: radius.circle,
    backgroundColor: colors.voidBlack,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: borderWidth.emphasis,
    overflow: "hidden",
  },
  playerRingParty: {
    borderWidth: 3,
  },
  // Same 2pt top offset as the convoy/distress rings it shares the slot with.
  playerRankRing: {
    top: 2,
  },
  partyOuterRing: {
    position: "absolute",
    top: 2,
    width: 42,
    height: 42,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    opacity: 0.5,
  },
  partyBadge: {
    position: "absolute",
    top: 3,
    right: 20,
    width: 16,
    height: 16,
    borderRadius: radius.circle,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: borderWidth.hairline,
    borderColor: colors.voidBlack,
  },
  playerAvatarImg: {
    width: 30,
    height: 30,
    borderRadius: radius.circle,
  },
  playerAvatarInitial: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 13,
    lineHeight: 16,
    color: colors.textPrimary,
  },
  playerLevelBadge: {
    position: "absolute",
    top: 1,
    right: 1,
    minWidth: 18,
    height: 18,
    borderRadius: radius.circle,
    paddingHorizontal: spacing.spacingXs,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  playerLevelBadgeText: {
    ...textStyle("dataSm"),
    fontSize: 10,
    lineHeight: 12,
    color: colors.textPrimary,
  },
  playerName: {
    ...textStyle("caption"),
    ...mapLabelShadow,
    color: colors.textPrimary,
    textAlign: "center",
    maxWidth: 92,
  },
  // Distress ring: same geometry as the party ring, but red and near-solid
  // so a driver in trouble reads from across the map. Static, not pulsed —
  // Android snapshots the marker to a bitmap (D-5).
  problemOuterRing: {
    position: "absolute",
    top: 2,
    width: 42,
    height: 42,
    borderRadius: radius.circle,
    borderWidth: borderWidth.emphasis,
    borderColor: colors.racingRed,
    opacity: 0.9,
  },
  // Sits top-left, opposite the level badge, so both stay legible.
  problemBadge: {
    position: "absolute",
    top: 1,
    left: 1,
    width: 18,
    height: 18,
    borderRadius: radius.circle,
    backgroundColor: colors.racingRed,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: borderWidth.hairline,
    borderColor: colors.voidBlack,
  },
  playerProblemLabel: {
    ...textStyle("caption"),
    ...mapLabelShadow,
    color: colors.racingRed,
    textAlign: "center",
    maxWidth: 92,
  },

  /* ---------------- Online driver sheet ---------------- */
  driverSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
  },
  driverSheetAvatar: {
    width: spacing.spacingXxxl,
    height: spacing.spacingXxxl,
    borderRadius: radius.circle,
    borderWidth: borderWidth.emphasis,
    backgroundColor: colors.voidBlack,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  driverSheetAvatarImg: {
    width: spacing.spacingXxxl,
    height: spacing.spacingXxxl,
    borderRadius: radius.circle,
  },
  driverSheetText: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  driverSheetMetaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  driverSheetMeta: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  driverSheetMetaSep: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  driverSheetMetaUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  driverSheetActions: {
    gap: spacing.spacingSm,
  },
  // Utility surface: list rows stay plain rectangles.
  actionRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
  },
  actionRowItemBusy: {
    opacity: 0.4,
  },
  actionRowIcon: {
    width: spacing.spacingXl,
    alignItems: "center",
  },
  actionRowLabel: {
    flex: 1,
    ...textStyle("body"),
    color: colors.textPrimary,
  },

  /* ---------------- Event markers ---------------- */
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
  eventMarker: {
    width: 36,
    height: 36,
  },
  eventMarkerSelected: {
    width: 44,
    height: 44,
  },
  eventMarkerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eventMarkerLiveRing: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
  },
  eventMarkerBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: radius.circle,
    paddingHorizontal: spacing.spacingXs,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: borderWidth.hairline,
    borderColor: colors.voidBlack,
  },
  eventMarkerBadgeText: {
    ...textStyle("dataSm"),
    fontSize: 10,
    lineHeight: 12,
  },
  eventMiniCard: {
    marginTop: spacing.spacingXs,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs,
    maxWidth: 168,
    alignItems: "center",
  },
  eventMiniCardLive: {
    borderColor: colors.racingRed,
  },
  eventMiniTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.4,
    color: colors.textPrimary,
  },
  eventMiniMeta: {
    ...textStyle("caption"),
    fontSize: 10,
    lineHeight: 13,
    color: colors.textSecondary,
  },
  eventCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
});
