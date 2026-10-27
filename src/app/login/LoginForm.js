"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";
import { onLocaleChange } from "@/i18n/runtime";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";
import AntaresFooter from "@/shared/components/AntaresFooter";
import RecentRequestsMonitor from "./RecentRequestsMonitor";
import StarField from "@/shared/components/StarField";
import Soft3DLogo from "@/shared/components/Soft3DLogo";

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
    cardTitle: "Masuk ke Dashboard",
    pwdLabel: "Password administrator",
    show: "Lihat password",
    hide: "Sembunyikan password",
    btnSubmit: "Masuk ke dashboard",
    btnLoading: "Memverifikasi...",
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
    footerMeta: "Server lokal + privat",
    ssoLogin: "Masuk via SSO",
    oidcLogin: "Masuk via OIDC",
    samlLogin: "Masuk via SAML",
    logoutAndLogin: "Logout & login ulang",
    noAuthConfigured: "Tidak ada metode autentikasi yang dikonfigurasi.",
    checkingAuth: "Memeriksa otentikasi...",
    errorParam: "Kesalahan autentikasi",
    tagline1: "Satu endpoint.",
    tagline2: "Semua model AI.",
    versionBadge: "v2",
    featureItems: [
      { icon: "shield_lock", text: "Enkripsi end-to-end" },
      { icon: "bolt", text: "Failover otomatis" },
      { icon: "storage", text: "Data di server Anda" },
    ],
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
    cardTitle: "Sign in to Dashboard",
    pwdLabel: "Administrator password",
    show: "Show password",
    hide: "Hide password",
    btnSubmit: "Open dashboard",
    btnLoading: "Verifying...",
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
    serverError: "Could not reach the server. Please try again later.",
    pwdChangeSuccess: "Password updated successfully. Redirecting...",
    pwdChangeFailed: "Failed to save new password. Please try again.",
    loginSuccess: "Login successful. Redirecting to dashboard...",
    compareTitle: "What is different from 9Router?",
    footerMeta: "Local plus private server",
    ssoLogin: "Sign in with SSO",
    oidcLogin: "Sign in with OIDC",
    samlLogin: "Sign in with SAML",
    logoutAndLogin: "Logout and sign in again",
    noAuthConfigured: "No authentication method is configured.",
    checkingAuth: "Checking authentication...",
    errorParam: "Authentication error",
    tagline1: "One endpoint.",
    tagline2: "Every AI model.",
    versionBadge: "v2",
    featureItems: [
      { icon: "shield_lock", text: "End-to-end encryption" },
      { icon: "bolt", text: "Automatic failover" },
      { icon: "storage", text: "Data on your server" },
    ],
  },
};

function getLocaleFromCookie() {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const cookieName = LOCALE_COOKIE + "=";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(cookieName));
  const value = cookie
    ? decodeURIComponent(cookie.split("=")[1])
    : DEFAULT_LOCALE;
  return normalizeLocale(value);
}

function getPasswordStrength(pwd) {
  if (!pwd || pwd.length === 0) return { score: 0, labelKey: "strengthWeak" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  score = Math.min(score, 3);
  const labels = { 1: "strengthWeak", 2: "strengthMedium", 3: "strengthStrong" };
  return { score, labelKey: labels[score] || "strengthWeak" };
}

function StrengthBar({ score }) {
  return (
    <div className="lf-str-bar">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="lf-str-seg"
          data-active={i <= score ? "1" : "0"}
          data-level={score === 1 ? "weak" : score === 2 ? "mid" : "strong"}
        />
      ))}
    </div>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPwd, setShowPwd] = useState(false);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pwdChangeMode, setPwdChangeMode] = useState(false);
  const [pwdChangeSuccess, setPwdChangeSuccess] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [authStatus, setAuthStatus] = useState(null);
  const [locale, setLocale] = useState("id");

  useEffect(() => {
    setLocale(getLocaleFromCookie());
    return onLocaleChange(() => setLocale(getLocaleFromCookie()));
  }, []);

  useEffect(() => {

    const loadAuthStatus = async () => {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAuthStatus(data);
          if (data.authenticated || data.requireLogin === false) {
            router.replace("/dashboard");
            return;
          }
        }
      } catch {
        setAuthStatus({
          requireLogin: true,
          authMode: "password",
          hasPassword: true,
          authenticated: false,
        });
      }
      setLoading(false);
    };
    loadAuthStatus();
  }, [router, searchParams]);

  const t = I18N[locale] || I18N.id;
  const pwdStrength = getPasswordStrength(newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.mustChangePassword) {
        setPwdChangeMode(true);
        setLoading(false);
        return;
      }
      if (res.ok && data.success) {
        setLoginSuccess(true);
        setTimeout(() => router.replace("/dashboard"), 1200);
      } else {
        setErrorMsg(data.error || t.loginFailed);
        setLoading(false);
      }
    } catch {
      setErrorMsg(t.serverError);
      setLoading(false);
    }
  };

  const handlePwdChange = async (e) => {
    e.preventDefault();
    if (!newPassword) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        setPwdChangeSuccess(true);
        setTimeout(() => router.replace("/dashboard"), 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || t.pwdChangeFailed);
        setLoading(false);
      }
    } catch {
      setErrorMsg(t.serverError);
      setLoading(false);
    }
  };

  const handleLogoutAndLogin = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setPassword("");
    setPwdChangeMode(false);
    setPwdChangeSuccess(false);
    router.replace("/login");
  };

  if (!authStatus) {
    return (
      <div className="an-scope login-skin lf-root">
        <div className="login-bg">
          <StarField />
          <div className="login-fade" />
        </div>
        <div className="lf-loading-wrap">
          <Soft3DLogo className="size-10" />
          <div className="lf-loading-dots">
            <span /><span /><span />
          </div>
          <p className="lf-loading-text">{t.checkingAuth}</p>
        </div>
      </div>
    );
  }

  const showPasswordForm =
    authStatus.authMode === "password" ||
    authStatus.authMode === "sso" ||
    authStatus.authMode === "saml";
  const showChangePassword = pwdChangeMode;
  const showOIDC = authStatus.authMode === "oidc";
  const showSAML = authStatus.authMode === "saml";

  return (
    <div className="an-scope login-skin lf-root">
      <div className="login-bg">
        <StarField />
        <div className="login-fade" />
      </div>

      <div className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--t-accent)] to-transparent z-50 pointer-events-none" />

      <div className="lf-shell">
        <header className="lf-header sk-anim" style={{ animationDelay: "0.05s" }}>
          <div className="lf-brand">
            <Soft3DLogo className="size-11" />
            <div>
              <h1 className="lf-brand-name">{t.systemTitle}</h1>
              <p className="lf-brand-sub">{t.systemSub}</p>
            </div>
          </div>
          <div className="lf-header-right">
            <span className="lf-version-badge">{t.versionBadge}</span>
            <LanguageSwitcher hideTrigger={true} />
          </div>
        </header>

        <main className="lf-main">
          <div className="lf-top sk-anim" style={{ animationDelay: "0.15s" }}>

            {!showChangePassword && (
              <div className="lf-hero">
                <p className="lf-hero-eyebrow">
                  <span className="an-dot ok" />
                  {t.badgeGateway}
                </p>
                <h2 className="lf-hero-headline">
                  <span>{t.tagline1}</span>
                  <span className="lf-hero-accent">{t.tagline2}</span>
                </h2>
                <p className="lf-hero-desc">{t.desc}</p>
                <div className="lf-features">
                  {(t.featureItems || []).map((f) => (
                    <div key={f.icon} className="lf-feature-chip">
                      <span className="material-symbols-outlined lf-feature-icon">{f.icon}</span>
                      {f.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showChangePassword ? (
              <div className="an-card lf-card sk-anim" style={{ animationDelay: "0.2s" }}>
                <div className="an-card-head">
                  <div className="flex items-center gap-3">
                    <span className="an-ic">
                      <span className="material-symbols-outlined">lock_reset</span>
                    </span>
                    <h3 className="an-card-title">{t.changePwdTitle}</h3>
                  </div>
                </div>
                <div className="lf-card-body">
                  <p className="lf-card-desc">{t.changePwdDesc}</p>
                  <form onSubmit={handlePwdChange} className="lf-form">
                    <div>
                      <label htmlFor="new-password" className="an-label">{t.newPwdLabel}</label>
                      <div className="an-field">
                        <span className="fi">
                          <span className="material-symbols-outlined">lock</span>
                        </span>
                        <input
                          id="new-password"
                          type={showPwd ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                          className="an-input eye"
                          minLength={8}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((v) => !v)}
                          aria-label={showPwd ? t.hide : t.show}
                          className="an-eye"
                        >
                          <span className="material-symbols-outlined">
                            {showPwd ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                      {newPassword.length > 0 && (
                        <div className="lf-str-row">
                          <StrengthBar score={pwdStrength.score} />
                          <span className="lf-str-label">{t[pwdStrength.labelKey]}</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={loading || pwdStrength.score < 1}
                      className="an-btn an-primary an-full lf-submit-btn"
                    >
                      {loading && (
                        <span className="material-symbols-outlined lf-spin">autorenew</span>
                      )}
                      {loading ? t.btnLoading : t.btnSavePwd}
                    </button>
                  </form>
                  {pwdChangeSuccess && (
                    <div className="an-msg ok lf-msg-ok">
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>check_circle</span>
                      {t.pwdChangeSuccess}
                    </div>
                  )}
                  {errorMsg && !pwdChangeSuccess && (
                    <div className="lf-error-msg">
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                      {errorMsg}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="an-card lf-card sk-anim" style={{ animationDelay: "0.2s" }}>
                <div className="an-card-head">
                  <div className="flex items-center gap-3">
                    <span className="an-ic">
                      <span className="material-symbols-outlined">shield_lock</span>
                    </span>
                    <div>
                      <h3 className="an-card-title">{t.cardTitle}</h3>
                    </div>
                  </div>
                </div>

                <div className="lf-card-body">
                  {showOIDC && (
                    <a
                      href="/api/auth/oidc/start"
                      className="an-btn an-primary an-full lf-sso-btn"
                    >
                      <span className="material-symbols-outlined">open_in_browser</span>
                      {t.oidcLogin}
                    </a>
                  )}
                  {showSAML && (
                    <a
                      href="/api/auth/saml/start"
                      className="an-btn an-primary an-full lf-sso-btn"
                    >
                      <span className="material-symbols-outlined">security</span>
                      {t.samlLogin}
                    </a>
                  )}

                  {showPasswordForm &&
                    authStatus.hasPassword &&
                    authStatus.authMode === "password" && (
                      <form onSubmit={handleSubmit} className="lf-form">
                        <div>
                          <label htmlFor="sk-password" className="an-label">{t.pwdLabel}</label>
                          <div className="an-field">
                            <span className="fi">
                              <span className="material-symbols-outlined">lock</span>
                            </span>
                            <input
                              id="sk-password"
                              type={showPwd ? "text" : "password"}
                              value={password}
                              onChange={(e) => {
                                setPassword(e.target.value);
                                if (errorMsg) setErrorMsg("");
                              }}
                              required
                              autoFocus
                              autoComplete="current-password"
                              className="an-input eye"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPwd((v) => !v)}
                              aria-label={showPwd ? t.hide : t.show}
                              className="an-eye"
                            >
                              <span className="material-symbols-outlined">
                                {showPwd ? "visibility_off" : "visibility"}
                              </span>
                            </button>
                          </div>
                          {errorMsg && (
                            <div className="lf-error-msg">
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                              {errorMsg}
                            </div>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="an-btn an-primary an-full lf-submit-btn"
                        >
                          {loading && (
                            <span className="material-symbols-outlined lf-spin">autorenew</span>
                          )}
                          {loading ? t.btnLoading : t.btnSubmit}
                          {!loading && (
                            <span className="material-symbols-outlined lf-arrow">arrow_forward</span>
                          )}
                        </button>

                        {loginSuccess && (
                          <div className="an-msg ok lf-msg-ok">
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>check_circle</span>
                            {t.loginSuccess}
                          </div>
                        )}
                      </form>
                    )}
                </div>
              </div>
            )}

          </div>

          <div className="lf-bottom sk-anim" style={{ animationDelay: "0.3s" }}>
            <RecentRequestsMonitor locale={locale} />
          </div>
        </main>

        <footer className="lf-footer sk-anim" style={{ animationDelay: "0.5s" }}>
          <AntaresFooter />
        </footer>
      </div>
    </div>
  );
}
