import React from "react";
import { clsx } from "clsx";

interface PageHeaderProps {
  title: string;
  serifWord?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  serifWord,
  subtitle,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={clsx(
        "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/40",
        className
      )}
    >
      <div className="space-y-2">
        {badge && <div className="mb-2.5 inline-block">{badge}</div>}
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
          {title}{" "}
          {serifWord && (
            <span className="accent-serif text-3xl md:text-4xl lg:text-5xl ml-1 text-primary drop-shadow-[0_2px_16px_rgba(var(--accent-green-rgb)/0.25)]">
              {serifWord}
            </span>
          )}
        </h1>
        {subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground max-w-2xl leading-relaxed font-normal">
            {subtitle}
          </p>
        )}
      </div>

      {actions && <div className="flex items-center gap-3 flex-shrink-0 pt-1 md:pt-0">{actions}</div>}
    </div>
  );
}
