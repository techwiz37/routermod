"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import PropTypes from "prop-types";
import ProviderIcon from "@/shared/components/ProviderIcon";
import HeaderMenu from "@/shared/components/HeaderMenu";
import HeaderLanguage from "@/shared/components/HeaderLanguage";
import DonateModal from "@/shared/components/DonateModal";
import Soft3DLogo from "@/shared/components/Soft3DLogo";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { translate } from "@/i18n/runtime";

const getBreadcrumbs = (pathname) => {
  if (!pathname) return [];

  const mediaDetailMatch = pathname.match(/\/media-providers\/([^/]+)\/([^/]+)$/);
  if (mediaDetailMatch) {
    const kindId = mediaDetailMatch[1];
    const providerId = mediaDetailMatch[2];
    const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kindId);
    const provider = AI_PROVIDERS[providerId];
    return [
      { label: "Media Providers", href: `/dashboard/media-providers/${kindId}` },
      { label: kindConfig?.label || kindId, href: `/dashboard/media-providers/${kindId}` },
      { label: provider?.name || providerId, image: getProviderIconSrc(providerId) },
    ];
  }

  const providerMatch = pathname.match(/\/providers\/([^/]+)$/);
  if (providerMatch) {
    const providerId = providerMatch[1];
    const providerInfo =
      OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId];
    if (providerInfo) {
      return [
        { label: "Providers", href: "/dashboard/providers" },
        {
          label: providerInfo.name,
          image: getProviderIconSrc(providerInfo.id),
        },
      ];
    }
  }

  return [];
};

export default function Header({ onMenuClick, showMenuButton = true }) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState("");
  const [loginMethod, setLoginMethod] = useState("");
  const [donateOpen, setDonateOpen] = useState(false);

  const breadcrumbs = useMemo(() => getBreadcrumbs(pathname), [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthStatus() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setDisplayName(data?.displayName || data?.samlName || data?.samlEmail || data?.oidcName || data?.oidcEmail || "");
          setLoginMethod(data?.loginMethod || "");
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setLoginMethod("");
        }
      }
    }

    loadAuthStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <header className="shrink-0 flex items-center justify-between gap-2.5 sm:gap-3 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3 border-b-2 border-border bg-surface/95 backdrop-blur-md z-20 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
      {/* Left side: Mobile menu + Logo brand (like login) */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="flex items-center justify-center size-8 rounded-md border-2 border-border bg-surface-2 text-text-main shadow-[1.5px_1.5px_0px_var(--color-border)] hover:bg-surface active:translate-y-0.5 transition-all shrink-0 cursor-pointer"
            aria-label={translate("Toggle sidebar")}
          >
            <span className="material-symbols-outlined text-[19px]">menu</span>
          </button>
        )}

        {/* Brand with 3D R Logo (matching login page) */}
        <Link href="/dashboard" className="flex items-center gap-2 group shrink-0">
          <Soft3DLogo className="size-7 sm:size-8" />
          <div className="hidden min-[380px]:flex flex-col leading-none">
            <span className="font-mono text-xs sm:text-sm font-black tracking-wider text-text-main">
              ROUTER<span className="text-[var(--color-primary)]">MOD</span>
            </span>
            <span className="font-mono text-[8px] sm:text-[9px] font-bold text-[var(--color-primary)] tracking-widest">
            </span>
          </div>
        </Link>

        {/* Breadcrumbs (desktop only, detail pages) */}
        {breadcrumbs.length > 0 && (
          <>
            <div className="hidden lg:block h-5 w-[2px] bg-border mx-1" />
            <div className="hidden md:flex items-center gap-1.5 min-w-0">
              {breadcrumbs.map((crumb, index) => (
                <div key={`${crumb.label}-${crumb.href || "current"}`} className="flex items-center gap-1 min-w-0">
                  {index > 0 && <span className="material-symbols-outlined text-text-muted text-xs">chevron_right</span>}
                  <span className="font-mono text-xs font-bold text-text-main truncate">{translate(crumb.label)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {displayName && (loginMethod === "OIDC" || loginMethod === "SAML") && (
          <div
            className="hidden sm:flex items-center max-w-[220px] px-3 py-1.5 rounded-full border border-border bg-surface/70 text-xs text-text-muted truncate"
            title={displayName}
          >
            <span className="material-symbols-outlined text-[14px] mr-1.5 text-primary">person</span>
            <span className="truncate">{displayName}</span>
            <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {loginMethod}
            </span>
          </div>
        )}
        <HeaderSearch />
        <button
          onClick={() => setDonateOpen(true)}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md border-2 border-border bg-[var(--color-primary)]/15 text-[var(--color-primary)] shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_var(--color-border)] active:translate-y-0 transition-all text-xs font-mono font-bold uppercase cursor-pointer"
          aria-label={translate("Donate")}
        >
          <span className="material-symbols-outlined text-[17px]">volunteer_activism</span>
          <span className="hidden sm:inline">{translate("Donate")}</span>
        </button>
        <HeaderLanguage />
        <HeaderMenu onLogout={handleLogout} />
      </div>
      <DonateModal isOpen={donateOpen} onClose={() => setDonateOpen(false)} />
    </header>
  );
}

function HeaderSearch() {
  const visible = useHeaderSearchStore((s) => s.visible);
  const query = useHeaderSearchStore((s) => s.query);
  const placeholder = useHeaderSearchStore((s) => s.placeholder);
  const setQuery = useHeaderSearchStore((s) => s.setQuery);

  if (!visible) return null;

  return (
    <div className="relative w-[160px] sm:w-[220px]">
      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-[16px] pointer-events-none">
        search
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 pl-7 pr-7 rounded-md border-2 border-border bg-surface text-xs font-mono shadow-[2px_2px_0px_var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] focus:shadow-[3px_3px_0px_var(--color-primary)] transition-all"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded"
          aria-label="Clear search"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}
    </div>
  );
}

Header.propTypes = {
  onMenuClick: PropTypes.func,
  showMenuButton: PropTypes.bool,
};
