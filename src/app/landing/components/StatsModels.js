"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import AntaresSelect from "@/shared/components/AntaresSelect";
import { useLandingT } from "../LandingLocaleContext";
import { liveProbeCandidates, recommendationScore, selectRecommendedModels } from "./modelFiltering";

const PAGE_SIZE = 10;
const EMPTY_LIVE_CHECK = { status: "idle", data: {}, ok: 0, tested: 0, total: 0, current: "", error: null, at: null, usedFallback: false };
const REFRESH_INTERVAL_MS = 10 * 60_000;

function kindKey(kind) {
  return `modelsKind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function kindLabel(kind, t) {
  const key = kindKey(kind || "llm");
  const translated = t(key);
  return translated === key ? kind : translated;
}

function ModelCapabilities({ capabilities, t, withPricing }) {
  const labels = [
    ["vision", t("modelsVision")],
    ["reasoning", t("modelsReasoning")],
    ["tools", t("modelsTools")],
    ["pdf", t("modelsPdf")],
    ["audioInput", t("modelsAudioInput")],
    ["videoInput", t("modelsVideoInput")],
    ["imageOutput", t("modelsImage")],
    ["audioOutput", t("modelsAudioOutput")],
    ["search", t("modelsSearchCap")],
  ];
  const available = labels.filter(([key]) => capabilities?.[key] === true);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--l-dim)]">{t("modelsSupport")}</p>
        {withPricing && <span className="landing-chip shrink-0">{t("modelsTokenBased")}</span>}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t("modelsCapabilities")}>
        {available.length > 0 ? available.map(([key, label]) => (
          <li key={key} className="rounded-md border border-[var(--l-line)] bg-[var(--l-raised)] px-1.5 py-0.5 text-[10px] text-[var(--l-muted)] sm:px-2 sm:py-1 sm:text-[11px]">
            {label}
          </li>
        )) : (
          <li className="rounded-md border border-[var(--l-line)] bg-[var(--l-raised)] px-1.5 py-0.5 text-[10px] text-[var(--l-muted)] sm:px-2 sm:py-1 sm:text-[11px]">
            {t("modelsSupportNone")}
          </li>
        )}
      </ul>
    </div>
  );
}

function formatPrice(value, locale) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
  return `$${amount}`;
}

function formatLatency(value, locale) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  if (value >= 1000) {
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 1000)}s`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}ms`;
}

function formatTps(value, locale) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}t/s`;
}

function formatTokens(value, locale) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBar({ rate }) {
  const hasData = typeof rate === "number" && Number.isFinite(rate);
  const filled = hasData ? Math.max(0, Math.min(20, Math.round(rate / 5))) : 0;
  const tone = !hasData
    ? "bg-[var(--l-line)]"
    : rate >= 99
      ? "bg-[var(--l-ok)]"
      : rate >= 90
        ? "bg-amber-400"
        : "bg-rose-400";
  return (
    <div className="mt-2 flex h-2.5 items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: 20 }, (_, index) => (
        <span key={index} className={`h-full flex-1 rounded-[1px] ${index < filled ? tone : "bg-[var(--l-line)]"}`} />
      ))}
    </div>
  );
}

function Pagination({ page, pages, onPage, t }) {
  if (pages <= 1) return null;
  const items = [];
  if (pages <= 7) {
    for (let index = 1; index <= pages; index += 1) items.push(index);
  } else {
    items.push(1);
    const start = Math.max(2, page - 1);
    const end = Math.min(pages - 1, page + 1);
    if (start > 2) items.push("start-ellipsis");
    for (let index = start; index <= end; index += 1) items.push(index);
    if (end < pages - 1) items.push("end-ellipsis");
    items.push(pages);
  }

  return (
    <nav className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label={t("modelsPagination")}>
      <p className="font-mono text-[11px] text-[var(--l-muted)]">
        {t("modelsPage").replace("{page}", String(page)).replace("{pages}", String(pages))}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="landing-btn landing-btn-ghost h-9 min-h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
          {t("modelsPrevious")}
        </button>
        <div className="hidden items-center gap-1.5 sm:flex">
          {items.map((item) => typeof item === "number" ? (
            <button
              key={item}
              type="button"
              onClick={() => onPage(item)}
              aria-current={item === page ? "page" : undefined}
              className={item === page
                ? "flex size-9 items-center justify-center rounded-lg border border-[var(--l-accent)] bg-[var(--l-accent)] font-mono text-xs font-semibold text-[var(--l-on-accent)]"
                : "flex size-9 items-center justify-center rounded-lg border border-[var(--l-line)] bg-[var(--l-raised)] font-mono text-xs text-[var(--l-muted)] transition hover:border-[var(--l-hover-line)] hover:text-[var(--l-ink)]"}
            >
              {item}
            </button>
          ) : (
            <span key={item} className="px-1 font-mono text-xs text-[var(--l-dim)]" aria-hidden="true">…</span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="landing-btn landing-btn-ghost h-9 min-h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("modelsNext")}
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
        </button>
      </div>
    </nav>
  );
}

function FilterCheckbox({ checked, onChange, label }) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[9px] border border-transparent px-2 py-1.5 text-xs text-[var(--l-muted)] transition-colors hover:border-[var(--l-line)] hover:bg-[var(--l-raised)] hover:text-[var(--l-ink)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-[var(--l-line)] bg-[var(--l-card)] text-transparent transition-colors peer-checked:border-[var(--l-accent)] peer-checked:bg-[var(--l-accent)] peer-checked:text-[var(--l-on-accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--l-accent)]">
        <span className="material-symbols-outlined text-[13px] leading-none" aria-hidden="true">check</span>
      </span>
      <span className="min-w-0">{label}</span>
    </label>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder, portal = false, t }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--l-dim)]">{label}</span>
      <AntaresSelect
        value={value}
        onChange={onChange}
        ariaLabel={label}
        options={options}
        placeholder={placeholder}
        portal={portal}
        placement="top"
        maxVisible={portal ? 5 : 0}
        buttonClassName="h-11 w-full rounded-[10px] border-[var(--l-line)] bg-[var(--l-card)] px-3 text-sm text-[var(--l-ink)] hover:border-[var(--l-hover-line)] focus:border-[var(--l-accent)]"
      />
    </label>
  );
}

function ModelCard({ model, copied, onCopy, locale, t, healthCheck }) {
  const stats = model.stats || {};
  const pricing = model.pricing || {};
  const rate = typeof stats.successRate === "number" ? stats.successRate : null;
  const statusLabel = rate == null ? t("modelsNoData") : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rate)}%`;
  const showLatency = typeof stats.latencyMs === "number" && stats.latencyMs >= 0;
  const showTps = model.kind === "llm" && typeof stats.tps === "number" && stats.tps >= 0;
  const metricCount = 1 + (showLatency ? 1 : 0) + (showTps ? 1 : 0);
  const priceRows = [
    ["modelsInput", pricing.input],
    ["modelsOutput", pricing.output],
    ["modelsCached", pricing.cached],
  ].filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const metaRows = [
    ["modelsProvider", model.provider.name],
    ["modelsType", kindLabel(model.kind, t)],
    ...(typeof model.contextWindow === "number" && model.contextWindow > 0
      ? [["modelsContext", formatTokens(model.contextWindow, locale)]]
      : []),
    ...(typeof model.maxOutput === "number" && model.maxOutput > 0
      ? [["modelsMaxOutput", formatTokens(model.maxOutput, locale)]]
      : []),
  ];
  const key = `${model.provider.id}|${model.id}`;
  const ttft = healthCheck?.ttft;

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-[var(--l-line)] bg-[var(--l-card)] p-3.5 transition-[border-color,background] duration-200 hover:border-[color-mix(in_srgb,var(--l-accent)_32%,transparent)] hover:bg-[var(--l-raised)] sm:p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 sm:size-10 items-center justify-center rounded-lg border border-[var(--l-line)] bg-[var(--l-raised)]">
          <ProviderIcon providerId={model.provider.id} alt="" size={20} className="size-5 rounded object-contain sm:size-[22px]" fallbackText={model.provider.name.slice(0, 2).toUpperCase()} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words text-sm font-semibold leading-snug sm:text-[15px] text-[var(--l-ink)]">
                {model.name}
                {healthCheck && (
                  <span
                    className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      healthCheck.status === "ok"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    }`}
                    title={healthCheck.error || ""}
                  >
                    <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                      {healthCheck.status === "ok" ? "bolt" : "error_outline"}
                    </span>
                    {healthCheck.status === "ok"
                      ? formatLatency(ttft, locale)
                      : (locale === "id" ? "Gagal" : "Failed")}
                  </span>
                )}
              </h3>
              <p className="mt-0.5 text-[11px] text-[var(--l-muted)] sm:mt-1 sm:text-xs">{model.provider.name}</p>
            </div>
            <button
              type="button"
              onClick={() => onCopy(model.id, key)}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--l-line)] bg-[var(--l-raised)] text-[var(--l-muted)] transition hover:border-[var(--l-hover-line)] hover:text-[var(--l-ink)]"
              aria-label={copied ? t("modelsCopied") : t("modelsCopyId")}
              title={copied ? t("modelsCopied") : t("modelsCopyId")}
            >
              <span className="material-symbols-outlined text-[17px]" aria-hidden="true">{copied ? "check" : "content_copy"}</span>
            </button>
          </div>
          {model.description && (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--l-muted)] sm:mt-2 sm:text-xs">
              {model.description}
            </p>
          )}
          <div className="mt-3 min-w-0">
            <ModelCapabilities capabilities={model.capabilities} t={t} withPricing={priceRows.length > 0} />
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--l-line)] pt-2.5 sm:mt-4 sm:pt-3">
        {priceRows.length > 0 ? (
          <div className={`grid gap-2 ${priceRows.length === 3 ? "grid-cols-3" : priceRows.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {priceRows.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--l-dim)] sm:text-[10px]">{t(label)}</p>
                <p className="mt-0.5 truncate font-mono text-xs font-semibold text-[var(--l-ink)] sm:mt-1 sm:text-[13px]">
                  {formatPrice(value, locale)}
                  <span className="ml-0.5 text-[10px] font-normal text-[var(--l-muted)]">/1M</span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--l-muted)]">{t("modelsNoPricing")}</p>
        )}
      </div>

      <div className={`mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[var(--l-line)] pt-2.5 text-[10px] sm:mt-3 sm:gap-y-2 sm:pt-3 sm:text-[11px] ${metaRows.length > 2 ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
        {metaRows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-[var(--l-dim)]">{t(label)}</p>
            <p className={`mt-0.5 truncate text-[var(--l-ink)] ${label === "modelsProvider" || label === "modelsType" ? "" : "font-mono"}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className={`mt-2.5 grid gap-3 border-t border-[var(--l-line)] pt-2.5 sm:mt-3 sm:pt-3 ${metricCount === 3 ? "grid-cols-3" : metricCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--l-dim)]">{t("modelsStatus")}</p>
          <p className={`mt-0.5 font-mono text-[11px] font-semibold sm:mt-1 sm:text-xs ${rate == null ? "text-[var(--l-muted)]" : "text-[var(--l-ink)]"}`}>{statusLabel}</p>
          <StatusBar rate={rate} />
        </div>
        {showLatency && (
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--l-dim)]">{t("modelsLatency")}</p>
            <p className="mt-0.5 font-mono text-[11px] font-semibold text-[var(--l-ink)] sm:mt-1 sm:text-xs">{formatLatency(stats.latencyMs, locale)}</p>
          </div>
        )}
        {showTps && (
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--l-dim)]">{t("modelsTps")}</p>
            <p className="mt-0.5 font-mono text-[11px] font-semibold text-[var(--l-ink)] sm:mt-1 sm:text-xs">{formatTps(stats.tps, locale)}</p>
          </div>
        )}
        {!showLatency && !showTps && (
          <p className="min-w-0 self-center text-[11px] text-[var(--l-muted)]">{t("modelsNoSamples")}</p>
        )}
      </div>

      <details className="group mt-3 border-t border-[var(--l-line)] pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-xs font-medium text-[var(--l-muted)] transition hover:text-[var(--l-ink)] [&::-webkit-details-marker]:hidden">
          <span>{t("modelsDetails")}</span>
          <span className="material-symbols-outlined text-[17px] transition-transform group-open:rotate-180" aria-hidden="true">expand_more</span>
        </summary>
        <dl className="mt-2 grid gap-2 pb-1 text-[11px] sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[var(--l-dim)]">{t("modelsModelId")}</dt>
            <dd className="mt-0.5 break-all font-mono text-[var(--l-ink)]">{model.id}</dd>
          </div>
          {stats.samples > 0 && (
            <div>
              <dt className="text-[var(--l-dim)]">{t("modelsSamples")}</dt>
              <dd className="mt-0.5 font-mono text-[var(--l-ink)]">{stats.samples}</dd>
            </div>
          )}
          {stats.lastTestedAt && (
            <div>
              <dt className="text-[var(--l-dim)]">{t("modelsLastTested")}</dt>
              <dd className="mt-0.5 font-mono text-[var(--l-ink)]">{formatDate(stats.lastTestedAt, locale)}</dd>
            </div>
          )}
        </dl>
      </details>
    </li>
  );
}

export default function StatsModels() {
  const { locale, t } = useLandingT();
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [recommendationsOnly, setRecommendationsOnly] = useState(false);
  const [sortBy, setSortBy] = useState("provider");
  const [showUnverified, setShowUnverified] = useState(true);
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [liveCheck, setLiveCheck] = useState(EMPTY_LIVE_CHECK);
  const copyTimer = useRef(0);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller = null;

    const refresh = async () => {
      if (disposed || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/public/models", {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("catalogue_unavailable");
        const data = await response.json();
        if (!Array.isArray(data.models) || !Array.isArray(data.providers)) {
          throw new Error("catalogue_unavailable");
        }
        if (!disposed) {
          setPayload(data);
          setLastUpdatedAt(Date.now());
          setStatus("ready");
        }
      } catch (error) {
        if (!disposed && error.name !== "AbortError") {
          setStatus((current) => current === "ready" ? current : "error");
        }
      } finally {
        inFlight = false;
        controller = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller?.abort();
    };
  }, [attempt]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  // Optional live probe for "recommendations only". A failed probe must never
  // empty the catalogue: the filter falls back to traffic-based recommendations.
  useEffect(() => {
    if (!recommendationsOnly || !payload?.models?.length) return undefined;

    const candidates = liveProbeCandidates(payload.models);
    if (candidates.length === 0) return undefined;

    const controller = new AbortController();
    let disposed = false;

    (async () => {
      // The server streams NDJSON so this card can show "3 / 200" plus the model
      // currently being probed. A whole-catalogue probe takes minutes; a silent
      // spinner made it look stuck.
      setLiveCheck({ ...EMPTY_LIVE_CHECK, status: "running", total: candidates.length });
      try {
        const response = await fetch("/api/public/models/health-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ models: candidates, stream: true }),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`health_check_http_${response.status}`);
        if (!response.body?.getReader) throw new Error("health_check_no_stream");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const results = {};
        let buffer = "";
        let finalPayload = null;

        const handleLine = (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let message;
          try { message = JSON.parse(trimmed); } catch { return; }
          if (message.type === "start") {
            setLiveCheck((previous) => ({ ...previous, status: "running", total: message.total, tested: 0 }));
          } else if (message.type === "probe") {
            setLiveCheck((previous) => (previous.current === message.model ? previous : { ...previous, current: message.model }));
          } else if (message.type === "result") {
            if (message.result && typeof message.result.model === "string") results[message.result.model] = message.result;
            setLiveCheck((previous) => ({
              ...previous,
              status: "running",
              data: { ...results },
              tested: typeof message.done === "number" ? message.done : previous.tested,
              total: typeof message.total === "number" ? message.total : previous.total,
            }));
          } else if (message.type === "done") {
            finalPayload = message;
          } else if (message.type === "error") {
            throw new Error(message.error || "health_check_failed");
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            handleLine(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
        }
        handleLine(buffer);
        if (disposed) return;
        if (!finalPayload || !Array.isArray(finalPayload.results)) throw new Error("health_check_bad_payload");

        const finalResults = {};
        for (const result of finalPayload.results) {
          if (result && typeof result.model === "string") finalResults[result.model] = result;
        }
        const ok = finalPayload.results.filter((result) => result?.status === "ok").length;
        setLiveCheck({
          status: "ready",
          data: finalResults,
          ok,
          tested: finalPayload.results.length,
          total: finalPayload.results.length,
          current: "",
          error: null,
          at: Date.now(),
          usedFallback: ok === 0,
        });
      } catch (error) {
        if (disposed || error?.name === "AbortError") return;
        setLiveCheck({ ...EMPTY_LIVE_CHECK, status: "error", error: error?.message || "health_check_failed", at: Date.now(), usedFallback: true });
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [recommendationsOnly, payload]);

  const providers = payload?.providers || [];
  const kinds = useMemo(
    () => Array.from(new Set((payload?.models || []).map((model) => model.kind || "llm"))).sort(),
    [payload],
  );
  const { models: filteredModels, usedFallback: recommendationFallback } = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const price = (model) => (typeof model.pricing?.input === "number" ? model.pricing.input : Infinity);
    const base = (payload?.models || []).filter((model) => {
      const hasTelemetry = Boolean(model.stats)
        && ((typeof model.stats.successRate === "number" && model.stats.successRate > 0)
          || typeof model.stats.latencyMs === "number"
          || typeof model.stats.tps === "number");
      if (!showUnverified && !hasTelemetry) return false;
      const matchesProvider = !providerFilter || model.provider.id === providerFilter;
      const matchesKind = !kindFilter || model.kind === kindFilter;
      const matchesQuery = !normalizedQuery
        || `${model.name} ${model.id} ${model.provider.name}`.toLocaleLowerCase().includes(normalizedQuery);
      return matchesProvider && matchesKind && matchesQuery;
    });

    const selected = recommendationsOnly
      ? selectRecommendedModels(base, liveCheck)
      : { models: base, usedFallback: false };
    const sorted = selected.models.slice().sort((a, b) => {
      if (recommendationsOnly) {
        // Models with a live answer first (fastest first token wins), then
        // traffic-proven recommendations.
        const ta = liveCheck.data?.[a.id]?.status === "ok" ? (liveCheck.data[a.id].ttft ?? Infinity) : Infinity;
        const tb = liveCheck.data?.[b.id]?.status === "ok" ? (liveCheck.data[b.id].ttft ?? Infinity) : Infinity;
        if (ta !== tb) return ta - tb;
        const aRequests = Number(a.stats?.requests) || 0;
        const bRequests = Number(b.stats?.requests) || 0;
        const aSuccesses = Number(a.stats?.successes) || 0;
        const bSuccesses = Number(b.stats?.successes) || 0;
        return recommendationScore(b) - recommendationScore(a)
          || bRequests - aRequests
          || bSuccesses - aSuccesses
          || a.name.localeCompare(b.name);
      }
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price") return price(a) - price(b) || a.name.localeCompare(b.name);
      return a.provider.name.localeCompare(b.provider.name) || a.name.localeCompare(b.name);
    });
    return { models: sorted, usedFallback: selected.usedFallback };
  }, [payload, providerFilter, kindFilter, query, sortBy, showUnverified, recommendationsOnly, liveCheck]);

  const pages = Math.max(1, Math.ceil(filteredModels.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visibleModels = filteredModels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const from = filteredModels.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, filteredModels.length);
  const lastUpdatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const copyModel = async (id, key) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(key);
      clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      /* clipboard access is optional */
    }
  };

  const resetPage = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <section id="stats-models" className="landing-section relative scroll-mt-20 border-y border-[var(--l-line)] bg-[var(--l-card-veil-soft)] py-10 sm:py-12">
      <div className="mx-auto landing-container">
        <div className="mb-6 flex flex-col gap-4 sm:mb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="landing-eyebrow"><span className="landing-eyebrow-dot" />{t("modelsEyebrow")}</p>
            <h2 className="landing-h2 mt-3">{t("modelsTitle")}</h2>
            <p className="landing-lead mt-3 max-w-2xl">{t("modelsDescription")}</p>
          </div>
          {status === "ready" && (
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:w-auto lg:min-w-[330px]">
              <div className="rounded-[10px] border border-[var(--l-line)] bg-[var(--l-card)] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--l-dim)]">{t("modelsEntries")}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-[var(--l-ink)]" aria-live="polite">{filteredModels.length}<span className="text-[var(--l-dim)]"> / {payload.models.length}</span></p>
              </div>
              <div className="rounded-[10px] border border-[var(--l-line)] bg-[var(--l-card)] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--l-dim)]">{t("modelsProviders")}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-[var(--l-ink)]">{providers.length}</p>
              </div>
              <div className="col-span-2 rounded-[10px] border border-[var(--l-line)] bg-[var(--l-card)] px-3 py-2.5 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--l-dim)]">{t("modelsLiveRefresh").replace("{time}", "")}</p>
                <p className="mt-1 truncate font-mono text-xs text-[var(--l-muted)]">{lastUpdatedLabel || "—"}</p>
              </div>
            </div>
          )}
        </div>

        {status === "ready" && payload.models.length > 0 && (
          <div className="mb-5 rounded-[14px] border border-[var(--l-line)] bg-[var(--l-card)] p-3.5 sm:p-5">
            <div className="mb-3 flex items-center gap-2 border-b border-[var(--l-line)] pb-3">
              <span className="material-symbols-outlined text-[17px] text-[var(--l-accent)]" aria-hidden="true">tune</span>
              <h3 className="text-[13px] font-medium text-[var(--l-ink)]">{locale === "id" ? "Filter model" : "Model filters"}</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-4">
              <label className="relative block min-w-0 sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--l-dim)]">{t("modelsSearch")}</span>
                <span className="material-symbols-outlined pointer-events-none absolute bottom-3 left-3 text-[18px] text-[var(--l-muted)]" aria-hidden="true">search</span>
                <input
                  type="search"
                  value={query}
                  onChange={resetPage(setQuery)}
                  placeholder={t("modelsSearch")}
                  className="h-11 w-full rounded-[10px] border border-[var(--l-line)] bg-[var(--l-card)] pl-10 pr-3 text-[16px] text-[var(--l-ink)] sm:text-sm placeholder:text-[var(--l-dim)] hover:border-[var(--l-hover-line)] focus:border-[var(--l-accent)] focus:outline-none"
                />
              </label>
              <div className="min-w-0">
                <FilterSelect
                  label={t("modelsProviderFilter")}
                  value={providerFilter}
                  onChange={resetPage(setProviderFilter)}
                  placeholder={t("modelsAllProviders")}
                  portal
                  options={[
                    { value: "", label: t("modelsAllProviders") },
                    ...providers.map((provider) => ({ value: provider.id, label: provider.name })),
                  ]}
                />
              </div>
              <div className="min-w-0">
                <FilterSelect
                  label={t("modelsTypeFilter")}
                  value={kindFilter}
                  onChange={resetPage(setKindFilter)}
                  placeholder={t("modelsAllTypes")}
                  options={[
                    { value: "", label: t("modelsAllTypes") },
                    ...kinds.map((kind) => ({ value: kind, label: kindLabel(kind, t) })),
                  ]}
                />
              </div>
              <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                <FilterSelect
                  label={t("modelsSort")}
                  value={sortBy}
                  onChange={resetPage(setSortBy)}
                  options={[
                    { value: "provider", label: t("modelsSortProvider") },
                    { value: "name", label: t("modelsSortName") },
                    { value: "price", label: t("modelsSortPrice") },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2 lg:col-span-2">
                <FilterCheckbox
                  checked={showUnverified}
                  onChange={(event) => { setShowUnverified(event.target.checked); setPage(1); }}
                  label={t("modelsShowUnverified")}
                />
                <FilterCheckbox
                  checked={recommendationsOnly}
                  onChange={(event) => {
                    setRecommendationsOnly(event.target.checked);
                    if (!event.target.checked) setLiveCheck(EMPTY_LIVE_CHECK);
                    setPage(1);
                  }}
                  label={t("modelsRecommendationsOnly")}
                />
                {recommendationsOnly && liveCheck.status === "running" && (
                  <div className="ml-2 flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                    <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
                    {t("modelsLiveProgress")
                      .replace("{done}", String(liveCheck.tested || 0))
                      .replace("{total}", String(liveCheck.total || liveCheck.tested || 0))}
                  </div>
                )}
                {recommendationsOnly && liveCheck.status === "ready" && liveCheck.ok > 0 && (
                  <div className="ml-2 flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">bolt</span>
                    {t("modelsLiveOk").replace("{count}", String(liveCheck.ok))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {status === "ready" && recommendationsOnly && recommendationFallback && (
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300" role="status">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">info</span>
            <span>{t("modelsLiveFallback")}</span>
          </div>
        )}

        {status === "loading" && (
          <div className="landing-card flex min-h-36 items-center justify-center gap-3 p-6 text-sm text-[var(--l-muted)]" role="status">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">hourglass_empty</span>
            {t("modelsLoading")}
          </div>
        )}
        {status === "error" && (
          <div className="landing-card flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center" role="alert">
            <span className="material-symbols-outlined text-2xl text-[var(--l-muted)]" aria-hidden="true">cloud_off</span>
            <p className="text-sm text-[var(--l-ink)]">{t("modelsError")}</p>
            <button type="button" className="landing-btn landing-btn-ghost mt-2 min-h-11" onClick={() => { setStatus("loading"); setAttempt((current) => current + 1); }}>{t("modelsRetry")}</button>
          </div>
        )}
        {status === "ready" && payload.models.length === 0 && (
          <div className="landing-card flex min-h-36 flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="material-symbols-outlined text-2xl text-[var(--l-muted)]" aria-hidden="true">view_list</span>
            <p className="text-sm text-[var(--l-ink)]">{t("modelsEmpty")}</p>
            <p className="text-xs text-[var(--l-muted)]">{t("modelsEmptyHint")}</p>
          </div>
        )}
        {status === "ready" && recommendationsOnly && (liveCheck.status === "running" || liveCheck.status === "idle") && (
          <div className="landing-card flex min-h-36 flex-col items-center justify-center gap-2.5 p-6 text-center" role="status">
            <span className="material-symbols-outlined animate-spin text-2xl text-blue-500" aria-hidden="true">sync</span>
            <p className="text-sm text-[var(--l-ink)]" aria-live="polite">
              {t("modelsLiveProgressTitle")
                .replace("{done}", String(liveCheck.tested || 0))
                .replace("{total}", String(liveCheck.total || liveCheck.tested || 0))}
            </p>
            {liveCheck.current ? (
              <p className="max-w-[22rem] truncate font-mono text-[11px] text-[var(--l-muted)]" title={liveCheck.current}>
                {t("modelsLiveCurrentModel").replace("{model}", liveCheck.current)}
              </p>
            ) : null}
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={liveCheck.total || 0}
              aria-valuenow={liveCheck.tested || 0}
              aria-label={t("modelsLiveProgressTitle")
                .replace("{done}", String(liveCheck.tested || 0))
                .replace("{total}", String(liveCheck.total || liveCheck.tested || 0))}
              className="h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-[var(--l-raised)]"
            >
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                style={{ width: liveCheck.total > 0 ? `${Math.min(100, Math.round(((liveCheck.tested || 0) / liveCheck.total) * 100))}%` : "0%" }}
              />
            </div>
            <p className="text-xs text-[var(--l-muted)]">{t("modelsLiveProgressHint")}</p>
          </div>
        )}
        {status === "ready" && payload.models.length > 0 && filteredModels.length === 0
          && !(recommendationsOnly && (liveCheck.status === "running" || liveCheck.status === "idle")) && (
          <div className="landing-card flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-[var(--l-muted)]">
              {recommendationsOnly ? t("modelsNoRecommendations") : t("modelsNoResults")}
            </p>
            <button
              type="button"
              className="landing-btn landing-btn-ghost min-h-11"
              onClick={() => {
                if (recommendationsOnly) {
                  setRecommendationsOnly(false);
                } else {
                  setQuery("");
                  setProviderFilter("");
                  setKindFilter("");
                  setSortBy("provider");
                  setShowUnverified(true);
                }
                setPage(1);
              }}
            >
              {recommendationsOnly ? t("modelsShowAllModels") : t("modelsClearFilters")}
            </button>
          </div>
        )}
        {status === "ready" && filteredModels.length > 0 && (
          <>
            <p className="mb-3 font-mono text-[11px] text-[var(--l-muted)]" aria-live="polite">
              {t("modelsShowing").replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", String(filteredModels.length))}
            </p>
            <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3" aria-label={t("modelsTitle")}>
              {visibleModels.map((model) => (
                <ModelCard
                  key={`${model.provider.id}|${model.id}`}
                  model={model}
                  copied={copiedId === `${model.provider.id}|${model.id}`}
                  onCopy={copyModel}
                  locale={locale}
                  t={t}
                  healthCheck={liveCheck.data?.[model.id]}
                />
              ))}
            </ul>
            <Pagination page={currentPage} pages={pages} onPage={setPage} t={t} />
          </>
        )}
      </div>
    </section>
  );
}
