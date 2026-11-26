"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/shared/components/Header";
import Sidebar from "@/shared/components/Sidebar";
import AntaresFooter from "@/shared/components/AntaresFooter";
import { onLocaleChange, translate } from "@/i18n/runtime";

// Reuse admin chrome and shell geometry, but never mount its admin fetching,
// preloads, update controls, or server-wide actions in an API-key session.
// Direction: admin RouterMod shell. ENERGY 1 / RHYTHM 1 / MOTION 1.
export default function KeyDashboardLayout({ children, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, setLocaleVersion] = useState(0);
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setSidebarCollapsed(localStorage.getItem("routermod:key-sidebar-collapsed") === "1");
      } catch { /* Storage may be unavailable. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const drawer = drawerRef.current;
    const previousFocus = triggerRef.current;
    const focusable = () => [...drawer.querySelectorAll('a[href], button:not([disabled])')];
    focusable()[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSidebarOpen(false);
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const handleResize = () => { if (desktop.matches) setSidebarOpen(false); };
    document.addEventListener("keydown", handleKeyDown);
    desktop.addEventListener("change", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", handleResize);
      previousFocus?.focus();
    };
  }, [sidebarOpen]);

  function toggleSidebar() {
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      triggerRef.current = document.activeElement;
      setSidebarOpen(true);
      return;
    }
    setSidebarCollapsed((previous) => {
      const next = !previous;
      try { localStorage.setItem("routermod:key-sidebar-collapsed", next ? "1" : "0"); } catch { /* Storage may be unavailable. */ }
      return next;
    });
  }

  return (
    <div className="key-dashboard-shell flex h-screen w-full overflow-hidden bg-bg">
      <div className={`key-dashboard-desktop-sidebar hidden lg:flex lg:h-full shrink-0 transition-[width] duration-200 ease-out overflow-hidden ${sidebarCollapsed ? "w-[68px]" : "w-[264px]"}`}>
        <Sidebar sessionType="apiKey" collapsed={sidebarCollapsed} />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-pointer" onClick={() => setSidebarOpen(false)} aria-label={translate("Close sidebar")} tabIndex={-1} />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label={translate("Navigation")} className="key-dashboard-drawer relative h-full w-[280px] max-w-[calc(100vw-24px)] shadow-[12px_0_40px_rgba(0,0,0,0.45)]">
            <Sidebar sessionType="apiKey" onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="key-dashboard-workspace flex flex-col flex-1 h-full min-w-0 relative overflow-x-clip transition-colors duration-300 isolate bg-[var(--color-bg)] text-[var(--color-text)]" inert={sidebarOpen}>
        <div className="fixed top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent z-50 pointer-events-none opacity-80" aria-hidden="true" />
        <Header sessionType="apiKey" onMenuClick={toggleSidebar} onLogout={onLogout} />
        <div className="key-dashboard-scroll flex-1 min-h-0 overflow-y-auto overflow-x-clip custom-scrollbar flex flex-col">
          <main className="flex flex-col flex-1 p-3 sm:p-4 lg:p-5">
            <div className="w-full max-w-none">{children}</div>
          </main>
          <AntaresFooter />
        </div>
      </div>
    </div>
  );
}
