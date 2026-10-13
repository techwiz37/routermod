"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/store/notificationStore";
import Sidebar from "../Sidebar";
import Header from "../Header";
import PageLoadBadge from "../PageLoadBadge";

const TG_URL = "https://t.me/techwizdisc";
const WA_URL = "https://chat.whatsapp.com/J40Gf92ksaT4Uma02CIMo3?s=cl&p=a&mlu=4&ilr=4";

function CommunityPopup({ onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-surface border-2 border-border rounded-xl shadow-[4px_6px_0px_var(--color-border)] animate-in fade-in zoom-in-95 duration-150 z-10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b-2 border-border bg-surface-2">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg border-2 border-border bg-[var(--color-primary)]/10 shadow-[1.5px_1.5px_0_var(--color-border)] flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px] text-[var(--color-primary)]">groups</span>
            </div>
            <div>
              <p className="font-mono font-bold text-text-main text-sm uppercase tracking-wider leading-tight">RouterMod Community</p>
              <p className="text-[10px] text-text-muted font-mono">Join &amp; hang out with us</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg border-2 border-border bg-surface flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-2 shadow-[1.5px_1.5px_0_var(--color-border)] transition-all active:translate-y-px"
            aria-label="Tutup"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-text-muted leading-relaxed">
            Join the RouterMod community — ask questions, swap configs, get the latest feature news, and help each other out.
          </p>

          {/* Telegram */}
          <a
            href={TG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border-2 border-[#229ED9]/60 bg-[#229ED9]/8 hover:bg-[#229ED9]/15 transition-colors shadow-[2px_2px_0px_#229ED940] group"
          >
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-[#229ED9]">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#229ED9] leading-tight">Telegram</p>
              <p className="text-[10px] text-text-muted font-mono">t.me/techwizdisc</p>
            </div>
            <span className="material-symbols-outlined text-[14px] text-[#229ED9] shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">open_in_new</span>
          </a>

          {/* WhatsApp */}
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border-2 border-[#25D366]/60 bg-[#25D366]/8 hover:bg-[#25D366]/15 transition-colors shadow-[2px_2px_0px_#25D36640] group"
          >
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-[#25D366]">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#25D366] leading-tight">WhatsApp</p>
              <p className="text-[10px] text-text-muted font-mono">RouterMod Discussion Group</p>
            </div>
            <span className="material-symbols-outlined text-[14px] text-[#25D366] shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">open_in_new</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function getToastStyle(type) {
  if (type === "success") {
    return {
      wrapper: "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]",
      icon: "check_circle",
    };
  }
  if (type === "error") {
    return {
      wrapper: "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
      icon: "error",
    };
  }
  if (type === "warning") {
    return {
      wrapper: "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
      icon: "warning",
    };
  }
  return {
    wrapper: "border-[var(--color-info)]/30 bg-[var(--color-info)]/10 text-[var(--color-info)]",
    icon: "info",
  };
}

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const pathname = usePathname();
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);

  useEffect(() => {
    const t = setTimeout(() => setShowCommunity(true), 800);
    return () => clearTimeout(t);
  }, []);

  function dismissCommunity() {
    setShowCommunity(false);
  }

  useEffect(() => {
    const preload = () => {
      import("@/shared/components/UsageStats").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/UsageChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/ProviderBarChart").catch(() => {});
      import("@/app/(dashboard)/dashboard/usage/components/TopModelsChart").catch(() => {});
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
      {showCommunity && <CommunityPopup onClose={dismissCommunity} />}
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
      <main className="flex flex-col flex-1 h-full min-w-0 relative overflow-x-clip transition-colors duration-300 isolate bg-[var(--color-bg)] text-[var(--color-text)]">
        {/* Top Accent Reticle (identical to login) */}
        <div className="fixed top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent z-50 pointer-events-none opacity-80" />

        <Header onMenuClick={() => setSidebarOpen(true)} />

        <div className={`flex-1 overflow-y-auto overflow-x-clip custom-scrollbar flex flex-col justify-between ${pathname === "/dashboard/basic-chat" ? "" : "p-3 sm:p-5 lg:p-8"} ${pathname === "/dashboard/basic-chat" ? "flex flex-col overflow-hidden" : ""}`}>
          <div className={`${pathname === "/dashboard/basic-chat" ? "flex-1 w-full h-full flex flex-col" : "w-full max-w-7xl mx-auto flex-1 flex flex-col"}`}>{children}</div>

          {/* Unified Neobrutalism Footer */}
          <footer className="mt-8 pt-4 pb-2 border-t-2 border-border flex flex-col items-center justify-center gap-1 font-mono text-center">
            <div className="text-xs font-bold text-text-main flex items-center justify-center gap-2">
              <span className="size-2 rounded-full bg-[var(--color-success)] animate-pulse" />
              <span>Router Mod {new Date().getFullYear()}</span>
            </div>
            <div className="text-[11px] font-semibold text-text-muted">
              Developed by{" "}
              <a
                href="https://github.com/techwiz37"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-primary)] hover:underline font-bold inline-flex items-center gap-0.5"
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
