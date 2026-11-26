"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { reloadTranslations } from "@/i18n/runtime";

function readLocale() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage?.getItem("app_locale");
    if (stored) return normalizeLocale(stored);
  } catch {}
  const cookie = document.cookie
    .split(";")
    .find((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`));
  return normalizeLocale(cookie ? decodeURIComponent(cookie.split("=")[1]) : DEFAULT_LOCALE);
}

/**
 * Compact EN/ID language toggle for the login surfaces. It writes the same
 * preference the rest of RouterMod reads (cookie + localStorage + API), then
 * reloads translations so every onLocaleChange subscriber follows along.
 */
export default function LocaleToggle({ className = "" }) {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const current = readLocale();
    setLocale(current);
    // Keep the server-side locale in sync so API error text follows the UI.
    try {
      if (sessionStorage.getItem("locale_synced") !== current) {
        fetch("/api/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: current }),
        })
          .then(() => sessionStorage.setItem("locale_synced", current))
          .catch(() => {});
      }
    } catch {}
  }, []);

  const change = async (next) => {
    if (pending || next === locale) return;
    setPending(true);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) return;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      try { window.localStorage.setItem("app_locale", next); } catch {}
      await reloadTranslations();
      setLocale(next);
    } catch (error) {
      console.error("Failed to change locale:", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--t-line)] bg-[var(--t-card)] p-0.5 ${className}`} role="group" aria-label="Language">
      {[
        { code: "en", label: "EN" },
        { code: "id", label: "ID" },
      ].map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => change(code)}
          disabled={pending}
          aria-pressed={locale === code}
          title={code === "en" ? "English" : "Bahasa Indonesia"}
          className={`flex h-6 min-w-9 items-center justify-center rounded-full px-2 font-mono text-[10px] font-semibold tracking-wide transition-colors disabled:opacity-50 ${
            locale === code
              ? "bg-[var(--t-accent)] text-white"
              : "text-[var(--t-muted)] hover:bg-[var(--t-raised)] hover:text-[var(--t-ink)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
