"use client";

import { useEffect } from "react";
import { cn } from "@/shared/utils/cn";
import Button from "./Button";
import Tooltip from "./Tooltip";
import AntaresModal from "./AntaresModal";
import { SurfaceSkinContext } from "./SurfaceSkinContext";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  showTrafficLights = true,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] fade-in"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      {/* Modal content */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        className={cn(
          "relative flex w-full flex-col bg-surface",
          "max-h-[calc(100dvh-1.5rem)]",
          "border-3 border-black",
          "rounded shadow-[8px_8px_0px_#000000]",
          "fade-in",
          sizes[size],
          className
        )}
      >
        {/* Header */}
        {(title || showTrafficLights) && (
          <div className="flex items-center justify-between gap-2 p-3 border-b-2 border-black bg-bg-alt sm:p-4">
            <div className="flex min-w-0 items-center">
              {/* Traffic lights — desktop only */}
              {showTrafficLights && (
                <div className="hidden md:flex items-center gap-2 mr-4 ml-2">
                  <Tooltip text="Close" position="top" color="#FF5F56">
                    <button
                      onClick={onClose}
                      aria-label="Close"
                      title="Close"
                      className="w-4 h-4 rounded-full border border-black bg-[#FF5F56] hover:brightness-90 transition-all cursor-pointer flex items-center justify-center group/dot shadow-[1px_1px_0px_#000000]"
                    >
                      <span className="text-[9px] font-bold text-white opacity-0 group-hover/dot:opacity-100 transition-opacity leading-none">✕</span>
                    </button>
                  </Tooltip>
                  <div className="w-4 h-4 rounded-full border border-black bg-[#FFBD2E] shadow-[1px_1px_0px_#000000]" />
                  <div className="w-4 h-4 rounded-full border border-black bg-[#27C93F] shadow-[1px_1px_0px_#000000]" />
                </div>
              )}
              {title && (
                <h2 className="break-words text-sm font-bold uppercase tracking-wider text-text-main sm:text-base">{title}</h2>
              )}
            </div>
            {/* X button — mobile only */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="md:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border-2 border-black bg-surface text-text-muted hover:text-text-main shadow-[2px_2px_0px_#000000] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 border-t-2 border-black bg-bg-alt">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}) {
  return (
    <AntaresModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      hideScrollbar
      footer={
        <SurfaceSkinContext.Provider value="antares">
          <div className="flex w-full gap-2">
            <Button skin="antares" variant="ghost" onClick={onClose} disabled={loading} fullWidth>
              {cancelText}
            </Button>
            <Button skin="antares" variant={variant} onClick={onConfirm} loading={loading} fullWidth>
              {confirmText}
            </Button>
          </div>
        </SurfaceSkinContext.Provider>
      }
    >
      <SurfaceSkinContext.Provider value="antares">
        <p className="text-sm text-[var(--t-muted)]">{message}</p>
      </SurfaceSkinContext.Provider>
    </AntaresModal>
  );
}
