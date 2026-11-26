"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import PropTypes from "prop-types";
import { usePageReady } from "@/shared/components/PageReadyContext";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresStat from "@/shared/components/AntaresStat";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresSelect from "@/shared/components/AntaresSelect";
import AntaresNotice from "@/shared/components/AntaresNotice";
import ProviderIcon from "@/shared/components/ProviderIcon";
import StarField from "@/shared/components/StarField";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const REFRESH_INTERVAL_MS = 60_000;
/* Per-account cards can expose dozens of model quotas. Keep the default card
   compact and let the user opt into the full list. */
const EXTRA_QUOTA_PREVIEW = 3;

/* Keep the shared dashboard vocabulary: quota health maps to AntaresStat tones. */
const TONE = {
  default: { bar: "var(--t-accent)", label: "var(--t-star-ink)" },
  ok:      { bar: "var(--t-ok)",     label: "var(--t-ok)" },
  warn:    { bar: "#f0a13a",         label: "#f0a13a" },
  danger:  { bar: "var(--t-danger)", label: "var(--t-danger)" },
};

function compact(value, locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

/* Single-unit countdown ("2d", "8h", "45m") fits the narrow stat tiles. */
function formatResetCountdown(value) {
  if (!value) return "—";
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "Due";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
  return `${minutes}m`;
}

function toneFor(percent) {
  if (percent == null || percent <= 0) return "default";
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}

function statusFor(percent) {
  if (percent == null || percent <= 0) return { label: translate("No quota"), className: "none", icon: "help_outline" };
  if (percent >= 90) return { label: translate("Critical"), className: "danger", icon: "error" };
  if (percent >= 70) return { label: translate("Low quota"), className: "warn", icon: "warning" };
  return { label: translate("Healthy"), className: "ok", icon: "check_circle" };
}

function parseQuotaRemaining(quota) {
  const used = Number(quota?.used) || 0;
  const limit = Number(quota?.limit) || 0;
  if (limit <= 0) return { percent: 0, remaining: 0, used, limit };
  const remaining = Math.max(0, limit - used);
  const percent = Math.min(100, (used / limit) * 100);
  return { percent, remaining, used, limit };
}

/* /api/usage/{id} returns either an array of quota rows or a name-keyed map
   (e.g. { session: { used, total, resetAt } }). Normalise both shapes so a
   backend shape change cannot break the whole page again. */
function normalizeQuotas(raw) {
  if (Array.isArray(raw)) {
    return raw.map((q) => ({
      name: q?.name || q?.type || "Quota",
      used: Number(q?.used) || 0,
      limit: q?.unlimited ? 0 : (Number(q?.limit ?? q?.total) || 0),
      resetsAt: q?.resetsAt || q?.resetAt || null,
    }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([name, q]) => ({
      name: q?.name || name,
      used: Number(q?.used) || 0,
      limit: q?.unlimited ? 0 : (Number(q?.limit ?? q?.total) || 0),
      resetsAt: q?.resetsAt || q?.resetAt || null,
    }));
  }
  return [];
}

function QuotaBar({ percent, tone, className = "" }) {
  const color = TONE[tone] || TONE.default;
  return (
    <div
      className={`quota-track ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="quota-track-fill"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color.bar }}
      />
    </div>
  );
}
QuotaBar.propTypes = { percent: PropTypes.number, tone: PropTypes.string, className: PropTypes.string };

/* One metric in a card: stacked label/value, always readable on a phone. */
function StatCell({ label, value, foot, color }) {
  return (
    <div className="quota-cell">
      <span className="quota-cell-label">{label}</span>
      <span className="quota-cell-value" style={{ color }}>{value}</span>
      {foot ? <span className="quota-cell-foot">{foot}</span> : null}
    </div>
  );
}
StatCell.propTypes = {
  label: PropTypes.string,
  value: PropTypes.node,
  foot: PropTypes.string,
  color: PropTypes.string,
};

function ProviderQuotaCard({ connection, quotaData, loading, error, onRefresh, locale }) {
  const provider = AI_PROVIDERS[connection.provider];
  const providerName = provider?.name || connection.provider;
  const quotas = quotaData?.quotas || [];
  const mainQuota = quotas[0] || null;
  const { percent, remaining, used, limit } = mainQuota
    ? parseQuotaRemaining(mainQuota)
    : { percent: 0, remaining: 0, used: 0, limit: 0 };
  const status = statusFor(percent);
  const tone = toneFor(percent);
  const accent = TONE[tone] || TONE.default;
  const accountLabel = connection.email || connection.name || connection.id;
  const [showAllExtras, setShowAllExtras] = useState(false);
  const extraQuotas = quotas.slice(1);
  const visibleExtras = showAllExtras ? extraQuotas : extraQuotas.slice(0, EXTRA_QUOTA_PREVIEW);
  const hasMoreExtras = extraQuotas.length > EXTRA_QUOTA_PREVIEW;

  return (
    <AntaresPanel className="quota-provider-card" padded={false}>
      <div className="quota-card-head">
        <div className="quota-card-top">
          <span className="quota-card-ico" aria-hidden style={{ color: accent.label }}>
            <ProviderIcon providerId={connection.provider} size={19} fallbackText={providerName.slice(0, 2).toUpperCase()} />
          </span>
          <div className="quota-card-identity">
            <h2 className="quota-card-title" title={providerName}>{providerName}</h2>
            <p className="quota-card-account" title={accountLabel}>{accountLabel}</p>
          </div>
          <span className="quota-refresh">
            <AntaresButton
              type="button"
              size="sm"
              variant="ghost"
              icon="refresh"
              onClick={() => onRefresh(connection.id, connection.provider)}
              disabled={loading}
              aria-label={`${translate("Refresh")} ${providerName}`}
            />
          </span>
        </div>
        <div className="quota-card-chips">
          {provider?.alias && <span className="an-chip">{String(provider.alias).toUpperCase()}</span>}
          <span className={`an-chip ${status.className === "ok" ? "ok" : status.className === "danger" ? "danger" : ""}`}
            style={status.className === "warn"
              ? { background: "rgba(240,161,58,0.14)", color: "#f0a13a", borderColor: "rgba(240,161,58,0.3)" }
              : undefined}
          >
            <span className="material-symbols-outlined" aria-hidden>{status.icon}</span>
            <span>{status.label}</span>
          </span>
        </div>
      </div>

      <div className="quota-card-body">
        {loading && (
          <div className="quota-inline-state" role="status">
            <span className="material-symbols-outlined animate-spin text-[15px]" aria-hidden>progress_activity</span>
            <span>{translate("Loading quota…")}</span>
          </div>
        )}
        {error && (
          <div className="quota-inline-state danger" role="alert">
            <span className="material-symbols-outlined text-[15px]" aria-hidden>error</span>
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}
        {!loading && !error && quotas.length === 0 && (
          <p className="quota-empty">{translate("No quota data available")}</p>
        )}

        {!loading && !error && quotas.length > 0 && (
          <>
            <div className="quota-gauge-row">
              <div
                className="quota-ring"
                role="img"
                aria-label={`${Math.round(percent)}% ${translate("used")}`}
                style={{ background: `conic-gradient(${accent.bar} ${Math.round(percent) * 3.6}deg, var(--t-raised) 0deg)` }}
              >
                <div className="quota-ring-inner">
                  <span className="quota-ring-value" style={{ color: accent.label }}>
                    {limit > 0 ? `${Math.round(percent)}%` : "∞"}
                  </span>
                  <span className="quota-ring-caption">{translate("USED")}</span>
                </div>
              </div>
              <div className="quota-gauge-copy">
                <p className="quota-label">{mainQuota?.name || translate("Quota")}</p>
                <p className="quota-gauge-ratio">
                  {limit > 0 ? `${compact(remaining, locale)} / ${compact(limit, locale)}` : translate("Unlimited")}
                </p>
                <p className="quota-gauge-sub">
                  {limit > 0 ? `${compact(used, locale)} ${translate("used")}` : translate("No limit")}
                </p>
              </div>
            </div>

            <div className="quota-cells">
              <StatCell label={translate("Used")} value={limit > 0 ? compact(used, locale) : "—"}
                foot={limit > 0 ? `${Math.round(percent)}%` : translate("No limit")} color={accent.label} />
              <StatCell label={translate("Left")} value={limit > 0 ? compact(remaining, locale) : translate("Unlimited")}
                foot={limit > 0 ? `of ${compact(limit, locale)}` : ""} color="var(--t-ok)" />
              <StatCell label={translate("Resets")} value={formatResetCountdown(mainQuota?.resetsAt)}
                foot={translate("Next cycle")} color="var(--t-ink)" />
            </div>

            {quotas.length > 1 && (
              <div className="quota-extra">
                <div className="quota-extra-head">
                  <p className="quota-label">{translate("Additional quotas")}</p>
                  <span className="quota-extra-count">{extraQuotas.length}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {visibleExtras.map((q, idx) => {
                    const qState = parseQuotaRemaining(q);
                    return (
                      <div key={`${q.name || idx}-${idx}`}>
                        <div className="quota-extra-row">
                          <span className="truncate text-[var(--t-muted)]" title={q.name || undefined}>{q.name || `Quota ${idx + 2}`}</span>
                          <span className="shrink-0 text-[var(--t-ink)]">
                            {qState.limit > 0 ? `${compact(qState.used, locale)} / ${compact(qState.limit, locale)}` : translate("Unlimited")}
                          </span>
                        </div>
                        {qState.limit > 0 && <QuotaBar className="mt-1.5" percent={qState.percent} tone={toneFor(qState.percent)} />}
                      </div>
                    );
                  })}
                </div>
                {hasMoreExtras && (
                  <button
                    type="button"
                    className="quota-extra-toggle"
                    onClick={() => setShowAllExtras((value) => !value)}
                    aria-expanded={showAllExtras}
                  >
                    <span className="material-symbols-outlined" aria-hidden>
                      {showAllExtras ? "expand_less" : "expand_more"}
                    </span>
                    <span>{showAllExtras ? translate("Show fewer quotas") : translate("Show all quotas")}</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AntaresPanel>
  );
}
ProviderQuotaCard.propTypes = {
  connection: PropTypes.object.isRequired,
  quotaData: PropTypes.object,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onRefresh: PropTypes.func.isRequired,
  locale: PropTypes.string,
};

export default function QuotaPageClient() {
  const [, setLocaleVersion] = useState(0);
  const [connections, setConnections] = useState([]);
  const [quotaData, setQuotaData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [providerFilter, setProviderFilter] = useState("all");
  const [providerOptions, setProviderOptions] = useState([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const intervalRef = useRef(null);
  const locale = getCurrentLocale();

  usePageReady(connectionsLoading);
  useEffect(() => onLocaleChange(() => setLocaleVersion((v) => v + 1)), []);

  const fetchConnections = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "999", accountStatus: "active", sort: "priority" });
      if (providerFilter !== "all") params.set("provider", providerFilter);
      const response = await fetch(`/api/providers/client?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch connections");
      const data = await response.json();
      setConnections(data.connections || []);
      // /api/providers/client returns providerOptions as plain id strings;
      // accept object shapes too so a future API change cannot blank the menu.
      const options = (data.providerOptions || []).map((p) => {
        if (typeof p === "string") return { value: p, label: AI_PROVIDERS[p]?.name || p };
        const id = p?.id ?? p?.value;
        return { value: id, label: p?.name ?? p?.label ?? AI_PROVIDERS[id]?.name ?? String(id ?? "") };
      }).filter((o) => o.value != null);
      setProviderOptions([{ value: "all", label: translate("All providers") }, ...options]);
    } catch (error) {
      console.error("Error fetching connections:", error);
      setConnections([]);
    } finally {
      setConnectionsLoading(false);
    }
  }, [providerFilter]);

  const fetchQuota = useCallback(async (connectionId, provider, { force = false } = {}) => {
    setLoading((prev) => ({ ...prev, [connectionId]: true }));
    setErrors((prev) => ({ ...prev, [connectionId]: null }));
    try {
      const url = `/api/usage/${connectionId}${force ? "?force=1" : ""}`;
      const response = await fetch(url, { headers: { "Accept-Language": locale, "x-locale": locale } });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || response.statusText);
      }
      const data = await response.json();
      const parsedQuotas = normalizeQuotas(data.quotas);
      setQuotaData((prev) => ({ ...prev, [connectionId]: { quotas: parsedQuotas, raw: data } }));
    } catch (error) {
      console.error(`Error fetching quota for ${provider} (${connectionId}):`, error);
      setErrors((prev) => ({ ...prev, [connectionId]: error.message || "Failed to fetch quota" }));
    } finally {
      setLoading((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, [locale]);

  const refreshProvider = useCallback((connectionId, provider) => {
    fetchQuota(connectionId, provider, { force: true });
  }, [fetchQuota]);

  const refreshAll = useCallback(() => {
    connections.forEach((conn) => fetchQuota(conn.id, conn.provider, { force: true }));
  }, [connections, fetchQuota]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  useEffect(() => {
    if (connections.length === 0) return;
    connections.forEach((conn) => fetchQuota(conn.id, conn.provider));
  }, [connections, fetchQuota]);

  useEffect(() => {
    if (!autoRefresh || connections.length === 0) return;
    intervalRef.current = setInterval(() => {
      connections.forEach((conn) => fetchQuota(conn.id, conn.provider));
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, connections, fetchQuota]);

  /* One glance at the fleet: mirror the dashboard's five stat tiles. */
  const summary = useMemo(() => {
    let healthy = 0, low = 0, critical = 0, remaining = 0, reporting = 0;
    for (const conn of connections) {
      const quotas = quotaData[conn.id]?.quotas || [];
      if (quotas.length === 0) continue;
      reporting += 1;
      const main = parseQuotaRemaining(quotas[0]);
      if (main.percent >= 90) critical += 1;
      else if (main.percent >= 70) low += 1;
      else if (main.percent > 0) healthy += 1;
      for (const q of quotas) {
        const parsed = parseQuotaRemaining(q);
        if (parsed.limit > 0) remaining += parsed.remaining;
      }
    }
    return { total: connections.length, healthy, low, critical, remaining, reporting };
  }, [connections, quotaData]);

  const pending = connectionsLoading || connections.some((conn) => loading[conn.id] && !quotaData[conn.id]);

  return (
    <div className="an-scope an-shell quota-page flex w-full min-w-0 flex-col gap-4 sm:gap-5">
      <div className="an-shell-bg" aria-hidden><StarField /></div>

      {/* ---- Hero ---- */}
      <header className="quota-hero">
        <div className="quota-hero-copy">
          <p className="an-eyebrow">
            <span className="an-num">05</span>
            <span className="an-rule" />
            <span>{translate("RouterMod · AI Gateway")}</span>
          </p>
          <h1 className="quota-hero-title">
            {translate("Quota")}<span className="an-dim mx-1.5">&amp;</span>{translate("Limits")}
          </h1>
          <p className="quota-hero-hint">{translate("Real-time quota monitoring for all active provider connections")}</p>
        </div>
        <div className="quota-hero-meta">
          <span className="an-chip ok">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--t-ok)]" />
            <span>{translate("Live")}</span>
          </span>
          <span>{translate("Just now")}</span>
        </div>
      </header>

      {/* ---- Fleet summary ---- */}
      <div className="an-grid quota-summary">
        <AntaresStat label={translate("Connections")} icon="hub" tone="default"
          value={connectionsLoading ? "…" : summary.total} unit={translate("Acc")}
          foot={translate("Active provider connections")} />
        <AntaresStat label={translate("Healthy")} icon="check_circle" tone="ok"
          value={connectionsLoading ? "…" : summary.healthy} unit={translate("Acc")}
          foot={translate("Quota available")} />
        <AntaresStat label={translate("Low quota")} icon="speed" tone="warn"
          value={connectionsLoading ? "…" : summary.low} unit={translate("Acc")}
          foot={translate("Approaching limit")} />
        <AntaresStat label={translate("Critical")} icon="error" tone="danger"
          value={connectionsLoading ? "…" : summary.critical} unit={translate("Acc")}
          foot={translate("Limit reached")} />
        <AntaresStat label={translate("Remaining")} icon="data_usage" tone="violet"
          value={connectionsLoading ? "…" : compact(summary.remaining, locale)}
          foot={`${translate("Across")} ${summary.reporting} ${translate("accounts")}`}
          className="col-span-2 sm:col-span-1" />
      </div>

      {/* ---- Toolbar ---- */}
      <div className="quota-toolbar">
        <AntaresSelect value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}
          ariaLabel={translate("Filter by provider")} options={providerOptions}
          portal placement="top" maxVisible={6}
          className="quota-filter" buttonClassName="h-9 px-3 text-sm" />
        <div className="quota-toolbar-side">
          {autoRefresh && (
            <span className="an-chip ok">
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--t-ok)]" />
              <span>{translate("Auto-refresh active")}</span>
            </span>
          )}
          {pending && (
            <span className="an-chip">
              <span className="material-symbols-outlined animate-spin text-[13px]" aria-hidden>sync</span>
              <span>{translate("Syncing")}</span>
            </span>
          )}
          <AntaresButton type="button" icon="refresh" onClick={refreshAll} disabled={connectionsLoading || pending}>
            {translate("Refresh All")}
          </AntaresButton>
          <AntaresButton type="button" icon={autoRefresh ? "pause" : "play_arrow"} variant="ghost"
            onClick={() => setAutoRefresh((current) => !current)}>
            {autoRefresh ? translate("Pause") : translate("Resume")}
          </AntaresButton>
        </div>
      </div>

      {/* ---- States ---- */}
      {connectionsLoading && (
        <AntaresNotice variant="info" icon="progress_activity"><p>{translate("Loading connections…")}</p></AntaresNotice>
      )}
      {!connectionsLoading && connections.length === 0 && (
        <AntaresNotice variant="default" icon="cloud_off"><p>{translate("No active provider connections found")}</p></AntaresNotice>
      )}

      {/* ---- Provider cards ---- */}
      {!connectionsLoading && connections.length > 0 && (
        <div className="quota-grid">
          {connections.map((conn) => (
            <ProviderQuotaCard key={conn.id} connection={conn} quotaData={quotaData[conn.id]}
              loading={loading[conn.id]} error={errors[conn.id]} onRefresh={refreshProvider} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
