"use client";

import { useState, useEffect } from "react";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LOCALE_FLAGS } from "@/shared/constants/locales";
import LanguageSwitcher from "./LanguageSwitcher";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

export default function HeaderLanguage() {
  const [locale, setLocale] = useState("id");

  useEffect(() => {
    setLocale(getLocaleFromCookie());
  }, []);

  const switchLocale = async (newLocale) => {
    if (newLocale === locale) return;
    setLocale(newLocale);
    document.cookie = `${LOCALE_COOKIE}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("app_locale", newLocale);
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch {}
    window.location.reload();
  };

  return (
    <div className="inline-flex items-center gap-1.5 border-2 border-border bg-surface-2 shadow-[2px_2px_0px_var(--color-border)] rounded-full p-0.5">
      <button
        type="button"
        onClick={() => switchLocale("id")}
        aria-label="Bahasa Indonesia"
        title="Bahasa Indonesia"
        className={`size-6.5 rounded-full overflow-hidden border-2 transition-all duration-150 flex items-center justify-center cursor-pointer ${
          locale === "id"
            ? "border-[var(--color-primary)] scale-105 shadow-[0_1px_4px_rgba(255,26,83,0.35)] ring-1 ring-[var(--color-primary)]"
            : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
        }`}
      >
        <svg viewBox="0 0 32 32" className="w-full h-full object-cover">
          <clipPath id="hdr-circle-id">
            <circle cx="16" cy="16" r="16" />
          </clipPath>
          <g clipPath="url(#hdr-circle-id)">
            <rect width="32" height="16" fill="#e11d48" />
            <rect y="16" width="32" height="16" fill="#ffffff" />
          </g>
        </svg>
      </button>

      <button
        type="button"
        onClick={() => switchLocale("en")}
        aria-label="English"
        title="English"
        className={`size-6.5 rounded-full overflow-hidden border-2 transition-all duration-150 flex items-center justify-center cursor-pointer ${
          locale === "en"
            ? "border-[var(--color-primary)] scale-105 shadow-[0_1px_4px_rgba(255,26,83,0.35)] ring-1 ring-[var(--color-primary)]"
            : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
        }`}
      >
        <svg viewBox="0 0 32 32" className="w-full h-full object-cover">
          <clipPath id="hdr-circle-uk">
            <circle cx="16" cy="16" r="16" />
          </clipPath>
          <g clipPath="url(#hdr-circle-uk)">
            <rect width="32" height="32" fill="#012169" />
            <path d="M0 0L32 32M32 0L0 32" stroke="#ffffff" strokeWidth="5.5" />
            <path d="M0 0L32 32M32 0L0 32" stroke="#C8102E" strokeWidth="2.5" />
            <path d="M16 0v32M0 16h32" stroke="#ffffff" strokeWidth="8.5" />
            <path d="M16 0v32M0 16h32" stroke="#C8102E" strokeWidth="5" />
          </g>
        </svg>
      </button>
    </div>
  );
}
