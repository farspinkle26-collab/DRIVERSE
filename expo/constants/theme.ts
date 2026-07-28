/**
 * Driveverse — Design Tokens
 *
 * The single source of truth for colour, type, spacing and shape.
 * Screens should import from here rather than hardcoding values.
 *
 * Visual direction: motorsport / telemetry. Precise, angular, technical.
 * Deliberately NOT: rounded-everything, gradient washes, glassmorphism,
 * pastel accents. Separation comes from 1px hairlines and surface steps,
 * not from drop shadows.
 *
 * NOTE: this file is additive. `constants/colors.ts` (the legacy orange
 * `driveverse` palette consumed via `useTheme()`) is still live and is not
 * touched by this phase. See DESIGN_SYSTEM_AUDIT.md for the migration scope.
 */

import { Platform, TextStyle, ViewStyle } from "react-native";

/* ------------------------------------------------------------------ *
 * COLOUR
 * ------------------------------------------------------------------ */

/**
 * The palette is exactly six values. Resist growing it — every extra hue
 * is one more thing that makes the app read as generic.
 *
 * `racingRed` is an accent, not a theme colour. If it lands on every icon
 * and every button it stops reading as an accent. Rule of thumb: at most
 * one red element in a viewport competing for attention (the primary
 * action, the active tab, or the live route — not all three).
 */
export const colors = {
  /** Primary brand accent, matches the logo. Primary actions, active
   *  states, route/XP accent. Use sparingly. */
  racingRed: "#FF2E37",
  /** App background. */
  voidBlack: "#0B0C10",
  /** Elevated surfaces: cards, sheets, nav bar. */
  carbonSurface: "#17181D",
  /** 1px borders and dividers — used instead of drop shadows. */
  hairline: "#26272E",
  textPrimary: "#F2F3F5",
  /** Meta text, timestamps, captions. */
  textSecondary: "#8A8C96",
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Foreground for content sitting on top of `racingRed`.
 * voidBlack-on-red is 5.3:1 (passes WCAG AA for body text);
 * textPrimary-on-red is only 3.3:1 (large text only). Default to black.
 */
export const onRacingRed = colors.voidBlack;

/**
 * Returns a palette colour at partial opacity, for pressed states and
 * subtle accent fills. Prefer this over inventing new hex values.
 *
 *   alpha(colors.racingRed, 0.12)  // "#FF2E371F"
 */
export function alpha(color: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  const hex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${color}${hex}`;
}

/* ------------------------------------------------------------------ *
 * TYPOGRAPHY
 * ------------------------------------------------------------------ */

/**
 * Three families, three jobs. Mixing them up is what makes an app look
 * templated, so the split is strict:
 *
 *   Rajdhani       — display. Screen titles, section headers, card headers.
 *                    Condensed and technical; reads as signage, not prose.
 *   Inter          — anything read at length. Body copy, chat messages,
 *                    form labels, descriptions.
 *   JetBrains Mono — every number that represents a measurement. Speed,
 *                    distance, duration, XP, coordinates, timestamps.
 *                    Tabular and deliberate — numbers should feel measured,
 *                    not decorative.
 *
 * Weight is encoded in the family name, which is how React Native loads
 * single-weight faces. Do NOT pair these families with a `fontWeight` style
 * prop: on Android that triggers a second, synthetic bold on top of an
 * already-bold face. Each scale token exposes the weight it carries as
 * `weight` (metadata) instead.
 */
export const fontFamily = {
  displayBold: "Rajdhani_700Bold",
  displaySemiBold: "Rajdhani_600SemiBold",
  bodyRegular: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  dataRegular: "JetBrainsMono_400Regular",
  dataMedium: "JetBrainsMono_500Medium",
  dataBold: "JetBrainsMono_700Bold",
} as const;

export type FontFamilyToken = keyof typeof fontFamily;

/** The full set of font assets, as expo-font expects them. */
export const fontAssets = {
  Rajdhani_600SemiBold: require("@/assets/fonts/Rajdhani_600SemiBold.ttf"),
  Rajdhani_700Bold: require("@/assets/fonts/Rajdhani_700Bold.ttf"),
  Inter_400Regular: require("@/assets/fonts/Inter_400Regular.ttf"),
  Inter_500Medium: require("@/assets/fonts/Inter_500Medium.ttf"),
  Inter_600SemiBold: require("@/assets/fonts/Inter_600SemiBold.ttf"),
  JetBrainsMono_400Regular: require("@/assets/fonts/JetBrainsMono_400Regular.ttf"),
  JetBrainsMono_500Medium: require("@/assets/fonts/JetBrainsMono_500Medium.ttf"),
  JetBrainsMono_700Bold: require("@/assets/fonts/JetBrainsMono_700Bold.ttf"),
};

type ScaleToken = TextStyle & {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  /** Weight carried by the font face. Metadata — never spread as a style. */
  weight: 400 | 500 | 600 | 700;
};

/**
 * The type scale. Six roles, no in-between sizes — if something needs to
 * sit between `displayMd` and `body`, it almost certainly wants one of
 * them plus a colour change.
 *
 * Display tokens carry positive tracking because Rajdhani is condensed and
 * tightens badly at title sizes; data tokens carry negative tracking
 * because JetBrains Mono's advance width is generous for big readouts.
 */
export const type = {
  /** Screen titles. Intended to be set in UPPERCASE. */
  displayXl: {
    fontFamily: fontFamily.displayBold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: 0.6,
    weight: 700,
  },
  /** Section headers and card headers. Also reads well uppercased. */
  displayMd: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0.4,
    weight: 600,
  },
  /** Body copy, chat messages, form labels. */
  body: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
    weight: 400,
  },
  /** Meta text, timestamps, helper text. Pair with `textSecondary`. */
  caption: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.2,
    weight: 400,
  },
  /** Hero readouts: current speed, trip distance, total XP. */
  dataLg: {
    fontFamily: fontFamily.dataBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    weight: 700,
  },
  /** Inline numerics: stat rows, list metadata, coordinates. */
  dataSm: {
    fontFamily: fontFamily.dataMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
    weight: 500,
  },
} as const satisfies Record<string, ScaleToken>;

export type TypeToken = keyof typeof type;

/**
 * Spreads a scale token as a style, dropping the `weight` metadata.
 *
 *   <Text style={textStyle("dataLg")}>{speed}</Text>
 *   <Text style={[textStyle("caption"), { color: colors.textSecondary }]}>
 */
export function textStyle(token: TypeToken, overrides?: TextStyle): TextStyle {
  const { weight: _weight, ...style } = type[token];
  return overrides ? { ...style, ...overrides } : { ...style };
}

/* ------------------------------------------------------------------ *
 * SPACING
 * ------------------------------------------------------------------ */

/**
 * A 4pt scale. Every padding, margin and gap should be one of these
 * seven values — no 5s, 6s, 10s, 14s or 18s.
 */
export const spacing = {
  spacingXs: 4,
  spacingSm: 8,
  spacingMd: 12,
  spacingLg: 16,
  spacingXl: 24,
  spacingXxl: 32,
  /** Extends the named range to complete the 7-step scale (48px). */
  spacingXxxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

export const {
  spacingXs,
  spacingSm,
  spacingMd,
  spacingLg,
  spacingXl,
  spacingXxl,
  spacingXxxl,
} = spacing;

/* ------------------------------------------------------------------ *
 * SHAPE
 * ------------------------------------------------------------------ */

/**
 * Corner policy:
 *
 *   Brand surfaces  — primary buttons, feature cards, badges, sheets:
 *                     angular corner cut (see components/CutCorner.tsx).
 *   Utility surfaces— text inputs, small icon buttons, chips, list rows:
 *                     `radius.sharp` (4) or `radius.none` (0). Plain rects.
 *
 * There is no "pill" or "rounded" token on purpose. Fully-rounded corners
 * are the single strongest signal of a default-template UI, and the logo's
 * geometry is diagonal, not circular. `radius.circle` exists only for
 * genuinely circular things — avatars.
 */
export const radius = {
  none: 0,
  sharp: 4,
  /** Avatars and other true circles only. */
  circle: 999,
} as const;

/**
 * Size of the 45° corner cut, in points. Matches the diagonal of the
 * logo's speed-swoosh. Keep within 12–16 — larger reads as a broken
 * layout, smaller reads as an accident.
 */
export const cut = {
  sm: 12,
  md: 14,
  lg: 16,
} as const;

export type CutSize = keyof typeof cut;

export const borderWidth = {
  hairline: 1,
  emphasis: 2,
} as const;

/** Ready-made 1px separator style. Use instead of a drop shadow. */
export const hairlineBorder: ViewStyle = {
  borderWidth: borderWidth.hairline,
  borderColor: colors.hairline,
};

export const hairlineDivider: ViewStyle = {
  height: borderWidth.hairline,
  backgroundColor: colors.hairline,
};

/**
 * Elevation is expressed as a surface step plus a hairline, never as a
 * shadow. Included so screens have something concrete to migrate their
 * `shadowColor` / `elevation` blocks onto.
 */
export const surface = {
  base: { backgroundColor: colors.voidBlack } as ViewStyle,
  raised: {
    backgroundColor: colors.carbonSurface,
    ...hairlineBorder,
  } as ViewStyle,
} as const;

/**
 * Text drawn directly on map tiles.
 *
 * The one sanctioned `textShadow` in the app, and the only exception to
 * "separation comes from hairlines, not shadows". Marker names and
 * distances have no surface behind them and disappear entirely over light
 * tiles, which the map's light/dark tile toggle makes reachable in one tap.
 * This is a legibility device, not an elevation one — see
 * MAP_SCREEN_REFERENCE.md D-6.
 *
 * Do not use it for text on a `carbonSurface`. If there is a surface, the
 * surface is the separation.
 */
export const mapLabelShadow = {
  textShadowColor: alpha(colors.voidBlack, 0.9),
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

/* ------------------------------------------------------------------ *
 * MOTION
 * ------------------------------------------------------------------ */

/** Short and mechanical. Nothing should bounce. */
export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/* ------------------------------------------------------------------ *
 * PLATFORM
 * ------------------------------------------------------------------ */

export const isWeb = Platform.OS === "web";

const theme = {
  colors,
  onRacingRed,
  fontFamily,
  fontAssets,
  type,
  spacing,
  radius,
  cut,
  borderWidth,
  hairlineBorder,
  hairlineDivider,
  surface,
  duration,
} as const;

export type Theme = typeof theme;

export default theme;
