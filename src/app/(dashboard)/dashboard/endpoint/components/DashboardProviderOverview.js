"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { LOCALE_COOKIE } from "@/i18n/config";

const CHECK_INTERVAL_SEC = 60;

const TEXT = {
  id: {
    activeProviders: "Provider Aktif",
    connsReady: "Koneksi AI siap digunakan",
    activeAccounts: "Akun Aktif (OK)",
    readyExec: "Siap melayani request",
    limitedAccounts: "Akun Limit",
    limitSub: "Limit token / kuota / 429",
    failedAccounts: "Akun Mati",
    needCheck: "Perlu dicek / mati",
    tokensUsed: "Token Terpakai",
    totalReqs: "Total request",
    sectionTitle: "Status Provider & Riwayat Token",
    sectionSub: "Monitor akun aktif, limit, mati, dan kuota pemakaian per provider AI",
    btnManage: "Atur Provider",
    btnUsage: "Detail Kuota",
    thProvider: "Provider AI",
    thStatus: "Status",
    thTotal: "Total Akun",
    thActive: "Akun Aktif",
    thLimited: "Akun Limit",
    thFailed: "Akun Mati",
    thPrompt: "Input (Prompt)",
    thCompletion: "Keluaran",
    thTotalTokens: "Total Token",
    badgeOnline: "ONLINE",
    badgeOffline: "OFFLINE",
    emptyTitle: "Belum Ada Provider Terpasang",
    emptySub: "Pasang API key (OpenAI, Anthropic, Gemini, DeepSeek, dsb.) buat mulai routing AI lu.",
    btnAdd: "Tambah Provider Baru",
    loading: "Lagi narik data provider...",
    liveCheck: "Live Cek",
    checking: "Mengecek...",
    btnCheckNow: "Cek Sekarang",
    limitedSectionTitle: "Tabel Akun Terkena Limit (Token / Quota)",
    limitedSectionSub: "Daftar akun yang sedang terkena limit token, rate limit (429), saldo habis (402), atau model lock",
    thLimitProvider: "Provider AI",
    thLimitAccount: "Akun / Node",
    thLimitType: "Jenis Limit",
    thLimitReset: "Estimasi Reset",
    thLimitReason: "Alasan / Pesan Error",
    thLimitAction: "Aksi",
    emptyLimitedTitle: "Semua Akun Normal",
    emptyLimitedSub: "Tidak ada akun yang terkena limit kuota, rate limit, atau token habis saat ini.",
    allProviders: "Semua Provider",
    searchAccount: "Cari akun / email...",
    btnRecheck: "Cek Ulang",
    rechecking: "Mengecek...",
    resetSoon: "Segera reset",
    noResetTime: "Tidak ada info reset",
    unitDay: "hari",
    unitHour: "jam",
    unitMin: "m",
    unitSec: "d",
  },
  en: {
    activeProviders: "Live Providers",
    connsReady: "AI connections ready",
    activeAccounts: "Active Accounts (OK)",
    readyExec: "Ready to route requests",
    limitedAccounts: "Limited Accounts",
    limitSub: "Rate / Quota limited",
    failedAccounts: "Dead Accounts",
    needCheck: "Needs attention / dead",
    tokensUsed: "Tokens Consumed",
    totalReqs: "Total requests",
    sectionTitle: "Provider Status & Token Usage",
    sectionSub: "Live view of healthy, limited, dead accounts, and lifetime tokens",
    btnManage: "Manage Providers",
    btnUsage: "Usage Details",
    thProvider: "AI Provider",
    thStatus: "Status",
    thTotal: "Total Accs",
    thActive: "Active Accounts",
    thLimited: "Limited Accounts",
    thFailed: "Dead Accounts",
    thPrompt: "Input (Prompt)",
    thCompletion: "Output",
    thTotalTokens: "Total Tokens",
    badgeOnline: "ONLINE",
    badgeOffline: "OFFLINE",
    emptyTitle: "No Providers Configured Yet",
    emptySub: "Connect your AI API keys (OpenAI, Anthropic, Gemini, DeepSeek, etc.) to start routing.",
    btnAdd: "Add New Provider",
    loading: "Fetching provider metrics...",
    liveCheck: "Live Check",
    checking: "Checking...",
    btnCheckNow: "Check Now",
    limitedSectionTitle: "Limited Accounts Table (Token / Quota)",
    limitedSectionSub: "Accounts currently hit by token limit, rate limit (429), zero balance (402), or model locks",
    thLimitProvider: "AI Provider",
    thLimitAccount: "Account / Node",
    thLimitType: "Limit Type",
    thLimitReset: "Reset Time",
    thLimitReason: "Reason / Error Detail",
    thLimitAction: "Action",
    emptyLimitedTitle: "All Accounts Healthy",
    emptyLimitedSub: "No accounts are currently rate-limited or quota-exhausted.",
    allProviders: "All Providers",
    searchAccount: "Search account / email...",
    btnRecheck: "Recheck",
    rechecking: "Checking...",
    resetSoon: "Resetting soon",
    noResetTime: "No reset info",
    unitDay: "days",
    unitHour: "hr",
    unitMin: "m",
    unitSec: "s",
  },
};

function fmtNum(n) {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatResetAt(resetAt, t) {
  if (!resetAt) return t.noResetTime;
  const d = new Date(resetAt);
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return t.resetSoon;
  const totalSec = Math.ceil(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (days > 0) {
    return h > 0 ? `${days} ${t.unitDay} ${h} ${t.unitHour}` : `${days} ${t.unitDay}`;
  }
  const parts = [];
  if (h > 0) parts.push(`${h} ${t.unitHour}`);
  if (m > 0) parts.push(`${m}${t.unitMin}`);
  if (s > 0 || parts.length === 0) parts.push(`${s}${t.unitSec}`);
  return parts.join(" ");
}

function getLocale() {
  if (typeof document === "undefined") return "id";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const val = cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
  if (val === "en" || val === "id") return val;
  const ls = localStorage.getItem("app_locale");
  return ls === "en" ? "en" : "id";
}

export default function DashboardProviderOverview() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState("id");
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [liveChecking, setLiveChecking] = useState(false);
  const [countdown, setCountdown] = useState(CHECK_INTERVAL_SEC);
  const [providerFilter, setProviderFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [recheckingId, setRecheckingId] = useState(null);

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  const t = TEXT[locale] || TEXT.id;

  const fetchStats = async (isLiveCheck = false) => {
    if (isLiveCheck) setLiveChecking(true);
    try {
      const url = isLiveCheck ? "/api/dashboard/stats?check=1" : "/api/dashboard/stats";
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to load dashboard provider stats:", e);
    } finally {
      setLoading(false);
      if (isLiveCheck) setLiveChecking(false);
      setCountdown(CHECK_INTERVAL_SEC);
    }
  };

  const handleManualCheck = async () => {
    await fetchStats(true);
  };

  const handleRecheckSingle = async (connId, provider) => {
    setRecheckingId(connId);
    try {
      await fetch("/api/providers/health-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connId, provider }),
      });
      await fetchStats(false);
    } catch (e) {
      console.error("Failed to recheck connection:", e);
    } finally {
      setRecheckingId(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await fetch("/api/dashboard/seed-usage", { method: "POST" });
      await fetchStats(false);
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await fetch("/api/dashboard/seed-usage", { method: "DELETE" });
      await fetchStats(false);
    } finally {
      setClearing(false);
    }
  };

  // Live check every 20 seconds
  useEffect(() => {
    fetchStats(false);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStats(false);
          return CHECK_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const summary = data?.summary || {
    totalProviders: 0,
    activeProviders: 0,
    totalAccounts: 0,
    totalActiveAccounts: 0,
    totalLimitedAccounts: 0,
    totalFailedAccounts: 0,
    totalTokens: 0,
    totalRequests: 0,
  };

  const providers = data?.providers || [];
  const limitedAccountsList = data?.limitedAccountsList || [];

  const filteredLimitedAccounts = useMemo(() => {
    return limitedAccountsList.filter((acc) => {
      if (providerFilter !== "all" && acc.provider !== providerFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const name = (acc.name || "").toLowerCase();
        const email = (acc.email || "").toLowerCase();
        const reason = (acc.lastError || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !reason.includes(q)) return false;
      }
      return true;
    });
  }, [limitedAccountsList, providerFilter, searchFilter]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* 5 Hero Neobrutalism Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* Active Providers */}
        <div className="bg-surface border-2 border-border p-3 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.activeProviders}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-[var(--color-primary)]/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-[var(--color-primary)]">
                hub
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-2xl lg:text-3xl font-black text-text-main">
              {loading ? "..." : summary.activeProviders}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">
              / {summary.totalProviders}
            </span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10px] font-mono text-text-muted flex items-center gap-1.5 truncate">
            <span className="size-1.5 rounded-full bg-[var(--color-success)] animate-pulse shrink-0" />
            <span className="truncate">{t.connsReady}</span>
          </div>
        </div>

        {/* Active Accounts (OK) */}
        <div className="bg-surface border-2 border-border p-3 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.activeAccounts}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-[var(--color-success)]/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-[var(--color-success)]">
                check_circle
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-2xl lg:text-3xl font-black text-[var(--color-success)]">
              {loading ? "..." : summary.totalActiveAccounts}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">Node</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10px] font-mono text-[var(--color-success)] flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">verified</span>
            <span className="truncate">{t.readyExec}</span>
          </div>
        </div>

        {/* Limited Accounts */}
        <div className="bg-surface border-2 border-border p-3 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.limitedAccounts}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-amber-500/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-amber-500">
                speed
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-2xl lg:text-3xl font-black text-amber-500">
              {loading ? "..." : summary.totalLimitedAccounts}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">Node</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10px] font-mono text-amber-500/90 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">hourglass_top</span>
            <span className="truncate">{t.limitSub}</span>
          </div>
        </div>

        {/* Dead Accounts */}
        <div className="bg-surface border-2 border-border p-3 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.failedAccounts}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-red-500/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-red-500">
                error
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-2xl lg:text-3xl font-black text-red-500">
              {loading ? "..." : summary.totalFailedAccounts}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">Node</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10px] font-mono text-red-500/90 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">warning</span>
            <span className="truncate">{t.needCheck}</span>
          </div>
        </div>

        {/* Lifetime Token Usage */}
        <div className="col-span-2 sm:col-span-1 bg-surface border-2 border-border p-3 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.tokensUsed}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-purple-500/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-purple-500">
                token
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-2xl lg:text-3xl font-black text-text-main truncate">
              {loading ? "..." : fmtNum(summary.totalTokens)}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted shrink-0">Tok</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10px] font-mono text-text-muted flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">query_stats</span>
            <span className="truncate">{fmtNum(summary.totalRequests)} {t.totalReqs}</span>
          </div>
        </div>
      </div>

      {/* Provider Details Table & Status Grid */}
      <div className="bg-surface border-2 border-border rounded-xl shadow-[3px_4px_0px_var(--color-border)] overflow-hidden">
        {/* Header Bar */}
        <div className="p-3.5 sm:p-5 border-b-2 border-border flex flex-wrap items-center justify-between gap-3 bg-surface-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-[var(--color-primary)]/15 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center text-[var(--color-primary)] shrink-0">
              <span className="material-symbols-outlined text-[18px]">dns</span>
            </div>
            <div className="min-w-0">
              <h2 className="font-mono text-xs sm:text-sm md:text-base font-bold text-text-main uppercase tracking-wider truncate">
                {t.sectionTitle}
              </h2>
              <p className="font-mono text-[10px] sm:text-[11px] text-text-muted truncate">
                {t.sectionSub}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Live Check Indicator & Refresh Button */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-surface font-mono text-[10.5px] text-text-muted shadow-[1px_1px_0px_var(--color-border)]">
              <span className="size-2 rounded-full bg-[var(--color-success)] animate-pulse shrink-0" />
              <span>{t.liveCheck}:</span>
              <span className="font-bold text-text-main">{countdown}s</span>
            </div>

            <button
              onClick={handleManualCheck}
              disabled={liveChecking}
              title="Cek live status akun mati sekarang"
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border-2 border-border bg-surface hover:bg-surface-2 text-text-main transition-all font-mono text-[11px] font-bold uppercase shadow-[1.5px_1.5px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[14px] ${liveChecking ? "animate-spin text-[var(--color-primary)]" : ""}`}>
                {liveChecking ? "progress_activity" : "sync"}
              </span>
              <span className="hidden sm:inline">{liveChecking ? t.checking : t.btnCheckNow}</span>
            </button>

            {/* Mock data buttons */}
            <button
              onClick={handleSeed}
              disabled={seeding}
              title="Generate mock data"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main transition-all font-mono text-[10px] font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[13px]">{seeding ? "progress_activity" : "science"}</span>
              <span className="hidden sm:inline">{seeding ? "..." : "Mock"}</span>
            </button>
            <button
              onClick={handleClear}
              disabled={clearing}
              title="Clear mock data"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-red-500/40 bg-surface hover:bg-red-500/10 text-red-500/60 hover:text-red-500 transition-all font-mono text-[10px] font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[13px]">{clearing ? "progress_activity" : "delete_sweep"}</span>
              <span className="hidden sm:inline">{clearing ? "..." : "Clear"}</span>
            </button>

            <Link
              href="/dashboard/providers"
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 transition-all font-mono text-[11px] font-bold uppercase text-center"
            >
              <span className="material-symbols-outlined text-[15px] shrink-0">add_circle</span>
              <span className="truncate">{t.btnManage}</span>
            </Link>
            <Link
              href="/dashboard/usage"
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 transition-all font-mono text-[11px] font-bold uppercase text-center"
            >
              <span className="material-symbols-outlined text-[15px] shrink-0">analytics</span>
              <span className="truncate">{t.btnUsage}</span>
            </Link>
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="p-8 text-center font-mono text-sm text-text-muted flex items-center justify-center gap-2">
            <span className="material-symbols-outlined animate-spin text-[20px] text-[var(--color-primary)]">
              progress_activity
            </span>
            <span>{t.loading}</span>
          </div>
        ) : providers.length === 0 ? (
          <div className="p-6 sm:p-10 text-center flex flex-col items-center justify-center gap-3">
            <div className="size-12 rounded-xl bg-surface-2 border-2 border-border shadow-[2px_2px_0px_var(--color-border)] flex items-center justify-center text-text-muted">
              <span className="material-symbols-outlined text-[24px]">cloud_off</span>
            </div>
            <p className="font-mono text-sm font-bold text-text-main">
              {t.emptyTitle}
            </p>
            <p className="font-mono text-xs text-text-muted max-w-md">
              {t.emptySub}
            </p>
            <Link
              href="/dashboard/providers"
              className="mt-2 px-4 py-2 rounded-lg border-2 border-border bg-[var(--color-primary)] text-white shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] active:translate-y-0 transition-all font-mono text-xs font-bold uppercase flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>{t.btnAdd}</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse min-w-[400px]">
              <thead>
                <tr className="border-b-2 border-border bg-surface-2/60 text-text-muted text-[10px] sm:text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 sm:py-3 px-2.5 sm:px-5">{t.thProvider}</th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">{t.thStatus}</th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">{t.thTotal}</th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">{t.thActive}</th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">{t.thLimited}</th>
                  <th className="py-2.5 sm:py-3 px-1.5 sm:px-3 text-center">{t.thFailed}</th>
                  <th className="hidden sm:table-cell py-2.5 sm:py-3 px-2 sm:px-3 text-right">{t.thPrompt}</th>
                  <th className="hidden sm:table-cell py-2.5 sm:py-3 px-2 sm:px-3 text-right">{t.thCompletion}</th>
                  <th className="py-2.5 sm:py-3 px-2.5 sm:px-5 text-right">{t.thTotalTokens}</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-border">
                {providers.map((p) => {
                  const iconSrc = getProviderIconSrc(p.provider);
                  const isOnline = p.isFree || p.activeAccounts > 0 || p.limitedAccounts > 0;
                  return (
                    <tr
                      key={p.provider}
                      onClick={() => router.push(`/dashboard/providers/${p.provider}`)}
                      className="hover:bg-surface-2/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2 sm:py-3 px-2.5 sm:px-5">
                        <div className="flex items-center gap-1.5 sm:gap-3">
                          <div className="size-6 sm:size-8 rounded-lg bg-surface-2 border-2 border-border shadow-[1px_1px_0px_var(--color-border)] flex items-center justify-center shrink-0 overflow-hidden p-0.5 sm:p-1">
                            {iconSrc ? (
                              <ProviderIcon
                                src={iconSrc}
                                alt={p.name}
                                size={18}
                                className="object-contain"
                              />
                            ) : (
                              <span className="material-symbols-outlined text-[14px] text-text-muted">
                                hub
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-text-main text-[11px] sm:text-sm truncate max-w-[80px] sm:max-w-none">{p.name}</span>
                              {p.isFree && (
                                <span className="shrink-0 px-1 py-0 rounded text-[8px] sm:text-[9px] font-black uppercase bg-amber-400/20 text-amber-500 border border-amber-400/30">FREE</span>
                              )}
                            </div>
                            <div className="text-[9px] sm:text-[9.5px] text-text-muted uppercase truncate">
                              {p.provider}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 sm:py-3 px-1.5 sm:px-3 text-center">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded-md border border-border bg-[var(--color-success)]/15 text-[var(--color-success)] font-bold text-[9px] sm:text-[10px] shadow-[1px_1px_0px_var(--color-border)]">
                            <span className="size-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                            <span className="hidden sm:inline">{t.badgeOnline}</span>
                            <span className="sm:hidden">ON</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-1 sm:px-2 py-0.5 rounded-md border border-border bg-red-500/15 text-red-500 font-bold text-[9px] sm:text-[10px] shadow-[1px_1px_0px_var(--color-border)]">
                            <span className="size-1.5 rounded-full bg-red-500" />
                            <span className="hidden sm:inline">{t.badgeOffline}</span>
                            <span className="sm:hidden">OFF</span>
                          </span>
                        )}
                      </td>

                      {/* TOTAL AKUN */}
                      <td className="py-2 sm:py-3 px-1.5 sm:px-3 text-center">
                        <span className="font-bold text-text-main text-[11px]">{p.totalAccounts}</span>
                      </td>

                      {/* AKUN AKTIF */}
                      <td className="py-2 sm:py-3 px-1.5 sm:px-3 text-center">
                        {p.isFree ? (
                          <span className="px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-500 font-bold text-[9px] uppercase tracking-wide">FREE</span>
                        ) : p.activeAccounts > 0 ? (
                          <span className="font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded border border-[var(--color-success)]/30 text-[11px]">
                            {p.activeAccounts}
                          </span>
                        ) : (
                          <span className="text-text-muted text-[11px]">0</span>
                        )}
                      </td>

                      {/* AKUN LIMIT */}
                      <td className="py-2 sm:py-3 px-1.5 sm:px-3 text-center">
                        {p.limitedAccounts > 0 ? (
                          <span className="font-bold text-amber-500 bg-amber-400/15 px-1 py-0.5 rounded border border-amber-400/40 inline-flex items-center gap-0.5 text-[10px]">
                            <span className="material-symbols-outlined text-[9px] leading-none">speed</span>
                            {p.limitedAccounts}
                          </span>
                        ) : (
                          <span className="text-text-muted text-[11px]">—</span>
                        )}
                      </td>

                      {/* AKUN MATI */}
                      <td className="py-2 sm:py-3 px-1.5 sm:px-3 text-center">
                        {p.failedAccounts > 0 ? (
                          <span className="font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30 text-[11px]">
                            {p.failedAccounts}
                          </span>
                        ) : (
                          <span className="text-text-muted text-[11px]">—</span>
                        )}
                      </td>

                      <td className="hidden sm:table-cell py-2 sm:py-3 px-2 sm:px-3 text-right text-text-muted">
                        {fmtNum(p.promptTokens)}
                      </td>
                      <td className="hidden sm:table-cell py-2 sm:py-3 px-2 sm:px-3 text-right text-text-muted">
                        {fmtNum(p.completionTokens)}
                      </td>
                      <td className="py-2 sm:py-3 px-2.5 sm:px-5 text-right font-bold text-text-main">
                        <span className="text-[var(--color-primary)] text-[11px] sm:text-xs">{fmtNum(p.tokens)}</span>
                        {p.requests > 0 && (
                          <span className="block text-[8.5px] sm:text-[9.5px] text-text-muted font-normal">
                            {fmtNum(p.requests)} reqs
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NEW: Dedicated Table for Limited Accounts (Tabel Akun Terkena Limit) */}
      <div className="bg-surface border-2 border-border rounded-xl shadow-[3px_4px_0px_var(--color-border)] overflow-hidden">
        {/* Section Header */}
        <div className="p-3.5 sm:p-5 border-b-2 border-border flex flex-wrap items-center justify-between gap-3 bg-surface-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-amber-500/15 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center text-amber-500 shrink-0">
              <span className="material-symbols-outlined text-[18px]">speed</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-xs sm:text-sm md:text-base font-bold text-text-main uppercase tracking-wider truncate">
                  {t.limitedSectionTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 font-mono text-[10px] font-bold">
                  {summary.totalLimitedAccounts} Node
                </span>
              </div>
              <p className="font-mono text-[10px] sm:text-[11px] text-text-muted truncate">
                {t.limitedSectionSub}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Provider Filter */}
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="h-8 px-2.5 rounded-lg border-2 border-border bg-surface font-mono text-xs font-bold text-text-main shadow-[1.5px_1.5px_0px_var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              <option value="all">{t.allProviders}</option>
              {providers
                .filter((p) => p.limitedAccounts > 0)
                .map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.name} ({p.limitedAccounts})
                  </option>
                ))}
            </select>

            {/* Search Input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-[15px]">
                search
              </span>
              <input
                type="text"
                placeholder={t.searchAccount}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-8 pl-7 pr-2.5 rounded-lg border-2 border-border bg-surface font-mono text-xs text-text-main placeholder:text-text-muted shadow-[1.5px_1.5px_0px_var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] w-36 sm:w-48"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {limitedAccountsList.length === 0 ? (
          <div className="p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-2.5">
            <div className="size-10 rounded-xl bg-[var(--color-success)]/15 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center text-[var(--color-success)]">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
            </div>
            <p className="font-mono text-xs sm:text-sm font-bold text-text-main">
              {t.emptyLimitedTitle}
            </p>
            <p className="font-mono text-[11px] text-text-muted max-w-md">
              {t.emptyLimitedSub}
            </p>
          </div>
        ) : filteredLimitedAccounts.length === 0 ? (
          <div className="p-6 text-center font-mono text-xs text-text-muted">
            Tidak ada akun limit yang cocok dengan filter pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b-2 border-border bg-surface-2 text-text-muted text-[10px] sm:text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 sm:px-4">{t.thLimitProvider}</th>
                  <th className="py-2.5 px-3 sm:px-4">{t.thLimitAccount}</th>
                  <th className="py-2.5 px-2 sm:px-3">{t.thLimitType}</th>
                  <th className="py-2.5 px-2 sm:px-3">{t.thLimitReset}</th>
                  <th className="py-2.5 px-3 sm:px-4">{t.thLimitReason}</th>
                  <th className="py-2.5 px-3 sm:px-4 text-center">{t.thLimitAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-border">
                {filteredLimitedAccounts.map((acc) => {
                  const iconSrc = getProviderIconSrc(acc.provider);
                  const isRechecking = recheckingId === acc.id;
                  return (
                    <tr key={acc.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="py-2 px-3 sm:px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded bg-surface-2 border border-border flex items-center justify-center overflow-hidden p-0.5 shrink-0">
                            {iconSrc ? (
                              <ProviderIcon src={iconSrc} alt={acc.providerName} size={16} />
                            ) : (
                              <span className="material-symbols-outlined text-[13px] text-text-muted">hub</span>
                            )}
                          </div>
                          <span className="font-bold text-text-main text-xs">{acc.providerName}</span>
                        </div>
                      </td>

                      <td className="py-2 px-3 sm:px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[13px] text-text-muted">
                            {acc.authType === "oauth" ? "lock" : "key"}
                          </span>
                          <span className="font-bold text-text-main text-xs truncate max-w-[160px] sm:max-w-[220px]" title={acc.name}>
                            {acc.name}
                          </span>
                        </div>
                        {acc.email && acc.email !== acc.name && (
                          <div className="text-[10px] text-text-muted truncate max-w-[160px] sm:max-w-[220px]">
                            {acc.email}
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-2 sm:px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 font-bold text-[9px] shadow-[1px_1px_0px_var(--color-border)]">
                          <span className="size-1 rounded-full bg-amber-500 shrink-0" />
                          {acc.limitType}
                        </span>
                      </td>

                      <td className="py-2 px-2 sm:px-3 whitespace-nowrap text-text-muted text-[11px]">
                        <span className="font-mono text-text-main font-semibold">
                          {formatResetAt(acc.resetAt, t)}
                        </span>
                      </td>

                      <td className="py-2 px-3 sm:px-4 max-w-[260px] sm:max-w-[340px]">
                        <p className="text-[10.5px] text-text-muted font-mono truncate" title={acc.lastError}>
                          {acc.lastError || "Akun terkena batas kuota / rate limit"}
                        </p>
                      </td>

                      <td className="py-2 px-3 sm:px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleRecheckSingle(acc.id, acc.provider)}
                          disabled={isRechecking}
                          title="Cek ulang akun ini"
                          className="px-2 py-1 rounded-md border border-border bg-surface hover:bg-surface-2 text-text-main font-mono text-[10px] font-bold shadow-[1px_1px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 transition-all inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <span className={`material-symbols-outlined text-[12px] ${isRechecking ? "animate-spin text-[var(--color-primary)]" : ""}`}>
                            {isRechecking ? "progress_activity" : "refresh"}
                          </span>
                          <span>{isRechecking ? t.rechecking : t.btnRecheck}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
