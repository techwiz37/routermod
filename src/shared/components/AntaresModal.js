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
}) {
  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-4xl",
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
    <div className="an-scope fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full bg-[var(--t-card)] border border-[var(--t-line)] rounded-[14px]",
          "shadow-[0_24px_60px_rgba(0,0,0,0.55)]",
          sizes[size],
          className
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--t-line-soft)]">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-medium text-[var(--t-ink)] leading-tight">{title}</h2>}
              {subtitle && <p className="an-panel-sub mt-1">{subtitle}</p>}
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

        <div className="p-5 max-h-[calc(85vh-120px)] overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 px-5 py-4 border-t border-[var(--t-line-soft)]">
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
  title: PropTypes.string,
  subtitle: PropTypes.string,
  children: PropTypes.node,
  footer: PropTypes.node,
  size: PropTypes.string,
  closeOnOverlay: PropTypes.bool,
  className: PropTypes.string,
};

export { AntaresButton };
