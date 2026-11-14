"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

const VARIANTS = {
  info: {
    accent: "bg-[var(--color-primary)]",
    iconWrap: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    icon: "info",
  },
  warning: {
    accent: "bg-amber-500",
    iconWrap: "bg-amber-500/10 text-amber-500",
    icon: "warning",
  },
  danger: {
    accent: "bg-[var(--color-danger)]",
    iconWrap: "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
    icon: "error",
  },
  success: {
    accent: "bg-[var(--color-success)]",
    iconWrap: "bg-[var(--color-success)]/10 text-[var(--color-success)]",
    icon: "check_circle",
  },
};

/**
 * In-page alert used across provider pages. One visual language for provider
 * notices, deprecation warnings, and connection/model errors.
 */
export default function ProviderAlert({
  variant = "info",
  title,
  children,
  action,
  className,
}) {
  const style = VARIANTS[variant] || VARIANTS.info;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/60 bg-surface-2/60 px-4 py-3.5",
        className
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", style.accent)} aria-hidden />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          {title ? (
            <div className="flex items-center gap-2">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", style.iconWrap)}>
                <span className="material-symbols-outlined text-[15px]">{style.icon}</span>
              </span>
              <p className="text-[13px] font-semibold text-text-main">{title}</p>
            </div>
          ) : null}
          <div className={cn("text-xs leading-relaxed text-text-muted", title && "mt-1.5", "break-words")}>
            {children}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

ProviderAlert.propTypes = {
  variant: PropTypes.oneOf(["info", "warning", "danger", "success"]),
  title: PropTypes.node,
  children: PropTypes.node,
  action: PropTypes.node,
  className: PropTypes.string,
};
