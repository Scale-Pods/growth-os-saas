import React from "react";
import { clsx } from "clsx";

export type SocialPlatform = "instagram" | "facebook" | "linkedin" | "youtube" | "x";

interface PlatformBadgeProps {
  platform: SocialPlatform | string;
  size?: "sm" | "md";
  className?: string;
}

const PLATFORM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  instagram: { bg: "#E1306C18", text: "#E1306C", label: "Instagram" },
  facebook: { bg: "#1877F218", text: "#1877F2", label: "Facebook" },
  linkedin: { bg: "#0A66C218", text: "#0A66C2", label: "LinkedIn" },
  youtube: { bg: "#FF000018", text: "#FF0000", label: "YouTube" },
  x: { bg: "#FFFFFF18", text: "var(--text-primary)", label: "X (Twitter)" },
};

export function PlatformBadge({ platform, size = "sm", className }: PlatformBadgeProps) {
  const meta = PLATFORM_COLORS[platform.toLowerCase()] || {
    bg: "var(--fill-tertiary)",
    text: "var(--text-secondary)",
    label: platform,
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 font-semibold rounded-md uppercase tracking-wider",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className
      )}
      style={{ backgroundColor: meta.bg, color: meta.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.text }} />
      {meta.label}
    </span>
  );
}
