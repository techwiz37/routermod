"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

export default function DonateModal({ isOpen, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    if (isOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (isOpen) {
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-xs bg-surface border-2 border-border rounded-xl shadow-[4px_6px_0px_var(--color-border)] animate-in fade-in zoom-in-95 duration-150 z-10 overflow-hidden"
      >
        {}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b-2 border-border bg-surface-2">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg border-2 border-border bg-[#ff1a53]/10 shadow-[1.5px_1.5px_0_var(--color-border)] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px] text-[#ff1a53]">volunteer_activism</span>
            </div>
            <div>
              <p className="font-mono font-bold text-text-main text-sm uppercase tracking-wider leading-tight">Donasi</p>
              <p className="text-[10px] text-text-muted font-mono">Scan QRIS untuk support RouterMod</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-md border-2 border-border bg-surface hover:bg-surface-2 flex items-center justify-center transition-colors"
            aria-label="Tutup"
          >
            <span className="material-symbols-outlined text-[16px] text-text-muted">close</span>
          </button>
        </div>

        {}
        <div className="p-4 flex flex-col items-center gap-3">
          <div className="border-2 border-border rounded-lg overflow-hidden shadow-[2px_2px_0px_var(--color-border)] bg-white">
            <img
              src="/qris-donate.jpg"
              alt="QRIS Donasi RouterMod"
              className="w-full max-w-[240px] block"
              draggable={false}
            />
          </div>
          <p className="text-xs text-text-muted text-center font-mono">
            Scan pakai aplikasi bank / e-wallet apapun
          </p>
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
