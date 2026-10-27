"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";
import AntaresStat from "@/shared/components/AntaresStat";
import { getProviderIconSrc, getCompatibleIconSrc } from "@/shared/utils/providerIcon";
import { LOCALE_COOKIE } from "@/i18n/config";

const CHECK_INTERVAL_SEC = 180;
const PAGE_SIZE = 5;

const TEXT = {
  id: {
    activeProviders: "Provider Aktif",
    connsReady: "AI siap dipecut",
    activeAccounts: "Akun Aktif",
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
    limitedSectionTitle: "List Akun Limit",
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
    reasonAuth: "API key tidak valid / tidak berwenang",
    reasonBalance: "Saldo atau kuota akun ini habis — perlu isi ulang",
    reasonRate: "Terlalu banyak request (rate limit) — tunggu sebentar lalu coba lagi",
    reasonQuota: "Kuota periode ini sudah habis",
    reasonLimit: "Akun sedang terkena limit",
  },
  en: {
    activeProviders: "Live Providers",
    connsReady: "AI ready to burn",
    activeAccounts: "Active Accounts",
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
    limitedSectionTitle: "Limited Account List",
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
    reasonAuth: "Invalid / unauthorized API key",
    reasonBalance: "Account balance or quota exhausted — top up required",
    reasonRate: "Too many requests (rate limit) — wait a moment and retry",
    reasonQuota: "This period's quota is exhausted",
    reasonLimit: "Account is currently limited",
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

// Unwrap a raw upstream error string like `[429]: [{"error":{"message":"Rate
// limit reached ... retry after 30s"}}]` into { status, message, retryAfterSec }.
// The executor stores `[status]: <body>` and the body may be JSON (object or
// array) or plain text, so we probe for JSON defensively and never throw.
function parseUpstreamError(raw) {
  const out = { status: null, message: "", retryAfterSec: null };
  if (!raw) return out;
  let text = String(raw).trim();

  const statusMatch = text.match(/^\[(\d{3})\]:\s*([\s\S]*)$/);
  if (statusMatch) {
    out.status = Number(statusMatch[1]);
    text = statusMatch[2].trim();
  }

  const extractMsg = (obj) => {
    const target = Array.isArray(obj) ? obj[0] : obj;
    return (
      target?.error?.message ||
      target?.message ||
      (typeof target?.error === "string" ? target.error : null) ||
      null
    );
  };

  let msg = null;
  try {
    msg = extractMsg(JSON.parse(text));
  } catch {
    // Body isn't clean JSON (may have a prefix); try from the first brace.
    const braceIdx = text.indexOf("{");
    if (braceIdx >= 0) {
      try {
        msg = extractMsg(JSON.parse(text.slice(braceIdx)));
      } catch { /* fall through to raw */ }
    }
  }
  out.message = msg || text;

  // Pull a reset/retry hint out of the body: `"retry-after": 30` or "retry after 30s".
  const rawStr = String(raw);
  const ra =
    rawStr.match(/"retry-?(?:after|in)"\s*:\s*"?(\d+)/i) ||
    rawStr.match(/(?:retry|try again|wait|reset)[^0-9]{0,14}(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hour|hours)/i);
  if (ra) {
    let n = Number(ra[1]);
    const unit = (ra[2] || "s").toLowerCase();
    if (unit.startsWith("m")) n *= 60;
    else if (unit.startsWith("h")) n *= 3600;
    if (Number.isFinite(n) && n > 0) out.retryAfterSec = n;
  }
  return out;
}

// Turn a parsed upstream error into a short human sentence in the active locale.
function humanizeLimit(parsed, t) {
  const lower = (parsed.message || "").toLowerCase();
  const s = parsed.status;
  if (s === 401 || lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("api key not valid")) {
    return t.reasonAuth;
  }
  if (s === 402 || lower.includes("insufficient") || lower.includes("balance") || lower.includes("credit") || lower.includes("out of credit")) {
    return t.reasonBalance;
  }
  if (s === 429 || lower.includes("rate limit") || lower.includes("too many request") || lower.includes("rate_limit")) {
    return t.reasonRate;
  }
  if (lower.includes("quota") || lower.includes("allowance")) {
    return t.reasonQuota;
  }
  if (lower.includes("limit")) {
    return t.reasonLimit;
  }
  return parsed.message || t.reasonLimit;
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
  const [liveChecking, setLiveChecking] = useState(false);
  const [countdown, setCountdown] = useState(CHECK_INTERVAL_SEC);
  const [providerFilter, setProviderFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [recheckingId, setRecheckingId] = useState(null);
  const [providerPage, setProviderPage] = useState(1);
  const [limitedPage, setLimitedPage] = useState(1);

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

  // Realtime live check every 3 minutes & on focus/events
  useEffect(() => {
    fetchStats(false);

    const onEventRefresh = () => {
      fetchStats(false);
    };

    const handleStorage = (e) => {
      if (e.key === "routermod:providers-changed") {
        fetchStats(false);
      }
    };

    window.addEventListener("focus", onEventRefresh);
    document.addEventListener("visibilitychange", onEventRefresh);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("routermod:providers-changed", onEventRefresh);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (typeof document !== "undefined" && document.visibilityState === "visible") {
            fetchStats(false);
          }
          return CHECK_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onEventRefresh);
      document.removeEventListener("visibilitychange", onEventRefresh);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("routermod:providers-changed", onEventRefresh);
    };
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

  // ── Pagination (5 rows per page) ──────────────────────────────────────────
  const providerTotalPages = Math.max(1, Math.ceil(providers.length / PAGE_SIZE));
  const safeProviderPage = Math.min(providerPage, providerTotalPages);
  const pagedProviders = useMemo(
    () => providers.slice((safeProviderPage - 1) * PAGE_SIZE, safeProviderPage * PAGE_SIZE),
    [providers, safeProviderPage]
  );

  const limitedTotalPages = Math.max(1, Math.ceil(filteredLimitedAccounts.length / PAGE_SIZE));
  const safeLimitedPage = Math.min(limitedPage, limitedTotalPages);
  const pagedLimitedAccounts = useMemo(
    () => filteredLimitedAccounts.slice((safeLimitedPage - 1) * PAGE_SIZE, safeLimitedPage * PAGE_SIZE),
    [filteredLimitedAccounts, safeLimitedPage]
  );

  // Reset to page 1 whenever the underlying list shrinks (refresh / filter).
  useEffect(() => {
    if (providerPage > providerTotalPages) setProviderPage(providerTotalPages);
  }, [providerPage, providerTotalPages]);
  useEffect(() => {
    if (limitedPage > limitedTotalPages) setLimitedPage(limitedTotalPages);
  }, [limitedPage, limitedTotalPages]);
  useEffect(() => {
    setLimitedPage(1);
  }, [providerFilter, searchFilter]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* 5 Hero Metrics Cards — Antares tiles */}
      <div className="an-grid gap-2.5 sm:gap-3">
        {/* Active Providers */}
        <AntaresStat
          label={t.activeProviders}
          icon="hub"
          tone="default"
          value={loading ? "..." : summary.activeProviders}
          unit={`/ ${summary.totalProviders}`}
          foot={t.connsReady}
        />

        {/* Active Accounts */}
        <AntaresStat
          label={t.activeAccounts}
          icon="check_circle"
          tone="ok"
          value={loading ? "..." : summary.totalActiveAccounts}
          unit="Acc"
          foot={t.readyExec}
        />

        {/* Limited Accounts */}
        <AntaresStat
          label={t.limitedAccounts}
          icon="speed"
          tone="warn"
          value={loading ? "..." : summary.totalLimitedAccounts}
          unit="Acc"
          foot={t.limitSub}
        />

        {/* Dead Accounts */}
        <AntaresStat
          label={t.failedAccounts}
          icon="heart_broken"
          tone="danger"
          value={loading ? "..." : summary.totalFailedAccounts}
          unit="Acc"
          foot={t.needCheck}
        />

        {/* Lifetime Token Usage — odd card spans the full row on narrow screens */}
        <AntaresStat
          className="an-stat-wide"
          label={t.tokensUsed}
          icon="token"
          tone="violet"
          value={loading ? "..." : fmtNum(summary.totalTokens)}
          unit="Token"
          foot={`${fmtNum(summary.totalRequests)} ${t.totalReqs}`}
        />
      </div>

      {/* Provider Details Table & Status Grid */}
      <div className="an-panel overflow-hidden">
        {/* Header Bar */}
        <div className="an-panel-head flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">dns</span>
            </span>
            <div className="min-w-0">
              <h2 className="an-panel-title">{t.sectionTitle}</h2>
              <p className="an-panel-sub">{t.sectionSub}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full sm:w-auto sm:items-end">
            {/* Live Check Indicator & Refresh Button */}
            <div className="flex items-center gap-2">
              <div className="an-chip">
                <span className="size-1.5 rounded-full bg-[var(--t-ok)] animate-pulse shrink-0" />
                <span>{t.liveCheck}:</span>
                <span className="font-semibold text-[var(--t-ink)]">{countdown}s</span>
              </div>

              <button
                onClick={handleManualCheck}
                disabled={liveChecking}
                title="Cek live status akun mati sekarang"
                aria-label={t.btnCheckNow}
                className="an-btn an-ghost h-8 w-8 px-0"
              >
                <span className={`material-symbols-outlined text-[14px] ${liveChecking ? "animate-spin text-[var(--t-star-ink)]" : ""}`}>
                  {liveChecking ? "progress_activity" : "sync"}
                </span>
              </button>
            </div>

            {/* Navigation — side by side on every breakpoint */}
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
              <Link
                href="/dashboard/providers"
                className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 justify-center"
              >
                <span className="material-symbols-outlined text-[15px] shrink-0">add_circle</span>
                <span className="truncate">{t.btnManage}</span>
              </Link>
              <Link
                href="/dashboard/usage"
                className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 justify-center"
              >
                <span className="material-symbols-outlined text-[15px] shrink-0">analytics</span>
                <span className="truncate">{t.btnUsage}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="p-8 text-center font-mono text-sm text-[var(--t-muted)] flex items-center justify-center gap-2">
            <span className="material-symbols-outlined animate-spin text-[20px] text-[var(--color-primary)]">
              progress_activity
            </span>
            <span>{t.loading}</span>
          </div>
        ) : providers.length === 0 ? (
          <div className="p-6 sm:p-10 text-center flex flex-col items-center justify-center gap-3">
            <div className="size-12 rounded-[12px] bg-[var(--t-raised)] border border-[var(--t-line)] flex items-center justify-center text-[var(--t-muted)]">
              <span className="material-symbols-outlined text-[24px]">cloud_off</span>
            </div>
            <p className="font-mono text-sm font-bold text-[var(--t-ink)]">
              {t.emptyTitle}
            </p>
            <p className="font-mono text-xs text-[var(--t-muted)] max-w-md">
              {t.emptySub}
            </p>
            <Link
              href="/dashboard/providers"
              className="an-btn an-primary mt-2 text-xs gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>{t.btnAdd}</span>
            </Link>
          </div>
        ) : (
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>{t.thProvider}</th>
                  <th className="text-center">{t.thStatus}</th>
                  <th className="text-center">{t.thTotal}</th>
                  <th className="text-center">{t.thActive}</th>
                  <th className="text-center">{t.thLimited}</th>
                  <th className="text-center">{t.thFailed}</th>
                  <th className="hidden sm:table-cell text-right">{t.thPrompt}</th>
                  <th className="hidden sm:table-cell text-right">{t.thCompletion}</th>
                  <th className="text-right">{t.thTotalTokens}</th>
                </tr>
              </thead>
              <tbody>
                {pagedProviders.map((p) => {
                  const iconSrc = getCompatibleIconSrc(p.provider) || getProviderIconSrc(p.provider);
                  const isOnline = p.isFree || p.activeAccounts > 0 || p.limitedAccounts > 0;
                  return (
                    <tr
                      key={p.provider}
                      onClick={() => router.push(`/dashboard/providers/${p.provider}`)}
                      className="cursor-pointer"
                    >
                      <td>
                        <div className="flex items-center gap-1.5 sm:gap-3">
                          <div className="size-6 sm:size-8 rounded-lg bg-[var(--t-raised)] border border-[var(--t-line)] flex items-center justify-center shrink-0 overflow-hidden p-0.5 sm:p-1">
                            {iconSrc ? (
                              <ProviderIcon
                                src={iconSrc}
                                alt={p.name}
                                size={18}
                                className="object-contain"
                              />
                            ) : (
                              <span className="material-symbols-outlined text-[14px] text-[var(--t-muted)]">
                                hub
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-[var(--t-ink)] text-[11px] sm:text-sm truncate max-w-[80px] sm:max-w-none">{p.name}</span>
                              {p.isFree && (
                                <span className="shrink-0 px-1 py-0 rounded text-[8px] sm:text-[9px] font-black uppercase bg-amber-400/20 text-amber-500 border border-amber-400/30">FREE</span>
                              )}
                            </div>
                            <div className="text-[9px] sm:text-[9.5px] text-[var(--t-muted)] uppercase truncate">
                              {p.subtitle || p.provider}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center">
                        {isOnline ? (
                          <span className="an-chip ok">
                            <span className="size-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                            <span className="hidden sm:inline">{t.badgeOnline}</span>
                            <span className="sm:hidden">ON</span>
                          </span>
                        ) : (
                          <span className="an-chip danger">
                            <span className="size-1.5 rounded-full bg-red-500" />
                            <span className="hidden sm:inline">{t.badgeOffline}</span>
                            <span className="sm:hidden">OFF</span>
                          </span>
                        )}
                      </td>

                      {/* TOTAL AKUN */}
                      <td className="text-center">
                        <span className="font-bold text-[var(--t-ink)] text-[11px]">{p.totalAccounts}</span>
                      </td>

                      {/* AKUN AKTIF */}
                      <td className="text-center">
                        {p.isFree ? (
                          <span className="an-chip" style={{ background: "rgba(240,161,58,0.14)", color: "#f0a13a", borderColor: "rgba(240,161,58,0.3)" }}>FREE</span>
                        ) : p.activeAccounts > 0 ? (
                          <span className="font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded border border-[var(--color-success)]/30 text-[11px]">
                            {p.activeAccounts}
                          </span>
                        ) : (
                          <span className="text-[var(--t-muted)] text-[11px]">0</span>
                        )}
                      </td>

                      {/* AKUN LIMIT */}
                      <td className="text-center">
                        {p.limitedAccounts > 0 ? (
                          <span className="font-bold text-amber-500 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30 text-[11px]">
                            {p.limitedAccounts}
                          </span>
                        ) : (
                          <span className="text-[var(--t-muted)] text-[11px]">—</span>
                        )}
                      </td>

                      {/* AKUN MATI */}
                      <td className="text-center">
                        {p.failedAccounts > 0 ? (
                          <span className="font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30 text-[11px]">
                            {p.failedAccounts}
                          </span>
                        ) : (
                          <span className="text-[var(--t-muted)] text-[11px]">—</span>
                        )}
                      </td>

                      <td className="hidden sm:table-cell py-2 sm:py-3 px-2 sm:px-3 text-right text-[var(--t-muted)]">
                        {fmtNum(p.promptTokens)}
                      </td>
                      <td className="hidden sm:table-cell py-2 sm:py-3 px-2 sm:px-3 text-right text-[var(--t-muted)]">
                        {fmtNum(p.completionTokens)}
                      </td>
                      <td className="text-right num font-bold text-[var(--t-ink)]">
                        <span className="text-[var(--color-primary)] text-[11px] sm:text-xs">{fmtNum(p.tokens)}</span>
                        {p.requests > 0 && (
                          <span className="block text-[8.5px] sm:text-[9.5px] text-[var(--t-muted)] font-normal">
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

        {/* Pagination — 5 provider per page */}
        {!loading && providers.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-[var(--t-line-soft)] text-[11px]">
            <span className="text-[var(--t-muted)]">
              Hal. <span className="font-bold text-[var(--t-ink)]">{safeProviderPage}</span> / {providerTotalPages}
              <span className="hidden sm:inline"> · {providers.length} provider</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setProviderPage((p) => Math.max(1, p - 1))}
                disabled={safeProviderPage <= 1}
                className="an-btn an-ghost h-7 w-7 px-0 font-bold disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_left</span>
              </button>
              <button
                onClick={() => setProviderPage((p) => Math.min(providerTotalPages, p + 1))}
                disabled={safeProviderPage >= providerTotalPages}
                className="an-btn an-ghost h-7 w-7 px-0 font-bold disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Table for Limited Accounts (Tabel Akun Terkena Limit) */}
      <div className="an-panel overflow-hidden">
        {/* Section Header */}
        <div className="an-panel-head flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="an-panel-ico" aria-hidden style={{ background: "rgba(240,161,58,0.14)", color: "#f0a13a", borderColor: "rgba(240,161,58,0.25)" }}>
              <span className="material-symbols-outlined text-[19px]">speed</span>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="an-panel-title">
                  {t.limitedSectionTitle}
                </h2>
                <span className="an-chip" style={{ background: "rgba(240,161,58,0.14)", color: "#f0a13a", borderColor: "rgba(240,161,58,0.3)" }}>
                  {summary.totalLimitedAccounts} Node
                </span>
              </div>
              <p className="an-panel-sub">
                {t.limitedSectionSub}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
            {/* Provider Filter */}
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              aria-label={t.allProviders}
              className="an-select h-8 w-full text-xs"
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
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--t-muted)] text-[15px] pointer-events-none">
                search
              </span>
              <input
                type="text"
                placeholder={t.searchAccount}
                aria-label={t.searchAccount}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="an-input h-8 pl-8 pr-2.5 py-0 text-xs w-full"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {limitedAccountsList.length === 0 ? (
          <div className="p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-2.5">
            <div className="size-10 rounded-[12px] bg-[var(--t-ok-soft)] border border-[rgba(63,179,127,0.3)] flex items-center justify-center text-[var(--t-ok)]">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
            </div>
            <p className="font-mono text-xs sm:text-sm font-bold text-[var(--t-ink)]">
              {t.emptyLimitedTitle}
            </p>
            <p className="font-mono text-[11px] text-[var(--t-muted)] max-w-md">
              {t.emptyLimitedSub}
            </p>
          </div>
        ) : filteredLimitedAccounts.length === 0 ? (
          <div className="p-6 text-center font-mono text-xs text-[var(--t-muted)]">
            Tidak ada akun limit yang cocok dengan filter pencarian.
          </div>
        ) : (
          <div className="an-table-wrap max-h-[380px] overflow-y-auto">
            <table className="an-table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>{t.thLimitProvider}</th>
                  <th>{t.thLimitAccount}</th>
                  <th>{t.thLimitType}</th>
                  <th>{t.thLimitReset}</th>
                  <th>{t.thLimitReason}</th>
                  <th className="text-center">{t.thLimitAction}</th>
                </tr>
              </thead>
              <tbody>
                {pagedLimitedAccounts.map((acc) => {
                  const iconSrc = getCompatibleIconSrc(acc.provider) || getProviderIconSrc(acc.provider);
                  const isRechecking = recheckingId === acc.id;
                  const parsedError = parseUpstreamError(acc.lastError);
                  const reasonText = humanizeLimit(parsedError, t);
                  const derivedResetMs = parsedError.retryAfterSec
                    ? new Date(acc.lastErrorAt || Date.now()).getTime() + parsedError.retryAfterSec * 1000
                    : null;
                  const effectiveResetAt =
                    acc.resetAt || (derivedResetMs ? new Date(derivedResetMs).toISOString() : null);
                  const upstreamDetail =
                    parsedError.message && parsedError.message !== reasonText ? parsedError.message : null;
                  return (
                    <tr key={acc.id}>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded-md bg-[var(--t-raised)] border border-[var(--t-line)] flex items-center justify-center overflow-hidden p-0.5 shrink-0">
                            {iconSrc ? (
                              <ProviderIcon src={iconSrc} alt={acc.providerName} size={16} />
                            ) : (
                              <span className="material-symbols-outlined text-[13px] text-[var(--t-muted)]">hub</span>
                            )}
                          </div>
                          <span className="font-bold text-[var(--t-ink)] text-xs">{acc.providerName}</span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[13px] text-[var(--t-muted)]">
                            {acc.authType === "oauth" ? "lock" : "key"}
                          </span>
                          <span className="font-bold text-[var(--t-ink)] text-xs truncate max-w-[160px] sm:max-w-[220px]" title={acc.name}>
                            {acc.name}
                          </span>
                        </div>
                        {acc.email && acc.email !== acc.name && (
                          <div className="text-[10px] text-[var(--t-muted)] truncate max-w-[160px] sm:max-w-[220px]">
                            {acc.email}
                          </div>
                        )}
                      </td>

                      <td className="whitespace-nowrap">
                        <span className="an-chip" style={{ background: "rgba(240,161,58,0.14)", color: "#f0a13a", borderColor: "rgba(240,161,58,0.35)" }}>
                          <span className="size-1 rounded-full bg-[#f0a13a] shrink-0" />
                          {acc.limitType}
                        </span>
                      </td>

                      <td className="whitespace-nowrap text-[var(--t-muted)] text-[11px]">
                        <span className="font-mono text-[var(--t-ink)] font-semibold">
                          {formatResetAt(effectiveResetAt, t)}
                        </span>
                      </td>

                      <td className="max-w-[260px] sm:max-w-[340px]">
                        <p className="text-[10.5px] text-[var(--t-ink)] font-mono truncate" title={acc.lastError}>
                          {reasonText}
                        </p>
                        {upstreamDetail && (
                          <p className="text-[9px] text-[var(--t-muted)] font-mono truncate" title={acc.lastError}>
                            {upstreamDetail}
                          </p>
                        )}
                      </td>

                      <td className="text-center whitespace-nowrap">
                        <button
                          onClick={() => handleRecheckSingle(acc.id, acc.provider)}
                          disabled={isRechecking}
                          title="Cek ulang akun ini"
                          className="an-btn an-ghost h-7 px-2 text-[10px] font-medium gap-1 disabled:opacity-50"
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

        {/* Pagination — 5 akun limit per page */}
        {filteredLimitedAccounts.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-[var(--t-line-soft)] text-[11px]">
            <span className="text-[var(--t-muted)]">
              Hal. <span className="font-bold text-[var(--t-ink)]">{safeLimitedPage}</span> / {limitedTotalPages}
              <span className="hidden sm:inline"> · {filteredLimitedAccounts.length} akun</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setLimitedPage((p) => Math.max(1, p - 1))}
                disabled={safeLimitedPage <= 1}
                className="an-btn an-ghost h-7 w-7 px-0 font-bold disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_left</span>
              </button>
              <button
                onClick={() => setLimitedPage((p) => Math.min(limitedTotalPages, p + 1))}
                disabled={safeLimitedPage >= limitedTotalPages}
                className="an-btn an-ghost h-7 w-7 px-0 font-bold disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}






