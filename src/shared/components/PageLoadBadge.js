"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Skeleton } from "./Loading";
import Soft3DLogo from "./Soft3DLogo";
import StarField from "./StarField";
import { usePageReadyState } from "./PageReadyContext";

export default function PageLoadBadge({ variant = "default" }) {
  const antares = variant === "antares";
  const [info, setInfo] = useState(null);
  const [visible, setVisible] = useState(false);
  const startRef = useRef(null);
  const pathname = usePathname();

  // State untuk menampung apakah seluruh konten sudah siap
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    startRef.current = performance.now();
    setInfo(null);
    setVisible(false);
    setIsLoaded(false);
    setIsHydrated(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const ms = Math.round(performance.now() - (startRef.current ?? performance.now()));
      const label = ms < 500 ? "fast" : ms < 1500 ? "ok" : ms < 4000 ? "slow" : "very slow";
      const color = ms < 500 ? "#22c55e" : ms < 1500 ? "#f59e0b" : ms < 4000 ? "#f97316" : "#ef4444";
      setInfo({ ms, label, color });
      setVisible(true);
    };

    let measured = false;
    const done = () => {
      if (measured) return;
      measured = true;
      requestAnimationFrame(() => requestAnimationFrame(measure));
    };

    if (document.readyState === "complete") {
      if ("requestIdleCallback" in window) {
        const id = requestIdleCallback(done, { timeout: 3000 });
        return () => { cancelled = true; cancelIdleCallback(id); }
      }
      const t = setTimeout(done, 200);
      return () => { cancelled = true; clearTimeout(t); }
    }

    window.addEventListener("load", done, { once: true });
    const fallback = "requestIdleCallback" in window
      ? (() => { const id = requestIdleCallback(done, { timeout: 5000 }); return () => cancelIdleCallback(id); })()
      : (() => { const t = setTimeout(done, 3000); return () => clearTimeout(t); })();

    return () => {
      cancelled = true;
      window.removeEventListener("load", done);
      fallback();
    };
  }, [pathname]);

  useEffect(() => {
    // Set isHydrated ketika isi sudah ter-render dan hydrated
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    // Set isLoaded setelah semua content ter-load dan hydrated
    if (isHydrated) {
      setIsLoaded(true);
    }
  }, [isHydrated]);

  // Fungsi untuk menyembunyikan preloader dan menampilkan konten
  useEffect(() => {
    if (isLoaded) {
      const hidePreloader = () => {
        setVisible(false);
        setIsLoaded(false); // Reset untuk halaman berikutnya
      };

      // Tunggu sebentar untuk memastikan animasi terlihat
      const timer = setTimeout(hidePreloader, 500);
      
      // Cleanup jika user navigate keluar
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  if (!info) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 9999,
        transition: "opacity 0.4s, transform 0.4s",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: antares ? "6px 12px" : "5px 10px",
          borderRadius: antares ? "999px" : "8px",
          border: antares ? "1px solid rgba(255,255,255,0.09)" : `1.5px solid ${info.color}40`,
          background: antares
            ? "rgba(14,16,19,0.82)"
            : `color-mix(in srgb, ${info.color} 10%, var(--color-surface-2, #f4f5f8))`,
          backdropFilter: antares ? "blur(10px)" : "none",
          boxShadow: antares ? "0 8px 24px -12px rgba(0,0,0,0.6)" : `2px 2px 0px ${info.color}30`,
          fontFamily: "monospace",
          fontSize: "11px",
          color: info.color,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "13px" }}>⚡</span>
        <span style={{ fontWeight: 700 }}>{info.ms}ms</span>
        <span style={{ opacity: 0.7 }}>· {info.label}</span>
      </div>
    </div>
  );
}

// Export komponen preloader utama yang akan menutup saat selesai
export function PagePreloader({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const pathname = usePathname();
  const ready = usePageReadyState();
  const pendingCount = ready?.pendingCount ?? 0;

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Close once the page is actually usable: hydrated, no page still fetching,
  // and the first paint of the real content has landed. Two rAFs give the
  // browser a frame to paint the children before the overlay is removed, so
  // there is no flash of an empty shell. The overlay is intentionally only
  // used for the first load; blocking every client-side navigation makes the
  // dev server feel slow and hides already-rendered page content.
  useEffect(() => {
    if (!isLoading || !hasHydrated) return;
    if (pendingCount > 0) return;
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) setIsLoading(false);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [isLoading, hasHydrated, pathname, pendingCount]);

  return (
    <div style={{ minHeight: "100%" }}>
      {isLoading ? (
        <div
          className="an-scope an-shell"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "18px",
            transition: "opacity 0.35s ease",
            opacity: 1,
          }}
        >
          <div className="an-shell-bg" aria-hidden>
            <StarField />
          </div>
          <div className="lf-loading-wrap">
            <Soft3DLogo className="size-10" />
            <div className="lf-loading-dots">
              <span /><span /><span />
            </div>
            <p className="lf-loading-text">Memuat...</p>
          </div>
        </div>
      ) : null}
      {isLoading ? null : children}
    </div>
  );
}
