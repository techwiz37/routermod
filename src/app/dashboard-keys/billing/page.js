"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import KeyDashboardLayout from "../KeyDashboardLayout";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresSelect from "@/shared/components/AntaresSelect";
import AntaresStat from "@/shared/components/AntaresStat";
import StarField from "@/shared/components/StarField";
import { PagePendingMarker, usePageReady } from "@/shared/components/PageReadyContext";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";

const PERIODS = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

function compact(value, locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function usd4(value) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value || 0)}`;
}

// Compact label for the daily bars so narrow columns never overlap.
function usdShort(value) {
  const amount = value || 0;
  if (amount >= 100) return `$${Math.round(amount)}`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount > 0) return `$${amount.toFixed(4)}`;
  return "";
}

function displayDate(value, dateOnly = false) {
  if (!value) return translate("Not available");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate("Not available");
  const locale = getCurrentLocale();
  return dateOnly
    ? date.toLocaleDateString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" })
    : date.toLocaleString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" });
}

function toneFor(percent) {
  if (percent == null) return "none";
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}

function statusFor(percent, kind = "spend") {
  if (percent == null) return null;
  const quota = kind === "token";
  if (percent >= 90) {
    return {
      label: translate(quota ? "Quota nearly reached" : "Limit nearly reached"),
      className: "danger",
      icon: "error",
    };
  }
  if (percent >= 70) {
    return {
      label: translate(quota ? "Approaching quota" : "Approaching limit"),
      className: "warn",
      icon: "warning",
    };
  }
  return {
    label: translate(quota ? "Within quota" : "Within budget"),
    className: "ok",
    icon: "check_circle",
  };
}

export default function BillingPage() {
  const router = useRouter();
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [, setLocaleVersion] = useState(0);

  // Keep the app-wide preloader up until the first payload arrives; there is no
  // second inline loading state (it only flashed between preloader and content).
  usePageReady(loading);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  const load = useCallback(async (selectedPeriod, signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/billing?period=${selectedPeriod}`, { cache: "no-store", signal });
      const result = await response.json();
      if (response.status === 401) { router.replace("/login-key"); return; }
      if (!response.ok) throw new Error(result.error || translate("Could not load billing data."));
      setData(result);
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || translate("Could not load billing data."));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    load(period, controller.signal);
    return () => controller.abort();
  }, [period, load]);

  const logout = async () => {
    await fetch("/api/public/key-dashboard", { method: "DELETE", cache: "no-store" }).catch(() => {});
    router.replace("/login-key");
  };

  const totals = data?.totals;
  const limits = data?.limits;
  const cycle = data?.cycle;
  const locale = getCurrentLocale();
  const spendLimit = Number(limits?.spendLimit) || 0;
  const tokenLimit = Number(limits?.tokenLimit) || 0;
  const spendTone = toneFor(cycle?.spendPercent);
  const tokenTone = toneFor(cycle?.tokenPercent);
  const status = statusFor(cycle?.spendPercent);
  const tokenStatus = statusFor(cycle?.tokenPercent, "token");
  const resetEnabled = cycle?.resetEnabled !== false;
  const expiryAt = cycle?.expiresAt || data?.key?.expiresAt || null;
  const activePercent = spendLimit > 0 ? cycle?.spendPercent : (tokenLimit > 0 ? cycle?.tokenPercent : null);
  const activeTone = spendLimit > 0 ? spendTone : tokenTone;
  const activeStatus = spendLimit > 0 ? status : (tokenLimit > 0 ? tokenStatus : null);
  const cycleFoot = resetEnabled
    ? `${translate("Resets")} ${displayDate(cycle?.resetAt)}`
    : expiryAt
      ? `${translate("Expires")} ${displayDate(expiryAt)}`
      : translate("Does not reset");
  const maxDailyCost = useMemo(
    () => Math.max(0, ...(data?.daily || []).map((item) => Number(item.cost) || 0)),
    [data]
  );
  const maxProviderCost = useMemo(
    () => Math.max(0, ...(data?.providers || []).map((item) => Number(item.cost) || 0)),
    [data]
  );

  return (
    <KeyDashboardLayout onLogout={logout}>
      <div className="an-scope an-shell key-dashboard-page billing-page">
        <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
        <PagePendingMarker active={loading && !data} />
        <div className="key-dashboard-main">
          <header className="key-dashboard-title-row">
            <div className="key-dashboard-title-copy">
              <p className="an-eyebrow"><span className="an-num">04</span><span className="an-rule" /><span>{translate("Billing & cost")}</span></p>
              <h1 className="an-h1">{translate("Billing")}</h1>
              <p className="an-hint key-dashboard-intro">{translate("Estimated cost from recorded token usage, based on your key's rate card and limits.")}</p>
              {data?.key?.name && <p className="key-dashboard-key-name">{data.key.name}</p>}
            </div>
            <div className="billing-header-actions">
              <div className="billing-period">
                <AntaresSelect
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  ariaLabel={translate("Billing period")}
                  buttonClassName="h-11 w-full px-3 text-sm"
                  options={PERIODS.map((option) => ({ value: option.value, label: translate(option.label) }))}
                />
              </div>
              <AntaresButton type="button" icon="add_card" onClick={() => router.push("/dashboard-keys/topup")}>
                {translate("Topup Token")}
              </AntaresButton>
            </div>
          </header>

          {error && (
            <AntaresNotice
              variant="danger"
              icon="error"
              className="billing-notice"
              action={<AntaresButton type="button" variant="ghost" size="sm" onClick={() => load(period)}>{translate("Retry")}</AntaresButton>}
            >
              <p>{error}</p>
            </AntaresNotice>
          )}

          {data && (
            <div className="billing-content" aria-busy={loading}>
              <section aria-label={translate("Billing summary")} className="billing-stats">
                <AntaresStat icon="payments" label={translate("Recorded cost")} value={usd.format(totals?.cost || 0)} foot={translate("Based on available pricing data")} />
                <AntaresStat
                  icon="account_balance_wallet"
                  label={spendLimit > 0 ? translate("Budget used") : tokenLimit > 0 ? translate("Quota used") : translate("Budget used")}
                  value={activePercent != null ? `${Math.round(activePercent)}%` : translate("No cap")}
                  foot={spendLimit > 0
                    ? `${usd.format(cycle?.cost || 0)} ${translate("of")} ${usd.format(spendLimit)}`
                    : tokenLimit > 0
                      ? `${compact(cycle?.tokensUsed || 0, locale)} ${translate("of")} ${compact(tokenLimit, locale)} ${translate("tokens")}`
                      : translate("Spending is unrestricted")}
                  tone={activePercent != null ? activeTone : "default"}
                />
                <AntaresStat
                  icon="savings"
                  label={spendLimit > 0 ? translate("Remaining") : tokenLimit > 0 ? translate("Tokens left") : translate("Remaining")}
                  value={spendLimit > 0
                    ? usd.format(Math.max(0, spendLimit - (cycle?.cost || 0)))
                    : tokenLimit > 0
                      ? compact(cycle?.tokensRemaining ?? Math.max(0, tokenLimit - (cycle?.tokensUsed || 0)), locale)
                      : "—"}
                  foot={spendLimit > 0 || tokenLimit > 0 ? cycleFoot : translate("No spending cap configured")}
                  tone={spendLimit > 0 || tokenLimit > 0 ? "ok" : "default"}
                />
                <AntaresStat
                  icon="query_stats"
                  label={translate("Requests")}
                  value={new Intl.NumberFormat(locale).format(totals?.requests || 0)}
                  foot={`${new Intl.NumberFormat(locale).format(totals?.failedRequests || 0)} ${translate("failed")}`}
                />
              </section>

              <AntaresPanel
                className="billing-budget"
                icon={spendLimit > 0 ? "account_balance_wallet" : tokenLimit > 0 ? "toll" : "account_balance_wallet"}
                title={spendLimit > 0 ? translate("Spending budget") : tokenLimit > 0 ? translate("Token quota") : translate("Spending budget")}
                subtitle={resetEnabled
                  ? translate("Current {window} cycle · resets {time}").replace("{window}", translate(cycle?.window || "24h")).replace("{time}", displayDate(cycle?.resetAt))
                  : expiryAt
                    ? translate("Fixed {window} window · expires {time}").replace("{window}", translate(cycle?.window || "24h")).replace("{time}", displayDate(expiryAt))
                    : translate("Fixed {window} window · does not reset").replace("{window}", translate(cycle?.window || "24h"))}
                action={activeStatus ? <span className={`billing-status ${activeStatus.className}`}><span className="material-symbols-outlined" aria-hidden="true">{activeStatus.icon}</span>{activeStatus.label}</span> : <span className="billing-status none">{translate("No limit set")}</span>}
              >
                {spendLimit > 0 && (
                  <>
                    <div className="billing-budget-amount">
                      <strong>{usd4(cycle?.cost || 0)}</strong>
                      <span>{translate("of")} {usd4(spendLimit)}</span>
                    </div>
                    <div className={`billing-progress ${spendTone}`} role="progressbar" aria-valuenow={Math.round(cycle?.spendPercent || 0)} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${cycle?.spendPercent || 0}%` }} />
                    </div>
                    <div className="billing-budget-meta">
                      <span>{Math.round(cycle?.spendPercent || 0)}% {translate("used")}</span>
                      <span>{usd.format(Math.max(0, spendLimit - (cycle?.cost || 0)))} {translate("left")}</span>
                    </div>
                  </>
                )}

                {tokenLimit > 0 && (
                  <div className={spendLimit > 0 ? "billing-token-block" : ""}>
                    <div className="billing-budget-amount">
                      <strong>{compact(cycle?.tokensUsed || 0, locale)}</strong>
                      <span>{translate("of")} {compact(tokenLimit, locale)} {translate("tokens")}</span>
                    </div>
                    <div className={`billing-progress ${tokenTone}`} role="progressbar" aria-valuenow={Math.round(cycle?.tokenPercent || 0)} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${cycle?.tokenPercent || 0}%` }} />
                    </div>
                    <div className="billing-budget-meta">
                      <span>{Math.round(cycle?.tokenPercent || 0)}% {translate("used")}</span>
                      <span>{compact(cycle?.tokensRemaining ?? Math.max(0, tokenLimit - (cycle?.tokensUsed || 0)), locale)} {translate("tokens left")}</span>
                    </div>
                  </div>
                )}

                {spendLimit === 0 && tokenLimit === 0 && (
                  <div className="billing-no-cap">
                    <span className="material-symbols-outlined" aria-hidden="true">lock_open</span>
                    <div>
                      <p>{translate("No spending cap configured for this key.")}</p>
                      <p className="billing-no-cap-sub">{usd4(cycle?.cost || 0)} {translate("recorded in the current cycle")}</p>
                    </div>
                  </div>
                )}

                <div className="billing-limit-grid">
                  <div><span>{translate("Token quota")}</span><strong>{tokenLimit > 0 ? `${compact(tokenLimit, locale)} / ${translate(cycle?.window || "24h")}` : translate("Unlimited")}</strong></div>
                  <div><span>{translate("Reset token")}</span><strong>{resetEnabled ? translate("On") : translate("Off")}</strong></div>
                  <div><span>{translate("Key validity")}</span><strong>{expiryAt ? displayDate(expiryAt, true) : translate("No expiry")}</strong></div>
                  <div><span>{translate("Daily requests")}</span><strong>{limits?.dailyLimit > 0 ? new Intl.NumberFormat(locale).format(limits.dailyLimit) : translate("Unlimited")}</strong></div>
                  <div><span>{translate("Hourly requests")}</span><strong>{limits?.hourLimit > 0 ? new Intl.NumberFormat(locale).format(limits.hourLimit) : translate("Unlimited")}</strong></div>
                  <div><span>{translate("Concurrent requests")}</span><strong>{limits?.maxConcurrentLimit > 0 ? new Intl.NumberFormat(locale).format(limits.maxConcurrentLimit) : translate("Unlimited")}</strong></div>
                </div>
              </AntaresPanel>

              <section className="billing-two-col">
                <AntaresPanel
                  icon="show_chart"
                  title={translate("Daily cost")}
                  subtitle={translate("Estimated cost recorded per day.")}
                >
                  {(data?.daily || []).length ? (
                    <div className="billing-bars" role="img" aria-label={translate("Daily cost bar chart")}>
                      {data.daily.map((item) => {
                        const height = maxDailyCost > 0 ? Math.max(3, Math.round((item.cost / maxDailyCost) * 100)) : 3;
                        return (
                          <div key={item.day} className="billing-bar-column" title={`${item.day} · ${usd4(item.cost)}`}>
                            <span className="billing-bar-value">{usdShort(item.cost)}</span>
                            <div className="billing-bar-track"><span className="billing-bar" style={{ height: `${height}%` }} /></div>
                            <span className="billing-bar-label">{item.day.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="billing-empty">{translate("No daily cost data in this period.")}</p>}
                </AntaresPanel>

                <AntaresPanel
                  icon="pie_chart"
                  title={translate("Cost by provider")}
                  subtitle={translate("Share of recorded cost per provider.")}
                >
                  {(data?.providers || []).length ? (
                    <>
                      <div className="billing-scroll-list scrollbar-none">
                        <ul className="billing-provider-list">
                          {data.providers.map((provider) => {
                            const share = totals?.cost > 0 ? (provider.cost / totals.cost) * 100 : 0;
                            const width = maxProviderCost > 0 ? Math.max(2, (provider.cost / maxProviderCost) * 100) : 0;
                            return (
                              <li key={provider.id || provider.name}>
                                <div className="billing-provider-head">
                                  <span className="truncate">{provider.name}</span>
                                  <strong>{usd4(provider.cost)}</strong>
                                </div>
                                <div className="billing-provider-bar"><span style={{ width: `${width}%` }} /></div>
                                <div className="billing-provider-meta">
                                  <span>{new Intl.NumberFormat(locale).format(provider.requests)} {translate("requests")} · {compact(provider.tokens, locale)} {translate("tokens")}</span>
                                  <span>{share.toFixed(1)}%</span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      {data.providers.length > 5 && (
                        <p className="billing-scroll-hint">{translate("Scroll to see all {count} providers").replace("{count}", String(data.providers.length))}</p>
                      )}
                    </>
                  ) : <p className="billing-empty">{translate("No provider cost data in this period.")}</p>}
                </AntaresPanel>
              </section>

              <AntaresPanel
                className="billing-models"
                icon="receipt_long"
                title={translate("Cost by model")}
                subtitle={translate("Rates are USD per 1 million tokens.")}
              >
                {(data?.models || []).length ? (
                  <>
                    <div className="an-table-wrap billing-table-scroll scrollbar-none">
                      <table className="an-table billing-table">
                        <thead>
                          <tr>
                            <th>{translate("Model")}</th>
                            <th>{translate("Provider")}</th>
                            <th className="num">{translate("Requests")}</th>
                            <th className="num">{translate("Tokens")}</th>
                            <th className="num">{translate("Rate in/out")}</th>
                            <th className="num">{translate("Cost")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.models.map((model, index) => (
                            <tr key={`${model.provider}-${model.model}-${index}`}>
                              <td data-label={translate("Model")}><span className="billing-model-id" title={model.model}>{model.model || translate("Unknown model")}</span></td>
                              <td data-label={translate("Provider")}><span className="billing-model-provider">{model.providerName}</span></td>
                              <td className="num" data-label={translate("Requests")}>{new Intl.NumberFormat(locale).format(model.requests)}</td>
                              <td className="num" data-label={translate("Tokens")}>{compact(model.tokens, locale)}</td>
                              <td className="num billing-rate" data-label={translate("Rate in/out")}>
                                {model.rate ? `${usd4(model.rate.input ?? 0)} / ${usd4(model.rate.output ?? 0)}` : "—"}
                              </td>
                              <td className="num billing-cost" data-label={translate("Cost")}>{usd4(model.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {data.models.length > 5 && (
                      <p className="billing-scroll-hint">{translate("Scroll to see all {count} models").replace("{count}", String(data.models.length))}</p>
                    )}
                  </>
                ) : <p className="billing-empty">{translate("No model cost data in this period.")}</p>}
              </AntaresPanel>
            </div>
          )}
        </div>
      </div>
    </KeyDashboardLayout>
  );
}
