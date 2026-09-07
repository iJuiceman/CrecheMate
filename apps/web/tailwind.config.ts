import type { Config } from "tailwindcss";

// CrecheMate palette — warm, calm, legible for a busy front desk. A friendly
// teal primary with a soft sand background and coral for medical/urgent flags.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Racqueteer's palette (the platform app), mapped onto CrecheMate's
      // existing token names so every component re-skins without edits:
      // teal = Racqueteer "court" green, coral = "clay" red, sand = "chalk".
      colors: {
        ink: "#14231F", // near-black, deep court-shadow green — primary text
        teal: {
          DEFAULT: "#2F6F62", // court green — primary accent
          dark: "#1F4A40",
          light: "#EAF2EF",
        },
        coral: "#C1443D", // clay — medical / urgent / errors
        sand: "#F4F6F5", // chalk — cool off-white page background
        line: "#DDE3E0", // court-line hairline dividers
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
