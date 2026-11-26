"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StarField from "@/shared/components/StarField";
import Soft3DLogo from "@/shared/components/Soft3DLogo";
import LocaleToggle from "@/shared/components/LocaleToggle";
import AntaresFooter from "@/shared/components/AntaresFooter";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { onLocaleChange } from "@/i18n/runtime";

const COPY = {
  en: {
    brandSub: "AI Gateway",
    eyebrow: "Private key analytics",
    headline: "Monitor your",
    headlineAccent: "API key usage.",
    description: "Sign in with your RouterMod API key to review its requests, token usage, costs, and models.",
    scoped: "Usage shown for this API key",
    session: "Browser session uses an HttpOnly cookie",
    cardTitle: "Sign in with API key",
    cardDescription: "Open this key's usage summary",
    apiKey: "API key",
    keyHelp: "Your key is not added to the URL or stored in browser JavaScript storage.",
    showKey: "Show API key",
    hideKey: "Hide API key",
    submit: "View usage statistics",
    verifying: "Verifying key…",
    invalidKey: "This API key is invalid, inactive, or expired.",
    verifyError: "The API key could not be verified. Please try again.",
    connectionError: "Unable to reach the server. Please try again.",
    footer: "API key usage dashboard",
    back: "Back to landing page",
    brandLink: "RouterMod, back to landing page",
  },
  id: {
    brandSub: "Gateway AI",
    eyebrow: "Statistik key pribadi",
    headline: "Pantau penggunaan",
    headlineAccent: "API key Anda.",
    description: "Masuk dengan API key RouterMod untuk melihat permintaan, pemakaian token, biaya, dan model dari key tersebut.",
    scoped: "Data ditampilkan khusus untuk key ini",
    session: "Sesi browser menggunakan cookie HttpOnly",
    cardTitle: "Login dengan API key",
    cardDescription: "Buka ringkasan penggunaan key",
    apiKey: "API key",
    keyHelp: "Key tidak ditambahkan ke URL atau disimpan di penyimpanan JavaScript browser.",
    showKey: "Tampilkan API key",
    hideKey: "Sembunyikan API key",
    submit: "Lihat statistik penggunaan",
    verifying: "Memverifikasi key…",
    invalidKey: "API key tidak valid, nonaktif, atau sudah kedaluwarsa.",
    verifyError: "API key tidak dapat diverifikasi. Silakan coba lagi.",
    connectionError: "Tidak dapat menghubungi server. Silakan coba lagi.",
    footer: "Dashboard penggunaan API key",
    back: "Kembali ke landing",
    brandLink: "RouterMod, kembali ke landing",
  },
};

function getLocaleFromPreference() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage?.getItem("app_locale");
  if (stored) return normalizeLocale(stored);
  const cookie = document.cookie
    .split(";")
    .find((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`));
  return normalizeLocale(cookie ? decodeURIComponent(cookie.split("=")[1]) : DEFAULT_LOCALE);
}

export default function LoginKeyPage() {
  const router = useRouter();
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = COPY[locale === "id" ? "id" : "en"];

  useEffect(() => {
    const timer = window.setTimeout(() => setLocale(getLocaleFromPreference()), 0);
    const unsubscribe = onLocaleChange(() => setLocale(getLocaleFromPreference()));
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy || !apiKey.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/key-dashboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? t.invalidKey : t.verifyError);
      }
      setApiKey("");
      router.replace("/dashboard-keys");
    } catch (submitError) {
      setError(submitError instanceof TypeError ? t.connectionError : submitError.message || t.verifyError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-key-page an-scope login-skin lf-root min-h-screen" data-i18n-skip="true">
      <div className="login-bg"><StarField /><div className="login-fade" /></div>
      <div className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-gradient-to-r from-transparent via-[var(--t-accent)] to-transparent" />

      <div className="lf-shell">
        <header className="lf-header">
          <a href="/landing" className="lf-brand rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--t-accent)]" aria-label={t.brandLink}>
            <Soft3DLogo className="size-11" />
            <span>
              <span className="lf-brand-name block">RouterMod</span>
              <span className="lf-brand-sub block">{t.brandSub}</span>
            </span>
          </a>
          <div className="lf-header-right">
            <span className="lf-version-badge">v2</span>
            <LocaleToggle />
          </div>
        </header>

        <main className="lf-main login-key-main">
          <div className="lf-row login-key-row">
            <div className="lf-hero login-key-hero">
              <p className="lf-hero-eyebrow">{t.eyebrow}</p>
              <h1 className="lf-hero-headline">
                <span>{t.headline}</span>
                <span className="lf-hero-accent">{t.headlineAccent}</span>
              </h1>
              <p className="lf-hero-desc">{t.description}</p>
              <div className="login-key-points" aria-label={t.eyebrow}>
                <p><span className="material-symbols-outlined" aria-hidden="true">filter_alt</span>{t.scoped}</p>
                <p><span className="material-symbols-outlined" aria-hidden="true">lock</span>{t.session}</p>
              </div>
            </div>

            <section className="an-card lf-card login-key-card" aria-labelledby="key-login-title">
              <div className="an-card-head">
                <div className="flex items-center gap-3">
                  <span className="an-ic"><span className="material-symbols-outlined" aria-hidden="true">key</span></span>
                  <div>
                    <h2 id="key-login-title" className="an-card-title">{t.cardTitle}</h2>
                    <p className="login-key-card-subtitle">{t.cardDescription}</p>
                  </div>
                </div>
              </div>
              <div className="lf-card-body">
                <form className="lf-form" onSubmit={submit}>
                  <div>
                    <label htmlFor="routermod-api-key" className="an-label">{t.apiKey}</label>
                    <div className="an-field">
                      <span className="fi"><span className="material-symbols-outlined" aria-hidden="true">key</span></span>
                      <input
                        id="routermod-api-key"
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        disabled={busy}
                        aria-describedby={error ? "key-login-error" : "key-login-help"}
                        placeholder="rmod-…"
                        className="an-input mono eye"
                      />
                      <button type="button" onClick={() => setShowKey((visible) => !visible)} className="an-eye" aria-label={showKey ? t.hideKey : t.showKey} aria-pressed={showKey}>
                        <span className="material-symbols-outlined" aria-hidden="true">{showKey ? "visibility_off" : "visibility"}</span>
                      </button>
                    </div>
                    <p id="key-login-help" className="login-key-help">{t.keyHelp}</p>
                  </div>
                  {error && <p id="key-login-error" role="alert" className="lf-error-msg">{error}</p>}
                  <button type="submit" disabled={busy || !apiKey.trim()} className="an-btn an-primary an-full lf-submit-btn">
                    {busy ? <><span className="material-symbols-outlined lf-spin" aria-hidden="true">autorenew</span>{t.verifying}</> : <>{t.submit}<span className="material-symbols-outlined lf-arrow" aria-hidden="true">arrow_forward</span></>}
                  </button>
                </form>
              </div>
            </section>
          </div>
        </main>

        <footer className="lf-footer">
          <AntaresFooter />
        </footer>
      </div>
    </div>
  );
}
