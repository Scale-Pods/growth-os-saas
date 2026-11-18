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
        "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6",
        className
      )}
    >
      <div className="space-y-1.5">
        {badge && <div className="mb-2">{badge}</div>}
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          {title}{" "}
          {serifWord && <span className="accent-serif text-3xl md:text-4xl">{serifWord}</span>}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}
