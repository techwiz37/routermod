"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { LOCALE_COOKIE } from "@/i18n/config";
import StarField from "@/shared/components/StarField";
import AntaresFooter from "@/shared/components/AntaresFooter";

const APP_VERSION = "0.1.0";
const GITHUB_URL = "https://github.com/techwiz37/routermod";

const I18N = {
  id: {
    systemTitle: "RouterMod",
    systemSub: "AI Gateway",
    nodeActive: "Node aktif",
    heroBadge: "Gateway AI privat",
    heroLine1: "Satu endpoint untuk",
    heroLine2: "seluruh model AI.",
    desc: "Gateway AI privat untuk Claude, OpenAI, Gemini, DeepSeek, Grok, dan Ollama. Failover otomatis, efisiensi token, dan seluruh data tetap di server Anda sendiri.",
    metaLoading: "Memuat statistik...",
    badgeGateway: "Konsol admin terenkripsi",
    cardTitle: "Login Dashboard",
    pwdLabel: "Password administrator",
    show: "Lihat password",
    hide: "Sembunyikan password",
    btnSubmit: "Masuk ke dashboard",
    btnLoading: "Memverifikasi",
    orDivider: "atau",
    defaultPwdText: "Password bawaan",
    defaultPwdVal: "merdeka",
    strengthLabel: "Kekuatan",
    strengthWeak: "Lemah",
    strengthMedium: "Sedang",
    strengthStrong: "Kuat",
    changePwdTitle: "Tetapkan password baru",
    changePwdDesc: "Password administrator masih memakai nilai bawaan. Tetapkan yang baru sebelum melanjutkan.",
    newPwdLabel: "Password baru",
    btnSavePwd: "Simpan dan lanjutkan",
    loginFailed: "Password salah. Silakan periksa kembali.",
    serverError: "Tidak dapat menghubungi server. Coba beberapa saat lagi.",
    pwdChangeSuccess: "Password berhasil diperbarui. Mengalihkan...",
    pwdChangeFailed: "Gagal menyimpan password baru. Silakan coba lagi.",
    loginSuccess: "Berhasil masuk. Mengalihkan ke dashboard...",
    compareTitle: "Apa Bedanya Dengan 9Router?",
    faqDesc: "RouterMod dibuat biar tampilannya jauh lebih responsif di semua layout (HP, tablet, sampai layar gede), lebih adem di mata, serta ada beberapa penambahan fitur.",
    faqRequestHint: "Mau request fitur baru atau ngasih masukan? Langsung gas ke repo GitHub RouterMod:",
    faqRepoBtn: "Buka Repo RouterMod",
    footerMeta: "Server lokal · privat",
    github: "GitHub",
  },
  en: {
    systemTitle: "RouterMod",
    systemSub: "AI Gateway",
    nodeActive: "Node active",
    heroBadge: "Private AI gateway",
    heroLine1: "One endpoint for",
    heroLine2: "every AI model.",
    desc: "A private AI gateway for Claude, OpenAI, Gemini, DeepSeek, Grok, and Ollama. Automatic failover, token efficiency, and every byte of data stays on your own server.",
    metaLoading: "Loading stats...",
    badgeGateway: "Encrypted admin console",
    cardTitle: "Login Dashboard",
    pwdLabel: "Administrator password",
    show: "Show password",
    hide: "Hide password",
    btnSubmit: "Open dashboard",
    btnLoading: "Verifying",
    orDivider: "or",
    defaultPwdText: "Default password",
    defaultPwdVal: "merdeka",
    strengthLabel: "Strength",
    strengthWeak: "Weak",
    strengthMedium: "Medium",
    strengthStrong: "Strong",
    changePwdTitle: "Set a new password",
    changePwdDesc: "The administrator password is still the default value. Set a new one before continuing.",
    newPwdLabel: "New password",
    btnSavePwd: "Save and continue",
    loginFailed: "Incorrect password. Please double-check.",
    serverError: "Couldn't reach the server. Please try again shortly.",
    pwdChangeSuccess: "Password updated. Redirecting...",
    pwdChangeFailed: "Failed to update password. Please try again.",
    loginSuccess: "Signed in. Redirecting to dashboard...",
    compareTitle: "What's the difference with 9Router?",
    faqDesc: "RouterMod is made to be way more responsive across every layout (phones, tablets, and large screens), easier on the eyes, and packed with extra built-in features.",
    faqRequestHint: "Want to request a feature or share feedback? Hop directly into the RouterMod GitHub repo:",
    faqRepoBtn: "View RouterMod on GitHub",
    footerMeta: "Local server · private",
    github: "GitHub",
  },
};

function getSavedLocale() {
  if (typeof document === "undefined") return "id";
  const cookie = document.cookie.split(";").find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const val = cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
  if (val === "en" || val === "id") return val;
  const ls = localStorage.getItem("app_locale");
  return ls === "en" ? "en" : "id";
}

function pwdScore(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function fmtResp(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function Spinner() {
  return (
    <svg className="size-[15px] animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3.5A4.5 4.5 0 0 0 7.5 12H4z" />
    </svg>
  );
}

export default function LoginForm() {
  const [locale, setLocale] = useState("id");

  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState("password");
  const [ssoType, setSsoType] = useState("oidc");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [samlConfigured, setSamlConfigured] = useState(false);
  const [samlLoginLabel, setSamlLoginLabel] = useState("Sign in with SAML SSO");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [stats, setStats] = useState(null);
  const [httpMs, setHttpMs] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [failFlash, setFailFlash] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);

  const t = I18N[locale] || I18N.id;
  const newScore = useMemo(() => pwdScore(newPassword), [newPassword]);
  const strengthText =
    newScore >= 3 ? t.strengthStrong : newScore === 2 ? t.strengthMedium : t.strengthWeak;

  useEffect(() => {
    setLocale(getSavedLocale());
  }, []);

  const switchLocale = (next) => {
    setLocale(next);
    if (typeof document !== "undefined") {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("app_locale", next);
    }
  };

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated === true || data.requireLogin === false) {
            window.location.assign("/dashboard");
            return;
          }
          setAuthMode(data.authMode || "password");
          setSsoType(data.ssoType || "oidc");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
          setSamlConfigured(data.samlConfigured === true);
          setSamlLoginLabel(data.samlLoginLabel || "Sign in with SAML SSO");
        }
      } catch (err) {
        clearTimeout(timeoutId);
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const startedAt = Date.now();
      try {
        const res = await fetch(`${baseUrl}/api/public/stats`, { cache: "no-store" });
        const elapsed = Date.now() - startedAt;
        if (!alive) return;
        setHttpMs(elapsed);
        if (res.ok) {
          const data = await res.json();
          if (alive) setStats(data);
        }
      } catch {
        if (alive) setHttpMs(Date.now() - startedAt);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        setSuccessMsg(t.loginSuccess);
        setSuccessFlash(true);
        setTimeout(() => window.location.assign("/dashboard"), 1400);
      } else {
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        setError(data.error || t.loginFailed);
        setFailFlash(true);
        setTimeout(() => setFailFlash(false), 1400);
      }
    } catch (err) {
      setError(t.serverError);
      setFailFlash(true);
      setTimeout(() => setFailFlash(false), 1400);
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        setSuccessMsg(t.pwdChangeSuccess);
        setSuccessFlash(true);
        setTimeout(() => window.location.assign("/dashboard"), 1400);
      } else {
        const data = await res.json();
        setError(data.error || t.pwdChangeFailed);
      }
    } catch (err) {
      setError(t.serverError);
    } finally {
      setLoading(false);
    }
  };

  const isSsoEnabled = ["sso", "oidc", "saml", "both"].includes(authMode);
  const activeSsoType = ssoType || (authMode === "saml" ? "saml" : "oidc");
  const samlAvailable = isSsoEnabled && activeSsoType === "saml" && samlConfigured;
  const oidcAvailable = isSsoEnabled && activeSsoType === "oidc" && oidcConfigured;
  const passwordAvailable =
    authMode === "password" || authMode === "both" || (!samlAvailable && !oidcAvailable);

  const respMs = stats && typeof stats.avgLatencyMs === "number" ? stats.avgLatencyMs : httpMs;
  const respText = fmtResp(respMs);
  const metaText =
    stats && respText
      ? locale === "en"
        ? `${stats.models} models · ${stats.providers} providers · avg response ${respText}`
        : `${stats.models} model · ${stats.providers} provider · rata-rata respon ${respText}`
      : null;

  return (
    <div className="login-skin relative min-h-screen w-full overflow-x-hidden antialiased selection:bg-[var(--t-accent)] selection:text-white">
      <div aria-hidden className="login-bg">
        <StarField />
        <div className="login-fade" />
      </div>

      <div className="relative z-10 flex min-h-screen w-full flex-col">
        {/* ---- Header ---- */}
        <header className="an-header">
          <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 md:h-16 md:gap-6 md:px-5 lg:px-6">
            <a href="#top" aria-label={`${t.systemTitle}, kembali ke atas`} className="inline-flex items-center gap-2.5">
              <span className="an-logo">
                <span className="material-symbols-outlined">hub</span>
              </span>
              <span className="an-name">{t.systemTitle}</span>
              <span className="an-badge an-hide-sm">v{APP_VERSION}</span>
            </a>

            <div className="flex items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t.systemTitle} di GitHub`}
                title={`${t.systemTitle} di GitHub`}
                className="an-iconbtn an-hide-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z" />
                </svg>
              </a>

              <div role="radiogroup" aria-label="Bahasa" className="flex gap-1 rounded-full border border-[var(--t-line)] bg-[var(--t-card)] p-1">
                {["id", "en"].map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={locale === l}
                    onClick={() => switchLocale(l)}
                    aria-label={l === "id" ? "Bahasa Indonesia" : "English"}
                    className={`inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] transition-colors ${
                      locale === l
                        ? "bg-[var(--t-raised)] text-[var(--t-ink)]"
                        : "text-[var(--t-muted)] hover:text-[var(--t-ink)]"
                    }`}
                  >
                    {locale === l && <span aria-hidden className="size-1.5 rounded-full bg-[var(--t-accent)]" />}
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* ---- Hero ---- */}
        <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden">
          <div className="relative mx-auto w-full max-w-[1400px] px-4 pt-14 pb-10 md:px-5 md:pt-20 md:pb-14 lg:px-6">
            <p className="an-eyebrow sk-anim">
              <span className="an-dot" />
              {t.heroBadge} · v{APP_VERSION}
            </p>
            <h1 id="hero-title" className="an-h1 sk-anim mt-5 max-w-[16ch]">
              {t.heroLine1}
              <span className="an-dim block">{t.heroLine2}</span>
            </h1>
            <p className="sk-anim mt-5 max-w-[46ch] text-[16px] leading-relaxed text-[var(--t-muted)] md:text-[17px]">
              {t.desc}
            </p>
            <p className="an-meta sk-anim mt-6">
              {metaText || <span className="an-meta-load">{t.metaLoading}</span>}
            </p>
          </div>
        </section>

        {/* ---- Main: login + side ---- */}
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-16 md:px-5 lg:px-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            {/* Login card */}
            <div id="sr-login" className="an-card sk-anim scroll-mt-20">
              <div className="an-card-head">
                <span className="an-card-title">
                  <span className="an-ic an-ic-sm" aria-hidden>
                    <span className="material-symbols-outlined">login</span>
                  </span>
                  {mustChange ? t.changePwdTitle : t.cardTitle}
                </span>
              </div>

              <div className="p-5 md:p-7 relative">
                {mustChange && (
                  <p className="mb-6 max-w-[54ch] text-[14.5px] leading-relaxed text-[var(--t-muted)]">
                    {t.changePwdDesc}
                  </p>
                )}

                {!mustChange && error && <p className="an-msg err mb-4">{error}</p>}
                {!mustChange && successMsg && <p className="an-msg ok mb-4">{successMsg}</p>}

                {mustChange ? (
                  <form onSubmit={handleSetNewPassword} className="mt-6 flex flex-col gap-4">
                    <div>
                      <label htmlFor="sk-newpwd" className="an-label">
                        {t.newPwdLabel}
                      </label>
                      <div className="an-field">
                        <span className="fi">
                          <span className="material-symbols-outlined">lock</span>
                        </span>
                        <input
                          id="sk-newpwd"
                          type={showNewPwd ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          autoFocus
                          autoComplete="new-password"
                          className="an-input eye"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPwd((v) => !v)}
                          aria-label={showNewPwd ? t.hide : t.show}
                          title={showNewPwd ? t.hide : t.show}
                          className="an-eye"
                        >
                          <span className="material-symbols-outlined">
                            {showNewPwd ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="an-str">
                      <span className="bars" aria-hidden>
                        {[1, 2, 3, 4].map((i) => (
                          <span key={i} style={{ background: newScore >= i ? "var(--t-accent)" : "var(--t-line)" }} />
                        ))}
                      </span>
                      <span className="lbl">
                        {t.strengthLabel}: <strong>{strengthText}</strong>
                      </span>
                    </div>

                    {error && <p className="an-msg err">{error}</p>}
                    {successMsg && <p className="an-msg ok">{successMsg}</p>}

                    <button type="submit" disabled={loading || !newPassword} className="an-btn an-primary an-full">
                      {loading && <Spinner />}
                      {loading ? t.btnLoading : t.btnSavePwd}
                      {!loading && <span className="material-symbols-outlined">arrow_right</span>}
                    </button>
                  </form>
                ) : (
                  <div className="mt-6 flex flex-col gap-4">
                    {samlAvailable && (
                      <button
                        type="button"
                        onClick={() => (window.location.href = "/api/auth/saml/start")}
                        className="an-btn an-ghost an-full"
                      >
                        <span className="material-symbols-outlined">shield</span>
                        {samlLoginLabel}
                      </button>
                    )}

                    {oidcAvailable && (
                      <button
                        type="button"
                        onClick={() => (window.location.href = "/api/auth/oidc/start")}
                        className="an-btn an-ghost an-full"
                      >
                        <span className="material-symbols-outlined">account_circle</span>
                        {oidcLoginLabel}
                      </button>
                    )}

                    {(samlAvailable || oidcAvailable) && (
                      <div className="flex items-center gap-4 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--t-dim)]">
                        <span className="h-px flex-1 bg-[var(--t-line)]" />
                        {t.orDivider}
                        <span className="h-px flex-1 bg-[var(--t-line)]" />
                      </div>
                    )}

                    {passwordAvailable && (
                      <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <div>
                          <label htmlFor="sk-password" className="an-label">
                            {t.pwdLabel}
                          </label>
                          <div className="an-field">
                            <span className="fi">
                              <span className="material-symbols-outlined">lock</span>
                            </span>
                            <input
                              id="sk-password"
                              type={showPwd ? "text" : "password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              autoFocus
                              autoComplete="current-password"
                              className="an-input eye"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPwd((v) => !v)}
                              aria-label={showPwd ? t.hide : t.show}
                              title={showPwd ? t.hide : t.show}
                              className="an-eye"
                            >
                              <span className="material-symbols-outlined">
                                {showPwd ? "visibility_off" : "visibility"}
                              </span>
                            </button>
                          </div>
                        </div>

                        <button type="submit" disabled={loading} className="an-btn an-primary an-full">
                          {loading && <Spinner />}
                          {loading ? t.btnLoading : t.btnSubmit}
                          {!loading && <span className="material-symbols-outlined">arrow_right</span>}
                        </button>

                        <p className="an-hint text-center">
                          {t.defaultPwdText}: <code>{t.defaultPwdVal}</code>
                        </p>
                      </form>
                    )}
                  </div>
                )}

                {loading && (
                  <div className="an-overlay">
                    <Spinner />
                    <span className="an-overlay-text">{t.btnLoading}</span>
                  </div>
                )}

                {failFlash && (
                  <div className="an-failflash">
                    <span className="an-failflash-emoji">😭</span>
                  </div>
                )}

                {successFlash && (
                  <div className="an-successflash">
                    <span className="an-successflash-emoji">🎉</span>
                    <span className="an-successflash-text">{t.loginSuccess}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Side column: comparison */}
            <div className="flex flex-col gap-6">
              <div className="an-card">
                <button
                  type="button"
                  onClick={() => setCompareOpen((v) => !v)}
                  aria-expanded={compareOpen}
                  className="an-dd-head"
                >
                  <span className="an-eyebrow">
                    <span className="an-rule" />
                    {t.compareTitle}
                  </span>
                  <span className={`an-dd-chev${compareOpen ? " on" : ""}`} aria-hidden>
                    <span className="material-symbols-outlined">expand_more</span>
                  </span>
                </button>

                {compareOpen && (
                  <div className="an-dd-body">
                    <p className="text-[13.5px] leading-relaxed text-[var(--t-muted)]">
                      {t.faqDesc}
                    </p>
                    <div className="flex flex-col gap-2 pt-1 border-t border-[var(--t-line-soft)]">
                      <span className="text-[11.5px] text-[var(--t-dim)]">
                        {t.faqRequestHint}
                      </span>
                      <a
                        className="an-dd-src"
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t.faqRepoBtn}
                        <span className="material-symbols-outlined">open_in_new</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* ---- Footer ---- */}
        <AntaresFooter />
      </div>
    </div>
  );
}
