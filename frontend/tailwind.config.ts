import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "var(--bg-void)",
        base: "var(--bg-base)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        amber: "var(--amber)",
        "amber-hi": "var(--amber-hi)",
        "amber-dim": "var(--amber-dim)",
        steel: "var(--steel)",
        "steel-dim": "var(--steel-dim)",
        danger: "var(--danger)",
        good: "var(--good)",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter-tight)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["12px", { lineHeight: "1.4" }],
        xs: ["13px", { lineHeight: "1.45" }],
        sm: ["14px", { lineHeight: "1.5" }],
        base: ["14px", { lineHeight: "1.55" }],
        md: ["16px", { lineHeight: "1.55" }],
        lg: ["20px", { lineHeight: "1.4" }],
        xl: ["25px", { lineHeight: "1.3" }],
        "2xl": ["32px", { lineHeight: "1.2" }],
        "3xl": ["44px", { lineHeight: "1.08" }],
        "4xl": ["64px", { lineHeight: "1.02" }],
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "6": "24px",
        "8": "32px",
        "12": "48px",
        "16": "64px",
        "24": "96px",
      },
      borderRadius: {
        chip: "999px",
        btn: "10px",
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.8), 0 2px 8px -4px rgba(0,0,0,0.6)",
        "card-hover":
          "0 1px 0 0 rgba(245,184,65,0.08) inset, 0 18px 48px -16px rgba(0,0,0,0.9), 0 4px 16px -6px rgba(0,0,0,0.7)",
        panel: "0 24px 64px -24px rgba(0,0,0,0.9)",
        "amber-glow": "0 0 0 1px var(--amber-dim), 0 0 24px -6px rgba(245,184,65,0.25)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        drift: {
          "0%": { transform: "translate(-2%, -1%) scale(1)" },
          "50%": { transform: "translate(3%, 2%) scale(1.08)" },
          "100%": { transform: "translate(-2%, -1%) scale(1)" },
        },
        "marquee-x": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        drift: "drift 22s ease-in-out infinite",
        marquee: "marquee-x 48s linear infinite",
      },
      transitionTimingFunction: {
        cine: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
