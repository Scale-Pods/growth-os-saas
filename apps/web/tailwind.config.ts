import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "rgb(var(--accent-green-rgb) / <alpha-value>)",
          foreground: "var(--cta-text)",
        },
        secondary: {
          DEFAULT: "rgb(var(--accent-blue-rgb) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--accent-orange-rgb) / <alpha-value>)",
        },
        ctaText: "var(--cta-text)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        panel: {
          DEFAULT: "var(--panel)",
          foreground: "var(--panel-foreground)",
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
        },
        "glass-border": "var(--glass-border)",
        "border-subtle": "var(--border-subtle)",
        glass: {
          border: "var(--glass-border)",
          fill: "var(--glass-fill)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        fill: {
          primary: "var(--fill-primary)",
          secondary: "var(--fill-secondary)",
          tertiary: "var(--fill-tertiary)",
          quaternary: "var(--fill-quaternary)",
        },
        sage: {
          DEFAULT: "#B1D997",
          dark: "#8FBC6A",
        },
        electric: {
          DEFAULT: "#63A5E7",
          dark: "#408CD6",
        },
        terracotta: {
          DEFAULT: "#CC6B49",
        },
      },
      borderRadius: {
        card: "20px",
        panel: "14px",
        modal: "28px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "Instrument Serif", "Georgia", "serif"],
      },
      boxShadow: {
        glass: "var(--glass-shadow)",
        "glass-hover": "var(--glass-shadow-hover)",
      },
      backdropBlur: {
        glass: "40px",
        "glass-lg": "60px",
      },
    },
  },
  plugins: [],
};

export default config;

