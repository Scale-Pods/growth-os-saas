import React from "react";
import { clsx } from "clsx";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ children, className, hover, ...props }: CardProps) {
  return (
    <div
      className={clsx("card p-6", hover && "cursor-pointer", className)}
      data-hover={hover ? "" : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
