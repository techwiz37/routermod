"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_CONFIG } from "@/shared/constants/config";
import { SOCIAL_LINKS } from "@/shared/components/SocialIcons";
import { useLandingT } from "../LandingLocaleContext";
import { LANDING_LOCALES, LANDING_LOCALE_NAMES } from "../landingCopy";

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const router = useRouter();
  const { locale, setLocale, t } = useLandingT();

  const LINKS = [
    { label: t("navFeatures"), href: "#features", icon: "auto_awesome" },
    { label: t("navHow"), href: "#how-it-works", icon: "account_tree" },
    { label: t("navStart"), href: "#get-started", icon: "rocket_launch" },
  ];

  // Lock body scroll while the sidebar is open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open && !langOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setLangOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, langOpen]);

  const go = (href) => {
    setOpen(false);
    router.push(href);
  };

  const pickLocale = (next) => {
    setLocale(next);
    setLangOpen(false);
  };

  return (
    <>
      <nav className="fixed top-0 z-50 w-full border-b border-[var(--l-line)] bg-[var(--l-bg-veil)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-none items-center justify-between gap-3 px-5 sm:px-8">
          {/* Brand */}
          <button
            type="button"
            onClick={() => router.push("/landing")}
            className="flex shrink-0 items-center gap-2.5 bg-transparent p-0"
            aria-label={t("navHome")}
          >
            <span className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-accent-ink)]">
              <span className="material-symbols-outlined text-[19px]">hub</span>
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[15px] font-semibold tracking-tight text-[var(--l-ink)]">
                {APP_CONFIG.name}
              </span>
              <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
                AI Gateway
              </span>
            </span>
          </button>

          {/* Desktop links */}
          <div className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-[13px] text-[var(--l-muted)] transition-colors hover:text-[var(--l-ink)]"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Language selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                className="flex h-9 items-center gap-1.5 rounded-[9px] border border-[var(--l-line)] bg-[var(--l-raised)] px-2.5 text-[12.5px] font-medium text-[var(--l-ink)] transition-colors hover:border-[var(--l-hover-line)]"
                aria-label="Language"
                aria-expanded={langOpen}
                aria-haspopup="listbox"
              >
                <span className="material-symbols-outlined text-[16px] text-[var(--l-muted)]">
                  language
                </span>
                <span className="hidden sm:inline">{LANDING_LOCALE_NAMES[locale]}</span>
                <span className="sm:hidden uppercase">{locale}</span>
                <span className="material-symbols-outlined text-[15px] text-[var(--l-dim)]">
                  expand_more
                </span>
              </button>

              {langOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setLangOpen(false)}
                    aria-hidden
                  />
                  <ul
                    role="listbox"
                    className="absolute right-0 top-[calc(100%+6px)] z-20 w-40 overflow-hidden rounded-[10px] border border-[var(--l-line)] bg-[var(--l-card)] p-1 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)]"
                  >
                    {LANDING_LOCALES.map((code) => {
                      const active = code === locale;
                      return (
                        <li key={code}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => pickLocale(code)}
                            className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left text-[12.5px] transition-colors ${
                              active
                                ? "bg-[var(--l-accent-soft)] text-[var(--l-accent-ink)]"
                                : "text-[var(--l-muted)] hover:bg-[var(--l-raised)] hover:text-[var(--l-ink)]"
                            }`}
                          >
                            {LANDING_LOCALE_NAMES[code]}
                            {active && (
                              <span className="material-symbols-outlined text-[15px]">check</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            <a
              href={SOCIAL_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-1.5 rounded-[9px] border border-[var(--l-line)] bg-[var(--l-raised)] px-3.5 text-[13px] font-medium text-[var(--l-ink)] transition-colors hover:border-[var(--l-hover-line)] sm:inline-flex"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              {t("navInstall")}
            </a>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="hidden h-9 items-center gap-1.5 rounded-[9px] bg-[var(--l-accent)] px-4 text-[13px] font-semibold text-[var(--l-on-accent)] transition-colors hover:bg-[var(--l-accent-hover)] sm:inline-flex"
            >
              <span className="material-symbols-outlined text-[16px]">login</span>
              {t("navLogin")}
            </button>

            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-[9px] text-[var(--l-ink)] transition-colors hover:bg-[var(--l-raised)] md:hidden"
              onClick={() => setOpen(true)}
              aria-label={t("navOpen")}
              aria-expanded={open}
              aria-controls="landing-sidebar"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-0 z-[60] md:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          id="landing-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label={t("navMenu")}
          className={`absolute right-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col border-l border-[var(--l-line)] bg-[var(--l-bg)] shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.9)] transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between border-b border-[var(--l-line)] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-accent-ink)]">
                <span className="material-symbols-outlined text-[19px]">hub</span>
              </span>
              <span className="flex flex-col items-start leading-none">
                <span className="text-[14px] font-semibold tracking-tight text-[var(--l-ink)]">
                  {APP_CONFIG.name}
                </span>
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
                  v{APP_CONFIG.version}
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-8 items-center justify-center rounded-lg text-[var(--l-muted)] transition-colors hover:bg-[var(--l-raised)] hover:text-[var(--l-ink)]"
              aria-label={t("navClose")}
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Sidebar nav */}
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            <p className="px-2 pb-1.5 pt-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
              {t("navSection")}
            </p>
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-[13.5px] text-[var(--l-muted)] transition-colors hover:bg-[var(--l-raised)] hover:text-[var(--l-ink)]"
              >
                <span className="material-symbols-outlined text-[18px] text-[var(--l-dim)]">
                  {l.icon}
                </span>
                {l.label}
              </a>
            ))}

            <div className="my-2 h-px bg-[var(--l-line)]" />

            <p className="px-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
              {t("navResources")}
            </p>
            <a
              href={SOCIAL_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-[13.5px] text-[var(--l-muted)] transition-colors hover:bg-[var(--l-raised)] hover:text-[var(--l-ink)]"
            >
              <span className="material-symbols-outlined text-[18px] text-[var(--l-dim)]">
                download
              </span>
              {t("navInstall")}
              <span className="material-symbols-outlined ml-auto text-[14px] text-[var(--l-dim)]">
                open_in_new
              </span>
            </a>
            <a
              href={SOCIAL_LINKS.telegram}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-[13.5px] text-[var(--l-muted)] transition-colors hover:bg-[var(--l-raised)] hover:text-[var(--l-ink)]"
            >
              <span className="material-symbols-outlined text-[18px] text-[var(--l-dim)]">
                send
              </span>
              {t("footTelegram")}
            </a>
            <a
              href={SOCIAL_LINKS.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-[13.5px] text-[var(--l-muted)] transition-colors hover:bg-[var(--l-raised)] hover:text-[var(--l-ink)]"
            >
              <span className="material-symbols-outlined text-[18px] text-[var(--l-dim)]">
                chat
              </span>
              {t("footWhatsApp")}
            </a>

            <div className="my-2 h-px bg-[var(--l-line)]" />

            <p className="px-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--l-dim)]">
              Language
            </p>
            <div className="flex gap-1.5 px-1">
              {LANDING_LOCALES.map((code) => {
                const active = code === locale;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLocale(code)}
                    className={`flex-1 rounded-[9px] border px-2 py-2 text-[12.5px] font-medium transition-colors ${
                      active
                        ? "border-[var(--l-accent)]/50 bg-[var(--l-accent-soft)] text-[var(--l-accent-ink)]"
                        : "border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-muted)] hover:text-[var(--l-ink)]"
                    }`}
                  >
                    {LANDING_LOCALE_NAMES[code]}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Sidebar footer */}
          <div className="border-t border-[var(--l-line)] p-3">
            <button
              type="button"
              onClick={() => go("/login")}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--l-accent)] text-[13.5px] font-semibold text-[var(--l-on-accent)] transition-colors hover:bg-[var(--l-accent-hover)]"
            >
              <span className="material-symbols-outlined text-[17px]">login</span>
              {t("navLogin")}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
