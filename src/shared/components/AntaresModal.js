"use client";

import { useEffect } from "react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";
import AntaresButton from "./AntaresButton";

/**
 * Antares modal — login-page surface (thin line, soft radius, no traffic
 * lights) instead of the neobrutalism dialog used elsewhere in the app.
 */
export default function AntaresModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  className,
  hideScrollbar = false,
}) {
  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg sm:max-w-lg",
    xl: "max-w-xl sm:max-w-xl",
    full: "max-w-2xl sm:max-w-4xl",
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="an-scope fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-2.5 md:p-4 overflow-y-auto">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-[calc(100%-1rem)] sm:w-full bg-[var(--t-card)] border border-[var(--t-line)] rounded-[14px]",
          "shadow-[0_24px_60px_rgba(0,0,0,0.55)]",
          "max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1.25rem)] md:max-h-[calc(100dvh-2rem)] flex flex-col my-auto overflow-hidden",
          sizes[size],
          hideScrollbar && "scrollbar-none",
          className
        )}
      >
        {(title || subtitle) && (
          <div className="sticky top-0 z-10 shrink-0 flex items-start justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-[var(--t-line-soft)] bg-[var(--t-card)]">
            <div className="min-w-0 flex-1">
              {title && <h2 className="break-words text-[15px] font-medium text-[var(--t-ink)] leading-tight">{title}</h2>}
              {subtitle && <div className="an-panel-sub mt-1 break-words text-xs">{subtitle}</div>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 size-8 rounded-[9px] border border-[var(--t-line)] bg-transparent text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}

        <div className={cn("p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto overscroll-contain", hideScrollbar ? "scrollbar-none" : "custom-scrollbar")}>
          {children}
        </div>

        {footer && (
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 sm:px-5 py-3 border-t border-[var(--t-line-soft)] bg-[var(--t-card)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

AntaresModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  subtitle: PropTypes.node,
  children: PropTypes.node,
  footer: PropTypes.node,
  size: PropTypes.string,
  closeOnOverlay: PropTypes.bool,
  className: PropTypes.string,
  hideScrollbar: PropTypes.bool,
};

export { AntaresButton };
