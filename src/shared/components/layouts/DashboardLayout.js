"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import PageLoadBadge from "../PageLoadBadge";

function getToastStyle(type) {
  if (type === "success") {
    return {
      wrapper: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
      icon: "check_circle",
    };
  }
  if (type === "error") {
    return {
      wrapper: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      icon: "error",
    };
  }
  if (type === "warning") {
    return {
      wrapper: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      icon: "warning",
    };
  }
  return {
    wrapper: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    icon: "info",
  };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  // Preload heavy usage charts in background when browser is idle
  useEffect(() => {
    const preload = () => {
      // Heavy chart components
      import("@/shared/components/UsageStats").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/UsageChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/ProviderBarChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/TopModelsChart").catch(() => {});
      // Other dashboard pages — prefetch chunks so nav is instant
      import("@/app/(dashboard)/dashboard/providers/page").catch(() => {});
      import("@/app/(dashboard)/dashboard/combos/page").catch(() => {});
      import("@/app/(dashboard)/dashboard/endpoint/EndpointPageClient").catch(() => {});
    };
    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(preload, { timeout: 4000 });
        return () => window.cancelIdleCallback(id);
      }
      const timer = setTimeout(preload, 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <PageLoadBadge />
      <div className="fixed top-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        {notifications.map((n) => {
          const style = getToastStyle(n.type);
          return (
            <div
              key={n.id}
              className={`rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm ${style.wrapper}`}
            >
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] leading-5">{style.icon}</span>
                <div className="min-w-0 flex-1">
                  {n.title ? <p className="text-xs font-semibold mb-0.5">{n.title}</p> : null}
                  <p className="text-xs whitespace-pre-wrap break-words">{n.message}</p>
                </div>
                {n.dismissible ? (
                  <button
                    type="button"
                    onClick={() => removeNotification(n.id)}
                    className="text-current/70 hover:text-current"
                    aria-label="Dismiss notification"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform lg:hidden transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex flex-col flex-1 h-full min-w-0 relative transition-colors duration-300 isolate bg-[var(--color-bg)] text-[var(--color-text)]">
        {/* Top Accent Reticle (identical to login) */}
        <div className="fixed top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-[#ff1a53] to-transparent z-50 pointer-events-none opacity-80" />

        <Header onMenuClick={() => setSidebarOpen(true)} />

        <div className={`flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-between ${pathname === "/dashboard/basic-chat" ? "" : "p-3 sm:p-5 lg:p-8"} ${pathname === "/dashboard/basic-chat" ? "flex flex-col overflow-hidden" : ""}`}>
          <div className={`${pathname === "/dashboard/basic-chat" ? "flex-1 w-full h-full flex flex-col" : "w-full max-w-7xl mx-auto flex-1 flex flex-col"}`}>{children}</div>

          {/* Unified Neobrutalism Footer */}
          <footer className="mt-8 pt-4 pb-2 border-t-2 border-border flex flex-col items-center justify-center gap-1 font-mono text-center">
            <div className="text-xs font-bold text-text-main flex items-center justify-center gap-2">
              <span className="size-2 rounded-full bg-[#10b981] animate-pulse" />
              <span>Router Mod {new Date().getFullYear()}</span>
            </div>
            <div className="text-[11px] font-semibold text-text-muted">
              Developed by{" "}
              <a
                href="https://github.com/techwiz37"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#ff1a53] hover:underline font-bold inline-flex items-center gap-0.5"
              >
                Techwiz
                <span className="material-symbols-outlined text-[12px]">open_in_new</span>
              </a>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
