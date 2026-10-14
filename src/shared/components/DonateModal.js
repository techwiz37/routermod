"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { translate } from "@/i18n/runtime";
import PropTypes from "prop-types";

export default function DonateModal({ isOpen, onClose }) {
  const modalRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && isOpen) onClose(); };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />

      <div
        ref={modalRef}
        className="relative w-full max-w-[340px] sm:max-w-md md:max-w-lg max-h-[calc(100dvh-2rem)] bg-surface border-2 border-border rounded-xl shadow-[4px_6px_0px_var(--color-border)] animate-in fade-in zoom-in-95 duration-150 flex flex-col overflow-hidden z-10 my-auto"
      >
        <div className="flex items-center justify-between p-3.5 sm:p-4 md:p-5 border-b-2 border-border bg-surface-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-9 sm:size-10 rounded-lg bg-[var(--color-primary)]/15 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center text-[var(--color-primary)]">
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">volunteer_activism</span>
            </div>
            <div>
              <h2 className="font-mono text-sm sm:text-base font-bold text-text-main uppercase tracking-wider">
                {translate("Donate")}
              </h2>
              <p className="font-mono text-[11px] sm:text-xs text-text-muted">
                {translate("Support RouterMod development")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 sm:size-9 rounded-md border-2 border-border bg-surface text-text-muted hover:text-text-main hover:bg-surface-2 shadow-[1.5px_1.5px_0px_var(--color-border)] active:translate-y-0.5 transition-all flex items-center justify-center cursor-pointer"
            aria-label="Tutup"
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">close</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 flex flex-col items-center gap-3 sm:gap-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
          <div className="border-2 border-border rounded-xl overflow-hidden shadow-[3px_3px_0px_var(--color-border)] bg-white w-full max-w-[260px] sm:max-w-[320px] md:max-w-[360px] p-2 shrink-0">
            <img
              src="/qris-donate.jpg"
              alt="QRIS Donasi RouterMod"
              className="w-full h-auto block object-contain rounded-lg"
              draggable={false}
            />
          </div>
          <p className="text-xs sm:text-sm text-text-muted text-center font-mono shrink-0">
            {translate("Scan QR with any bank / e-wallet app")}
          </p>
        </div>

        <div className="p-3 sm:p-4 border-t-2 border-border bg-surface-2 flex items-center justify-end font-mono text-xs shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[1.5px_1.5px_0px_var(--color-border)] active:translate-y-0.5 font-bold uppercase text-xs cursor-pointer"
          >
            {translate("Close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

DonateModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
