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
      className={clsx("card metric-tile p-5 flex flex-col justify-between", className)}
      style={{ "--tile-accent": accentColor } as React.CSSProperties}
      {...props}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center p-1.5"
            style={{
              backgroundColor: `rgb(${
                accent === "blue"
                  ? "99 165 231 / 0.15"
                  : accent === "orange"
                  ? "204 107 73 / 0.15"
                  : "177 217 151 / 0.15"
              })`,
              color: accentColor,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-3xl font-bold tracking-tight text-foreground">
          {value}
        </div>
        {subtext && (
          <div className="text-[11px] text-muted-foreground">{subtext}</div>
        )}
      </div>
    </div>
  );
}
