"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * Antares button — login-page button shape (1px border, 10px radius,
 * 44px touch target on mobile) instead of the neobrutalism hard shadow.
 */
export default function AntaresButton({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  className,
  ...props
}) {
  const variants = {
    primary: "an-primary",
    ghost: "an-ghost",
    quiet: "border border-transparent bg-transparent text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)]",
  };
  const sizes = {
    sm: "h-8 px-3 text-[12px]",
    md: "h-10 px-4 text-[13px]",
    lg: "h-11 px-5 text-[14px]",
  };

  return (
    <button
      className={cn(
        "an-btn inline-flex items-center justify-center gap-2 rounded-[10px] font-medium",
        "transition-colors duration-150 disabled:opacity-55 disabled:cursor-not-allowed",
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading ? (
        <span className="material-symbols-outlined text-[16px]">{iconRight}</span>
      ) : null}
    </button>
  );
}

AntaresButton.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.string,
  size: PropTypes.string,
  icon: PropTypes.string,
  iconRight: PropTypes.string,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
};
