export const THEME_TOKENS = {
  dark: {
    background: "#04070D",
    foreground: "rgba(255, 255, 255, 0.92)",
    card: "#080A0E",
    panel: "#10131C",
    layer3: "#191D2A",
    primary: "#B1D997", // Sage
    secondary: "#63A5E7", // Electric
    destructive: "#CC6B49", // Terracotta
    muted: "rgba(255, 255, 255, 0.38)",
    border: "rgba(255, 255, 255, 0.09)",
  },
  light: {
    background: "#F8FAF7",
    foreground: "rgba(4, 7, 13, 0.88)",
    card: "#FFFFFF",
    panel: "#EEF3EA",
    layer3: "#E4EBDD",
    primary: "#8FBC6A",
    secondary: "#408CD6",
    destructive: "#CC6B49",
    muted: "rgba(4, 7, 13, 0.36)",
    border: "rgba(4, 7, 13, 0.08)",
  },
} as const;

export const RADII = {
  card: "20px",
  panel: "14px",
  modal: "28px",
  xl2: "1.25rem",
} as const;

