"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { LANDING_COPY, LANDING_LOCALES } from "./landingCopy";

const LandingLocaleContext = createContext(null);

function readCookieLocale() {
  if (typeof document === "undefined") return "id";
  const raw = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = raw ? decodeURIComponent(raw.split("=")[1]) : "id";
  const normalized = normalizeLocale(value);
  return LANDING_LOCALES.includes(normalized) ? normalized : "id";
}

export function LandingLocaleProvider({ children }) {
  // Default is Indonesian; the cookie only overrides it once the visitor picks.
  const [locale, setLocaleState] = useState("en");

  useEffect(() => {
    // Deferred so the first paint keeps the server-rendered default ("id") and
    // the cookie only overrides it after hydration — avoids a mismatch and the
    // cascading-render warning.
    const id = setTimeout(() => setLocaleState(readCookieLocale()), 0);
    return () => clearTimeout(id);
  }, []);

  const setLocale = useCallback(async (next) => {
    if (!LANDING_LOCALES.includes(next)) return;
    setLocaleState(next);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } catch {
      /* the UI already switched; the cookie is best-effort */
    }
  }, []);

  const value = useMemo(() => {
    const dict = LANDING_COPY[locale] || LANDING_COPY.id;
    return {
      locale,
      setLocale,
      t: (key) => dict[key] ?? LANDING_COPY.id[key] ?? key,
    };
  }, [locale, setLocale]);

  return (
    <LandingLocaleContext.Provider value={value}>{children}</LandingLocaleContext.Provider>
  );
}

export function useLandingT() {
  const ctx = useContext(LandingLocaleContext);
  if (!ctx) {
    // Safe fallback so a component rendered outside the provider still works.
    return {
      locale: "id",
      setLocale: () => {},
      t: (key) => LANDING_COPY.id[key] ?? key,
    };
  }
  return ctx;
}
