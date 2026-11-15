import type { Config } from "tailwindcss";
// Website palette: modern, indigo and orange accents (per brief). The mobile app uses the sunrise palette.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        indigo: { 950: "#120B33", 900: "#1A1040", 800: "#271A5C", 700: "#35247A", 600: "#4B3AA8", 500: "#5E4BD1", 100: "#E9E6FB", 50: "#F4F2FD" },
        orange: { 600: "#E07B00", 500: "#F5891F", 400: "#F5A623", 100: "#FFEBD1", 50: "#FFF6EA" },
        ink: "#16112E", body: "#3E3A57", muted: "#6B6785", line: "#E4E1F0", paper: "#FBFAFF",
        teal: { 600: "#1F7A6D", 500: "#2A8C7E", 50: "#E6F4F1" }, coral: { 600: "#C93333", 500: "#E84545", 50: "#FDECEC" },
      },
      fontFamily: { display: ["var(--font-display)", "system-ui", "sans-serif"], sans: ["var(--font-body)", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(26,16,64,.06), 0 8px 24px rgba(26,16,64,.06)", lift: "0 18px 40px rgba(26,16,64,.14)" },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
} satisfies Config;
