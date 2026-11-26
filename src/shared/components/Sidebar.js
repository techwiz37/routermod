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
  { href: "/dashboard/informations", label: "Informations", icon: "campaign" },
  { href: "/dashboard/quota", label: "Check Limit", icon: "data_usage" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/automate", label: "Automate", icon: "automation" },
  { href: "/dashboard/cli-tools", label: "Tool CLI", icon: "terminal" },
  { href: "/dashboard/agent", label: "AI Agent", icon: "smart_toy" },
];

const keyNavItems = [
  { href: "/dashboard-keys", label: "Dashboard", icon: "dns" },
  { href: "/dashboard-keys/informations", label: "Informations", icon: "campaign" },
  { href: "/dashboard-keys/live-models", label: "Live Models", icon: "model_training" },
  { href: "/dashboard-keys/top-models-keys", label: "Top Models & Keys", icon: "leaderboard" },
  { href: "/dashboard-keys/billing", label: "Billing", icon: "receipt_long" },
  { href: "/dashboard-keys/topup", label: "Topup Token", icon: "add_card" },
  { href: "/dashboard-keys/manage-keys", label: "Manage Keys", icon: "key" },
  { href: "/dashboard-keys/permissions", label: "Permissions & List IP", icon: "shield_person" },
];

const debugItems = [
  { href: "/dashboard/console-log", label: "Console Log", icon: "terminal" },
  { href: "/dashboard/translator", label: "Translator", icon: "translate" },
];

const systemItems = [
  { href: "/dashboard/payment", label: "Payment & Mutations", icon: "account_balance_wallet" },
  { href: "/dashboard/settings/pricing", label: "Price Settings", icon: "payments" },
  { href: "/dashboard/proxy-pools", label: "Proxy Pools", icon: "lan" },
  { href: "/dashboard/jailbreaks", label: "Jailbreaks", icon: "security" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
];

function SectionLabel({ children, collapsed }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-6 bg-[var(--t-line)]" />;
  return (
    <p className="px-2.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--t-dim)]">
      {children}
    </p>
  );
}

function NavItem({ href, icon, label, active, onClick, collapsed, nested = false }) {
  const text = translate(label);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? text : undefined}
      className={cn(
        "group relative flex h-9 items-center rounded-[9px] text-[12.5px] font-medium transition-colors",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        nested && !collapsed && "ml-3 h-8",
        active
          ? "bg-[var(--t-accent-soft)] text-[var(--t-ink)]"
          : "text-[var(--t-muted)] hover:bg-[var(--t-raised)] hover:text-[var(--t-ink)]"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--t-accent)]" aria-hidden />
      )}
      <span
        className={cn(
          "material-symbols-outlined shrink-0 transition-colors",
          nested ? "text-[16px]" : "text-[18px]",
          active ? "text-[var(--t-accent)]" : "text-[var(--t-dim)] group-hover:text-[var(--t-ink)]"
        )}
        aria-hidden
      >
        {icon}
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{text}</span>}
    </Link>
  );
}

export default function Sidebar({ onClose, sessionType = "admin", collapsed = false }) {
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
    if (sessionType === "apiKey") return;
    useSettingsStore.getState().fetchSettings().then((data) => {
      if (data?.enableTranslator) setEnableTranslator(true);
    });
  }, [sessionType]);

  useEffect(() => {
    if (sessionType === "apiKey") return;
    const timer = setTimeout(() => {
      fetch("/api/version")
        .then(res => res.json())
        .then(data => { if (data.hasUpdate) setUpdateInfo(data); })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, [sessionType]);

  const isActive = (href) => {
    if (href === "/dashboard-keys") return pathname === href;
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
    try { await navigator.clipboard.writeText(INSTALL_CMD); } catch { /* clipboard blocked */ }
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

  const mainItems = sessionType === "apiKey" ? keyNavItems : navItems;
  const mediaActive = pathname.startsWith("/dashboard/media-providers");
  const mediaItems = MEDIA_PROVIDER_KINDS.filter((k) => VISIBLE_MEDIA_KINDS.includes(k.id));

  return (
    <>
      <aside
        className={cn(
          "an-scope flex h-full flex-col overflow-hidden border-r border-[var(--t-line)] bg-[var(--t-card)] text-[var(--t-ink)]",
          collapsed ? "w-[68px]" : "w-[264px]"
        )}
      >
        {/* Brand */}
        <div className={cn("relative flex h-[58px] shrink-0 items-center border-b border-[var(--t-line-soft)]", collapsed ? "justify-center px-2" : "gap-2.5 px-3.5")}>
          <Link
            href={sessionType === "apiKey" ? "/dashboard-keys" : "/dashboard"}
            title={collapsed ? APP_CONFIG.name : undefined}
            className="flex min-w-0 items-center gap-2.5 group"
          >
            <svg
              viewBox="0 0 120 120"
              className={cn("shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5", collapsed ? "size-8" : "size-9")}
              aria-hidden
            >
              <defs>
                <linearGradient id="sb-logo-r-red" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="var(--t-accent)" />
                  <stop offset="100%" stopColor="#dc2626" />
                </linearGradient>
              </defs>
              <rect x="8" y="8" width="104" height="104" rx="22" fill="var(--t-line)" />
              <rect x="12" y="12" width="96" height="96" rx="18" fill="var(--t-card)" />
              <path d="M12 36L36 12H12v24z" fill="url(#sb-logo-r-red)" />
              <circle cx="94" cy="26" r="4.5" fill="var(--t-ok)" />
              <rect x="34" y="30" width="16" height="60" rx="4" fill="var(--t-ink)" />
              <path d="M48 30h23c10.5 0 18.5 7 18.5 18s-8 18-18.5 18H48V30z" fill="var(--t-ink)" />
              <path d="M50 41.5h20c4.5 0 8 3 8 6.5s-3.5 6.5-8 6.5H50v-13z" fill="var(--t-card)" />
              <path d="M60 62L83 90H65L48 68h14z" fill="url(#sb-logo-r-red)" />
              <circle cx="88" cy="88" r="4.5" fill="var(--t-accent)" />
            </svg>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold tracking-tight text-[var(--t-ink)]">
                  ROUTER<span className="text-[var(--t-accent)]">MOD</span>
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--t-dim)]">Control Panel</p>
              </div>
            )}
          </Link>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={translate("Close sidebar")}
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-[8px] text-[var(--t-muted)] transition-colors hover:bg-[var(--t-raised)] hover:text-[var(--t-ink)] lg:hidden"
            >
              <span className="material-symbols-outlined text-[17px]">close</span>
            </button>
          )}
        </div>

        {/* Status */}
        <div className={cn("flex shrink-0 items-center border-b border-[var(--t-line-soft)] py-2", collapsed ? "justify-center px-2" : "gap-2 px-4")}>
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--t-ok)] opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[var(--t-ok)]" />
          </span>
          {!collapsed && (
            <>
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--t-muted)]">Online</span>
              <span className="ml-auto rounded-md border border-[var(--t-line)] bg-[var(--t-raised)] px-1.5 py-0.5 font-mono text-[9.5px] text-[var(--t-dim)]">:1337</span>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-1.5">
          <SectionLabel collapsed={collapsed}>{translate("Main Menu")}</SectionLabel>
          <div className="space-y-0.5">
            {mainItems.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onClick={onClose}
                collapsed={collapsed}
              />
            ))}
          </div>

          {sessionType === "admin" && (
            <>
              <SectionLabel collapsed={collapsed}>{translate("System")}</SectionLabel>
              <div className="space-y-0.5">
                {/* Media Providers accordion */}
                {collapsed ? (
                  <Link
                    href="/dashboard/media-providers/embedding"
                    onClick={onClose}
                    title={translate("Media Providers")}
                    aria-label={translate("Media Providers")}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-[9px] transition-colors",
                      mediaActive
                        ? "bg-[var(--t-accent-soft)] text-[var(--t-ink)]"
                        : "text-[var(--t-muted)] hover:bg-[var(--t-raised)] hover:text-[var(--t-ink)]"
                    )}
                  >
                    {mediaActive && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--t-accent)]" />}
                    <span className={cn("material-symbols-outlined text-[18px]", mediaActive ? "text-[var(--t-accent)]" : "text-[var(--t-dim)]")}>perm_media</span>
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setMediaOpen((v) => !v)}
                      aria-expanded={mediaOpen}
                      className={cn(
                        "relative flex h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium transition-colors",
                        mediaActive
                          ? "bg-[var(--t-accent-soft)] text-[var(--t-ink)]"
                          : "text-[var(--t-muted)] hover:bg-[var(--t-raised)] hover:text-[var(--t-ink)]"
                      )}
                    >
                      {mediaActive && <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--t-accent)]" />}
                      <span className={cn("material-symbols-outlined shrink-0 text-[18px]", mediaActive ? "text-[var(--t-accent)]" : "text-[var(--t-dim)]")}>perm_media</span>
                      <span className="min-w-0 flex-1 truncate text-left">{translate("Media Providers")}</span>
                      <span
                        className={cn(
                          "material-symbols-outlined shrink-0 text-[15px] text-[var(--t-dim)] transition-transform duration-200",
                          mediaOpen && "rotate-180"
                        )}
                      >
                        expand_more
                      </span>
                    </button>
                    {mediaOpen && (
                      <div className="space-y-0.5 py-0.5">
                        {mediaItems.map((kind) => (
                          <NavItem
                            key={kind.id}
                            href={`/dashboard/media-providers/${kind.id}`}
                            icon={kind.icon}
                            label={kind.label}
                            active={pathname.startsWith(`/dashboard/media-providers/${kind.id}`)}
                            onClick={onClose}
                            collapsed={collapsed}
                            nested
                          />
                        ))}
                        <NavItem
                          href={COMBINED_WEB_ITEM.href}
                          icon={COMBINED_WEB_ITEM.icon}
                          label={COMBINED_WEB_ITEM.label}
                          active={pathname.startsWith(COMBINED_WEB_ITEM.href)}
                          onClick={onClose}
                          collapsed={collapsed}
                          nested
                        />
                      </div>
                    )}
                  </>
                )}

                {systemItems.map((item) => (
                  <NavItem key={item.href} {...item} active={isActive(item.href)} onClick={onClose} collapsed={collapsed} />
                ))}
                {debugItems.map((item) => {
                  const show = item.href !== "/dashboard/translator" || enableTranslator;
                  return show ? (
                    <NavItem key={item.href} {...item} active={isActive(item.href)} onClick={onClose} collapsed={collapsed} />
                  ) : null;
                })}
                <NavItem href="/dashboard/contact" icon="contact_support" label="Contact Developer" active={isActive("/dashboard/contact")} onClick={onClose} collapsed={collapsed} />
                <NavItem href="/dashboard/profile" icon="settings" label="Settings" active={isActive("/dashboard/profile")} onClick={onClose} collapsed={collapsed} />
              </div>
            </>
            )}

          {/* Update notice */}
          {sessionType === "admin" && updateInfo && (
            <div className={cn("mt-3 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-raised)] p-2.5", collapsed && "px-1.5")}>
              {collapsed ? (
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(true)}
                  title={`Update v${updateInfo.latestVersion}`}
                  className="flex h-8 w-full items-center justify-center rounded-[8px] bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                >
                  <span className="material-symbols-outlined text-[17px]">system_update</span>
                </button>
              ) : (
                <>
                  <p className="text-[11px] font-medium text-[var(--t-ink)]">Update available · v{updateInfo.latestVersion}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowUpdateModal(true)}
                      className="h-7 rounded-[7px] bg-[var(--t-accent)] px-2.5 text-[10.5px] font-semibold text-[var(--t-accent-ink)] transition-opacity hover:opacity-90"
                    >
                      Update now
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(INSTALL_CMD)}
                      title="Copy install command"
                      className="h-7 min-w-0 flex-1 truncate rounded-[7px] border border-[var(--t-line)] px-2 text-left font-mono text-[9.5px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-ink)]"
                    >
                      {copied ? "✓ copied!" : INSTALL_CMD}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className={cn("flex h-11 shrink-0 items-center border-t border-[var(--t-line-soft)] px-3", collapsed ? "justify-center" : "justify-between")}>
          {collapsed ? (
            <span className="font-mono text-[9px] text-[var(--t-dim)]">v{APP_CONFIG.version}</span>
          ) : (
            <>
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--t-dim)]">RouterMod</span>
              <span className="font-mono text-[9.5px] text-[var(--t-dim)]">v{APP_CONFIG.version}</span>
            </>
          )}
        </div>
      </aside>

      {/* Update Confirmation Modal */}
      <ConfirmModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        onConfirm={handleUpdate}
        title="Update RouterMod"
        message={`Show install command for v${updateInfo?.latestVersion || ""}? You can copy it and shutdown to install manually.`}
        confirmText="Show Command"
        cancelText="Cancel"
        variant="primary"
      />

      {/* Disconnected / Updating Overlay */}
      {(isDisconnected || isUpdating) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
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
              <div className="flex items-center justify-center size-16 rounded-full bg-[var(--color-danger)]/20 text-[var(--color-danger)] mx-auto mb-4">
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
  sessionType: PropTypes.oneOf(["admin", "apiKey"]),
  collapsed: PropTypes.bool,
};

function ManualUpdatePanel({ latestVersion, installCmd, copied, onCopyAndShutdown, onCancel, countdown, isDisconnected }) {
  const isCountingDown = countdown > 0;
  return (
    <div className="w-full max-w-lg rounded-xl bg-neutral-900/95 border border-white/10 p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center size-11 rounded-full bg-[var(--color-warning)]/20 text-[var(--color-warning)]">
          <span className="material-symbols-outlined text-[24px]">content_copy</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Update RouterMod{latestVersion ? ` to v${latestVersion}` : ""}</h2>
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
        <li>Run <code className="px-1 rounded bg-white/10 text-green-400">routermod</code> again after install.</li>
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
