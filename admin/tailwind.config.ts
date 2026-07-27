import type { Config } from "tailwindcss";

// Palette roles: red-and-black house theme, kept as CSS custom properties in
// globals.css; Tailwind maps a few semantic tokens onto them so utility
// classes stay readable. Chart series stay hue-varied within red/amber/rose
// so multi-series charts are still distinguishable.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          plane: "#090707",
          1: "#160b0b",
          2: "#221010",
        },
        ink: {
          primary: "#ffffff",
          secondary: "#d9c7c5",
          muted: "#9c8482",
        },
        hairline: "#3a1414",
        baseline: "#4a1a1a",
        series: {
          1: "#e0263a",
          2: "#ff6a3d",
          3: "#c9184a",
          4: "#f2a900",
          5: "#8f0f2a",
          6: "#ff9d8a",
          7: "#7a1220",
          8: "#c94b4b",
        },
        status: {
          good: "#2e9e4f",
          warning: "#f2a900",
          serious: "#ff6a3d",
          critical: "#e0263a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
