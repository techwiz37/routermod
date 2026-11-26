"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "./KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresStat from "@/shared/components/AntaresStat";
import AntaresSelect from "@/shared/components/AntaresSelect";
import StarField from "@/shared/components/StarField";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";
import { formatCompact } from "@/shared/utils/compactNumber";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PERIODS = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];
// Both analytics cards show 5 rows at a time and scroll internally instead of
// paginating — scrolling is faster on mobile and keeps the list context visible.
const VISIBLE_ROWS = 5;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const usdStat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Stat({ icon, label, value, detail }) {
  return (
    <AntaresStat className="key-dashboard-stat" icon={icon} label={label} value={value} foot={detail} />
  );
}

function displayDate(value, dateOnly = false) {
  if (!value) return translate("No requests yet");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate("Time unavailable");
  const locale = getCurrentLocale();
  return dateOnly
    ? date.toLocaleDateString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" })
    : date.toLocaleString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" });
}

// Countdown text: 3d 04h 12m 05s / 04h 12m 05s / 12m 05s. Always padded so the
// ticking badge keeps a stable width on mobile.
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (hours > 0) return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${pad(minutes)}m ${pad(seconds)}s`;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Key lifetime badge.
 *   no expiresAt   -> "Lifetime" (the row is stored as NULL, never as "unknown")
 *   has expiresAt  -> absolute expiry date + a countdown ticking every second,
 *                     turning amber inside the last day and red once expired.
 */
function KeyExpiry({ expiresAt }) {
  const target = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const hasDeadline = Number.isFinite(target);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasDeadline) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasDeadline, expiresAt]);

  if (!expiresAt) {
    return (
      <span className="key-dashboard-expiry is-lifetime" title={translate("This key never expires")}>
        <span className="material-symbols-outlined" aria-hidden="true">all_inclusive</span>
        <span className="key-dashboard-expiry-label">{translate("Lifetime")}</span>
      </span>
    );
  }
  if (!hasDeadline) return null;

  const remaining = target - now;
  const expired = remaining <= 0;
  const urgent = !expired && remaining <= 24 * HOUR_MS;
  return (
    <span className={`key-dashboard-expiry${expired ? " is-expired" : urgent ? " is-urgent" : ""}`}>
      <span className="material-symbols-outlined" aria-hidden="true">{expired ? "error" : "timer"}</span>
      <span className="key-dashboard-expiry-label">{translate(expired ? "Expired" : "Expires")}</span>
      <time dateTime={expiresAt}>{displayDate(expiresAt)}</time>
      {!expired && (
        <span className="key-dashboard-expiry-count">{translate("Remaining")} {formatDuration(remaining)}</span>
      )}
    </span>
  );
}



export default function DashboardKeysPage() {
  const router = useRouter();
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [, setLocaleVersion] = useState(0);

  // Hold the app-wide preloader until the first payload has landed, so the
  // overlay never disappears onto placeholder zeros. Later period changes keep
  // the previous content on screen instead of showing a second loading state.
  usePageReady(loading);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  const load = useCallback(async (selectedPeriod, signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/key-dashboard?period=${selectedPeriod}`, { cache: "no-store", signal });
      const result = await response.json();
      if (response.status === 401) {
        router.replace("/login-key");
        return;
      }
      if (!response.ok) throw new Error(result.error || translate("Could not load statistics."));
      setData(result);
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || translate("Could not load statistics."));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    load(period, controller.signal);
    return () => controller.abort();
  }, [period, load]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(""), 8000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  const totals = data?.totals;
  const number = new Intl.NumberFormat(getCurrentLocale());

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page key-dashboard-overview">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading && !data} />
        <div className="key-dashboard-main">
          <section className="key-dashboard-title-row" aria-labelledby="key-dashboard-title">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow"><span className="an-num">01</span><span className="an-rule" /><span>{translate("RouterMod · API usage")}</span></p>
              <h1 id="key-dashboard-title" className="an-h1">{translate("API key")} <span className="an-dim">{translate("Dashboard")}</span></h1>
              <p className="an-hint key-dashboard-intro">{translate("Monitor requests, token usage and model activity for your key.")}</p>
              <p className="key-dashboard-key-name">
                {data?.key?.name || translate("Key usage statistics")}
                {data?.key?.masked ? <><span aria-hidden="true"> · </span><span className="key-dashboard-masked">{data.key.masked}</span></> : null}
              </p>
              {data?.key ? (
                <div className="key-dashboard-key-meta">
                  <KeyExpiry expiresAt={data.key.expiresAt} />
                </div>
              ) : null}
            </div>
            <div className="key-dashboard-period">
              <AntaresSelect
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                ariaLabel={translate("Statistics period")}
                buttonClassName="h-11 w-full px-3 text-sm"
                options={PERIODS.map((option) => ({ value: option.value, label: translate(option.label) }))}
              />
            </div>
          </section>

          {error && (
            <section role="alert" className="an-panel key-dashboard-error">
              <div className="key-dashboard-error-copy">
                <p className="key-dashboard-error-title">{translate("Failed to load statistics")}</p>
                <p className="key-dashboard-error-message">{error}</p>
              </div>
              <AntaresButton type="button" variant="ghost" onClick={() => load(period)} className="key-dashboard-retry">{translate("Retry")}</AntaresButton>
            </section>
          )}

          {data && (
            <div className="key-dashboard-content" aria-busy={loading}>
              <section aria-label={translate("Usage summary")} className="key-dashboard-stats">
                <Stat icon="query_stats" label={translate("Total requests")} value={formatCompact(totals?.requests || 0)} detail={`${formatCompact(totals?.failedRequests || 0)} ${translate("failed")}`} />
                <Stat icon="token" label={translate("Total tokens")} value={formatCompact(totals?.tokens || 0)} detail={`${translate("Input")} ${formatCompact(totals?.promptTokens || 0)} · ${translate("output")} ${formatCompact(totals?.completionTokens || 0)}`} />
                <Stat icon="payments" label={translate("Recorded cost")} value={usdStat.format(totals?.cost || 0)} detail={translate("Based on available pricing data")} />
                <Stat icon="schedule" label={translate("Last used")} value={totals?.lastUsedAt ? displayDate(totals.lastUsedAt, true) : translate("Not used yet")} detail={totals?.lastUsedAt ? displayDate(totals.lastUsedAt) : translate("Last activity in this period")} />
              </section>

              {totals?.requests === 0 && (
                <section className="key-dashboard-empty">
                  <h2>{translate("No usage in this period")}</h2>
                  <p>{translate("Requests using this key will appear once recorded by the server.")}</p>
                </section>
              )}

              <AntaresPanel className="key-dashboard-chart key-dashboard-analytics-panel" icon="bar_chart" title={translate("Requests per day")} subtitle={translate("Recorded requests for the selected period.")} action={totals?.requests > 0 ? <p className="key-dashboard-chart-total"><span>{formatCompact(totals.requests)}</span> {translate("requests")}</p> : null} aria-label={translate("Requests per day")}>
                {totals?.requests > 0 ? (
                  <div style={{ width: "100%", height: 240 }} role="img" aria-label={translate("Daily requests bar chart")}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.daily} margin={{ top: 12, right: 8, bottom: 0, left: -20 }} accessibilityLayer>
                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)" />
                        <XAxis dataKey="day" tickFormatter={(value) => value.slice(5)} stroke="#a8adb7" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                        <YAxis stroke="#a8adb7" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "rgba(255,255,255,.04)" }} contentStyle={{ background: "#15181d", border: "1px solid #424750", borderRadius: 6, color: "#eceef2", fontSize: 12 }} itemStyle={{ color: "#eceef2" }} formatter={(value) => [number.format(value), translate("Requests")]} />
                        <Bar dataKey="requests" fill="#ff6a75" maxBarSize={36} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="key-dashboard-panel-empty">{translate("No daily data to display.")}</p>}
              </AntaresPanel>

              <section className="key-dashboard-details">
                <AntaresPanel className="key-dashboard-analytics-panel" icon="model_training" title={translate("Models used")} subtitle={translate("Usage by AI model.")}>
                  {data?.models?.length ? (
                    <div className="key-dashboard-scroll scrollbar-none" style={{ overflowY: "auto", overscrollBehavior: "contain", maxHeight: `${VISIBLE_ROWS * 76}px` }}>
                      <ul className="key-dashboard-list">
                        {data.models.map((model, index) => <li key={`${model.provider}-${model.model}-${index}`} className="key-dashboard-model-row">
                          <div className="key-dashboard-model-copy"><p className="key-dashboard-model-name">{model.model || translate("Unknown model")}</p><p className="key-dashboard-model-provider">{model.provider || translate("Unknown provider")}</p></div>
                          <div className="key-dashboard-model-stats"><p>{formatCompact(model.requests)} {translate("requests")}</p><p>{formatCompact(model.tokens)} {translate("tokens")}</p></div>
                        </li>)}
                      </ul>
                    </div>
                  ) : <p className="key-dashboard-panel-empty">{translate("No models recorded for this period.")}</p>}
                </AntaresPanel>

                <AntaresPanel className="key-dashboard-analytics-panel" icon="history" title={translate("Recent requests")} subtitle={translate("Up to 20 recent activities, not limited by the statistics period.")}>
                  {data?.recent?.length ? (
                    <div className="key-dashboard-scroll scrollbar-none" style={{ overflowY: "auto", overscrollBehavior: "contain", maxHeight: `${VISIBLE_ROWS * 104}px` }}>
                      <ul className="key-dashboard-list">
                        {data.recent.map((request, index) => <li key={`${request.timestamp}-${index}`} className="key-dashboard-request-row">
                          <div className="key-dashboard-request-heading"><p className="key-dashboard-model-name">{request.model || translate("Unknown model")}</p><span className="key-dashboard-request-status">{request.status || translate("Completed")}</span></div>
                          <p className="key-dashboard-request-meta">{request.provider || translate("Unknown provider")} · {formatCompact((request.promptTokens || 0) + (request.completionTokens || 0))} {translate("tokens")}</p>
                          <time className="key-dashboard-request-time" dateTime={request.timestamp}>{displayDate(request.timestamp)}</time>
                        </li>)}
                      </ul>
                    </div>
                  ) : <p className="key-dashboard-panel-empty">{translate("No requests recorded yet.")}</p>}
                </AntaresPanel>
              </section>
            </div>
          )}
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
