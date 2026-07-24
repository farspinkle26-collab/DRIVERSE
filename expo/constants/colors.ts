// Driveverse — Dark Automotive Theme
// Inspired by Forza Horizon / Need for Speed aesthetic

const driveverse = {
  // Core brand
  primary: "#FF3B30",       // Horizon red — main accent
  primaryBright: "#FF6259",
  primaryDark: "#D9291F",
  primaryLight: "#FF6259",
  primaryGlow: "#FF3B3040",

  // Secondary accents
  secondary: "#00D4AA",     // Premium teal
  secondaryLight: "#33E0C4",
  secondaryDark: "#00B894",
  accent: "#FF3B6F",        // Speed pink
  accentLight: "#FF6B8A",
  accentDark: "#E03050",
  accentTeal: "#00D4AA",
  accentGold: "#FFD700",
  accentPink: "#FF3B6F",
  accentBlue: "#3B82F6",
  accentGreen: "#22C55E",

  // Background spectrum
  background: "#0A0A0F",    // (legacy) main background
  backgroundLight: "#181823",
  backgroundDark: "#060609",
  bgDeep: "#060609",
  bgPrimary: "#0A0A0F",
  bgCard: "#12121A",
  bgElevated: "#181823",
  bgGlass: "#1A1A2E50",
  card: "#12121A",          // (legacy) card bg

  // Surface accents
  surfaceGlow: "#FF3B3008",
  surfaceBorder: "#1E1E2E",
  border: "#1E1E2E",        // (legacy)
  borderLight: "#2A2A3A",
  divider: "#1E1E2E",

  // Text
  text: "#FFFFFF",          // (legacy)
  textLight: "#8A8A9A",     // (legacy)
  textDark: "#FFFFFF",      // (legacy)
  textOnGradient: "#FFFFFF",// (legacy)
  textPrimary: "#FFFFFF",
  textSecondary: "#8A8A9A",
  textMuted: "#5A5A6E",
  textAccent: "#FF3B30",

  // Map POI colors
  poiWorkshop: "#FF3B30",
  poiCafe: "#8B5CF6",
  poiFuel: "#F59E0B",
  poiEV: "#22C55E",
  poiEvent: "#FF3B6F",
  poiScenic: "#00D4AA",
  poiCommunity: "#3B82F6",
  poiEmergency: "#EF4444",

  // Status
  success: "#22C55E",
  successLight: "#44E677",
  danger: "#EF4444",
  dangerLight: "#FF6B6B",
  warning: "#F59E0B",
  warningLight: "#F7B84D",
  info: "#3B82F6",
  infoLight: "#60A5FA",

  // Gradients (legacy)
  gradientStart: "#FF3B30",
  gradientMiddle: "#FF3B6F",
  gradientEnd: "#00D4AA",

  // Utility
  white: "#FFFFFF",
  black: "#000000",
  overlay: "rgba(0, 0, 0, 0.75)",
  overlayLight: "rgba(0, 0, 0, 0.5)",
  inactive: "#3A3A4E",
  disabled: "#2A2A3A",
  shadow: "rgba(255, 59, 48, 0.15)",
  shadowLight: "rgba(255, 59, 48, 0.08)",
  transparent: "transparent",
} as const;

type ThemeColors = { -readonly [K in keyof typeof driveverse]: string };

// Driveverse — Light theme
// Same brand accents as the dark theme, flipped onto a white/light-grey surface.
const driveverseLight: ThemeColors = {
  ...driveverse,

  // Background spectrum
  background: "#FFFFFF",
  backgroundLight: "#F5F5F7",
  backgroundDark: "#EDEDF2",
  bgDeep: "#EDEDF2",
  bgPrimary: "#FFFFFF",
  bgCard: "#FFFFFF",
  bgElevated: "#F5F5F7",
  bgGlass: "#FFFFFF80",
  card: "#FFFFFF",

  // Surface accents
  surfaceGlow: "#FF3B3008",
  surfaceBorder: "#E4E4EA",
  border: "#E4E4EA",
  borderLight: "#D5D5DE",
  divider: "#E4E4EA",

  // Text
  text: "#0A0A0F",
  textLight: "#5A5A6E",
  textDark: "#0A0A0F",
  textOnGradient: "#FFFFFF",
  textPrimary: "#0A0A0F",
  textSecondary: "#5A5A6E",
  textMuted: "#8A8A9A",
  textAccent: "#FF3B30",

  // Utility
  overlay: "rgba(0, 0, 0, 0.45)",
  overlayLight: "rgba(0, 0, 0, 0.15)",
  inactive: "#C5C5D0",
  disabled: "#E4E4EA",
};

const lightTheme = driveverseLight;
const darkTheme: ThemeColors = driveverse;

export type Theme = ThemeColors;

export { driveverse, driveverseLight, lightTheme, darkTheme };
export default driveverse;
