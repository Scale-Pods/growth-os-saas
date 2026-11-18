import React from "react";
import { clsx } from "clsx";

export function Panel({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("panel p-4", className)} {...props}>
      {children}
    </div>
  );
}
