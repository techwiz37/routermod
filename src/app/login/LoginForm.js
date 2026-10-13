"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/shared/hooks/useTheme";
import { LOCALE_COOKIE } from "@/i18n/config";

const I18N = {
  id: {
    systemTitle: "ROUTERMOD",
    badgeGateway: "ONLINE :1945",
    badgeBeta: "BETA V0.5",
    subtitle: "// AI GATEWAY & SMART LOAD BALANCER",
    heroHighlight: "AI ROUTING HUB",
    desc: "Satu pintu masuk buat semua AI favorit lu (Claude, OpenAI, Gemini, DeepSeek, Grok, Ollama). Failover otomatis tanpa putus, hemat kuota token, dan database lokal aman.",
    welcomeHeader: "LOGIN ADMIN",
    welcomeSub: "Akses dashboard pengelola infrastruktur AI",
    pwdLabel: "PASSWORD ADMIN",
    pwdPlaceholder: "Ketik password (bawaan: merdeka)",
    btnSubmit: "GAS MASUK DASHBOARD",
    btnLoading: "LAGI NGECEK...",
    defaultPwdText: "PASSWORD BAWAAN:",
    defaultPwdVal: "merdeka",
    forgotHint: "Lupa password? Reset langsung dari terminal host:",
    feature1Title: "MULTI-MODEL HUB",
    feature1Desc: "Satu API bisa manggil ratusan model AI tanpa ribet ubah kode aplikasi.",
    feature2Title: "SMART FAILOVER",
    feature2Desc: "Langsung switch ke provider cadangan kalau yang utama kena limit atau lemot.",
    feature3Title: "SQLITE LOKAL",
    feature3Desc: "History pemakaian dan API key tersimpan aman di lokal (routermod.sqlite).",
    changePwdTitle: "GANTI PASSWORD",
    changePwdDesc: "Wajib set password baru dulu biar makin aman.",
    newPwdLabel: "PASSWORD BARU",
    newPwdPlaceholder: "Masukin password baru",
    btnSavePwd: "SIMPAN & LANJUT",
    darkMode: "GELAP",
    lightMode: "TERANG",
    loginSuccess: "Login berhasil! Mengalihkan ke dashboard...",
    loginFailed: "Password salah nih, coba cek lagi ya.",
    serverError: "Gagal nyambung ke server. Coba beberapa saat lagi.",
    pwdChangeSuccess: "Password berhasil diganti! Mengalihkan...",
    pwdChangeFailed: "Gagal simpan password baru. Coba lagi.",
    faqTitle: "Apa Bedanya Dengan 9Router?",
    faqDesc: "RouterMod dibuat biar tampilannya jauh lebih responsif di semua layout (HP, tablet, sampai layar gede), lebih adem di mata, serta ada beberapa penambahan fitur.",
    faqRequestHint: "Mau request fitur baru atau ngasih masukan? Langsung gas ke repo GitHub RouterMod:",
    faqRepoBtn: "Buka Repo RouterMod",
  },
  en: {
    systemTitle: "ROUTERMOD",
    badgeGateway: "ONLINE :1945",
    badgeBeta: "BETA V0.5",
    subtitle: "// AI GATEWAY & SMART LOAD BALANCER",
    heroHighlight: "AI ROUTING HUB",
    desc: "Single unified hub for all your go-to AI models (Claude, OpenAI, Gemini, DeepSeek, Grok, Ollama). Seamless auto-failover, lower token spend, and private local storage.",
    welcomeHeader: "ADMIN LOGIN",
    welcomeSub: "Sign in to manage your AI routing infrastructure",
    pwdLabel: "ADMIN PASSWORD",
    pwdPlaceholder: "Enter password (default: merdeka)",
    btnSubmit: "OPEN DASHBOARD",
    btnLoading: "CHECKING...",
    defaultPwdText: "DEFAULT PASSWORD:",
    defaultPwdVal: "merdeka",
    forgotHint: "Forgot password? Reset anytime via your host terminal:",
    feature1Title: "MULTI-MODEL HUB",
    feature1Desc: "Hit 100+ AI models through one endpoint without touching client apps.",
    feature2Title: "SMART FAILOVER",
    feature2Desc: "Instantly switches to a backup model when the main one rates-limit or drops.",
    feature3Title: "LOCAL SQLITE",
    feature3Desc: "All metrics, keys, and configs stay safe in your local routermod.sqlite.",
    changePwdTitle: "UPDATE PASSWORD",
    changePwdDesc: "Pick a new password to keep things secure.",
    newPwdLabel: "NEW PASSWORD",
    newPwdPlaceholder: "Type your new password",
    btnSavePwd: "SAVE & CONTINUE",
    darkMode: "DARK",
    lightMode: "LIGHT",
    loginSuccess: "Signed in successfully! Redirecting to dashboard...",
    loginFailed: "Incorrect password, please double-check.",
    serverError: "Couldn't reach server. Please try again shortly.",
    pwdChangeSuccess: "Password updated! Redirecting...",
    pwdChangeFailed: "Failed to update password. Please try again.",
    faqTitle: "What's the difference with 9Router?",
    faqDesc: "RouterMod is made to be way more responsive across every layout (phones, tablets, and large screens), easier on the eyes, and packed with extra built-in features.",
    faqRequestHint: "Want to request a feature or share feedback? Hop directly into the RouterMod GitHub repo:",
    faqRepoBtn: "View RouterMod on GitHub",
  },
};

function getSavedLocale() {
  if (typeof document === "undefined") return "id";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const val = cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
  if (val === "en" || val === "id") return val;
  const ls = localStorage.getItem("app_locale");
  return ls === "en" ? "en" : "id";
}

function Soft3DLogo({ className = "size-11" }) {
  return (
    <div className={`relative flex items-center justify-center shrink-0 group ${className}`}>
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full drop-shadow-[2.5px_3.5px_0px_var(--color-border)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:drop-shadow-[3.5px_4.5px_0px_var(--color-border)]"
      >
        <defs>
          <linearGradient id="logo-r-red" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-brand-500)" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>

        <rect x="8" y="8" width="104" height="104" rx="22" fill="var(--color-border)" stroke="var(--color-border)" strokeWidth="4" />
        <rect x="12" y="12" width="96" height="96" rx="18" className="fill-[var(--color-surface)]" />

        <path d="M12 36L36 12H12v24z" fill="url(#logo-r-red)" />
        <circle cx="94" cy="26" r="4.5" className="fill-[var(--color-success)]" stroke="var(--color-border)" strokeWidth="2" />

        <rect x="34" y="30" width="16" height="60" rx="4" className="fill-[var(--color-text-main)]" />
        <path d="M48 30h23c10.5 0 18.5 7 18.5 18s-8 18-18.5 18H48V30z" className="fill-[var(--color-text-main)]" />
        <path d="M50 41.5h20c4.5 0 8 3 8 6.5s-3.5 6.5-8 6.5H50v-13z" className="fill-[var(--color-surface)]" />

        <path d="M60 62L83 90H65L48 68h14z" fill="url(#logo-r-red)" stroke="var(--color-border)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="88" cy="88" r="4.5" className="fill-[var(--color-info)]" stroke="var(--color-border)" strokeWidth="2" />
      </svg>
    </div>
  );
}

export default function LoginForm() {
  const { isDark, toggleTheme } = useTheme();
  const [locale, setLocale] = useState("id");

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [ssoType, setSsoType] = useState("oidc");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [samlConfigured, setSamlConfigured] = useState(false);
  const [samlLoginLabel, setSamlLoginLabel] = useState("Sign in with SAML SSO");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [faqOpen, setFaqOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const t = I18N[locale] || I18N.id;

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
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated === true || data.requireLogin === false) {
            window.location.assign("/dashboard");
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setSsoType(data.ssoType || "oidc");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
          setSamlConfigured(data.samlConfigured === true);
          setSamlLoginLabel(data.samlLoginLabel || "Sign in with SAML SSO");
        } else {
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");
    setResetHint("");

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
        setTimeout(() => {
          window.location.assign("/dashboard");
        }, 500);
      } else {
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        setError(data.error || t.loginFailed);
      }
    } catch (err) {
      setError(t.serverError);
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
        setTimeout(() => {
          window.location.assign("/dashboard");
        }, 500);
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
  const passwordAvailable = authMode === "password" || authMode === "both" || (!samlAvailable && !oidcAvailable);

  return (
    <div className="min-h-screen w-full bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col justify-between selection:bg-[var(--color-primary)] selection:text-white relative font-sans overflow-x-hidden">
      {/* Top Ambient Glow / Reticle */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent z-50 pointer-events-none opacity-80" />

      {/* Top Navbar */}
      <header className="w-full border-b-2 border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md z-40 sticky top-0 shadow-[0_4px_12px_rgba(24,28,36,0.06)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Logo brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer">
            <Soft3DLogo className="size-9 sm:size-10" />
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-sm sm:text-base font-black tracking-wider text-[var(--color-text-main)]">
                ROUTER<span className="text-[var(--color-primary)]">MOD</span>
              </span>
              <span className="font-mono text-[9.5px] sm:text-[10px] font-bold text-[var(--color-primary)] tracking-widest">
              </span>
            </div>
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Online Pulse with 3D Depth */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] shadow-[2px_3px_0px_var(--color-border)] rounded-lg text-[11px] font-mono font-bold">
              <span className="size-2 rounded-full bg-[var(--color-success)] animate-pulse" />
              <span>{t.badgeGateway}</span>
            </div>

            {/* Circular National Flags with 3D Pill */}
            <div className="inline-flex items-center gap-1.5 border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] shadow-[2px_3px_0px_var(--color-border)] rounded-full p-1">
              <button
                type="button"
                onClick={() => switchLocale("id")}
                aria-label="Bahasa Indonesia"
                title="Bahasa Indonesia"
                className={`size-7 rounded-full overflow-hidden border-2 transition-all duration-200 flex items-center justify-center cursor-pointer ${
                  locale === "id"
                    ? "border-[var(--color-primary)] scale-110 shadow-[0_2px_6px_rgba(255,26,83,0.4)] ring-1 ring-[var(--color-primary)]"
                    : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                }`}
              >
                <svg viewBox="0 0 32 32" className="w-full h-full object-cover">
                  <clipPath id="circle-id">
                    <circle cx="16" cy="16" r="16" />
                  </clipPath>
                  <g clipPath="url(#circle-id)">
                    <rect width="32" height="16" fill="#e11d48" />
                    <rect y="16" width="32" height="16" fill="#ffffff" />
                  </g>
                </svg>
              </button>

              <button
                type="button"
                onClick={() => switchLocale("en")}
                aria-label="English (United States / UK)"
                title="English"
                className={`size-7 rounded-full overflow-hidden border-2 transition-all duration-200 flex items-center justify-center cursor-pointer ${
                  locale === "en"
                    ? "border-[var(--color-primary)] scale-110 shadow-[0_2px_6px_rgba(255,26,83,0.4)] ring-1 ring-[var(--color-primary)]"
                    : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                }`}
              >
                <svg viewBox="0 0 32 32" className="w-full h-full object-cover">
                  <clipPath id="circle-uk">
                    <circle cx="16" cy="16" r="16" />
                  </clipPath>
                  <g clipPath="url(#circle-uk)">
                    <rect width="32" height="32" fill="#012169" />
                    <path d="M0 0L32 32M32 0L0 32" stroke="#ffffff" strokeWidth="5.5" />
                    <path d="M0 0L32 32M32 0L0 32" stroke="#C8102E" strokeWidth="2.5" />
                    <path d="M16 0v32M0 16h32" stroke="#ffffff" strokeWidth="8.5" />
                    <path d="M16 0v32M0 16h32" stroke="#C8102E" strokeWidth="5" />
                  </g>
                </svg>
              </button>
            </div>

            {/* Dark / Light Mode 3D Button */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              className="px-2.5 py-1.5 bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4.5px_0px_var(--color-border)] active:translate-y-0.5 active:shadow-[1px_1px_0px_var(--color-border)] transition-all flex items-center gap-1.5 font-mono text-xs font-bold rounded-lg cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-[var(--color-primary)]">
                {isDark ? "light_mode" : "dark_mode"}
              </span>
              <span className="hidden sm:inline text-[11px]">
                {isDark ? t.lightMode : t.darkMode}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Section */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
          {/* Left Hero & Specs Column */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-[var(--color-primary)] text-white border-2 border-[var(--color-border)] shadow-[2px_3px_0px_var(--color-border)] font-mono text-[11px] font-black uppercase tracking-wider rounded-lg">
                {t.badgeBeta}
              </span>
              <span className="px-2.5 py-1 bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[2px_3px_0px_var(--color-border)] font-mono text-[11px] font-bold text-[var(--color-success)] flex items-center gap-1.5 rounded-lg">
                <span className="size-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                STANDALONE // FAST REFRESH
              </span>
            </div>

            <div>
              <h1 className="font-mono text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-[var(--color-text-main)] leading-[1.15] mb-2.5">
                AI GATEWAY <span className="text-[var(--color-primary)] underline decoration-3 underline-offset-4">{t.heroHighlight}</span>
              </h1>
              <p className="text-xs sm:text-sm md:text-base text-[var(--color-text-muted)] leading-relaxed max-w-xl">
                {t.desc}
              </p>
            </div>

            {/* 3D Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[3px_4px_0px_var(--color-border)] hover:shadow-[4px_6px_0px_var(--color-border)] p-3.5 rounded-xl hover:-translate-y-1 transition-all">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="size-6 rounded-md bg-[var(--color-primary)]/10 border border-[var(--color-primary)] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[var(--color-primary)] text-[16px]">hub</span>
                  </div>
                  <span className="font-mono font-black text-xs uppercase tracking-wide text-[var(--color-text-main)]">
                    {t.feature1Title}
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--color-text-muted)] leading-snug">
                  {t.feature1Desc}
                </p>
              </div>

              <div className="bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[3px_4px_0px_var(--color-border)] hover:shadow-[4px_6px_0px_var(--color-border)] p-3.5 rounded-xl hover:-translate-y-1 transition-all">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="size-6 rounded-md bg-[var(--color-info)]/10 border border-[var(--color-info)] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[var(--color-info)] text-[16px]">sync</span>
                  </div>
                  <span className="font-mono font-black text-xs uppercase tracking-wide text-[var(--color-text-main)]">
                    {t.feature2Title}
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--color-text-muted)] leading-snug">
                  {t.feature2Desc}
                </p>
              </div>

              <div className="bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[3px_4px_0px_var(--color-border)] hover:shadow-[4px_6px_0px_var(--color-border)] p-3.5 rounded-xl hover:-translate-y-1 transition-all">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="size-6 rounded-md bg-[var(--color-success)]/10 border border-[var(--color-success)] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[var(--color-success)] text-[16px]">database</span>
                  </div>
                  <span className="font-mono font-black text-xs uppercase tracking-wide text-[var(--color-text-main)]">
                    {t.feature3Title}
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--color-text-muted)] leading-snug">
                  {t.feature3Desc}
                </p>
              </div>
            </div>

            {/* Dropdown FAQ: "Apa Bedanya Dengan 9Router?" */}
            <div className="border-2 border-[var(--color-border)] bg-[var(--color-surface)] shadow-[3px_4px_0px_var(--color-border)] rounded-xl overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setFaqOpen(!faqOpen)}
                className="w-full px-4 py-3 bg-[var(--color-surface-2)] flex items-center justify-between gap-3 text-left font-mono font-black text-xs uppercase tracking-wide text-[var(--color-text-main)] hover:bg-[var(--color-surface)] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-md bg-[var(--color-primary)] text-white flex items-center justify-center text-[12px] font-mono">
                    ?
                  </span>
                  <span>{t.faqTitle}</span>
                </div>
                <span className={`material-symbols-outlined text-[18px] text-[var(--color-text-muted)] transition-transform duration-200 ${faqOpen ? "rotate-180 text-[var(--color-primary)]" : ""}`}>
                  expand_more
                </span>
              </button>

              {faqOpen && (
                <div className="p-4 border-t-2 border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col gap-3">
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    {t.faqDesc}
                  </p>
                  <div className="pt-2 border-t border-[var(--color-border)]/60 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {t.faqRequestHint}
                    </span>
                    <a
                      href="https://github.com/techwiz37/routermod"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-2 border-[var(--color-border)] shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 text-xs font-mono font-bold rounded-lg transition-all"
                    >
                      <span>{t.faqRepoBtn}</span>
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Terminal Command Bar */}
            <div className="border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-main)] px-4 py-2.5 shadow-[2.5px_3.5px_0px_var(--color-border)] rounded-xl font-mono text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-primary)] font-black">$</span>
                <span className="font-bold">npm i -g routermod</span>
                <span className="text-[var(--color-text-muted)]">&amp;&amp; routermod</span>
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">
                PORT 1945
              </span>
            </div>
          </div>

          {/* Right Login Card Column */}
          <div className="lg:col-span-5 w-full">
            <div className="bg-[var(--color-surface)] border-2 border-[var(--color-border)] shadow-[5px_7px_0px_var(--color-border)] p-5 sm:p-7 rounded-2xl relative transition-transform">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[var(--color-primary)] rounded-t-2xl" />

              <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] pb-3.5 mb-5 mt-1">
                <div>
                  <h2 className="font-mono text-lg sm:text-xl font-black uppercase text-[var(--color-text-main)] tracking-wide flex items-center gap-2">
                    <span className="material-symbols-outlined text-[var(--color-primary)] text-[22px]">key</span>
                    {mustChange ? t.changePwdTitle : t.welcomeHeader}
                  </h2>
                  <p className="text-[11px] sm:text-xs text-[var(--color-text-muted)] font-mono mt-0.5">
                    {mustChange ? t.changePwdDesc : t.welcomeSub}
                  </p>
                </div>
                <span className="px-2 py-0.5 bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-border)] font-mono font-black text-[9.5px] shadow-[1px_2px_0px_var(--color-border)] rounded-md">
                  AUTH
                </span>
              </div>

              {mustChange ? (
                <form onSubmit={handleSetNewPassword} className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-mono text-xs font-black uppercase text-[var(--color-text-main)]">
                      {t.newPwdLabel}
                    </label>
                    <input
                      type="password"
                      placeholder={t.newPwdPlaceholder}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      className="w-full bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] p-2.5 sm:p-3 font-mono text-xs sm:text-sm shadow-[2px_3px_0px_var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] focus:shadow-[3px_4px_0px_var(--color-primary)] transition-all rounded-lg"
                    />
                    {error && (
                      <p className="font-mono text-xs font-bold text-[var(--color-danger)] mt-1 bg-[var(--color-danger)]/10 p-2 border border-[var(--color-danger)] rounded-md">
                        {error}
                      </p>
                    )}
                    {successMsg && (
                      <p className="font-mono text-xs font-bold text-[var(--color-success)] mt-1 bg-[var(--color-success)]/10 p-2 border border-[var(--color-success)] rounded-md">
                        {successMsg}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !newPassword}
                    className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-2 border-[var(--color-border)] font-mono font-black text-xs sm:text-sm uppercase py-3 px-4 shadow-[3px_4px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[4px_5.5px_0px_var(--color-border)] active:translate-y-0.5 active:shadow-[1px_1px_0px_var(--color-border)] transition-all flex items-center justify-center gap-2 cursor-pointer rounded-lg mt-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                    {loading ? t.btnLoading : t.btnSavePwd}
                  </button>
                </form>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {samlAvailable && (
                    <button
                      type="button"
                      onClick={() => (window.location.href = "/api/auth/saml/start")}
                      className="w-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border-2 border-[var(--color-border)] font-mono font-bold text-xs uppercase py-2.5 px-4 shadow-[2px_3px_0px_var(--color-border)] transition-all rounded-lg"
                    >
                      {samlLoginLabel}
                    </button>
                  )}

                  {oidcAvailable && (
                    <button
                      type="button"
                      onClick={() => (window.location.href = "/api/auth/oidc/start")}
                      className="w-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border-2 border-[var(--color-border)] font-mono font-bold text-xs uppercase py-2.5 px-4 shadow-[2px_3px_0px_var(--color-border)] transition-all rounded-lg"
                    >
                      {oidcLoginLabel}
                    </button>
                  )}

                  {passwordAvailable && (
                    <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
                      <div className="flex flex-col gap-1.5">
                        <label className="font-mono text-xs font-black uppercase text-[var(--color-text-main)] flex items-center justify-between">
                          <span>{t.pwdLabel}</span>
                          <span className="text-[10px] text-[var(--color-text-muted)] font-normal">
                            PORT :1945
                          </span>
                        </label>
                        <input
                          type="password"
                          placeholder={t.pwdPlaceholder}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          autoFocus
                          className="w-full bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] p-2.5 sm:p-3 font-mono text-xs sm:text-sm shadow-[2px_3px_0px_var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] focus:shadow-[3px_4px_0px_var(--color-primary)] transition-all placeholder:text-[var(--color-text-muted)]/60 rounded-lg"
                        />

                        {error && (
                          <div className="font-mono text-xs font-bold text-[var(--color-danger)] mt-1 bg-[var(--color-danger)]/10 p-2 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_var(--color-border)] rounded-md">
                            [!] {error}
                          </div>
                        )}

                        {successMsg && (
                          <div className="font-mono text-xs font-bold text-[var(--color-success)] mt-1 bg-[var(--color-success)]/10 p-2 border-2 border-[var(--color-border)] shadow-[2px_2px_0px_var(--color-border)] rounded-md">
                            [âœ“] {successMsg}
                          </div>
                        )}
                      </div>

                      {/* Submit 3D Button */}
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-2 border-[var(--color-border)] font-mono font-black text-xs sm:text-sm uppercase py-3 sm:py-3.5 px-4 shadow-[3px_4.5px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[4px_6px_0px_var(--color-border)] active:translate-y-0.5 active:shadow-[1px_1.5px_0px_var(--color-border)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-lg mt-0.5"
                      >
                        <span className="material-symbols-outlined text-[17px]">login</span>
                        {loading ? t.btnLoading : t.btnSubmit}
                      </button>

                      {/* Password helper chip */}
                      <div className="mt-1 p-2 bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] shadow-[2px_2.5px_0px_var(--color-border)] flex items-center justify-between text-[11px] font-mono rounded-lg">
                        <span className="text-[var(--color-text-muted)] font-bold">{t.defaultPwdText}</span>
                        <code className="bg-[var(--color-surface)] text-[var(--color-success)] px-2.5 py-0.5 border border-[var(--color-border)] font-black tracking-wider text-[11px] shadow-[1px_1.5px_0px_var(--color-border)] rounded-md">
                          {t.defaultPwdVal}
                        </code>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modern Responsive Footer */}
      <footer className="w-full border-t-2 border-[var(--color-border)] bg-[var(--color-surface)] py-3.5 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col items-center justify-center gap-1 font-mono text-center">
          <div className="text-xs font-bold text-[var(--color-text-main)] flex items-center justify-center gap-2">
            <span className="size-2 rounded-full bg-[var(--color-success)]" />
            <span>Router Mod {new Date().getFullYear()}</span>
          </div>
          <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
            Developed by{" "}
            <a
              href="https://github.com/techwiz37"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline font-bold inline-flex items-center gap-0.5"
            >
              Techwiz
              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
