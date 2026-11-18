export const THEME_TOKENS = {
  dark: {
    background: "#04070D",
    card: "#080A0E",
    panel: "#10131C",
    layer3: "#191D2A",
    primary: "#B1D997", // Sage
    secondary: "#63A5E7", // Electric
    destructive: "#CC6B49", // Terracotta
    ctaText: "#0B1A08",
    foreground: "rgba(255, 255, 255, 0.92)",
    textSecondary: "rgba(255, 255, 255, 0.62)",
    muted: "rgba(255, 255, 255, 0.38)",
    textQuaternary: "rgba(255, 255, 255, 0.18)",
    border: "rgba(255, 255, 255, 0.09)",
    fillPrimary: "rgba(255, 255, 255, 0.14)",
    fillSecondary: "rgba(255, 255, 255, 0.1)",
    fillTertiary: "rgba(255, 255, 255, 0.07)",
    fillQuaternary: "rgba(255, 255, 255, 0.045)",
    glassFill: "rgba(8, 10, 14, 0.72)",
    glassFillHover: "rgba(16, 19, 28, 0.8)",
  },
  light: {
    background: "#F8FAF7",
    card: "#FFFFFF",
    panel: "#EEF3EA",
    layer3: "#E4EBDD",
    primary: "#8FBC6A",
    secondary: "#408CD6",
    destructive: "#CC6B49",
    ctaText: "#04070D",
    foreground: "rgba(4, 7, 13, 0.88)",
    textSecondary: "rgba(4, 7, 13, 0.6)",
    muted: "rgba(4, 7, 13, 0.36)",
    textQuaternary: "rgba(4, 7, 13, 0.16)",
    border: "rgba(4, 7, 13, 0.08)",
    fillPrimary: "rgba(4, 7, 13, 0.08)",
    fillSecondary: "rgba(4, 7, 13, 0.06)",
    fillTertiary: "rgba(4, 7, 13, 0.045)",
    fillQuaternary: "rgba(4, 7, 13, 0.03)",
    glassFill: "rgba(255, 255, 255, 0.72)",
    glassFillHover: "rgba(255, 255, 255, 0.88)",
  },
} as const;

export const PLATFORMS = {
  instagram: { name: "Instagram", color: "#E1306C" },
  facebook: { name: "Facebook", color: "#1877F2" },
  linkedin: { name: "LinkedIn", color: "#0A66C2" },
  youtube: { name: "YouTube", color: "#FF0000" },
  x: { name: "X", color: "#000000" },
} as const;

export const RADII = {
  card: "20px",
  panel: "14px",
  modal: "28px",
  button: "10px",
  badge: "7px",
  navItem: "9px",
} as const;
