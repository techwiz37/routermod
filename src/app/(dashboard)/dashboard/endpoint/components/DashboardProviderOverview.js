"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { LOCALE_COOKIE } from "@/i18n/config";

const TEXT = {
  id: {
    activeProviders: "Provider Aktif",
    connsReady: "Koneksi AI siap tempur",
    activeAccounts: "Akun Aktif (OK)",
    readyExec: "Siap gas request",
    failedAccounts: "Akun Gagal / Off",
    needCheck: "Perlu dicek / off",
    tokensUsed: "Token Terpakai",
    totalReqs: "Total request",
    sectionTitle: "Status Provider & Riwayat Token",
    sectionSub: "Monitor akun aktif, gagal, dan kuota pemakaian per provider AI",
    btnManage: "Atur Provider",
    btnUsage: "Detail Kuota",
    thProvider: "Provider AI",
    thStatus: "Status",
    thActive: "Akun Gas",
    thFailed: "Akun Off",
    thPrompt: "Input (Prompt)",
    thCompletion: "Output",
    thTotal: "Total Token",
    badgeOnline: "ONLINE",
    badgeOffline: "OFFLINE",
    emptyTitle: "Belum Ada Provider Terpasang",
    emptySub: "Pasang API key (OpenAI, Anthropic, Gemini, DeepSeek, dsb.) buat mulai routing AI lu.",
    btnAdd: "Tambah Provider Baru",
    loading: "Lagi narik data provider...",
  },
  en: {
    activeProviders: "Live Providers",
    connsReady: "AI connections ready",
    activeAccounts: "Active Accounts",
    readyExec: "Ready to route requests",
    failedAccounts: "Failed / Off Accounts",
    needCheck: "Needs attention / off",
    tokensUsed: "Tokens Consumed",
    totalReqs: "Total requests",
    sectionTitle: "Provider Status & Token Usage",
    sectionSub: "Live view of healthy accounts, failed nodes, and lifetime tokens",
    btnManage: "Manage Providers",
    btnUsage: "Usage Details",
    thProvider: "AI Provider",
    thStatus: "Status",
    thActive: "Active",
    thFailed: "Offline",
    thPrompt: "Input (Prompt)",
    thCompletion: "Output",
    thTotal: "Total Tokens",
    badgeOnline: "ONLINE",
    badgeOffline: "OFFLINE",
    emptyTitle: "No Providers Configured Yet",
    emptySub: "Connect your AI API keys (OpenAI, Anthropic, Gemini, DeepSeek, etc.) to start routing.",
    btnAdd: "Add New Provider",
    loading: "Fetching provider metrics...",
  },
};

function fmtNum(n) {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState("id");
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  const t = TEXT[locale] || TEXT.id;

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to load dashboard provider stats:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await fetch("/api/dashboard/seed-usage", { method: "POST" });
      await fetchStats();
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await fetch("/api/dashboard/seed-usage", { method: "DELETE" });
      await fetchStats();
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const summary = data?.summary || {
    totalProviders: 0,
    activeProviders: 0,
    totalActiveAccounts: 0,
    totalFailedAccounts: 0,
    totalTokens: 0,
    totalRequests: 0,
  };

  const providers = data?.providers || [];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* 4 Hero Neobrutalism Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Active Providers */}
        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.activeProviders}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-[#ff1a53]/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-[#ff1a53]">
                hub
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-3xl font-black text-text-main">
              {loading ? "..." : summary.activeProviders}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">
              / {summary.totalProviders}
            </span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-text-muted flex items-center gap-1.5 truncate">
            <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse shrink-0" />
            <span className="truncate">{t.connsReady}</span>
          </div>
        </div>

        {/* Active Accounts */}
        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.activeAccounts}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-[#10b981]/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-[#10b981]">
                check_circle
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-3xl font-black text-[#10b981]">
              {loading ? "..." : summary.totalActiveAccounts}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">Node</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-[#10b981] flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">verified</span>
            <span className="truncate">{t.readyExec}</span>
          </div>
        </div>

        {/* Failed Accounts */}
        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
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
            <span className="font-mono text-xl sm:text-3xl font-black text-red-500">
              {loading ? "..." : summary.totalFailedAccounts}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">Node</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-red-500/90 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">warning</span>
            <span className="truncate">{t.needCheck}</span>
          </div>
        </div>

        {/* Lifetime Token Usage */}
        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">
              {t.tokensUsed}
            </span>
            <span className="size-6 sm:size-7 rounded-md bg-amber-500/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-amber-500">
                token
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-3xl font-black text-text-main truncate">
              {loading ? "..." : fmtNum(summary.totalTokens)}
            </span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted shrink-0">Tok</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-text-muted flex items-center gap-1 truncate">
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
            <div className="size-8 rounded-lg bg-[#ff1a53]/15 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center text-[#ff1a53] shrink-0">
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

          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:gap-2 sm:w-auto">
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
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 transition-all font-mono text-[11px] sm:text-xs font-bold uppercase text-center"
            >
              <span className="material-symbols-outlined text-[15px] shrink-0">add_circle</span>
              <span className="truncate">{t.btnManage}</span>
            </Link>
            <Link
              href="/dashboard/usage"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 transition-all font-mono text-[11px] sm:text-xs font-bold uppercase text-center"
            >
              <span className="material-symbols-outlined text-[15px] shrink-0">analytics</span>
              <span className="truncate">{t.btnUsage}</span>
            </Link>
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="p-8 text-center font-mono text-sm text-text-muted flex items-center justify-center gap-2">
            <span className="material-symbols-outlined animate-spin text-[20px] text-[#ff1a53]">
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
              className="mt-2 px-4 py-2 rounded-lg border-2 border-border bg-[#ff1a53] text-white shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] active:translate-y-0 transition-all font-mono text-xs font-bold uppercase flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>{t.btnAdd}</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-border bg-surface-2/60 text-text-muted text-[10px] sm:text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 sm:py-3 px-3 sm:px-5">{t.thProvider}</th>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">{t.thStatus}</th>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">{t.thActive}</th>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">{t.thFailed}</th>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-3 text-right">{t.thPrompt}</th>
                  <th className="py-2.5 sm:py-3 px-2 sm:px-3 text-right">{t.thCompletion}</th>
                  <th className="py-2.5 sm:py-3 px-3 sm:px-5 text-right">{t.thTotal}</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-border">
                {providers.map((p) => {
                  const iconSrc = getProviderIconSrc(p.provider);
                  const isOnline = p.activeAccounts > 0;
                  return (
                    <tr
                      key={p.provider}
                      className="hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="py-2.5 sm:py-3 px-3 sm:px-5">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="size-7 sm:size-8 rounded-lg bg-surface-2 border-2 border-border shadow-[1px_1px_0px_var(--color-border)] flex items-center justify-center shrink-0 overflow-hidden p-1">
                            {iconSrc ? (
                              <ProviderIcon
                                src={iconSrc}
                                alt={p.name}
                                size={20}
                                className="object-contain"
                              />
                            ) : (
                              <span className="material-symbols-outlined text-[16px] text-text-muted">
                                hub
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-text-main text-xs sm:text-sm truncate">
                              {p.name}
                            </div>
                            <div className="text-[9.5px] text-text-muted uppercase truncate">
                              {p.provider}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-[#10b981]/15 text-[#10b981] font-bold text-[10px] shadow-[1px_1px_0px_var(--color-border)]">
                            <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse" />
                            {t.badgeOnline}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-red-500/15 text-red-500 font-bold text-[10px] shadow-[1px_1px_0px_var(--color-border)]">
                            <span className="size-1.5 rounded-full bg-red-500" />
                            {t.badgeOffline}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">
                        <span className="font-bold text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/30">
                          {p.activeAccounts}
                        </span>
                      </td>
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">
                        {p.failedAccounts > 0 ? (
                          <span className="font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                            {p.failedAccounts}
                          </span>
                        ) : (
                          <span className="text-text-muted">0</span>
                        )}
                      </td>
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-right text-text-muted">
                        {fmtNum(p.promptTokens)}
                      </td>
                      <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-right text-text-muted">
                        {fmtNum(p.completionTokens)}
                      </td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-5 text-right font-bold text-text-main">
                        <span className="text-[#ff1a53]">{fmtNum(p.tokens)}</span>
                        {p.requests > 0 && (
                          <span className="block text-[9.5px] text-text-muted font-normal">
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
    </div>
  );
}
