"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "bg-[#ff1a53] hover:bg-[#e10943] text-white disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "bg-surface-2 hover:bg-surface-3 text-text-main disabled:opacity-50",
  outline: "bg-surface text-text-main hover:bg-surface-2",
  ghost: "border-transparent shadow-none hover:bg-surface-2 hover:border-border hover:shadow-[2px_2px_0px_var(--color-border)] text-text-muted hover:text-text-main",
  danger: "bg-red-500 hover:bg-red-600 text-white disabled:bg-surface-3 disabled:text-text-muted",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  sm: "h-8 px-3 text-xs rounded-lg font-mono",
  md: "h-9.5 px-4 text-xs sm:text-sm rounded-lg font-mono",
  lg: "h-11 px-6 text-sm rounded-xl font-mono",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider transition-all duration-150 ease-out cursor-pointer",
        "border-2 border-border shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] active:translate-y-0 active:shadow-[1px_1px_0px_var(--color-border)]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-[2px_2px_0px_var(--color-border)]",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className="material-symbols-outlined text-[18px]">{iconRight}</span>
      )}
    </button>
  );
}
