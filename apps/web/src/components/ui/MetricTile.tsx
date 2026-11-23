import React from "react";
import { clsx } from "clsx";

interface MetricTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  accent?: "green" | "blue" | "orange";
  subtext?: string;
}

export function MetricTile({
  label,
  value,
  icon,
  accent = "green",
  subtext,
  className,
  ...props
}: MetricTileProps) {
  const accentColor =
    accent === "blue"
      ? "var(--accent-blue)"
      : accent === "orange"
      ? "var(--accent-orange)"
      : "var(--accent-green)";

  return (
    <div
      className={clsx("card metric-tile p-5 md:p-6 flex flex-col justify-between hover:border-primary/40 transition-all", className)}
      style={{ "--tile-accent": accentColor } as React.CSSProperties}
      {...props}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90">
          {label}
        </span>
        {icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center p-2 border shadow-sm transition-transform group-hover:scale-105"
            style={{
              backgroundColor: `rgb(${
                accent === "blue"
                  ? "99 165 231 / 0.15"
                  : accent === "orange"
                  ? "204 107 73 / 0.15"
                  : "177 217 151 / 0.15"
              })`,
              borderColor: `rgb(${
                accent === "blue"
                  ? "99 165 231 / 0.3"
                  : accent === "orange"
                  ? "204 107 73 / 0.3"
                  : "177 217 151 / 0.3"
              })`,
              color: accentColor,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground font-mono tabular-nums">
          {value}
        </div>
        {subtext && (
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}
