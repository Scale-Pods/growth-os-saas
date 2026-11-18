import React from "react";
import { clsx } from "clsx";

export type BadgeTone = "green" | "blue" | "orange" | "grey";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({
  children,
  tone = "green",
  className,
  ...props
}: BadgeProps) {
  const toneClass =
    tone === "blue"
      ? "badge-blue"
      : tone === "orange"
      ? "badge-orange"
      : tone === "grey"
      ? "badge-grey"
      : "badge";

  return (
    <span className={clsx(toneClass, className)} {...props}>
      {children}
    </span>
  );
}
