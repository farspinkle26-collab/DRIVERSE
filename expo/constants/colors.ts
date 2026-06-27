// Color palette for TarikAja towing app - Light and Dark themes

const lightTheme = {
  // Primary gradient colors
  primary: "#FF3532", // Fiery red
  primaryLight: "#FF6B47",
  primaryDark: "#E52B28",
  
  // Secondary gradient colors
  secondary: "#FFE3B2", // Warm cream
  secondaryLight: "#FFF0D4",
  secondaryDark: "#FFD699",
  
  // Gradient combinations
  gradientStart: "#FF3532",
  gradientMiddle: "#FF7A47",
  gradientEnd: "#FFE3B2",
  
  // Additional accent colors
  accent: "#FF8A65", // Coral orange
  accentLight: "#FFAB91",
  accentDark: "#FF5722",
  
  // Neutral colors
  background: "#FFFFFF",
  backgroundLight: "#FEFEFE",
  backgroundDark: "#F8F8F8",
  card: "#FFFFFF",
  
  // Text colors
  text: "#2D2D2D",
  textLight: "#757575",
  textDark: "#1A1A1A",
  textOnGradient: "#FFFFFF",
  
  // Border and dividers
  border: "#F0F0F0",
  borderLight: "#F8F8F8",
  divider: "#E8E8E8",
  
  // Status colors
  success: "#4CAF50",
  successLight: "#81C784",
  danger: "#F44336",
  dangerLight: "#EF5350",
  warning: "#FF9800",
  warningLight: "#FFB74D",
  info: "#2196F3",
  infoLight: "#64B5F6",
  
  // Utility colors
  shadow: "rgba(255, 53, 50, 0.15)", // Gradient shadow
  shadowLight: "rgba(255, 53, 50, 0.08)",
  overlay: "rgba(0, 0, 0, 0.5)",
  overlayLight: "rgba(0, 0, 0, 0.3)",
  inactive: "#BDBDBD",
  disabled: "#E0E0E0",
  
  // Base colors
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",
};

const darkTheme = {
  // Galaxy gradient colors - deep space theme
  primary: "#8B5FE6", // Vibrant purple from galaxy
  primaryLight: "#A478F0",
  primaryDark: "#7B4FD6",
  
  // Galaxy secondary colors
  secondary: "#4F97FE", // Cosmic blue
  secondaryLight: "#6BA7FF",
  secondaryDark: "#3F87EE",
  
  // Galaxy gradient combinations - cosmic depth
  gradientStart: "#1A0B2E", // Deep space purple
  gradientMiddle: "#2D1B69", // Galaxy purple-blue
  gradientEnd: "#4F97FE", // Cosmic blue
  
  // Galaxy accent colors
  accent: "#E91E63", // Pink nebula accent
  accentLight: "#F06292",
  accentDark: "#C2185B",
  
  // Dark space backgrounds
  background: "#0B0B14", // Deep space background
  backgroundLight: "#141420", // Lighter space
  backgroundDark: "#060609", // Deepest space
  card: "#1C1C2E", // Space card background with subtle blue tint
  
  // Galaxy text colors
  text: "#E8E8F0", // Starlight text
  textLight: "#A8A8C0", // Muted starlight
  textDark: "#FFFFFF", // Pure white for emphasis
  textOnGradient: "#FFFFFF",
  
  // Space borders and dividers
  border: "#2A2A40", // Subtle space border
  borderLight: "#1F1F35",
  divider: "#2A2A40",
  
  // Status colors (galaxy themed)
  success: "#00E676", // Bright green like distant star
  successLight: "#69F0AE",
  danger: "#FF5252", // Red giant star
  dangerLight: "#FF8A80",
  warning: "#FFD740", // Yellow star
  warningLight: "#FFECB3",
  info: "#40C4FF", // Blue star
  infoLight: "#84FFFF",
  
  // Galaxy utility colors
  shadow: "rgba(139, 95, 230, 0.3)", // Purple nebula shadow
  shadowLight: "rgba(139, 95, 230, 0.15)",
  overlay: "rgba(0, 0, 0, 0.8)", // Deep space overlay
  overlayLight: "rgba(0, 0, 0, 0.6)",
  inactive: "#4A4A60", // Dim star
  disabled: "#2A2A40", // Dead star
  
  // Base colors
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",
};

export { lightTheme, darkTheme };
export default lightTheme;