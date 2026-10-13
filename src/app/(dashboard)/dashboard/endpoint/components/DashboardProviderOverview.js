"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
    sectionSub: "Geser kartu provider, klik untuk lihat & test model",
    btnManage: "Atur Provider",
    btnUsage: "Detail Kuota",
    badgeOnline: "ONLINE",
    badgeOffline: "OFFLINE",
    emptyTitle: "Belum Ada Provider Terpasang",
    emptySub: "Pasang API key (OpenAI, Anthropic, Gemini, DeepSeek, dsb.) buat mulai routing AI lu.",
    btnAdd: "Tambah Provider Baru",
    loading: "Lagi narik data provider...",
    models: "Model Tersedia",
    testBtn: "Test",
    testing: "Testing...",
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
    sectionSub: "Slide provider cards, click to view & test models",
    btnManage: "Manage Providers",
    btnUsage: "Usage Details",
    badgeOnline: "ONLINE",
    badgeOffline: "OFFLINE",
    emptyTitle: "No Providers Configured Yet",
    emptySub: "Connect your AI API keys (OpenAI, Anthropic, Gemini, DeepSeek, etc.) to start routing.",
    btnAdd: "Add New Provider",
    loading: "Fetching provider metrics...",
    models: "Available Models",
    testBtn: "Test",
    testing: "Testing...",
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

function ModelDropdown({ provider, t }) {
  const [models, setModels] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});

  useEffect(() => {
    fetch(`/api/models?provider=${encodeURIComponent(provider)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const list = (data?.models || data || []).filter(m =>
          !m.kind || m.kind === "llm"
        ).slice(0, 30);
        setModels(list);
      })
      .catch(() => setModels([]));
  }, [provider]);

  const testModel = useCallback(async (modelId) => {
    setTesting(p => ({ ...p, [modelId]: true }));
    setTestResults(p => ({ ...p, [modelId]: null }));
    const t0 = Date.now();
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId }),
      });
      const data = await res.json().catch(() => ({}));
      const ms = Date.now() - t0;
      setTestResults(p => ({
        ...p,
        [modelId]: { ok: res.ok && data.ok !== false, ms: data.latencyMs || ms, error: data.error },
      }));
    } catch (e) {
      setTestResults(p => ({ ...p, [modelId]: { ok: false, ms: Date.now() - t0, error: e.message } }));
    } finally {
      setTesting(p => ({ ...p, [modelId]: false }));
    }
  }, []);

  if (!models) return (
    <div className="flex items-center justify-center py-6">
      <span className="material-symbols-outlined animate-spin text-[20px] text-[#ff1a53]">progress_activity</span>
    </div>
  );

  if (!models.length) return (
    <div className="py-4 text-center text-xs text-[var(--color-text-muted)] font-mono">Tidak ada model ditemukan</div>
  );

  return (
    <div className="flex flex-col divide-y divide-[var(--color-border)]">
      {models.map(m => {
        const res = testResults[m.id];
        const busy = testing[m.id];
        return (
          <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--color-surface-2)] transition-colors">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs font-bold text-[var(--color-text-main)] truncate">{m.name || m.id}</div>
              <div className="font-mono text-[10px] text-[var(--color-text-muted)] truncate">{m.id}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {res && (
                <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${res.ok ? "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/30" : "text-red-500 bg-red-500/10 border-red-500/30"}`}>
                  {res.ok ? `${res.ms}ms` : `✗ ${res.ms}ms`}
                </span>
              )}
              <button
                onClick={() => testModel(m.id)}
                disabled={busy}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] shadow-[1.5px_2px_0px_var(--color-border)] hover:-translate-y-px active:translate-y-0 transition-all font-mono text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy
                  ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                  : <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                }
                {busy ? t.testing.split("...")[0] : t.testBtn}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProviderCard({ p, t, isOpen, onToggle }) {
  const iconSrc = getProviderIconSrc(p.provider);
  const isOnline = p.isFree || p.activeAccounts > 0;

  return (
    <div className="shrink-0 w-56 flex flex-col">
      <button
        onClick={onToggle}
        className={`w-full text-left bg-[var(--color-surface)] border-2 rounded-xl transition-all cursor-pointer ${
          isOpen
            ? "border-[#ff1a53] shadow-[3px_4px_0px_#ff1a53]"
            : "border-[var(--color-border)] shadow-[3px_4px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[4px_5px_0px_var(--color-border)]"
        }`}
      >
        <div className="p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="size-9 rounded-lg bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center overflow-hidden p-1 shrink-0">
              {iconSrc
                ? <ProviderIcon src={iconSrc} alt={p.name} size={22} className="object-contain" />
                : <span className="material-symbols-outlined text-[18px] text-[var(--color-text-muted)]">hub</span>
              }
            </div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-bold text-[10px] shadow-[1px_1px_0px_var(--color-border)] ${
              isOnline
                ? "border-[#10b981]/40 bg-[#10b981]/15 text-[#10b981]"
                : "border-red-500/40 bg-red-500/15 text-red-500"
            }`}>
              <span className={`size-1.5 rounded-full ${isOnline ? "bg-[#10b981] animate-pulse" : "bg-red-500"}`} />
              {isOnline ? t.badgeOnline : t.badgeOffline}
            </span>
          </div>

          <div className="min-w-0">
            <div className="font-mono font-black text-sm text-[var(--color-text-main)] truncate">{p.name}</div>
            <div className="font-mono text-[10px] text-[var(--color-text-muted)] truncate uppercase">{p.provider}</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-center">
            <div className="bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-border)] px-2 py-1.5">
              <div className="font-mono font-black text-sm text-[#10b981]">
                {p.isFree ? <span title="Unlimited">∞</span> : p.activeAccounts}
              </div>
              <div className="font-mono text-[9px] text-[var(--color-text-muted)] uppercase">Aktif</div>
            </div>
            <div className="bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-border)] px-2 py-1.5">
              <div className={`font-mono font-black text-sm ${p.failedAccounts > 0 ? "text-red-500" : "text-[var(--color-text-muted)]"}`}>
                {p.failedAccounts}
              </div>
              <div className="font-mono text-[9px] text-[var(--color-text-muted)] uppercase">Off</div>
            </div>
          </div>

          {p.tokens > 0 && (
            <div className="font-mono text-[10px] text-[var(--color-text-muted)] flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px] text-amber-500">token</span>
              {fmtNum(p.tokens)} tok · {fmtNum(p.requests)} req
            </div>
          )}

          <div className="flex items-center justify-center gap-1 text-[10px] font-mono text-[#ff1a53] font-bold">
            <span className="material-symbols-outlined text-[13px]">{isOpen ? "expand_less" : "expand_more"}</span>
            {isOpen ? "Tutup model" : "Lihat & test model"}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="mt-1 bg-[var(--color-surface)] border-2 border-[#ff1a53] rounded-xl shadow-[3px_4px_0px_#ff1a53] overflow-hidden max-h-72 overflow-y-auto">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#ff1a53]/10 border-b-2 border-[#ff1a53]/30">
            <span className="material-symbols-outlined text-[14px] text-[#ff1a53]">model_training</span>
            <span className="font-mono text-[11px] font-black uppercase text-[#ff1a53]">{t.models}</span>
          </div>
          <ModelDropdown provider={p.provider} t={t} />
        </div>
      )}
    </div>
  );
}

export default function DashboardProviderOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState("id");
  const [openProvider, setOpenProvider] = useState(null);
  const sliderRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, scrollLeft: 0 });

  useEffect(() => { setLocale(getLocale()); }, []);

  const t = TEXT[locale] || TEXT.id;

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 10000);
    return () => clearInterval(iv);
  }, []);

  const summary = data?.summary || { totalProviders: 0, activeProviders: 0, totalActiveAccounts: 0, totalFailedAccounts: 0, totalTokens: 0, totalRequests: 0 };
  const providers = data?.providers || [];

  const onMouseDown = (e) => {
    setIsDragging(true);
    dragStart.current = { x: e.pageX - sliderRef.current.offsetLeft, scrollLeft: sliderRef.current.scrollLeft };
  };
  const onMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft;
    sliderRef.current.scrollLeft = dragStart.current.scrollLeft - (x - dragStart.current.x);
  };
  const onMouseUp = () => setIsDragging(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">{t.activeProviders}</span>
            <span className="size-6 sm:size-7 rounded-md bg-[#ff1a53]/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-[#ff1a53]">hub</span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-3xl font-black text-text-main">{loading ? "..." : summary.activeProviders}</span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">/ {summary.totalProviders}</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-text-muted flex items-center gap-1.5 truncate">
            <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse shrink-0" />
            <span className="truncate">{t.connsReady}</span>
          </div>
        </div>

        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">{t.activeAccounts}</span>
            <span className="size-6 sm:size-7 rounded-md bg-[#10b981]/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-[#10b981]">check_circle</span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-3xl font-black text-[#10b981]">{loading ? "..." : summary.totalActiveAccounts}</span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">Node</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-[#10b981] flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">verified</span>
            <span className="truncate">{t.readyExec}</span>
          </div>
        </div>

        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">{t.failedAccounts}</span>
            <span className="size-6 sm:size-7 rounded-md bg-red-500/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-red-500">error</span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-3xl font-black text-red-500">{loading ? "..." : summary.totalFailedAccounts}</span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted">Node</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-red-500/90 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">warning</span>
            <span className="truncate">{t.needCheck}</span>
          </div>
        </div>

        <div className="bg-surface border-2 border-border p-3.5 sm:p-4 rounded-xl shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase text-text-muted truncate">{t.tokensUsed}</span>
            <span className="size-6 sm:size-7 rounded-md bg-amber-500/15 border border-border flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[15px] sm:text-[18px] text-amber-500">token</span>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="font-mono text-xl sm:text-3xl font-black text-text-main truncate">{loading ? "..." : fmtNum(summary.totalTokens)}</span>
            <span className="font-mono text-[10px] sm:text-xs text-text-muted shrink-0">Tok</span>
          </div>
          <div className="mt-2 text-[9.5px] sm:text-[10.5px] font-mono text-text-muted flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[12px] shrink-0">query_stats</span>
            <span className="truncate">{fmtNum(summary.totalRequests)} {t.totalReqs}</span>
          </div>
        </div>
      </div>

      <div className="bg-surface border-2 border-border rounded-xl shadow-[3px_4px_0px_var(--color-border)] overflow-hidden">
        <div className="p-3.5 sm:p-5 border-b-2 border-border flex flex-wrap items-center justify-between gap-3 bg-surface-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-[#ff1a53]/15 border-2 border-border shadow-[1.5px_1.5px_0px_var(--color-border)] flex items-center justify-center text-[#ff1a53] shrink-0">
              <span className="material-symbols-outlined text-[18px]">dns</span>
            </div>
            <div className="min-w-0">
              <h2 className="font-mono text-xs sm:text-sm font-bold text-text-main uppercase tracking-wider truncate">{t.sectionTitle}</h2>
              <p className="font-mono text-[10px] sm:text-[11px] text-text-muted truncate">{t.sectionSub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/providers" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 transition-all font-mono text-[11px] sm:text-xs font-bold uppercase">
              <span className="material-symbols-outlined text-[15px]">add_circle</span>
              <span className="hidden sm:inline">{t.btnManage}</span>
            </Link>
            <Link href="/dashboard/usage" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-border bg-surface text-text-main hover:bg-surface-2 shadow-[2px_2px_0px_var(--color-border)] hover:-translate-y-0.5 active:translate-y-0 transition-all font-mono text-[11px] sm:text-xs font-bold uppercase">
              <span className="material-symbols-outlined text-[15px]">analytics</span>
              <span className="hidden sm:inline">{t.btnUsage}</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center font-mono text-sm text-text-muted flex items-center justify-center gap-2">
            <span className="material-symbols-outlined animate-spin text-[20px] text-[#ff1a53]">progress_activity</span>
            <span>{t.loading}</span>
          </div>
        ) : providers.length === 0 ? (
          <div className="p-6 sm:p-10 text-center flex flex-col items-center justify-center gap-3">
            <div className="size-12 rounded-xl bg-surface-2 border-2 border-border shadow-[2px_2px_0px_var(--color-border)] flex items-center justify-center text-text-muted">
              <span className="material-symbols-outlined text-[24px]">cloud_off</span>
            </div>
            <p className="font-mono text-sm font-bold text-text-main">{t.emptyTitle}</p>
            <p className="font-mono text-xs text-text-muted max-w-md">{t.emptySub}</p>
            <Link href="/dashboard/providers" className="mt-2 px-4 py-2 rounded-lg border-2 border-border bg-[#ff1a53] text-white shadow-[2.5px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] transition-all font-mono text-xs font-bold uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>{t.btnAdd}</span>
            </Link>
          </div>
        ) : (
          <div className="p-4 relative">
            <div
              ref={sliderRef}
              className="flex gap-3 overflow-x-auto pb-3 scroll-smooth"
              style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-border) transparent", cursor: isDragging ? "grabbing" : "grab" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {providers.map(p => (
                <ProviderCard
                  key={p.provider}
                  p={p}
                  t={t}
                  isOpen={openProvider === p.provider}
                  onToggle={() => setOpenProvider(prev => prev === p.provider ? null : p.provider)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
