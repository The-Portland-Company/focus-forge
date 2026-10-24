import type { Config } from "tailwindcss"

// TPC UI tokens (see app/globals.css). Colors resolve through CSS variables;
// opacity modifiers (bg-primary/10) work via color-mix.
const token = (name: string) =>
  `color-mix(in oklab, var(--${name}) calc(<alpha-value> * 100%), transparent)`

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        scrim: token("scrim"),
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        chart: {
          1: token("chart-1"),
          2: token("chart-2"),
          3: token("chart-3"),
          4: token("chart-4"),
          5: token("chart-5"),
        },
        bg: token("tpc-bg"),
        panel: token("tpc-panel"),
        ink: { DEFAULT: token("tpc-ink"), dim: token("tpc-muted") },
        line: token("tpc-line"),
        danger: { DEFAULT: token("tpc-danger"), ink: token("tpc-danger-ink") },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      transitionDuration: {
        DEFAULT: "var(--tpc-duration-fast)",
        fast: "var(--tpc-duration-fast)",
        base: "var(--tpc-duration-base)",
        slow: "var(--tpc-duration-slow)",
        slower: "var(--tpc-duration-slower)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--tpc-ease-standard)",
        standard: "var(--tpc-ease-standard)",
        emphasized: "var(--tpc-ease-emphasized)",
        exit: "var(--tpc-ease-exit)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up var(--tpc-duration-slower) var(--tpc-ease-emphasized) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
export default config
