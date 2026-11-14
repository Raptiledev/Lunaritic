import type { Config } from "tailwindcss";

// Colour carries meaning: sun = Sun only, earth = Earth only, haz = hazard classes (same RGB as the backend PNGs).
// Everything else is a neutral "regolith" scale on lunar-night black.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./context/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          950: "#04060a",
          900: "#080b12",
          850: "#0c1018",
          800: "#121722",
          700: "#1a2130",
          600: "#2a3142",
          500: "#3d465a",
        },
        bone: { DEFAULT: "#efe9dc", muted: "#9e998e", faint: "#6a675f" },
        sun: { DEFAULT: "#ffb547", dim: "#a9762c", soft: "rgba(255, 181, 71, 0.14)" },
        earth: { DEFAULT: "#5aaeff", dim: "#3a6fa3", soft: "rgba(90, 174, 255, 0.14)" },
        haz: { ok: "#6fd6a0", caution: "#f2a93b", high: "#f07178", none: "#5a647d" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Consolas", "monospace"],
      },
      letterSpacing: {
        label: "0.16em",
        brand: "0.32em",
        tightish: "-0.02em",
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(236, 231, 220, 0.04), 0 18px 40px -28px rgba(0, 0, 0, 0.85)",
        "panel-hover": "0 0 0 1px rgba(236, 231, 220, 0.08), 0 22px 48px -24px rgba(0, 0, 0, 0.9)",
        "glow-sun": "0 0 24px -8px rgba(255, 181, 71, 0.45)",
        "glow-earth": "0 0 24px -8px rgba(90, 174, 255, 0.4)",
        brand: "0 0 40px -12px rgba(236, 231, 220, 0.18)",
      },
      backgroundImage: {
        "limb-wash":
          "radial-gradient(90% 55% at 50% -8%, rgba(236, 231, 220, 0.09), transparent 58%), radial-gradient(40% 30% at 12% 18%, rgba(255, 181, 71, 0.05), transparent 70%), radial-gradient(36% 28% at 88% 12%, rgba(90, 174, 255, 0.05), transparent 70%)",
        "panel-sheen":
          "linear-gradient(180deg, rgba(236, 231, 220, 0.035), transparent 42%)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.42" },
        },
        "horizon-draw": {
          from: { strokeDashoffset: "48" },
          to: { strokeDashoffset: "0" },
        },
        "star-drift": {
          from: { transform: "translate3d(0, 0, 0)" },
          to: { transform: "translate3d(-1.5%, -0.8%, 0)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "20%": { opacity: "0.35" },
          "100%": { transform: "translateY(220%)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.6s ease both",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        "horizon-draw": "horizon-draw 1.4s ease-out both",
        "star-drift": "star-drift 80s linear infinite alternate",
        "scan-line": "scan-line 5.5s ease-in-out infinite",
      },
      transitionTimingFunction: {
        outback: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
