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
 *
 * ── THE RENDERER (5 Aug 2026) ───────────────────────────────────────────────
 *
 * This screen draws on `@rnmapbox/maps`, not `react-native-maps`.
 * MAP_MARKER_REFERENCE.md §11 has the full account; the short version is that
 * `react-native-maps` needs Google's Maps SDK on Android as a hard dependency
 * even though every tile here has always come from Mapbox, and a rejected
 * Google API key left the whole map blank with no error anywhere. Mapbox's own
 * SDK removes Google from the stack.
 *
 * What that changes for anyone editing this file:
 *
 *   - **Coordinates are `[longitude, latitude]`.** Never write a coordinate
 *     pair by hand; go through `lib/mapboxCoords.ts`, which is tested. A
 *     transposed pair does not throw and does not fail a type check.
 *   - **The camera is a separate ref**, wrapped by `hooks/useMapboxCamera.ts`
 *     so the call sites still read `animateCamera({ center, zoom, pitch,
 *     heading }, { duration })`.
 *   - **Markers are `Mapbox.MarkerView`** and render live React views, so the
 *     `tracksViewChanges` bitmap-freeze problem (§10c) is gone — but
 *     `allowOverlap` defaults to FALSE, which silently hides adjacent markers.
 *     Every marker here sets it. Mapbox also suggests keeping MarkerViews
 *     under ~100 on screen, which is what `lib/mapClustering.ts` is for.
 *   - **`MarkerView` has no `onPress`** — the child handles its own touches,
 *     which is why the marker bodies are `Pressable`.
 *   - **Lines are a source plus a style layer**, wrapped by
 *     `components/MapPolyline.tsx`, which needs a unique `id` per line.
 *   - **The package must not be imported statically** — see
 *     LAUNCH_SAFETY_REFERENCE.md §20 and `lib/mapboxNative.ts`.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Animated,
  ActivityIndicator,
  Dimensions,
  Image,
  TextInput,
  Keyboard,
  Modal,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapPolyline from "@/components/MapPolyline";
import MapboxMapStatus from "@/components/MapboxMapStatus";
import { loadMapbox, initMapbox } from "@/lib/mapboxNative";
import { useMapboxCamera } from "@/hooks/useMapboxCamera";
import { toPosition, zoomForLatitudeDelta, latitudeDeltaForZoom } from "@/lib/mapboxCoords";
import { RankFrameRing } from "@/components/frames/AvatarFrame";
import {
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/constants/placesCategories";
import { CATEGORY_COLORS, ON_CATEGORY } from "@/constants/mapCategoryColors";
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
  Flag,
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
  mapLabelShadow,
  onRacingRed,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import {
  DEMO_DRIVERS_ENABLED,
  demoAvatarSource as avatarSource,
  isDemoDriver,
  withDemoDrivers,
} from "@/lib/demoDrivers";
import DemoDriverSheet from "@/components/DemoDriverSheet";
import { useRouter } from "expo-router";
import * as ImagePickerExpo from "expo-image-picker";
import SaveRouteModal from "@/components/SaveRouteModal";
import ShareCardModal from "@/components/ShareCardModal";
import { encodePolyline, simplifyIndices, simplifyPath } from "@/lib/polyline";
import { encodeSpeedProfile, speedProfileFromFixes } from "@/lib/speedTrace";
import { describeSaveFailure, sanitizeCount, sanitizeMetric } from "@/lib/routeDraft";
import { calculateDriveXP } from "@/lib/tripStats";
import { haversineMeters, bearingBetween, headingDelta } from "@/lib/tripGeoStats";
import { rankForLevel } from "@/constants/ranks";
import { useXP } from "@/hooks/useXPStore";
import { useOnlineUsers, OnlineUser, ProblemType } from "@/hooks/useOnlineUsers";
import { useParty } from "@/hooks/usePartyStore";
import {
  activeConvoyDestination,
  convoyDestinationHeadline,
  sameConvoyDestination,
} from "@/lib/convoyNav";
import { useEvents, DriveEvent } from "@/hooks/useEventsStore";
import { EventTypeIcon, eventTypeLabel } from "@/components/EventMeta";
import { useAuth } from "@/hooks/useAuthStore";
import { useActiveCar } from "@/hooks/useActiveCarStore";
import { useTheme } from "@/hooks/useThemeStore";
import { supabase } from "@/lib/supabase";
import { MAPBOX_ACCESS_TOKEN, mapboxStyleUrl } from "@/constants/mapbox";
import { convertSpeed, speedUnitForCountry, speedUnitLabel } from "@/lib/speedUnits";
import { searchPlaces, getDirectionsWithSteps, reverseGeocodePlace } from "@/lib/mapboxApi";
import { coordinateLabel, shortPlaceLabel } from "@/lib/tripEndpoints";
import { appAlert } from "@/lib/appAlert";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * Landmarks are fetched around the driver, not preloaded nationwide.
 *
 * WHAT THIS REPLACED, AND WHY
 *   This screen used to walk a hardcoded list of twenty Indonesian cities on
 *   first GPS fix, run nine geocoder queries per city, and keep the first 200
 *   results — a cap that nine categories × twenty cities blows through inside
 *   the first two or three cities. Two things went wrong with that:
 *
 *   1. The 200 kept were the ones the *list* happened to reach first, not the
 *      ones near the driver, and nothing ever refetched for where the driver
 *      actually was. Drive anywhere outside those first cities and the
 *      landmark layer was empty for the rest of the session.
 *   2. Mapbox's geocoder matches names, not categories, and `proximity` only
 *      re-ranks. Querying "parking" returned *Paring Raya* — a street 724 km
 *      away, one letter off — and it outranked nothing because there was
 *      nothing else to rank it against.
 *
 *   The result on screen was a map with no POI markers on it at all and a
 *   live feed offering the driver a "nearest parking" 724 km away.
 *
 *   Now: one fetch centred on the driver, `types=poi` so the geocoder answers
 *   with POIs instead of streets and regions, and a hard radius so a fuzzy
 *   name match in another province can never land on the map.
 */
/** How far out landmarks are pulled from the current centre. */
const LANDMARK_RADIUS_METERS = 15_000;
/** How far the map centre must move before landmarks are refetched. */
const LANDMARK_REFETCH_METERS = 6_000;
/** Pan settling time before a landmark refetch fires. */
const LANDMARK_REFETCH_DEBOUNCE_MS = 800;

/**
 * Landmarks and Places used to carry two different vocabularies for the
 * same nine things — `spbu`/`carwash`/`charging` here, `gas_station`/
 * `car_wash`/`ev_charger` in the Places layer — which is why a single
 * Filters panel could not cover both. There is now one set of category
 * ids, owned by `constants/mapLayers.ts`, and both marker sources speak it.
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
}

// --- Mapbox Geocoding search terms used to populate each landmark category ---
const LANDMARK_CATEGORY_QUERIES: { category: PlaceCategory; query: string }[] = [
  { category: "cafe", query: "cafe" },
  { category: "restaurant", query: "restaurant" },
  { category: "gas_station", query: "gas station" },
  { category: "shopping", query: "shopping mall" },
  { category: "car_wash", query: "car wash" },
  { category: "workshop", query: "car repair" },
  { category: "ev_charger", query: "ev charging station" },
  { category: "parking", query: "parking" },
  { category: "hangout", query: "park" },
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

// --- Format helpers ---
function fmtKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function fmtMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
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

// Labels and glyphs both come from the shared layer vocabulary now. The
// local `CAT_LABELS` / `CAT_GLYPHS` maps they replace were a second copy of
// the same table, keyed by a second set of ids.
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
/** Clears the top chrome so the hint never lands on the greeting card or the
 *  Signal button under it. */
const DROP_PIN_HINT_OFFSET = spacing.spacingXxxl * 3 + spacing.spacingXxxl / 2 + spacing.spacingLg; // 184
/** Where the idle bottom stack (live feed, action stack) sits above the bar. */
const BOTTOM_STACK_OFFSET = spacing.spacingXxxl * 4; // 192

const ROUTE_CASING_WIDTH = 8;
const ROUTE_CORE_WIDTH = 4;

const CAT_GLYPHS = PLACE_CATEGORY_ICONS;

/**
 * The rank frame on a driver marker fills the same 42pt outer slot the
 * convoy and distress rings use, inside the 46pt `playerRingBox`. Keeping
 * all three on one diameter means the marker's bounds never change with
 * rank — which matters because the native marker snapshot is taken from
 * those bounds, and a taller marker would clip.
 */
const PLAYER_RANK_RING_SIZE = 42;

// `SettledMarker` and its whole `tracksViewChanges` problem are gone from this
// screen. It existed because Android rasterised a `react-native-maps` marker
// into a bitmap and froze it, so a marker could end up present, tappable and
// blank (MAP_MARKER_REFERENCE.md §10c). Mapbox's `MarkerView` renders the real
// React view on the map, so there is no snapshot to mistime — markers update
// like any other view. `components/SettledMarker.tsx` still serves the places
// layer until stage 3 of the migration lands.

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
  const router = useRouter();
  const { isDark } = useTheme();

  /**
   * The Mapbox module, and the camera in the shape this file already calls it
   * (`hooks/useMapboxCamera.ts`). `loadMapbox()` rather than a static import:
   * the package reaches a throwing native lookup at module scope, so the
   * platform check has to come first — LAUNCH_SAFETY_REFERENCE.md §20.
   */
  const Mapbox = loadMapbox();
  const {
    ref: cameraRef,
    animate: animateCamera,
    fitTo: fitToCoordinates,
    flatRotation,
  } = useMapboxCamera();

  /**
   * `setAccessToken` is a native call, so it happens on mount rather than at
   * import time (§1/§2). False means the map cannot draw and the screen says
   * so, instead of showing an empty rectangle.
   */
  const [mapboxReady, setMapboxReady] = useState(false);
  useEffect(() => {
    setMapboxReady(initMapbox());
  }, []);

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

  // Landmark state (Mapbox POI geocoding, fetched around the driver)
  const [cafes, setCafes] = useState<CafePOI[]>([]);
  const [loadingCafes, setLoadingCafes] = useState(false);
  /** Centre the current landmark set was fetched for. */
  const landmarkCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);
  /** Monotonic id so a superseded landmark fetch cannot overwrite a newer one. */
  const landmarkFetchRef = useRef(0);
  const landmarkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected destination (cafe or custom tapped location)
  const [selectedDestination, setSelectedDestination] = useState<SelectedDestination | null>(null);
  // Where the current recording started, reverse-geocoded when the driver
  // hits Start. `null` until it resolves — and it may never resolve, so
  // nothing may block on it. See `resolveOriginName`.
  const [originLabel, setOriginLabel] = useState<string | null>(null);
  // Bumped per recording so a late geocoder reply from a previous drive
  // cannot stamp its name on this one.
  const originRequestRef = useRef(0);
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
  /** Capture time (epoch ms) of each fix in `recordedPath`, same length. */
  const pathTimesRef = useRef<number[]>([]);
  /**
   * The finished drive's per-point speed profile, encoded — written to
   * `trips.speed_profile` and handed to the share card so its heatmap uses
   * measured speeds rather than the geometry-derived approximation.
   */
  const [recordedSpeedProfile, setRecordedSpeedProfile] = useState<string | null>(null);
  const photoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenicToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Save & Share Route modal
  const [showSaveRoute, setShowSaveRoute] = useState(false);
  // Id of the just-recorded drive once it has been saved to the profile.
  // Drives the Save button's "Saved" state. Sharing does not depend on it.
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);
  // Id of the `trips` row written automatically when the drive ended, so the
  // name entered in the Save Route sheet can be written back onto it — the
  // trips row is otherwise never named, even though the Drive Hub and trip
  // detail screen both prefer `trip.name` when it is set.
  const [lastTripId, setLastTripId] = useState<string | null>(null);
  // Why the automatic `trips` write failed, if it did. Surfaced on the trip
  // summary rather than swallowed into the console.
  const [tripSaveError, setTripSaveError] = useState<string | null>(null);
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
  const {
    onlineUsers,
    isOnline: isUserOnline,
    goOnline,
    goOffline,
    myProblem,
    raiseProblem,
    clearProblem,
  } = useOnlineUsers();
  const { user } = useAuth();
  // Every raw km/h reading on this screen — the live speedometer, the
  // recording HUD, the trip summary — renders through this. See
  // lib/speedUnits.ts's header for why it always follows the signed-in
  // driver's own country rather than anything about the drive itself.
  const speedUnit = useMemo(() => speedUnitForCountry(user?.country), [user?.country]);
  const { activeCar } = useActiveCar();
  const {
    party,
    members: convoyMembers,
    partyMemberIds,
    inviteDriver,
    isLeader: isConvoyLeader,
    leaderName: convoyLeaderName,
    destination: convoyDestination,
    setDestination: shareConvoyDestination,
    clearDestination: clearConvoyDestination,
    leaveParty,
  } = useParty();
  const [convoyMenuOpen, setConvoyMenuOpen] = useState(false);
  const [selectedOnlineUser, setSelectedOnlineUser] = useState<OnlineUser | null>(null);
  // TEMPORARY: promo capture. A demo driver's "See profile" opens this local
  // sheet instead of navigating to /user/[id] — that route loads a real
  // profile from Supabase, and a demo-driver-N id has no row to load. Delete
  // with lib/demoDrivers.ts and components/DemoDriverSheet.tsx.
  const [demoProfileUser, setDemoProfileUser] = useState<OnlineUser | null>(null);
  const [invitingToParty, setInvitingToParty] = useState(false);
  // The raise-a-signal chooser sheet, and a tick that re-renders the age
  // labels ("3 min ago") on active signals once a minute.
  const [problemChooserOpen, setProblemChooserOpen] = useState(false);
  const [, setProblemClock] = useState(0);
  const [addingFriend, setAddingFriend] = useState(false);
  const [askingMeetup, setAskingMeetup] = useState(false);

  // ─── HUD chrome state (GTA-style homepage) ───────────────
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  const [greetingExpanded, setGreetingExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [privacySheetOpen, setPrivacySheetOpen] = useState(false);
  /** Last region the map reported. Drives the clustering threshold. */
  const [mapRegion, setMapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const weatherFetchedRef = useRef(false);

  // Avatar load-gating is vestigial now and kept only because the online-user
  // sheet reads the same state. Markers are live views under Mapbox, so a
  // network image that decodes late simply appears when it is ready rather
  // than being frozen half-drawn into a bitmap. It costs one Set and no
  // renders that were not happening anyway; removing it is a separate change
  // from the migration.
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

  // --- Landmarks around a point (see LANDMARK_RADIUS_METERS' header) ---
  //
  // The nine category queries go out together and each is allowed to fail on
  // its own: one geocoder hiccup should cost that category's markers, not the
  // whole layer. `landmarkFetchRef` makes a superseded fetch a no-op, so a
  // slow response from a region the driver has already left cannot land on
  // top of a newer one.
  const fetchLandmarksAround = useCallback(async (lat: number, lng: number) => {
    if (!MAPBOX_ACCESS_TOKEN) return;
    const fetchId = ++landmarkFetchRef.current;
    landmarkCenterRef.current = { latitude: lat, longitude: lng };
    setLoadingCafes(true);

    const proximity = { latitude: lat, longitude: lng };
    const perCategory = await Promise.all(
      LANDMARK_CATEGORY_QUERIES.map(async ({ category, query }) => {
        try {
          const places = await searchPlaces(query, proximity, "id", {
            types: "poi",
            maxDistanceMeters: LANDMARK_RADIUS_METERS,
          });
          return { category, places };
        } catch {
          return { category, places: [] };
        }
      })
    );

    // A newer fetch owns the state — including `loadingCafes`, which that
    // fetch will clear when it finishes.
    if (fetchId !== landmarkFetchRef.current) return;

    const seen = new Set<string>();
    const results: CafePOI[] = [];
    for (const { category, places } of perCategory) {
      for (const place of places) {
        if (seen.has(place.id)) continue;
        seen.add(place.id);
        results.push({
          id: place.id,
          name: place.name,
          lat: place.latitude,
          lng: place.longitude,
          vicinity: place.fullAddress,
          types: [],
          category,
        });
      }
    }

    setCafes(results);
    setLoadingCafes(false);
  }, []);

  /**
   * Refetch landmarks when the map centre has moved far enough to be a
   * different area, debounced so a pan gesture costs one round of queries
   * rather than one per frame.
   */
  const maybeRefetchLandmarks = useCallback(
    (lat: number, lng: number) => {
      const from = landmarkCenterRef.current;
      if (from && haversineMeters(from, { latitude: lat, longitude: lng }) < LANDMARK_REFETCH_METERS) {
        return;
      }
      if (landmarkDebounceRef.current) clearTimeout(landmarkDebounceRef.current);
      landmarkDebounceRef.current = setTimeout(() => {
        fetchLandmarksAround(lat, lng);
      }, LANDMARK_REFETCH_DEBOUNCE_MS);
    },
    [fetchLandmarksAround]
  );

  useEffect(
    () => () => {
      if (landmarkDebounceRef.current) clearTimeout(landmarkDebounceRef.current);
    },
    []
  );

  // --- Fetch directions from user location to destination ---
  const fetchDirections = useCallback(async (origin: { latitude: number; longitude: number }, dest: { latitude: number; longitude: number }) => {
    if (!MAPBOX_ACCESS_TOKEN) {
      // Voice rule: name what happened and what fixes it. "Route
      // Unavailable" on its own told the driver nothing they could act on.
      appAlert(
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

        fitToCoordinates(result.coordinates, {
          edgePadding: { top: 80, right: 60, bottom: 250, left: 60 },
          duration: 600,
        });
      } else {
        setNavigating(false);
        appAlert(
          "No road route to that point",
          "There's no drivable road connecting you to the pin — it may be offshore, inside a closed area, or on the far side of a water crossing. Drag the pin onto a road and tap Route again."
        );
      }
    } catch {
      setNavigating(false);
      appAlert(
        "Couldn't reach the routing service",
        "The request to Mapbox didn't get through, so there's no route yet. Check your connection and tap Route again."
      );
    } finally {
      setLoadingRoute(false);
    }
  }, [fitToCoordinates]);

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
          animateCamera(
            { center: coords, zoom: 16, pitch: 45, heading: loc.coords.heading ?? 0 },
            { duration: 1200 }
          );
        }, 300);

        Animated.timing(fadeIn, { toValue: 1, duration: 800, useNativeDriver: true }).start();

        // Landmarks for where the driver actually is
        fetchLandmarksAround(coords.latitude, coords.longitude);

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
              // When each fix landed, appended in lockstep with the path so
              // the drive can be stored with a real per-point speed profile
              // (`trips.speed_profile`, drawn as the share card's heatmap).
              // Pushed here rather than inside the updater below because a
              // state updater is not guaranteed to run exactly once, and a
              // times array one entry longer than the path is a profile that
              // silently colours the wrong corner of the map.
              pathTimesRef.current.push(now);
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
              animateCamera(
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
        appAlert(
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
      appAlert(
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

  // --- Invite any driver on the map to my convoy ---
  //
  // "Any driver" is the change here: this used to fail for everyone who
  // wasn't already an accepted friend, which is nearly everyone you can
  // actually see on the map. The friends requirement is gone from the RLS
  // policy and from the store, so the marker you tapped is now invitable.
  const handleInviteToPartyFromMap = useCallback(async (driverId: string, driverName: string) => {
    if (!party) {
      appAlert(
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
      const result = await inviteDriver(driverId);
      if (result.ok) {
        appAlert("Invite sent", `${driverName} was invited to join ${party.name}.`);
      } else {
        appAlert(
          result.error?.title ?? "Invite not sent",
          result.error?.message ?? "The database rejected the invite and didn't say why."
        );
      }
    } finally {
      setInvitingToParty(false);
    }
  }, [party, inviteDriver, router]);

  // --- Leave/disband convoy from the map's quick menu ---
  // Same confirm copy as `app/convoy.tsx`'s `handleLeave` — a driver should
  // read the same warning whichever screen they act from.
  const handleLeaveConvoyFromMap = useCallback(() => {
    if (!party) return;
    const isSolo = convoyMembers.length <= 1;
    appAlert(
      isConvoyLeader ? "Disband Convoy?" : "Leave Convoy?",
      isConvoyLeader && !isSolo
        ? "You're the leader — leaving disbands the convoy for everyone."
        : "You can rejoin later if someone invites you again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isConvoyLeader ? "Disband" : "Leave",
          style: "destructive",
          onPress: () => {
            setConvoyMenuOpen(false);
            void leaveParty();
          },
        },
      ]
    );
  }, [party, convoyMembers.length, isConvoyLeader, leaveParty]);

  // --- Ask a meetup from map marker ---
  const handleAskMeetupFromMap = useCallback(async (friendId: string, friendName: string) => {
    if (!user) return;
    // TEMPORARY: promo capture. A demo driver satisfies no foreign key, so the
    // insert below would fail and the footage would show an error alert on the
    // one action most worth filming. Answer it locally instead — the sheet
    // behaves exactly as it does for a real driver, and still nothing is
    // written. Delete with lib/demoDrivers.ts.
    if (isDemoDriver(friendId)) {
      setAskingMeetup(true);
      setTimeout(() => {
        setAskingMeetup(false);
        appAlert("Meetup request sent", `${friendName} will see it in their inbox.`);
      }, 600);
      return;
    }
    setAskingMeetup(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: friendId,
        content: `👋 ${user.name ?? "A driver"} wants to meet up nearby! Are you free to link up?`,
      });
      if (error) {
        appAlert(
          "Meetup request not sent",
          `The message to ${friendName} didn't reach the server: ${error.message} Check your connection and tap Ask a Meetup again.`
        );
      } else {
        appAlert("Meetup request sent", `${friendName} will see it in their inbox.`);
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
    // TEMPORARY: promo capture — same reason as the meetup handler above.
    if (isDemoDriver(friendId)) {
      setAddingFriend(true);
      setTimeout(() => {
        setAddingFriend(false);
        appAlert("Friend request sent", `${friendName} will get your request.`);
      }, 600);
      return;
    }
    setAddingFriend(true);
    try {
      const { error } = await supabase.from("friends").insert({
        user_id: user.id,
        friend_id: friendId,
        status: "pending",
      });
      if (error) {
        if (error.code === "23505") {
          appAlert(
            "Already connected",
            `You and ${friendName} are already friends — no second request needed.`
          );
        } else {
          appAlert(
            "Friend request not sent",
            `The request to ${friendName} didn't reach the server: ${error.message} Check your connection and tap Add Friend again.`
          );
        }
      } else {
        appAlert("Friend request sent", `${friendName} will see it on their profile.`);
      }
    } catch {
      // Silent
    } finally {
      setAddingFriend(false);
    }
  }, [user]);

  // --- Handlers ---
  const centerOnUser = useCallback(() => {
    if (!userLocation) return;
    animateCamera(
      { center: userLocation, zoom: 17, pitch: 50, heading },
      { duration: 800 }
    );
  }, [userLocation, heading, animateCamera]);

  const handleCafePress = useCallback((cafe: CafePOI) => {
    setSelectedDestination({ type: "cafe", data: cafe });
    setLocationChosen(false);
    setRouteInfo(null);
    animateCamera(
      { center: { latitude: cafe.lat, longitude: cafe.lng }, zoom: 17, pitch: 40 },
      { duration: 500 }
    );
  }, [animateCamera]);

  const destCoords = useCallback((): { latitude: number; longitude: number } | null => {
    if (!selectedDestination) return null;
    if (selectedDestination.type === "cafe") {
      return { latitude: selectedDestination.data.lat, longitude: selectedDestination.data.lng };
    }
    return { latitude: selectedDestination.lat, longitude: selectedDestination.lng };
  }, [selectedDestination]);

  // Sync destCoordsRef for use inside the GPS watcher (stale closure)
  useEffect(() => { destCoordsRef.current = destCoords(); }, [destCoords]);

  /**
   * The one place the destination gets a human name. Every surface that used
   * to build this string for itself — the route sheet, the trip row, the
   * save sheet, the share card — reads it from here, which is what stopped
   * four call sites disagreeing about what a pin with no name is called.
   *
   * `null` means "not named yet, or not nameable": callers decide what to
   * show or store for that, and the share card is the one that turns it into
   * "Point B".
   */
  const destinationLabel = useMemo((): string | null => {
    if (!selectedDestination) return null;
    if (selectedDestination.type === "cafe") {
      return shortPlaceLabel(selectedDestination.data.name);
    }
    return shortPlaceLabel(selectedDestination.name);
  }, [selectedDestination]);

  /**
   * The same, for what gets written to `trips` / `saved_routes`. Storage
   * prefers a coordinate pair over nothing, because a row that knows where
   * it was can be named later; a row that says "Unknown" never can.
   */
  const destinationStoredName = useMemo((): string => {
    const coords = destCoords();
    return destinationLabel ?? coordinateLabel(coords?.latitude, coords?.longitude) ?? "Unknown";
  }, [destinationLabel, destCoords]);

  const handleNavigate = useCallback(() => {
    const coords = destCoords();
    if (!coords) return;
    if (!userLocation) {
      appAlert(
        "No GPS fix yet",
        "A route starts from where you are, and Driveverse doesn't have your position. Check location is on for the app, wait for the driver marker to appear, then tap Route again."
      );
      return;
    }
    setNavigating(true);
    fetchDirections(userLocation, coords);

    // The leader's route is the convoy's route. Published here — at the tap,
    // not once the directions come back — because the destination is what the
    // convoy needs, and it is already known; waiting on Mapbox would delay
    // every member's banner behind a network call that can also fail.
    //
    // Only the leader writes it (`canSetConvoyDestination`, enforced again in
    // `set_convoy_destination`), and the store drops a republish of the same
    // point, so nothing here fires twice for one destination.
    if (isConvoyLeader && party) {
      void shareConvoyDestination({
        lat: coords.latitude,
        lng: coords.longitude,
        name: destinationStoredName,
      });
    }
  }, [userLocation, destCoords, fetchDirections, isConvoyLeader, party, shareConvoyDestination, destinationStoredName]);

  /** Route to the destination the convoy leader shared. */
  const handleFollowConvoyDestination = useCallback(() => {
    if (!convoyDestination) return;
    setSelectedDestination({
      type: "location",
      lat: convoyDestination.lat,
      lng: convoyDestination.lng,
      name: convoyDestination.name,
    });
    setLocationChosen(true);
    setRouteInfo(null);
    setShowDropPinHint(false);
    if (!userLocation) {
      appAlert(
        "No GPS fix yet",
        "The convoy's destination is on your map, but a route has to start from where you are. Wait for the driver marker to appear, then tap Route."
      );
      return;
    }
    setNavigating(true);
    fetchDirections(userLocation, {
      latitude: convoyDestination.lat,
      longitude: convoyDestination.lng,
    });
  }, [convoyDestination, userLocation, fetchDirections]);

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
    pathTimesRef.current = [];
    setRecordedSpeedProfile(null);
    setTripDistance(0);
    setElapsedMs(0);
    setTripStartMs(null);
    setRouteSplitIdx(null);
    setXpEarned(null);
    setRouteSteps([]);
    // The leader stopping is the convoy arriving (or changing its mind).
    // Nothing else clears the shared destination, so without this a convoy
    // stays pointed at last night's meet until the 6-hour staleness window in
    // `lib/convoyNav.ts` expires.
    if (isConvoyLeader) void clearConvoyDestination();
  }, [isConvoyLeader, clearConvoyDestination]);

  // --- Event handlers ---
  const openCreateEvent = useCallback(() => {
    if (!user) {
      appAlert(
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
      appAlert(
        "Drives need an account",
        "A drive is recorded to your trip log and awards XP, so it can't start while signed out. Sign in from the banner above the tab bar, then tap DRIVE again."
      );
      return;
    }
    setShowDropPinHint((v) => !v);
  }, [user]);

  /**
   * Ask Mapbox what the driver just tapped on, and hang the answer off the
   * selected destination.
   *
   * A dropped pin is a pair of coordinates and nothing else, which is how
   * the trip log, the save sheet and the share card all ended up saying
   * "Dropped Pin". Naming it is best-effort by design: the pin is already
   * selected and the route already fetchable before this resolves, and a
   * geocoder that is slow, off or tokenless costs the drive nothing but a
   * generic label. Hence no loading state and no error path.
   *
   * The result is only applied if that same pin is still selected — a driver
   * who taps twice must not have the first tap's name land on the second
   * tap's pin.
   */
  const resolveDroppedPinName = useCallback(async (lat: number, lng: number) => {
    const place = await reverseGeocodePlace(lat, lng);
    const label = shortPlaceLabel(place?.name) ?? shortPlaceLabel(place?.address);
    if (!label) return;
    setSelectedDestination((prev) =>
      prev && prev.type === "location" && prev.lat === lat && prev.lng === lng && !prev.name
        ? { ...prev, name: label }
        : prev
    );
  }, []);

  // --- Drop a destination pin wherever the driver taps the map, while drive mode is active ---
  //
  // Mapbox reports a tap as a GeoJSON Point feature rather than
  // `nativeEvent.coordinate`, so the coordinate arrives as `[lng, lat]` — the
  // one place in this file where the array order is read directly, and the
  // reason it is destructured into named variables immediately.
  const handleMapPress = useCallback((feature: GeoJSON.Feature<GeoJSON.Point>) => {
    if (!showDropPinHint) return;
    const [longitude, latitude] = feature.geometry.coordinates;
    setSelectedDestination({ type: "location", lat: latitude, lng: longitude });
    setLocationChosen(true);
    setRouteInfo(null);
    setShowDropPinHint(false);
    void resolveDroppedPinName(latitude, longitude);
  }, [showDropPinHint, resolveDroppedPinName]);

  /**
   * Mapbox reports camera state as `{ center: [lng, lat], zoom, bounds }`,
   * where `react-native-maps` reported a region with a `latitudeDelta`.
   *
   * The delta is converted back rather than the thresholds being rewritten in
   * zoom units: `lib/mapClustering.ts` disables clustering below a
   * `latitudeDelta` that was tuned on a device, and the landmark refetch
   * compares distances in metres. Both keep working untouched this way, and
   * the conversion is one tested function.
   */
  const handlePlacesRegionChange = useCallback(
    (state: { properties: { center: GeoJSON.Position; zoom: number } }) => {
      const [longitude, latitude] = state.properties.center;
      const latitudeDelta = latitudeDeltaForZoom(state.properties.zoom);

      setMapRegion({ latitude, longitude, latitudeDelta, longitudeDelta: latitudeDelta });
      // Landmarks follow the map, not just the first GPS fix — panning to
      // another city has to bring that city's POIs with it. Guarded by
      // distance inside, so an idle nudge costs nothing.
      maybeRefetchLandmarks(latitude, longitude);
    },
    [maybeRefetchLandmarks]
  );

  const handleJoinEvent = useCallback(async (ev: DriveEvent) => {
    setEventActionBusy(true);
    const { error } = await joinEvent(ev.id);
    setEventActionBusy(false);
    if (error) {
      appAlert(
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
      appAlert(
        "Couldn't leave the event",
        `${error} You're still listed as attending. Tap Leave again once you're back online.`
      );
    }
  }, [leaveEvent]);

  const handleCancelEvent = useCallback((ev: DriveEvent) => {
    appAlert("Cancel this event?", `"${ev.title}" will be removed from the map and everyone who joined will be told it's off. This can't be undone.`, [
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
            appAlert(
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
      appAlert(
        "No GPS fix yet",
        "A route starts from where you are, and Driveverse doesn't have your position. Check location is on for the app, wait for the driver marker to appear, then tap Route again."
      );
      return;
    }
    setSelectedEventId(null);
    // An event already has a name, so this destination never needs geocoding.
    setSelectedDestination({
      type: "location",
      lat: ev.latitude,
      lng: ev.longitude,
      name: ev.title,
    });
    setLocationChosen(true);
    setNavigating(true);
    fetchDirections(userLocation, { latitude: ev.latitude, longitude: ev.longitude });
  }, [userLocation, fetchDirections]);

  /**
   * Name the point the drive started from, so the share card can say
   * "Blok M → Puncak Pass" instead of naming the field it read.
   *
   * Fire-and-forget, exactly like {@link resolveDroppedPinName}: the
   * recording is already running by the time this is called, and the label
   * is not needed until the driver stops.
   */
  const resolveOriginName = useCallback(
    async (point: { latitude: number; longitude: number }) => {
      const token = ++originRequestRef.current;
      const place = await reverseGeocodePlace(point.latitude, point.longitude);
      const label = shortPlaceLabel(place?.name) ?? shortPlaceLabel(place?.address);
      if (label && originRequestRef.current === token) setOriginLabel(label);
    },
    []
  );

  // --- Recording handlers ---
  const startRecording = useCallback(() => {
    const now = Date.now();
    setIsRecording(true);
    setTripStartMs(now);
    setElapsedMs(0);
    setTripDistance(0);
    setRecordedPath([]);
    pathTimesRef.current = [];
    setRecordedSpeedProfile(null);
    setXpEarned(null);
    setSavedRouteId(null);
    setLastTripId(null);
    setTripSaveError(null);
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
    setOriginLabel(null);
    originRequestRef.current++;
    if (userLocation) {
      setRecordedPath([userLocation]);
      pathTimesRef.current = [now];
      lastCoordRef.current = userLocation;
      void resolveOriginName(userLocation);
    }
    // Drop into the third-person navigation view: tight zoom, tilted horizon,
    // and rotated so the direction of travel points up the screen.
    if (userLocation) {
      animateCamera(
        { center: userLocation, zoom: 18, pitch: 60, heading },
        { duration: 600 }
      );
    }
  }, [userLocation, heading, resolveOriginName, animateCamera]);

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

    // --- Per-point speed profile (the share card's heatmap) ---
    // Thinned through the SAME indices as the polyline, or the two arrays
    // describe different points and the colours land on the wrong stretch of
    // road. A times array that fell out of step with the path (which should
    // not happen, but is cheap to check and expensive to miss) writes no
    // profile at all — `lib/speedTrace.ts` then derives one from the geometry,
    // exactly as it does for every drive recorded before this existed.
    const storedIndices = simplifyIndices(recordedPath.length, 400);
    const fixTimes = pathTimesRef.current;
    const speedProfile =
      recordedPath.length > 1 && fixTimes.length === recordedPath.length
        ? encodeSpeedProfile(
            speedProfileFromFixes(
              storedIndices.map((i) => ({ ...recordedPath[i], t: fixTimes[i] }))
            )
          )
        : null;
    setRecordedSpeedProfile(speedProfile);

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
      const dest = destCoords();
      const estSec = estimatedDurationRef.current ?? 0;
      // Both ends are named here rather than at the four places that read the
      // row back. A drive that could not be geocoded stores its coordinates,
      // which is a fact; "Current Location" was not one.
      const start = recordedPath[0];
      const originName =
        originLabel ?? coordinateLabel(start?.latitude, start?.longitude) ?? "Unknown";
      setTripSaveError(null);
      supabase.from("trips").insert({
        user_id: user.id,
        origin_name: originName,
        origin_lat: start?.latitude ?? 0,
        origin_lng: start?.longitude ?? 0,
        destination_name: destinationStoredName,
        destination_lat: dest?.latitude ?? 0,
        destination_lng: dest?.longitude ?? 0,
        // The recorded trace, so the Drive Hub and the trip detail screen can
        // draw the drive. It was being dropped on the floor here, which is
        // why saved trips came back as stat rows with no map.
        route_polyline:
          recordedPath.length > 1
            ? encodePolyline(storedIndices.map((i) => recordedPath[i]))
            : "",
        // One whole km/h per point of the polyline above. Null on a drive too
        // short to have one; see database_migration_trip_speed_profile.sql.
        speed_profile: speedProfile,
        distance_km: sanitizeMetric(tripDistance / 1000),
        duration_seconds: sanitizeCount(actualDurationSec),
        avg_speed_kmh: sanitizeMetric(avgSpeed),
        top_speed_kmh: sanitizeMetric(tripTopSpeed),
        estimated_duration_seconds: sanitizeCount(estSec),
        xp_earned: sanitizeCount(earned),
        was_faster_than_estimation: faster,
        car_id: activeCar?.id ?? null,
        started_at: new Date(tripStartMs ?? now).toISOString(),
        completed_at: new Date(now).toISOString(),
      }).select("id").single().then(
        ({ data, error }) => {
          // A failed trip write used to be console-only, so the driver was
          // told the drive was recorded while nothing had been stored.
          if (error) setTripSaveError(describeSaveFailure(error));
          else setLastTripId((data as { id: string } | null)?.id ?? null);
        },
        (err: unknown) => setTripSaveError(describeSaveFailure(err))
      );
    }

    // Keep path visible after stopping
  }, [recordedPath, tripDistance, tripStartMs, level, addXP, user, destinationStoredName, originLabel, destCoords, currentSpeed, tripTopSpeed, xpEarned, wasFaster, activeCar]);

  useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

  // --- Map region ---
  //
  // `defaultSettings` is Mapbox's `initialRegion`: where the camera starts
  // before anything moves it. It is read once on mount, so it must not be
  // recomputed into a moving target — the GPS fix animates the camera through
  // `animateCamera` instead of re-rendering a new starting point.
  const initialCamera = useMemo(
    () => ({
      centerCoordinate: toPosition(
        userLocation ?? { latitude: -6.2088, longitude: 106.8456 }
      ),
      zoomLevel: zoomForLatitudeDelta(userLocation ? 0.01 : 0.05),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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

  // ─── TEMPORARY: promo capture ────────────────────────────
  // Delete this block together with `lib/demoDrivers.ts`.
  //
  // Folded in HERE rather than inside `useOnlineUsers` because the centre has
  // to be `userLocation`, which the screen's own location watcher fills in
  // whether or not you are sharing your position. Hanging it off the presence
  // broadcast meant nothing appeared with VISIBILITY OFF, which is the state
  // the app opens in.
  //
  // The real list still obeys the reciprocal-privacy rule below (hidden means
  // you do not see others); only the demo cast is exempt, so a capture works
  // without having to go online first.
  const [demoTick, setDemoTick] = useState(0);
  useEffect(() => {
    if (!DEMO_DRIVERS_ENABLED) return;
    const id = setInterval(() => setDemoTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  /** What the map actually draws: real drivers if visible, plus the cast. */
  const visibleDrivers = useMemo(
    () => withDemoDrivers(isUserOnline ? onlineUsers : [], userLocation),
    // `demoTick` is what re-runs this once a second so the cast moves; it is
    // unused in the body and does nothing while the flag is off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isUserOnline, onlineUsers, userLocation, demoTick]
  );

  // Nearest other online player (for the "Jason Lv.34 600m" style card)
  let nearestFriend: (OnlineUser & { dist: number }) | null = null;
  if (userLocation) {
    for (const ou of visibleDrivers) {
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
        appAlert(
          "Signalling a problem needs an account",
          "A problem signal is tied to your driver profile so others know who to help. Sign in from the banner above the tab bar, then raise it again."
        );
        return;
      }
      setProblemChooserOpen(false);
      await raiseProblem(type);
      const meta = problemMeta(type);
      appAlert(
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
        animateCamera(
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

  // The map surface is the whole screen's backdrop; every HUD panel below is
  // absolutely positioned over it. When Mapbox cannot load there is nothing to
  // put behind them but the void, which is what `styles.container` already is.
  if (!Mapbox) {
    return (
      <View style={styles.container}>
        <View style={[styles.loadingOverlay, { paddingTop: insets.top + spacing.spacingXl }]}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>
              The map isn&apos;t available in this build.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* --- Map ---
          Mapbox renders the style's own vector tiles natively, so there is no
          tile-overlay child any more and no `mapType="none"` to hide a base
          map underneath: this IS the base map. `styleURL` carries the
          light/dark choice that `customMapStyle` used to.

          The drop-pin "pick" styles are gone with it — they were Google
          style-JSON, which Mapbox does not read. The dimming they provided is
          now the drop-pin hint's own scrim, and the map stays legible while
          the driver aims at it. */}
      <Mapbox.MapView
        style={styles.map}
        styleURL={mapboxStyleUrl(mapStyleDark)}
        zoomEnabled
        scrollEnabled
        pitchEnabled
        rotateEnabled
        compassEnabled={false}
        scaleBarEnabled={false}
        // The Mapbox logo and the attribution control stay ON. They are not a
        // style choice: displaying them is a condition of Mapbox's terms for
        // apps drawing their maps, and the attribution control is also what
        // carries the OpenStreetMap credit the data itself requires. The
        // compass and scale bar are ours to remove; these two are not.
        logoEnabled
        attributionEnabled
        onPress={handleMapPress}
        onMapIdle={handlePlacesRegionChange}
      >
        <Mapbox.Camera ref={cameraRef} defaultSettings={initialCamera} />

        {/* Landmark markers — cut-corner badge + hand-drawn category glyph +
            name + distance. Always rendered, regardless of recording/online/
            party/chat state, so the map's POI layer never disappears
            mid-session.

            The category badge is filled with the category's own colour and
            the glyph drawn in `ON_CATEGORY` on top. Selected is still
            racingRed on every category, so "the one you tapped" can never be
            read as "this is a car wash". */}
        {cafes.map((poi) => {
          const isSelected = selectedDestination?.type === "cafe" && selectedDestination.data.id === poi.id;
          const Glyph = CAT_GLYPHS[poi.category];
          const isChosen = isSelected && locationChosen;
          const distLabel = userLocation
            ? fmtMeters(Math.round(haversineMeters(userLocation, { latitude: poi.lat, longitude: poi.lng })))
            : null;
          return (
            <Mapbox.MarkerView
              key={poi.id}
              coordinate={toPosition({ latitude: poi.lat, longitude: poi.lng })}
              anchor={{ x: 0.5, y: 0.37 }}
              allowOverlap
            >
              <Pressable
                onPress={() => handleCafePress(poi)}
                accessibilityRole="button"
                accessibilityLabel={poi.name}
                style={styles.poiMarkerWrap}
              >
                {/* Fixed-size box, kept from the bitmap era: the marker's outer
                    bounds stay constant across normal/selected/chosen states.
                    Mapbox renders these as live views rather than snapshots, so
                    it no longer prevents a clipped capture — but it still stops
                    the badge shoving the name label around as it grows. */}
                <View style={styles.poiBadgeBox}>
                  <CutCornerSurface
                    fill={isSelected ? colors.racingRed : CATEGORY_COLORS[poi.category]}
                    borderColor={isSelected ? colors.racingRed : alpha(colors.voidBlack, 0.55)}
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
                      color={isSelected ? onRacingRed : ON_CATEGORY}
                    />
                  </CutCornerSurface>
                </View>
                <Text style={styles.poiMarkerName} numberOfLines={1}>{poi.name}</Text>
                {distLabel && <Text style={styles.poiMarkerDist}>{distLabel}</Text>}
              </Pressable>
            </Mapbox.MarkerView>
          );
        })}

        {/* Recorded path — the trace of where the driver actually went.
            One casing plus one core, both racingRed, matching the trip-card
            trace in components/RouteLine.tsx. The old three-layer neon glow
            is gone: glow is not in the system, and three stacked polylines
            per GPS fix is three times the geometry to redraw. */}
        {recordedPath.length > 1 && (
          <>
            <MapPolyline
              id="recorded-casing"
              points={recordedPath}
              width={ROUTE_CASING_WIDTH}
              color={colors.racingRed}
              opacity={0.22}
            />
            <MapPolyline
              id="recorded-core"
              points={recordedPath}
              width={ROUTE_CORE_WIDTH}
              color={colors.racingRed}
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
                  <MapPolyline
                    id="route-remaining"
                    points={remaining}
                    width={ROUTE_CASING_WIDTH}
                    color={colors.racingRed}
                    opacity={0.28}
                  />
                )}
                {/* Traversed — solid. */}
                {traversed.length > 1 && (
                  <MapPolyline
                    id="route-traversed"
                    points={traversed}
                    width={ROUTE_CORE_WIDTH}
                    color={colors.racingRed}
                  />
                )}
              </>
            );
          }
          // No split yet — the whole route as casing plus core.
          return (
            <>
              <MapPolyline
                id="route-casing"
                points={routeInfo.coordinates}
                width={ROUTE_CASING_WIDTH}
                color={colors.racingRed}
                opacity={0.28}
              />
              <MapPolyline
                id="route-core"
                points={routeInfo.coordinates}
                width={ROUTE_CORE_WIDTH}
                color={colors.racingRed}
              />
            </>
          );
        })()}

        {/* Destination marker (when navigating) — a target reticle rather
            than a map pin, which is what every map provider's default looks
            like. Anchored on its centre because a reticle marks a point. */}
        {selectedDestination && routeInfo && destCoords() && (
          <Mapbox.MarkerView
            coordinate={toPosition(destCoords()!)}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
          >
            <View style={styles.destPin}>
              <DestinationMark size={spacing.spacingXl + spacing.spacingXs} />
            </View>
          </Mapbox.MarkerView>
        )}

        {/* Custom location marker (tapped, no route yet) */}
        {selectedDestination && selectedDestination.type === "location" && !routeInfo && (
          <Mapbox.MarkerView
            coordinate={toPosition({
              latitude: selectedDestination.lat,
              longitude: selectedDestination.lng,
            })}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
          >
            <View style={styles.customPin}>
              <DestinationMark
                size={locationChosen ? spacing.spacingXxl : spacing.spacingXl}
                color={locationChosen ? colors.racingRed : colors.textPrimary}
              />
            </View>
          </Mapbox.MarkerView>
        )}

        {/* ─── THE CONVOY'S SHARED DESTINATION ──────────────────
            The leader routed somewhere, so every member's map marks it — in
            the convoy's own colour, which is the same colour their markers
            wear, so "that flag and those rings are the same crew" needs no
            explaining.

            Suppressed when the driver's own selected destination is the same
            point (`sameConvoyDestination`), which is always true for the
            leader who just set it: two pins on one spot reads as two places. */}
        {activeConvoyDestination(convoyDestination, Date.now()) &&
          party &&
          !sameConvoyDestination(
            convoyDestination,
            destCoords() ? { lat: destCoords()!.latitude, lng: destCoords()!.longitude } : null
          ) && (
          <Mapbox.MarkerView
            coordinate={toPosition({ latitude: convoyDestination!.lat, longitude: convoyDestination!.lng })}
            anchor={{ x: 0.5, y: 1 }}
            allowOverlap
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Convoy destination: ${convoyDestination!.name}. Route there.`}
              onPress={handleFollowConvoyDestination}
              style={styles.convoyDestWrap}
            >
              <View style={[styles.convoyDestBadge, { borderColor: party.color }]}>
                <Flag size={spacing.spacingMd} color={party.color} strokeWidth={MAP_GLYPH_STROKE} />
                <Text style={styles.convoyDestLabel} numberOfLines={1}>{convoyDestination!.name}</Text>
              </View>
              <View style={[styles.convoyDestStem, { backgroundColor: party.color }]} />
            </Pressable>
          </Mapbox.MarkerView>
        )}

        {/* Online driver markers. The ring carries the driver's livery colour
            (see PLAYER_COLORS); everything else — level badge, convoy badge,
            name plate — is palette. The party ring stays thicker rather than
            brighter, because a shadow-based "glow" is not in the system. */}
        {visibleDrivers.length > 0 && visibleDrivers.map((onlineUser) => {
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
          return (
            <Mapbox.MarkerView
              key={`online-${onlineUser.user_id}`}
              coordinate={toPosition({ latitude: onlineUser.latitude, longitude: onlineUser.longitude })}
              anchor={{ x: 0.5, y: 0.36 }}
              allowOverlap
            >
              <Pressable
                onPress={() => setSelectedOnlineUser(onlineUser)}
                accessibilityRole="button"
                accessibilityLabel={`${onlineUser.name}, level ${onlineUser.level}`}
                style={styles.playerMarkerWrap}
              >
                {/* Ring box gives the badges room inside the marker bounds.
                    Under `react-native-maps` this was load-bearing — absolutely
                    positioned children with negative offsets were clipped out
                    of the marker's bitmap snapshot. Mapbox renders the view
                    live, so it is now only layout. */}
                <View style={styles.playerRingBox}>
                  {/* Outer slot precedence: distress → convoy → rank frame.
                      The first two are live operational state and have to
                      win; rank is cosmetic and yields. The inner `playerRing`
                      keeps carrying the livery colour either way, so adding
                      rank never costs the marker its identity hue.

                      Marker frames are still static — see `RankFrameRing`.
                      The original reason (Android froze the marker bitmap
                      mid-lap) no longer applies now that Mapbox renders these
                      live, but an animated frame on every driver on screen is
                      a cost the map does not need to pay. Revisit deliberately
                      rather than by accident. */}
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
                    {avatarSource(onlineUser.avatar) ? (
                      <Image
                        source={avatarSource(onlineUser.avatar)!}
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
                  {/* Distress wins the badge slot from the convoy mark: a
                      driver in trouble is more urgent than the fact they're
                      in your convoy, which the alert banner still spells out. */}
                  {problem ? (
                    <View style={styles.problemBadge}>
                      <ProblemGlyph size={spacing.spacingSm} color={onRacingRed} />
                    </View>
                  ) : isPartyMate ? (
                    <View style={[styles.partyBadge, { backgroundColor: ringColor }]}>
                      {/* The leader gets the crown, everyone else the convoy
                          mark. Worth the extra glyph: shared navigation means
                          one driver on this map decides where the convoy is
                          going, and which one that is now matters at a
                          glance. Same slot, same size — it reads as a
                          variant of the convoy badge, not a new badge. */}
                      {party && onlineUser.user_id === party.leader_id ? (
                        <Crown size={spacing.spacingSm} color={colors.voidBlack} strokeWidth={MAP_GLYPH_STROKE} />
                      ) : (
                        <Users size={spacing.spacingSm} color={colors.voidBlack} strokeWidth={MAP_GLYPH_STROKE} />
                      )}
                    </View>
                  ) : null}
                  {/* Direction of travel, pinned to the top of the ring box
                      and rotated to the driver's last reported bearing.

                      A heading of exactly 0 is treated as "no bearing yet",
                      not as due north: `useOnlineUsers` defaults a null
                      heading to 0, so every parked driver would otherwise
                      sprout a north-pointing arrow. The cost is that a
                      driver genuinely heading due north loses the chevron —
                      a 1-in-360 cosmetic miss against a wrong arrow on every
                      stationary marker on the map. */}
                  {Number.isFinite(onlineUser.heading) && onlineUser.heading > 0 ? (
                    <View
                      style={[
                        styles.playerHeading,
                        { transform: [{ rotate: `${onlineUser.heading}deg` }] },
                      ]}
                      pointerEvents="none"
                    >
                      <HeadingChevron size={10} color={ringColor} />
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.playerName, isPartyMate && !problem && { color: ringColor }]}
                  numberOfLines={1}
                >
                  {onlineUser.name}
                </Text>
                {problem ? (
                  <Text style={styles.playerProblemLabel} numberOfLines={1}>
                    {problemMeta(problem.type).label}
                  </Text>
                ) : isPartyMate && party ? (
                  // The convoy's name under a convoy-mate's marker. A ring in
                  // an arbitrary colour asks the driver to remember what that
                  // colour meant; the name doesn't.
                  <Text style={styles.playerConvoyLabel} numberOfLines={1}>
                    {party.name}
                  </Text>
                ) : null}
              </Pressable>
            </Mapbox.MarkerView>
          );
        })}

        {/* Event markers — cut-corner badge + head-count + a mini card.
            A live event is the one thing on the events layer that gets the
            accent; scheduled events stay neutral so "live" means something
            at a glance. */}
        {!isRecording && events.map((ev) => {
          const isSelected = selectedEventId === ev.id;
          const timeLabel = fmtEventTime(ev.starts_at, ev.is_live);
          const accented = ev.is_live || isSelected;
          // Events take their category colour like every other layer, with
          // one exception kept from before: a *live* event still gets the
          // accent, because "happening right now" is operational state and
          // has to beat category identity. Selected wins over both.
          const markerFill = isSelected
            ? colors.racingRed
            : CATEGORY_COLORS.events;
          const markerBorder = accented
            ? colors.racingRed
            : alpha(colors.voidBlack, 0.55);
          const glyphColor = isSelected ? onRacingRed : ON_CATEGORY;
          return (
            <Mapbox.MarkerView
              key={`event-${ev.id}`}
              coordinate={toPosition({ latitude: ev.latitude, longitude: ev.longitude })}
              anchor={{ x: 0.5, y: 0.22 }}
              allowOverlap
            >
              <Pressable
                onPress={() => setSelectedEventId(ev.id)}
                accessibilityRole="button"
                accessibilityLabel={`${ev.title}, ${timeLabel}`}
                style={styles.eventMarkerColumn}
              >
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
              </Pressable>
            </Mapbox.MarkerView>
          );
        })}

        {/* The driver's own marker — coded SVG, no bitmap asset.
            `react-native-maps` drew this `flat` on the map surface with an
            absolute `rotation={heading}`. A `MarkerView` always faces the
            viewer, so the rotation is applied here in screen space, relative
            to the map's own bearing — see `flatRotation`. While navigating the
            camera bearing tracks the driver's heading, so this resolves to
            ~0° and the car points up the screen exactly as it did. */}
        {userLocation && (
          <Mapbox.MarkerView
            coordinate={toPosition(userLocation)}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
          >
            <View style={styles.carMarkerBox}>
              <Animated.View
                style={[
                  styles.carMarker,
                  {
                    transform: [
                      { translateY: carFloat },
                      { rotate: `${flatRotation(heading)}deg` },
                    ],
                  },
                ]}
              >
                <DriverMark />
              </Animated.View>
            </View>
          </Mapbox.MarkerView>
        )}

        {/* "You · Lv." label rides in a separate marker so it stays upright */}
        {userLocation && !isRecording && (
          <Mapbox.MarkerView
            coordinate={toPosition(userLocation)}
            anchor={{ x: 0.5, y: -0.35 }}
            allowOverlap
          >
            <View style={styles.youLabelWrap}>
              <Text style={styles.youLabelName}>You</Text>
              <Text style={styles.youLabelLevel}>Lv. {level}</Text>
            </View>
          </Mapbox.MarkerView>
        )}
      </Mapbox.MapView>
      <MapboxMapStatus style={[styles.mapboxStatus, { bottom: insets.bottom + spacing.spacingXl }]} />

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

      {/* --- Landmark search progress --- */}
      {loadingCafes && !locating && !isRecording && (
        <Animated.View style={[styles.cafeLoading, { top: insets.top + LANDMARK_STATUS_OFFSET, opacity: fadeIn }]}>
          <View style={styles.statusPill}>
            <ActivityIndicator size="small" color={colors.racingRed} />
            <Text style={styles.statusPillText}>Loading landmarks nearby…</Text>
          </View>
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
                  animateCamera({ center: userLocation, heading: 0 }, { duration: 500 });
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
                <Text style={styles.speedometerValue}>{convertSpeed(currentSpeed, speedUnit).toFixed(0)}</Text>
                <Text style={styles.speedometerUnit}>{speedUnitLabel(speedUnit)}</Text>
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
              <DriveStat label="AVG" value={convertSpeed(liveAvgSpeed, speedUnit).toFixed(0)} unit={speedUnitLabel(speedUnit)} />
              <DriveStat label="MAX" value={convertSpeed(tripTopSpeed, speedUnit).toFixed(0)} unit={speedUnitLabel(speedUnit)} />
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
                  pathTimesRef.current = [];
                  setRecordedSpeedProfile(null);
                  setTripDistance(0);
                  setElapsedMs(0);
                  setXpEarned(null);
                  setSavedRouteId(null);
                  setTripSaveError(null);
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
              <DriveStat label="AVG" value={convertSpeed(avgSpeed, speedUnit).toFixed(1)} unit={speedUnitLabel(speedUnit)} />
              <View style={styles.statDivider} />
              <DriveStat label="TOP" value={convertSpeed(tripTopSpeed, speedUnit).toFixed(0)} unit={speedUnitLabel(speedUnit)} />
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

            {tripSaveError && (
              <Text style={styles.sheetErrorText} accessibilityLiveRegion="polite">
                {tripSaveError}
              </Text>
            )}

            {/* Save and Share are independent actions.
                Share used to be disabled until `savedRouteId` was set, on the
                reasoning that a drive should live on the profile before it
                goes out. That coupled the growth loop to a database write:
                any save failure — offline, session expired, route library
                full — also took sharing away, and the driver had no way to
                tell the two apart. The share card is rendered from the
                in-memory trip, so it never needed the row. Share is now
                always live; Save still flips to a locked-in "Saved" state so
                the driver can see which of the two has happened. */}
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
                onPress={() => setShowShareTrip(true)}
                style={styles.sheetPrimaryAction}
                accessibilityLabel="Share this drive"
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
      {!isRecording && !searchOpen && (
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
                  animateCamera(
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
                No landmark here matches “{searchQuery.trim()}”. Landmarks load for the area you're looking at —
                pan the map to the area you mean, then search again.
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
        </CutCornerSurface>
      )}

      {/* ===================================================== */}
      {/*   LIVE FEED — bottom-left panel                        */}
      {/* ===================================================== */}
      {hudIdle && !searchOpen && (
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
                    fitToCoordinates(
                      events.map((e) => ({ latitude: e.latitude, longitude: e.longitude })),
                      { edgePadding: { top: 140, right: 100, bottom: 320, left: 60 }, duration: 600 }
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

          {/* Same slot, two different menus. Not in a convoy: the button is
              a shortcut to browsing/creating one, same as it always was.
              In a convoy: it opens a quick menu right here instead of
              leaving the map, because "who's in my convoy" and "leave it"
              are questions a driver mid-drive shouldn't have to navigate
              away to ask. `active` borrows the same on-state
              `MapChromeButton` already uses for Filters. */}
          <MapChromeButton
            label="Convoy"
            active={!!party}
            accessibilityLabel={party ? `${party.name} — open convoy menu` : "Open convoys"}
            onPress={() =>
              party
                ? setConvoyMenuOpen(true)
                : router.push({ pathname: "/community", params: { tab: "convoy" } } as any)
            }
          >
            {party && isConvoyLeader ? (
              <Crown size={spacing.spacingLg} color={party.color} strokeWidth={CHROME_ICON_STROKE} />
            ) : (
              <Users
                size={spacing.spacingLg}
                color={party ? party.color : colors.textPrimary}
                strokeWidth={CHROME_ICON_STROKE}
              />
            )}
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
      {!isRecording && !searchOpen && distressUsers.length > 0 && (() => {
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
      {/*   CONVOY DESTINATION — the leader picked a place       */}
      {/* ===================================================== */}
      {/* Sits in the same slot as the distress banner and yields to it: a
          driver who needs help outranks knowing where the convoy is going.
          Hidden while recording for the same reason the distress banner is —
          the turn card owns the top of a driving screen.

          Not shown to the leader: they set it, they are already routed to it,
          and a banner telling them their own destination is chrome. */}
      {!isRecording && !searchOpen && distressUsers.length === 0 && party && !isConvoyLeader && (() => {
        const dest = activeConvoyDestination(convoyDestination, Date.now());
        if (!dest) return null;
        const alreadyRouted =
          navigating &&
          sameConvoyDestination(
            dest,
            destCoords() ? { lat: destCoords()!.latitude, lng: destCoords()!.longitude } : null
          );
        return (
          <View style={[styles.distressBannerSlot, { top: insets.top + spacing.spacingMd }]} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                alreadyRouted
                  ? `Following the convoy to ${dest.name}`
                  : `Route to the convoy's destination, ${dest.name}`
              }
              disabled={alreadyRouted}
              onPress={handleFollowConvoyDestination}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={party.color}
                borderWidth={borderWidth.emphasis}
                cutSize={cut.md}
                corners="topRight"
                contentStyle={styles.distressBanner}
              >
                <View style={[styles.convoyBannerBadge, { borderColor: party.color }]}>
                  <Flag size={spacing.spacingLg} color={party.color} strokeWidth={CHROME_ICON_STROKE} />
                </View>
                <View style={styles.distressTextWrap}>
                  <Text style={styles.distressTitle} numberOfLines={1}>
                    {convoyDestinationHeadline(dest, {
                      isLeader: false,
                      leaderName: convoyLeaderName,
                    })}
                  </Text>
                  <Text style={styles.distressSub} numberOfLines={1}>
                    {alreadyRouted ? `Following ${party.name}` : `${party.name} · Tap to route there`}
                  </Text>
                </View>
                {!alreadyRouted && (
                  <ChevronRight size={spacing.spacingXl} color={party.color} strokeWidth={CHROME_ICON_STROKE} />
                )}
              </CutCornerSurface>
            </Pressable>
          </View>
        );
      })()}

      {/* ===================================================== */}
      {/*   PROBLEM SIGNAL CHOOSER — pick what's wrong           */}
      {/* ===================================================== */}
      {problemChooserOpen && !isRecording && !selectedOnlineUser && (
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
      {/*   CONVOY QUICK MENU — opened from the map's Convoy button */}
      {/* ===================================================== */}
      {/* Only reachable through the button above, which only opens this
          while `party` is set — the guard on `visible` stays anyway, since
          the leader could disband from another device while this is open. */}
      <Modal
        visible={convoyMenuOpen && !!party}
        animationType="slide"
        transparent
        onRequestClose={() => setConvoyMenuOpen(false)}
      >
        <Pressable
          style={styles.privacyOverlay}
          accessibilityRole="button"
          accessibilityLabel="Close convoy menu"
          onPress={() => setConvoyMenuOpen(false)}
        >
          <Pressable style={styles.privacySheetWrap} onPress={() => {}}>
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.lg}
              corners="topRight"
              contentStyle={styles.privacySheet}
            >
              <View style={styles.privacyHeader}>
                <View style={styles.convoyMenuTitleRow}>
                  <View style={[styles.convoyMenuDot, { backgroundColor: party?.color ?? colors.racingRed }]} />
                  <Text style={styles.privacyTitle} numberOfLines={1}>{party?.name ?? "Convoy"}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={spacing.spacingSm}
                  onPress={() => setConvoyMenuOpen(false)}
                >
                  <X size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                </Pressable>
              </View>

              <Text style={styles.privacyRowSub}>
                {convoyMembers.length} driver{convoyMembers.length !== 1 ? "s" : ""} ·{" "}
                {isConvoyLeader ? "You're leading" : `Led by ${convoyLeaderName ?? "a driver"}`}
              </Text>

              <View style={styles.convoyMenuRoster}>
                {convoyMembers.slice(0, 6).map((m) => (
                  <View key={m.id} style={styles.convoyMenuRosterRow}>
                    {m.user_id === party?.leader_id ? (
                      <Crown size={spacing.spacingMd} color={party?.color ?? colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
                    ) : (
                      <View style={[styles.convoyMenuRosterDot, { backgroundColor: party?.color ?? colors.racingRed }]} />
                    )}
                    <Text style={styles.convoyMenuRosterName} numberOfLines={1}>{m.name}</Text>
                  </View>
                ))}
                {convoyMembers.length > 6 && (
                  <Text style={styles.convoyMenuRosterMore}>+{convoyMembers.length - 6} more</Text>
                )}
              </View>

              <ActionRow
                label="View & Manage Convoy"
                icon={<Users size={spacing.spacingLg} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
                onPress={() => {
                  setConvoyMenuOpen(false);
                  router.push("/convoy" as any);
                }}
              />

              <CutCornerButton
                title={isConvoyLeader ? "Disband Convoy" : "Leave Convoy"}
                variant="outline"
                corners="topRight"
                onPress={handleLeaveConvoyFromMap}
                style={styles.convoyMenuLeaveBtn}
              />
            </CutCornerSurface>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===================================================== */}
      {/*   MAP PRIVACY SHEET                                    */}
      {/* ===================================================== */}
      {/* Opened by tapping the status card's body. It answers the question
          the card raises but has no room for: what exactly is being shared,
          and with whom.

          KNOWN GAP — visibility is all-or-nothing. There is no friends-only
          or convoy-only setting, because the presence layer has no audience
          concept: `useOnlineUsers` broadcasts to one channel every signed-in
          driver subscribes to, and `user_locations` is readable by any
          authenticated user. Scoping it is a schema change (an audience
          column plus RLS on the read path), not a UI toggle, so this sheet
          states the limit plainly rather than implying a control that does
          not exist. Tracked in MAP_MARKER_REFERENCE.md §7. */}
      <Modal
        visible={privacySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPrivacySheetOpen(false)}
      >
        <Pressable
          style={styles.privacyOverlay}
          accessibilityRole="button"
          accessibilityLabel="Close privacy settings"
          onPress={() => setPrivacySheetOpen(false)}
        >
          <Pressable style={styles.privacySheetWrap} onPress={() => {}}>
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.lg}
              corners="topRight"
              contentStyle={styles.privacySheet}
            >
              <View style={styles.privacyHeader}>
                <Text style={styles.privacyTitle}>MAP PRIVACY</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={spacing.spacingSm}
                  onPress={() => setPrivacySheetOpen(false)}
                >
                  <X size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                </Pressable>
              </View>

              <View style={styles.privacyRow}>
                <VisibilityGlyph
                  visible={isUserOnline}
                  color={colors.textPrimary}
                  size={spacing.spacingLg}
                />
                <View style={styles.privacyRowText}>
                  <Text style={styles.privacyRowTitle}>
                    {isUserOnline ? "You're on the map" : "You're hidden"}
                  </Text>
                  <Text style={styles.privacyRowSub}>
                    {isUserOnline
                      ? "Every signed-in driver can see your position, your name, your level and your car — live, while the app is open."
                      : "Nobody can see your position. You can still see other drivers."}
                  </Text>
                </View>
              </View>

              <View style={styles.privacyRow}>
                <MAP_GLYPHS.driver size={spacing.spacingLg} color={colors.textPrimary} />
                <View style={styles.privacyRowText}>
                  <Text style={styles.privacyRowTitle}>Hiding other drivers is separate</Text>
                  <Text style={styles.privacyRowSub}>
                    The Drivers switch in Filters clears them off your map. It does
                    not change what they can see of you — only this does.
                  </Text>
                </View>
              </View>

              {/* Stated, not implied. A driver deciding whether to go online
                  needs to know the choice is all-or-nothing before they make
                  it, not after they go looking for a setting that isn't there. */}
              <Text style={styles.privacyNote}>
                Visibility is all-or-nothing today — there's no friends-only or
                convoy-only option yet.
              </Text>

              <CutCornerButton
                title={isUserOnline ? "Go Offline" : "Go Online"}
                variant={isUserOnline ? "primary" : "ghost"}
                corners="topRight"
                onPress={() => {
                  if (isUserOnline) goOffline();
                  else goOnline();
                  setPrivacySheetOpen(false);
                }}
              />
            </CutCornerSurface>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===================================================== */}
      {/*   ONLINE STATUS BANNER — compact, above the tab bar    */}
      {/* ===================================================== */}
      {!isRecording && !routeInfo && !selectedDestination && recordedPath.length === 0 && (() => {
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
                {/* The body opens the privacy sheet; the switch flips
                    visibility. Two targets in one card, so "what is shared?"
                    and "stop sharing" are never the same tap. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Map privacy and visibility"
                  onPress={() => setPrivacySheetOpen(true)}
                  style={({ pressed }) => [styles.onlineBannerLeft, pressed && styles.pressed]}
                >
                  <View style={styles.onlineBannerDot} />
                  <View style={styles.onlineBannerTextWrap}>
                    <Text style={styles.onlineBannerTitle}>VISIBILITY OFF</Text>
                    <Text style={styles.onlineBannerSub}>
                      Other drivers can't see you. Flip the switch to share your position.
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.visibilitySwitchTrack}
                  onPress={goOnline}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: false }}
                  accessibilityLabel="Turn visibility on"
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Map privacy and visibility"
                  onPress={() => setPrivacySheetOpen(true)}
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
                    <Text style={styles.onlineBannerTitle}>VISIBILITY ON</Text>
                    <Text style={styles.onlineBannerSub}>
                      {onlineCount > 0
                        ? `Position shared. ${onlineCount} other driver${onlineCount !== 1 ? "s" : ""} on the map now.`
                        : "Position shared. Connected to the live map."}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.visibilitySwitchTrack, styles.visibilitySwitchTrackOn]}
                  onPress={goOffline}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: true }}
                  accessibilityLabel="Turn visibility off"
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
                if (isDemoDriver(uid)) {
                  setDemoProfileUser(selectedOnlineUser);
                  setSelectedOnlineUser(null);
                  return;
                }
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
                {avatarSource(selectedOnlineUser.avatar) ? (
                  <Image source={avatarSource(selectedOnlineUser.avatar)!} style={styles.driverSheetAvatarImg} />
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
                  if (isDemoDriver(uid)) {
                    setDemoProfileUser(selectedOnlineUser);
                    setSelectedOnlineUser(null);
                    return;
                  }
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

      {/* TEMPORARY: promo capture — see the state declaration above. */}
      <DemoDriverSheet driver={demoProfileUser} onClose={() => setDemoProfileUser(null)} />

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
        // This callout prints the coordinates directly underneath, so it is
        // the one place "Dropped pin" is still an honest label while the
        // geocoder is in flight.
        const destName = destinationLabel ?? "Dropped pin";
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
                  // Until the geocoder answers (or when it cannot), the sheet
                  // says where, not what — a coordinate pair beats the word
                  // "pin" for a driver deciding whether this is the right spot.
                  const coords = destCoords();
                  const destName =
                    destinationLabel ??
                    coordinateLabel(coords?.latitude, coords?.longitude) ??
                    "your pin";
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
        speedProfile={recordedSpeedProfile}
        xpEarned={xpEarned ?? 0}
        carId={activeCar?.id ?? null}
        tripId={lastTripId}
        originName={originLabel ?? ""}
        destinationName={destinationLabel ?? ""}
        onSaved={(routeId) => setSavedRouteId(routeId)}
        speedUnit={speedUnit}
      />

      {/* --- Share the just-saved drive as a trip card --- */}
      <ShareCardModal
        visible={showShareTrip}
        onClose={() => setShowShareTrip(false)}
        type="trip"
        payload={{
          trip: {
            id: savedRouteId ?? "recorded",
            // The card renders from the in-memory trip, so it gets the
            // resolved names directly — `null` where there is none, which is
            // what ShareableCard turns into Point A / Point B.
            destination_name: destinationLabel,
            origin_name: originLabel,
            route_polyline:
              recordedPath.length > 1
                ? encodePolyline(simplifyPath(recordedPath, 400))
                : null,
            // Measured, not derived — this drive's own timings, computed when
            // recording stopped. Keeps the heatmap exact on the one card that
            // is shared straight off the road.
            speed_profile: recordedSpeedProfile,
            distance_km: tripDistance / 1000,
            duration_seconds: Math.round(elapsedMs / 1000),
            avg_speed_kmh:
              elapsedMs > 0 ? (tripDistance / 1000) / (elapsedMs / 1000 / 3600) : 0,
            top_speed_kmh: tripTopSpeed,
            xp_earned: xpEarned ?? 0,
            completed_at: new Date().toISOString(),
            car_id: activeCar?.id ?? null,
          },
          car: activeCar
            ? {
                name: activeCar.name,
                make: activeCar.make,
                model: activeCar.model,
                year: activeCar.year,
                color: activeCar.color,
                hp: activeCar.hp,
                photo_url: activeCar.photo_url,
              }
            : null,
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
// `mapLabelShadow` now lives in `constants/theme.ts` — the Places layer
// needs the same device for its marker labels, and two copies of a
// legibility rule is how they drift apart.

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidBlack,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapboxStatus: {
    position: "absolute",
    right: spacing.spacingMd,
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

  /* ---------------- Map privacy sheet ---------------- */
  privacyOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: alpha(colors.voidBlack, 0.75),
  },
  privacySheetWrap: {
    padding: spacing.spacingMd,
  },
  privacySheet: {
    padding: spacing.spacingXl,
    gap: spacing.spacingLg,
  },
  privacyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  privacyTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  privacyRow: {
    flexDirection: "row",
    gap: spacing.spacingMd,
    alignItems: "flex-start",
  },
  privacyRowText: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  privacyRowTitle: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  privacyRowSub: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  privacyNote: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingMd,
  },
  // ---- Convoy quick menu ----
  convoyMenuTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    flexShrink: 1,
  },
  convoyMenuDot: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    borderRadius: radius.circle,
  },
  convoyMenuRoster: {
    gap: spacing.spacingSm,
  },
  convoyMenuRosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  convoyMenuRosterDot: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    borderRadius: radius.circle,
  },
  convoyMenuRosterName: {
    ...textStyle("body"),
    color: colors.textPrimary,
    flexShrink: 1,
  },
  convoyMenuRosterMore: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  convoyMenuLeaveBtn: {
    marginTop: spacing.spacingXs,
  },

  /* ---------------- Filters popover ---------------- */
  filtersPopover: {
    position: "absolute",
    right: spacing.spacingXxxl + spacing.spacingXl + spacing.spacingSm,
    width: spacing.spacingXxxl * 5,
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
  sheetErrorText: {
    ...textStyle("caption"),
    color: colors.racingRed,
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
  // Pinned inside `playerRingBox`, which is 46 square. Absolutely positioned
  // children with negative offsets get clipped out of the native marker
  // snapshot, so this sits at the top edge rather than above it.
  playerHeading: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
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
  /* The convoy's name under a convoy-mate's marker. Secondary colour, not
     the convoy's — the ring, badge and driver name already carry that, and a
     fourth element in the same hue would flatten the marker. */
  playerConvoyLabel: {
    ...textStyle("caption"),
    ...mapLabelShadow,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 92,
  },

  /* ---------------- Convoy shared destination ---------------- */
  /* A flag on a stem rather than the reticle a personal destination gets:
     the convoy's destination is a place the crew is meeting at, not the
     point this driver is currently routed to, and the two can be on screen
     together. Anchored at the bottom of the stem, so the stem's foot is the
     coordinate. */
  convoyDestWrap: {
    alignItems: "center",
  },
  convoyDestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    maxWidth: 160,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.emphasis,
    backgroundColor: colors.carbonSurface,
  },
  convoyDestLabel: {
    ...textStyle("caption"),
    color: colors.textPrimary,
    flexShrink: 1,
  },
  convoyDestStem: {
    width: borderWidth.emphasis,
    height: spacing.spacingMd,
  },
  convoyBannerBadge: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.circle,
    borderWidth: borderWidth.emphasis,
    backgroundColor: colors.voidBlack,
    alignItems: "center",
    justifyContent: "center",
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
