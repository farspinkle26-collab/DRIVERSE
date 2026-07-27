/**
 * Driveverse — map category glyphs.
 *
 * Every icon that lands on the map surface is drawn here, by hand, at one
 * stroke weight. The set exists because the map was carrying three
 * different icon languages at once:
 *
 *   - lucide outline icons at `strokeWidth` 2.2 (the landmark markers),
 *   - lucide's implicit default 2 (the Places layer),
 *   - and `MapPin`, lucide's generic map-pin, standing in for the
 *     "hangout" category — a pin used as a category glyph says
 *     "somewhere", not "a place drivers hang out".
 *
 * plus a set of pre-rendered neon PNG badges whose glow was baked into
 * the bitmap and could not be restyled.
 *
 * WHY THESE ARE HAND-DRAWN
 *   The token system's register is motorsport instrumentation: straight
 *   lines, mitred joins, 45° diagonals. lucide's family is round-capped
 *   and round-joined, which is the opposite reading. Every glyph below
 *   uses `strokeLinecap="square"` and `strokeLinejoin="miter"` so the
 *   icons match the corner cut and the hairlines rather than fighting
 *   them.
 *
 * STROKE WEIGHT
 *   `MAP_GLYPH_STROKE` is 2 for every glyph, with no per-call-site
 *   overrides. Map glyphs sit on top of photographic map tiles rather
 *   than on a flat surface, so they need more weight than the 1.5 the
 *   Drive Hub pins for UI chrome (DRIVE_HUB_REFERENCE.md, D-2). Two
 *   weights, each with a rule: 2 on the map, 1.5 in the chrome.
 *
 * COLOUR
 *   Glyphs take a single `color` and inherit nothing else. Category is
 *   carried by the *shape*; state (selected, active) is carried by
 *   colour. That is what lets the marker set live inside a six-value
 *   palette instead of needing a hue per category.
 */

import React from "react";
import Svg, { Circle, Path, Polyline } from "react-native-svg";
import { colors } from "@/constants/theme";
import type { PlaceCategory } from "@/constants/placesCategories";

/** The one stroke weight for everything drawn on the map surface. */
export const MAP_GLYPH_STROKE = 2;

/** Weight for icons in the screen's chrome, matching the Drive Hub. */
export const CHROME_ICON_STROKE = 1.5;

export interface GlyphProps {
  size?: number;
  color?: string;
  /** Escape hatch for the two chrome call sites that reuse these shapes. */
  strokeWidth?: number;
}

const VIEW_BOX = "0 0 24 24";

function Glyph({
  size = 16,
  color = colors.textPrimary,
  strokeWidth = MAP_GLYPH_STROKE,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {children}
    </Svg>
  );
}

/* ------------------------------------------------------------------ *
 * The nine place categories, plus events and drivers
 * ------------------------------------------------------------------ */

/** Cafe — tapered cup, bracket handle, one steam stroke. */
export function CafeGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M4 9h13l-1.5 9h-10L4 9Z" />
      <Path d="M17 11h2.5v3.5H16.5" />
      <Path d="M10 3v3" />
    </Glyph>
  );
}

/** Food — plate seen edge-on, with a fork. Distinct from the cup at 14pt. */
export function FoodGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M3 12h11" />
      <Path d="M4 12a5.5 5.5 0 0 0 9 0" />
      <Path d="M18 3v8" />
      <Path d="M21 3v8" />
      <Path d="M19.5 11v10" />
    </Glyph>
  );
}

/** Fuel — pump body with a display slot, nozzle arm to the right. */
export function FuelGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M4 21V4h9v17" />
      <Path d="M3 21h11" />
      <Path d="M6.5 7.5h4v3h-4z" />
      <Path d="M13 10h4v9a1.5 1.5 0 0 1-3 0v-4" />
      <Path d="M17 10V6l-2.5-2.5" />
    </Glyph>
  );
}

/** Workshop — open-jaw spanner on the diagonal, plus the nut it turns. */
export function WorkshopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M9.5 3.5 7 6l2 2 2.5-2.5" />
      <Path d="M6 5a5 5 0 0 0 6.5 6.5L19 18l-2 2-6.5-6.5A5 5 0 0 0 4 7l2-2Z" />
      <Path d="M17.5 4.5h4v4h-4z" />
    </Glyph>
  );
}

/**
 * Hangout — two car roofs on a shared kerb line: the spot where drivers
 * park up together. Replaces the generic `MapPin` that stood here.
 */
export function HangoutGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M2 19h20" />
      <Path d="M3 16v-3l2-4h7l2 4v3" />
      <Path d="M14 16v-2l1.5-3H20l1 3v2" />
      <Path d="M3 13h11" />
    </Glyph>
  );
}

/** Shopping — square carrier bag with a straight handle. */
export function ShopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M4 8h16l-1.5 13h-13L4 8Z" />
      <Path d="M8.5 8V5.5a3.5 3.5 0 0 1 7 0V8" />
    </Glyph>
  );
}

/** Car wash — car roofline under three jets. */
export function WashGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M3 21h18" />
      <Path d="M4 18v-4l2.5-4h11L20 14v4" />
      <Path d="M4 14h16" />
      <Path d="M7 3v3" />
      <Path d="M12 2v4" />
      <Path d="M17 3v3" />
    </Glyph>
  );
}

/**
 * Events — a pennant on a post. The one map layer that is an occasion
 * rather than a place, so it is the only glyph without a ground line.
 */
export function EventGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M6 21V3" />
      <Path d="M6 4h13l-3 4 3 4H6" />
    </Glyph>
  );
}

/** Drivers — a car seen head-on: cabin, body, two lamps. */
export function DriverGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M3 19v-6l3-6h12l3 6v6" />
      <Path d="M3 13h18" />
      <Path d="M6 19v2" />
      <Path d="M18 19v2" />
      <Path d="M6.5 16h2" />
      <Path d="M15.5 16h2" />
    </Glyph>
  );
}

/**
 * Parking — the regulatory "P" as a plate, not a letterform.
 *
 * The one glyph in the set that is a character rather than an object,
 * because the P on a parking sign is understood everywhere and drawing a
 * car in a bay instead would collide with the driver glyph at 12pt. It is
 * built from strokes like the rest so it takes the same weight and mitred
 * joins, rather than being set in a typeface that isn't Rajdhani.
 */
export function ParkingGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M4 3h16v18H4z" />
      <Path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5" />
    </Glyph>
  );
}

/** Charging — plug body with the bolt cut through it. */
export function ChargeGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M5 21V4h9v17" />
      <Path d="M4 21h11" />
      <Path d="M14 9h4v10a1.5 1.5 0 0 1-3 0v-5" />
      <Path d="M10.5 7 7.5 12h4l-3 5" />
    </Glyph>
  );
}

/* ------------------------------------------------------------------ *
 * Non-category map marks
 * ------------------------------------------------------------------ */

/**
 * The destination mark. A pin shape is what a map-provider default looks
 * like, so the destination is a target reticle instead: two crosshairs
 * through a ring, which is also what the route line terminates in.
 */
export function DestinationMark({
  size = 28,
  color = colors.racingRed,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
      <Circle
        cx="12"
        cy="12"
        r="7"
        stroke={color}
        strokeWidth={MAP_GLYPH_STROKE}
        fill="none"
      />
      <Circle cx="12" cy="12" r="3" fill={color} />
      <Polyline
        points="12,0 12,4"
        stroke={color}
        strokeWidth={MAP_GLYPH_STROKE}
        strokeLinecap="square"
      />
      <Polyline
        points="12,20 12,24"
        stroke={color}
        strokeWidth={MAP_GLYPH_STROKE}
        strokeLinecap="square"
      />
      <Polyline
        points="0,12 4,12"
        stroke={color}
        strokeWidth={MAP_GLYPH_STROKE}
        strokeLinecap="square"
      />
      <Polyline
        points="20,12 24,12"
        stroke={color}
        strokeWidth={MAP_GLYPH_STROKE}
        strokeLinecap="square"
      />
    </Svg>
  );
}

/**
 * The driver's own position. An upward chevron inside a bearing ring —
 * the parent `Marker` supplies `rotation={heading}` and `flat`, so the
 * chevron steers with the vehicle.
 *
 * Previously a Google-blue navigation arrow (`#4285F4`), which was both
 * off-palette and borrowed another product's identity.
 */
export function DriverMark({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <Circle cx="18" cy="18" r="16" fill={colors.voidBlack} opacity={0.55} />
      <Circle
        cx="18"
        cy="18"
        r="16"
        stroke={colors.hairline}
        strokeWidth={MAP_GLYPH_STROKE}
      />
      <Path
        d="M18 7 L27 27 L18 22 L9 27 Z"
        fill={colors.racingRed}
        stroke={colors.voidBlack}
        strokeWidth={MAP_GLYPH_STROKE}
        strokeLinejoin="miter"
      />
    </Svg>
  );
}

/**
 * Direction-of-travel chevron, drawn pointing north.
 *
 * Rides on another driver's marker to say which way they are heading. The
 * caller rotates it — a wrapper the size of the marker's ring well, turned
 * by the driver's bearing, so the chevron orbits the ring rather than
 * spinning on its own centre.
 *
 * Solid rather than stroked: at 10pt on a photographic map tile a two-stroke
 * outline closes up into a smudge, and this mark has to be readable at a
 * glance from a moving car. It carries the driver's rank colour, so it is
 * also the marker's only tinted element besides the rings.
 */
export function HeadingChevron({
  size = 10,
  color = colors.textPrimary,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path
        d="M6 0.5 11 11 6 8.5 1 11Z"
        fill={color}
        stroke={colors.voidBlack}
        strokeWidth={1}
        strokeLinejoin="miter"
      />
    </Svg>
  );
}

/**
 * Visibility toggle glyph: open eye when the driver is on the map,
 * slashed when hidden.
 */
export function VisibilityGlyph({
  visible,
  color,
  size = 14,
}: {
  visible: boolean;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
      <Path
        d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        stroke={color}
        strokeWidth={MAP_GLYPH_STROKE}
        strokeLinejoin="miter"
      />
      <Circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth={MAP_GLYPH_STROKE} />
      {!visible && (
        <Path d="M3 3L21 21" stroke={color} strokeWidth={MAP_GLYPH_STROKE} strokeLinecap="square" />
      )}
    </Svg>
  );
}

/**
 * Problem signal — a warning triangle with an exclamation, drawn in the
 * same mitred register as the category glyphs. Sits on a driver's marker
 * (and in the raise-a-signal chooser) to say "this driver has a problem".
 * The triangle is the one shape on the map that means "stop and look",
 * which is exactly what a driver in distress needs from everyone near them.
 */
export function ProblemGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d="M12 3 L22 20 L2 20 Z" />
      <Path d="M12 9 V14" />
      <Path d="M12 16.5 V17.5" />
    </Glyph>
  );
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export type MapGlyphKey =
  | "cafe"
  | "food"
  | "fuel"
  | "workshop"
  | "hangout"
  | "shopping"
  | "carwash"
  | "charging"
  | "parking"
  | "event"
  | "driver";

export type MapGlyphComponent = (props: GlyphProps) => React.JSX.Element;

/**
 * Place category → glyph.
 *
 * The binding lives here rather than in `constants/placesCategories.ts`
 * because the taxonomy is data — it is shared with the Supabase edge
 * functions and must stay free of React imports so it can be unit-tested
 * and read from non-render code. The glyphs are components, and this file
 * already owns them.
 */
export const PLACE_CATEGORY_GLYPHS: Record<PlaceCategory, MapGlyphComponent> = {
  cafe: CafeGlyph,
  restaurant: FoodGlyph,
  gas_station: FuelGlyph,
  workshop: WorkshopGlyph,
  shopping: ShopGlyph,
  parking: ParkingGlyph,
  ev_charger: ChargeGlyph,
  car_wash: WashGlyph,
  // Was lucide's `MapPin` — a generic map pin standing in for a category.
  hangout: HangoutGlyph,
};

export const MAP_GLYPHS: Record<MapGlyphKey, MapGlyphComponent> = {
  cafe: CafeGlyph,
  food: FoodGlyph,
  fuel: FuelGlyph,
  workshop: WorkshopGlyph,
  hangout: HangoutGlyph,
  shopping: ShopGlyph,
  carwash: WashGlyph,
  charging: ChargeGlyph,
  parking: ParkingGlyph,
  event: EventGlyph,
  driver: DriverGlyph,
};

export default MAP_GLYPHS;
