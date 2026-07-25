import type { Config } from "tailwindcss";

// Palette roles come from the validated data-viz reference palette (dark mode).
// Kept as CSS custom properties in globals.css; Tailwind maps a few semantic
// tokens onto them so utility classes stay readable.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          plane: "#0d0d0d",
          1: "#1a1a19",
          2: "#232322",
        },
        ink: {
          primary: "#ffffff",
          secondary: "#c3c2b7",
          muted: "#898781",
        },
        hairline: "#2c2c2a",
        baseline: "#383835",
        series: {
          1: "#3987e5",
          2: "#d95926",
          3: "#199e70",
          4: "#c98500",
          5: "#d55181",
          6: "#008300",
          7: "#9085e9",
          8: "#e66767",
        },
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
