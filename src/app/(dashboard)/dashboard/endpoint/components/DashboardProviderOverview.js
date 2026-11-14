"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";
import AntaresStat from "@/shared/components/AntaresStat";
import { getProviderIconSrc, getCompatibleIconSrc } from "@/shared/utils/providerIcon";
import { LOCALE_COOKIE } from "@/i18n/config";
import { onLocaleChange } from "@/i18n/runtime";

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
    tokensUsed: "Token Bulan Ini",
    totalReqs: "request bulan ini",
    sectionTitle: "Status Provider & Token Bulan Ini",
    sectionSub: "Monitor akun aktif, limit, mati, dan pemakaian token periode berjalan",
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
    reasonModalTitle: "Detail Alasan Limit",
    reasonModalSub: "Pesan asli dari provider yang membuat akun ini dikeluarkan dari rotasi",
    reasonStatus: "Status HTTP",
    reasonAt: "Waktu Kejadian",
    reasonResetAt: "Reset Diperkirakan",
    reasonLimitType: "Jenis Limit",
    reasonRaw: "Teks mentah (raw)",
    reasonParsed: "Pesan terurai",
    reasonEmpty: "Tidak ada detail alasan tersimpan untuk akun ini.",
    reasonCopy: "Salin",
    reasonCopied: "Tersalin!",
    reasonClose: "Tutup",
    reasonHint: "Klik baris alasan untuk melihat detail lengkap",
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
    tokensUsed: "Tokens This Month",
    totalReqs: "requests this month",
    sectionTitle: "Provider Status & Monthly Tokens",
    sectionSub: "Live view of healthy, limited, dead accounts, and current month tokens",
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
    reasonModalTitle: "Limit Reason Detail",
    reasonModalSub: "Raw provider message that took this account out of rotation",
    reasonStatus: "HTTP Status",
    reasonAt: "Occurred At",
    reasonResetAt: "Estimated Reset",
    reasonLimitType: "Limit Type",
    reasonRaw: "Raw text",
    reasonParsed: "Parsed message",
    reasonEmpty: "No reason detail was stored for this account.",
    reasonCopy: "Copy",
    reasonCopied: "Copied!",
    reasonClose: "Close",
    reasonHint: "Click the reason row to see the full detail",
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
  if (typeof document === "undefined") return "en";
  const ls = localStorage.getItem("app_locale");
  if (ls === "en" || ls === "id") return ls;
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const val = cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
  if (val === "en" || val === "id") return val;
  return "en";
}

function formatDateTime(iso, locale) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

// Pretty-print a raw upstream body when it can be parsed as JSON; keeps the
// full payload intact instead of the truncated table cell.
function prettyRaw(raw) {
  const text = String(raw || "").trim();
  const braceIdx = text.indexOf("{");
  const bracketIdx = text.indexOf("[");
  const start = [braceIdx, bracketIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start !== undefined) {
    try {
      return JSON.stringify(JSON.parse(text.slice(start)), null, 2);
    } catch { /* keep raw text */ }
  }
  return text;
}

function LimitReasonModal({ account, parsed, reasonText, resetText, locale, t, onClose }) {
  const [copied, setCopied] = useState(false);
  const raw = account?.lastError || "";

  useEffect(() => {
    if (!account) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [account, onClose]);

  // Reset the copy confirmation when the dialog is reopened for another account.
  useEffect(() => {
    setCopied(false);
  }, [account?.id]);

  if (!account) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  const iconSrc = account.iconSrc;
  const rawPretty = prettyRaw(raw);

  return (
    <>
      <style>{`
        @keyframes rmFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rmPopIn { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }
      `}</style>
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t.reasonModalTitle}
      style={{ animation: "rmFadeIn 140ms ease-out" }}
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl max-h-[86vh] flex flex-col rounded-2xl border border-[var(--t-line)] bg-[var(--t-card)] shadow-2xl overflow-hidden"
        style={{ animation: "rmPopIn 160ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-[var(--t-line-soft)]">
          <div className="size-10 rounded-xl bg-[var(--t-raised)] border border-[var(--t-line)] flex items-center justify-center overflow-hidden p-1 shrink-0">
            {iconSrc ? (
              <ProviderIcon src={iconSrc} alt={account.providerName} size={24} />
            ) : (
              <span className="material-symbols-outlined text-[18px] text-[var(--t-muted)]">hub</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-[var(--t-ink)] truncate">{account.name || account.providerName}</h3>
            <p className="text-[11px] text-[var(--t-muted)] truncate">
              {account.providerName}
              {account.email && account.email !== account.name ? ` · ${account.email}` : ""}
            </p>
            <p className="text-[10px] text-[var(--t-muted)] mt-0.5">{t.reasonModalSub}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t.reasonClose}
            className="size-8 rounded-lg flex items-center justify-center text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 border-b border-[var(--t-line-soft)]">
          <div className="rounded-lg bg-[var(--t-raised)] px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-[var(--t-muted)]">{t.reasonStatus}</div>
            <div className="text-xs font-mono font-bold text-[var(--t-ink)]">{parsed.status ? String(parsed.status) : "-"}</div>
          </div>
          <div className="rounded-lg bg-[var(--t-raised)] px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-[var(--t-muted)]">{t.reasonLimitType}</div>
            <div className="text-xs font-bold text-[#f0a13a] truncate">{account.limitType || "-"}</div>
          </div>
          <div className="rounded-lg bg-[var(--t-raised)] px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-[var(--t-muted)]">{t.reasonAt}</div>
            <div className="text-[11px] font-semibold text-[var(--t-ink)] truncate">{formatDateTime(account.lastErrorAt, locale)}</div>
          </div>
          <div className="rounded-lg bg-[var(--t-raised)] px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-[var(--t-muted)]">{t.reasonResetAt}</div>
            <div className="text-[11px] font-semibold text-[var(--t-ink)] truncate">{resetText}</div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {!raw && (
            <p className="text-xs text-[var(--t-muted)] font-mono">{t.reasonEmpty}</p>
          )}

          {parsed.message && parsed.message !== raw && (
            <section>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="material-symbols-outlined text-[13px] text-[var(--t-muted)]">notes</span>
                <span className="text-[10px] uppercase tracking-wide font-bold text-[var(--t-muted)]">{t.reasonParsed}</span>
              </div>
              <p className="text-xs leading-relaxed text-[var(--t-ink)] whitespace-pre-wrap break-words rounded-lg bg-[var(--t-raised)] px-3 py-2">
                {parsed.message}
              </p>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px] text-[var(--t-muted)]">code</span>
                <span className="text-[10px] uppercase tracking-wide font-bold text-[var(--t-muted)]">{t.reasonRaw}</span>
              </div>
              <button
                onClick={copy}
                className="an-btn an-ghost h-6 px-2 text-[10px] font-medium gap-1"
              >
                <span className="material-symbols-outlined text-[12px]">{copied ? "check" : "content_copy"}</span>
                <span>{copied ? t.reasonCopied : t.reasonCopy}</span>
              </button>
            </div>
            <pre className="text-[11px] leading-relaxed font-mono text-[var(--t-ink)] whitespace-pre-wrap break-words rounded-lg border border-[var(--t-line-soft)] bg-[var(--t-bg)] px-3 py-2.5 max-h-[38vh] overflow-y-auto">
              {rawPretty || reasonText}
            </pre>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-[var(--t-line-soft)]">
          <button onClick={onClose} className="an-btn an-ghost h-8 px-4 text-[11px] font-semibold">
            {t.reasonClose}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

export default function DashboardProviderOverview() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState("en");
  const [liveChecking, setLiveChecking] = useState(false);
  const [countdown, setCountdown] = useState(CHECK_INTERVAL_SEC);
  const [providerFilter, setProviderFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [recheckingId, setRecheckingId] = useState(null);
  const [providerPage, setProviderPage] = useState(1);
  const [limitedPage, setLimitedPage] = useState(1);
  const [providerFavicons, setProviderFavicons] = useState({});
  const [reasonModal, setReasonModal] = useState(null);

  useEffect(() => {
    setLocale(getLocale());
    return onLocaleChange(() => setLocale(getLocale()));
  }, []);

  const t = TEXT[locale] || TEXT.en;

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

  useEffect(() => {
    const fetchProviderNodes = async () => {
      try {
        const res = await fetch("/api/provider-nodes", { cache: "no-store" });
        if (res.ok) {
          const nodesData = await res.json();
          const nodes = nodesData.nodes || [];
          const customNodes = nodes.filter(node => 
            (node.type === "openai-compatible" || node.type === "anthropic-compatible") && node.baseUrl
          );
          
          if (customNodes.length > 0) {
            const results = {};
            await Promise.allSettled(
              customNodes.map(async (node) => {
                try {
                  const faviconRes = await fetch(`/api/providers/favicon?url=${encodeURIComponent(node.baseUrl)}`);
                  const faviconData = await faviconRes.json();
                  if (faviconData.faviconUrl) {
                    results[node.id] = faviconData.faviconUrl;
                  }
                } catch (e) {}
              })
            );
            setProviderFavicons(results);
          }
        }
      } catch (e) {}
    };

    fetchProviderNodes();
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
      {/* 4 Hero Metrics Cards — Antares tiles */}
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
                  const iconSrc = providerFavicons[p.provider] || getCompatibleIconSrc(p.provider) || getProviderIconSrc(p.provider);
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
                  const iconSrc = providerFavicons[acc.provider] || getCompatibleIconSrc(acc.provider) || getProviderIconSrc(acc.provider);
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
                        <button
                          type="button"
                          onClick={() => setReasonModal({ account: acc, parsed: parsedError, reasonText, resetText: formatResetAt(effectiveResetAt, t), iconSrc })}
                          title={t.reasonHint}
                          className="group block w-full rounded-md px-1 py-0.5 hover:bg-[var(--t-raised)] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40"
                          aria-label={`${t.reasonModalTitle}: ${acc.name || acc.providerName}`}
                        >
                          <p className="text-[10.5px] text-[var(--t-ink)] font-mono truncate group-hover:text-[var(--color-primary)]">
                            {reasonText}
                          </p>
                          {upstreamDetail && (
                            <p className="text-[9px] text-[var(--t-muted)] font-mono truncate">
                              {upstreamDetail}
                            </p>
                          )}
                        </button>
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

      <LimitReasonModal
        account={reasonModal?.account}
        parsed={reasonModal?.parsed}
        reasonText={reasonModal?.reasonText}
        resetText={reasonModal?.resetText}
        locale={locale}
        t={t}
        onClose={() => setReasonModal(null)}
      />
    </div>
  );
}






