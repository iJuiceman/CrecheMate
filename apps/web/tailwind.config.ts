import type { Config } from "tailwindcss";

// CrecheMate palette — warm, calm, legible for a busy front desk. A friendly
// teal primary with a soft sand background and coral for medical/urgent flags.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933", // primary text — soft near-black
        teal: {
          DEFAULT: "#0d9488",
          dark: "#0f766e",
          light: "#ccfbf1",
        },
        coral: "#e11d48", // medical / urgent
        sand: "#faf7f2", // page background
        line: "#e7e0d6",
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
