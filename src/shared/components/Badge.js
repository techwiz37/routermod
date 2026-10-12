"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  default: "bg-surface-2 text-text-muted border-black",
  primary: "bg-brand-500/15 text-brand-700 dark:text-brand-300 border-brand-500",
  success: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-600",
  warning: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-600",
  error: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-600",
  info: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-600",
};

const sizes = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-sm",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm font-bold uppercase tracking-wider border-2 border-black shadow-[1.5px_1.5px_0px_#000000]",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-green-500",
            variant === "warning" && "bg-yellow-500",
            variant === "error" && "bg-red-500",
            variant === "info" && "bg-blue-500",
            variant === "primary" && "bg-brand-500",
            variant === "default" && "bg-gray-500"
          )}
        />
      )}
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
