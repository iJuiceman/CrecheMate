import type { Config } from "tailwindcss";

// CrecheMate palette — warm, calm, legible for a busy front desk. A friendly
// teal primary with a soft sand background and coral for medical/urgent flags.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Racqueteer's LIVE palette, mapped onto CrecheMate's existing token
      // names so every component re-skins without edits. The live sites brand
      // primaryColor #B00020 (deep red); light/dark are derived the same way
      // Racqueteer's applyTheme does (90% toward white / 30% toward black).
      // coral = Racqueteer "clay" errors, sand = "chalk", line/ink fixed.
      colors: {
        ink: "#14231F", // near-black — primary text (fixed on Racqueteer)
        teal: {
          DEFAULT: "#B00020", // Racqueteer brand red — primary accent
          dark: "#7B0016",
          light: "#F7E6E9",
        },
        coral: "#C1443D", // clay — medical / urgent / errors
        sand: "#F4F6F5", // chalk — cool off-white page background
        line: "#DDE3E0", // hairline dividers
      },
      fontFamily: {
        display: ["ui-rounded", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "0.9rem",
      },
    },
  },
  plugins: [],
};
export default config;
