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
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        panel: {
          DEFAULT: "var(--panel)",
          foreground: "var(--panel-foreground)",
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
        border: "var(--border)",
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
      },
      borderRadius: {
        card: "20px",
        panel: "14px",
        modal: "28px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;

