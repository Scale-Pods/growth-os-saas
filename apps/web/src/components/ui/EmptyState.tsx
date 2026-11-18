import React from "react";
import { clsx } from "clsx";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "panel p-8 text-center flex flex-col items-center justify-center space-y-3",
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-fill-tertiary flex items-center justify-center text-muted-foreground border border-glass-border">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
