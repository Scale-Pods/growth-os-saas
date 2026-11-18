import React from "react";
import { clsx } from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  loading,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const baseClass = variant === "ghost" ? "btn-ghost" : "btn-primary";

  return (
    <button
      disabled={disabled || loading}
      className={clsx(baseClass, className)}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
