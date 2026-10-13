"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG, UPDATER_CONFIG } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import useSettingsStore from "@/store/settingsStore";
import { translate } from "@/i18n/runtime";
import Button from "./Button";
import { ConfirmModal } from "./Modal";


const VISIBLE_MEDIA_KINDS = ["embedding", "image", "video", "tts", "stt", "systemone"];

const COMBINED_WEB_ITEM = { id: "web", label: "Web Fetch & Search", icon: "travel_explore", href: "/dashboard/media-providers/web" };

const navItems = [
  { href: "/dashboard/endpoint", label: "Dashboard", icon: "dns" },
  { href: "/dashboard/providers", label: "Provider", icon: "hub" },

  { href: "/dashboard/combos", label: "Combo & Vision Adapter", icon: "layers" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart" },
  { href: "/dashboard/quota", label: "Cek Limit", icon: "data_usage" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },

  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
  { href: "/dashboard/translator", label: "Translator", icon: "translate" },
];

const systemItems = [
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
];

export default function Sidebar({ onClose }) {
  const pathname = usePathname();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [shutdownCountdown, setShutdownCountdown] = useState(0);
  const [enableTranslator, setEnableTranslator] = useState(false);
  const { copied, copy } = useCopyToClipboard(2000);

  const INSTALL_CMD = UPDATER_CONFIG.installCmdLatest;

  useEffect(() => {
    useSettingsStore.getState().fetchSettings().then((data) => {
      if (data?.enableTranslator) setEnableTranslator(true);
    });
  }, []);


  useEffect(() => {
    const timer = setTimeout(() => {
      fetch("/api/version")
        .then(res => res.json())
        .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const isActive = (href) => {
    if (href === "/dashboard/endpoint") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/endpoint");
    }
    return pathname.startsWith(href);
  };


  const handleUpdate = () => {
    setShowUpdateModal(false);
    setIsUpdating(true);
  };


  const handleCopyAndShutdown = async () => {
    try { await navigator.clipboard.writeText(INSTALL_CMD); } catch {  }
    copy(INSTALL_CMD);
    let remaining = UPDATER_CONFIG.shutdownCountdownSec;
    setShutdownCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setShutdownCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        fetch("/api/version/shutdown", { method: "POST" }).catch(() => {});
        setIsDisconnected(true);
      }
    }, 1000);
  };

  const handleCancelUpdate = () => {
    setIsUpdating(false);
    setShutdownCountdown(0);
  };




  return (
    <>
      <aside className="flex w-72 flex-col border-r-2 border-border bg-surface min-h-full">
        {}
        <div className="flex items-center justify-between border-b-2 border-border bg-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full border border-border bg-[#ff1a53] shadow-[1px_1px_0px_var(--color-border)]" />
            <div className="w-2.5 h-2.5 rounded-full border border-border bg-[#f59e0b] shadow-[1px_1px_0px_var(--color-border)]" />
            <div className="w-2.5 h-2.5 rounded-full border border-border bg-[#10b981] shadow-[1px_1px_0px_var(--color-border)]" />
          </div>
          <span className="font-mono text-[10.5px] font-extrabold uppercase tracking-widest text-[#10b981] bg-surface border-2 border-border px-2 py-0.5 rounded-md shadow-[2px_2px_0px_var(--color-border)] flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
            PORT :1945
          </span>
        </div>

        {}
        <div className="px-4 py-3.5 border-b-2 border-border flex flex-col gap-2 bg-surface">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="relative flex items-center justify-center shrink-0 size-10 group">
              <svg
                viewBox="0 0 120 120"
                className="w-full h-full drop-shadow-[2.5px_3px_0px_var(--color-border)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:drop-shadow-[3px_4px_0px_var(--color-border)]"
              >
                <defs>
                  <linearGradient id="sb-logo-r-red" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ff1a53" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                </defs>
                <rect x="8" y="8" width="104" height="104" rx="22" fill="#181c24" stroke="var(--color-border)" strokeWidth="4" />
                <rect x="12" y="12" width="96" height="96" rx="18" fill="#ffffff" className="dark:fill-[#1b1f2b]" />
                <path d="M12 36L36 12H12v24z" fill="url(#sb-logo-r-red)" />
                <circle cx="94" cy="26" r="4.5" fill="#10b981" stroke="var(--color-border)" strokeWidth="2" />
                <rect x="34" y="30" width="16" height="60" rx="4" fill="#181c24" className="dark:fill-white" />
                <path d="M48 30h23c10.5 0 18.5 7 18.5 18s-8 18-18.5 18H48V30z" fill="#181c24" className="dark:fill-white" />
                <path d="M50 41.5h20c4.5 0 8 3 8 6.5s-3.5 6.5-8 6.5H50v-13z" fill="#ffffff" className="dark:fill-[#1b1f2b]" />
                <path d="M60 62L83 90H65L48 68h14z" fill="url(#sb-logo-r-red)" stroke="var(--color-border)" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="88" cy="88" r="4.5" fill="#3b82f6" stroke="var(--color-border)" strokeWidth="2" />
              </svg>
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm font-black uppercase tracking-wider text-text-main font-mono flex items-center gap-1">
                ROUTER<span className="text-[#ff1a53]">MOD</span>
              </h1>
              <span className="text-[10px] font-mono font-bold text-[#ff1a53] tracking-widest">
            </div>
          </Link>
          {updateInfo && (
            <div className="flex flex-col gap-1.5 rounded p-1 -m-1">
              <span className="text-xs font-semibold text-green-600 dark:text-amber-500">
                ↑ New version available: v{updateInfo.latestVersion}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="px-2 py-1 rounded bg-green-600 hover:bg-green-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Update now
                </button>
                <button
                  onClick={() => copy(INSTALL_CMD)}
                  title="Copy install command"
                  className="flex-1 text-left hover:opacity-80 transition-opacity cursor-pointer min-w-0"
                >
                  <code className="block text-[10px] text-green-600/80 dark:text-amber-400/70 font-mono truncate">
                    {copied ? "✓ copied!" : INSTALL_CMD}
                  </code>
                </button>
              </div>
            </div>
          )}
        </div>

        {}
        <nav className="flex-1 px-4 py-2 space-y-0.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all group font-mono text-[12.5px] font-bold uppercase",
                isActive(item.href)
                  ? "bg-[#ff1a53] text-white border-2 border-border shadow-[2px_2.5px_0px_var(--color-border)]"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main border-2 border-transparent hover:border-border hover:shadow-[2px_2px_0px_var(--color-border)]"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive(item.href) ? "fill-1" : "group-hover:text-primary transition-colors"
                )}
              >
                {item.icon}
              </span>
              <span className="text-[13px] font-medium">{translate(item.label)}</span>
            </Link>
          ))}

          {}
          <div className="pt-3 mt-2 space-y-0.5">
            <p className="px-4 text-xs font-semibold text-text-muted/60 uppercase tracking-wider mb-2">
              System
            </p>

            {}
            <button
              onClick={() => setMediaOpen((v) => !v)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all group font-mono text-[12.5px] font-bold uppercase",
                pathname.startsWith("/dashboard/media-providers")
                  ? "bg-[#ff1a53] text-white border-2 border-border shadow-[2px_2.5px_0px_var(--color-border)]"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main border-2 border-transparent hover:border-border hover:shadow-[2px_2.5px_0px_var(--color-border)]"
              )}
            >
              <span className="material-symbols-outlined text-[18px]">perm_media</span>
              <span className="text-[13px] font-medium flex-1 text-left">Media Providers</span>
              <span className="material-symbols-outlined text-[14px] transition-transform" style={{ transform: mediaOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                expand_more
              </span>
            </button>
            {mediaOpen && (
              <div className="pl-4">
                {MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id)).map((kind) => (
                  <Link
                    key={kind.id}
                    href={`/dashboard/media-providers/${kind.id}`}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all group font-mono text-[12.5px] font-bold uppercase",
                      pathname.startsWith(`/dashboard/media-providers/${kind.id}`)
                        ? "bg-[#ff1a53] text-white border-2 border-border shadow-[2px_2.5px_0px_var(--color-border)]"
                        : "text-text-muted hover:bg-surface-2 hover:text-text-main border-2 border-transparent hover:border-border hover:shadow-[2px_2.5px_0px_var(--color-border)]"
                    )}
                  >
                    <span className="material-symbols-outlined text-[16px]">{kind.icon}</span>
                    <span className="text-sm">{kind.label}</span>
                  </Link>
                ))}
                <Link
                  key={COMBINED_WEB_ITEM.id}
                  href={COMBINED_WEB_ITEM.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all group font-mono text-[12.5px] font-bold uppercase",
                    pathname.startsWith(COMBINED_WEB_ITEM.href)
                      ? "bg-[#ff1a53] text-white border-2 border-border shadow-[2px_2.5px_0px_var(--color-border)]"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-main border-2 border-transparent hover:border-border hover:shadow-[2px_2.5px_0px_var(--color-border)]"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">{COMBINED_WEB_ITEM.icon}</span>
                  <span className="text-sm">{COMBINED_WEB_ITEM.label}</span>
                </Link>
              </div>
            )}

            {systemItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all group font-mono text-[12.5px] font-bold uppercase",
                  isActive(item.href)
                    ? "bg-[#ff1a53] text-white border-2 border-border shadow-[2px_2.5px_0px_var(--color-border)]"
                    : "text-text-muted hover:bg-surface-2 hover:text-text-main border-2 border-transparent hover:border-border hover:shadow-[2px_2.5px_0px_var(--color-border)]"
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined text-[18px]",
                    isActive(item.href) ? "fill-1" : "group-hover:text-primary transition-colors"
                  )}
                >
                  {item.icon}
                </span>
                <span className="text-[13px] font-medium">{translate(item.label)}</span>
              </Link>
            ))}

            {}
            {debugItems.map((item) => {
              const show = item.href !== "/dashboard/translator" || enableTranslator;
              return show ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all group font-mono text-[12.5px] font-bold uppercase",
                    isActive(item.href)
                      ? "bg-[#ff1a53] text-white border-2 border-border shadow-[2px_2.5px_0px_var(--color-border)]"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-main border-2 border-transparent hover:border-border hover:shadow-[2px_2.5px_0px_var(--color-border)]"
                  )}
                >
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px]",
                      isActive(item.href) ? "fill-1" : "group-hover:text-primary transition-colors"
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="text-[13px] font-medium">{item.label}</span>
                </Link>
              ) : null;
            })}

            {}
            <Link
              href="/dashboard/contact"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-1 rounded-lg transition-all group w-full",
                isActive("/dashboard/contact")
                  ? "bg-surface-2 text-text-main"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main"
              )}
            >
              <span className="material-symbols-outlined text-[18px] group-hover:text-primary transition-colors">
                contact_support
              </span>
              <span className="text-[13px] font-medium">Contact Developer</span>
            </Link>

            {}
            <Link
              href="/dashboard/profile"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all group font-mono text-[12.5px] font-bold uppercase",
                isActive("/dashboard/profile")
                  ? "bg-[#ff1a53] text-white border-2 border-border shadow-[2px_2.5px_0px_var(--color-border)]"
                  : "text-text-muted hover:bg-surface-2 hover:text-text-main border-2 border-transparent hover:border-border hover:shadow-[2px_2.5px_0px_var(--color-border)]"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[18px]",
                  isActive("/dashboard/profile") ? "fill-1" : "group-hover:text-primary transition-colors"
                )}
              >
                settings
              </span>
              <span className="text-[13px] font-medium">Settings</span>
            </Link>
          </div>
        </nav>

      </aside>


      {}
      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Update 9Router"
        message={`Show install command for v${updateInfo?.latestVersion || ""}? You can copy it and shutdown to install manually.`}
        confirmText="Show Command"
        cancelText="Cancel"
        variant="primary"
      />

      {}
      {(isDisconnected || isUpdating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          {isUpdating ? (
            <ManualUpdatePanel
              latestVersion={updateInfo?.latestVersion}
              installCmd={INSTALL_CMD}
              copied={copied}
              onCopyAndShutdown={handleCopyAndShutdown}
              onCancel={handleCancelUpdate}
              countdown={shutdownCountdown}
              isDisconnected={isDisconnected}
            />
          ) : (
            <div className="text-center p-8">
              <div className="flex items-center justify-center size-16 rounded-full bg-red-500/20 text-red-500 mx-auto mb-4">
                <span className="material-symbols-outlined text-[32px]">power_off</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Server Disconnected</h2>
              <p className="text-text-muted mb-6">The proxy server has been stopped.</p>
              <Button variant="secondary" onClick={() => globalThis.location.reload()}>
                Reload Page
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

Sidebar.propTypes = {
  onClose: PropTypes.func,
};

function ManualUpdatePanel({ latestVersion, installCmd, copied, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div className="w-full max-w-lg rounded-xl bg-neutral-900/95 border border-white/10 p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-amber-500/20 text-amber-400">
          <span className="material-symbols-outlined text-[24px]">content_copy</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Update 9Router{latestVersion ? ` to v${latestVersion}` : ""}</h2>
          <p className="text-xs text-white/60">
            {isDisconnected
              ? "Server stopped. Paste the command into a terminal to install."
              : isCountingDown
                ? `Command copied. Server will stop in ${countdown}s...`
                : "Click the button below to copy the install command and shutdown."}
          </p>
        </div>
      </div>

      <p className="text-sm text-white/80 mb-2">Install command:</p>
      <div className="w-full px-3 py-2 rounded bg-white/5 mb-4">
        <code className="text-xs font-mono text-amber-400 break-all">{installCmd}</code>
      </div>

      <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside mb-4">
        <li>Click <strong>Copy & Shutdown</strong> below.</li>
        <li>Paste the command into your terminal and press Enter.</li>
        <li>Run <code className="px-1 rounded bg-white/10 text-green-400">9router</code> again after install.</li>
      </ol>

      {isDisconnected ? (
        <Button variant="secondary" fullWidth onClick={() => globalThis.location.reload()}>
          Reload Page
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isCountingDown}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={onCopyAndShutdown} disabled={isCountingDown}>
            {copied ? "✓ Copied — shutting down..." : isCountingDown ? `Shutting down in ${countdown}s` : "Copy & Shutdown"}
          </Button>
        </div>
      )}
    </div>
  );
}

ManualUpdatePanel.propTypes = {
  latestVersion: PropTypes.string,
  installCmd: PropTypes.string.isRequired,
  copied: PropTypes.bool,
  onCopyAndShutdown: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  countdown: PropTypes.number,
  isDisconnected: PropTypes.bool,
};
