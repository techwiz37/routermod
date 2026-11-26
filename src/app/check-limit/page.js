"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresNotice from "@/shared/components/AntaresNotice";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresStat from "@/shared/components/AntaresStat";
import StarField from "@/shared/components/StarField";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";

function compact(value, locale) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function displayDate(value) {
  if (!value) return translate("Not available");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate("Not available");
  const locale = getCurrentLocale();
  return date.toLocaleString(locale === "id" ? "id-ID" : locale, { timeZone: "Asia/Jakarta" });
}

function toneFor(percent) {
  if (percent == null) return "default";
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}

function statusFor(percent) {
  if (percent == null) return null;
  if (percent >= 90) return { label: translate("Limit nearly reached"), className: "danger", icon: "error" };
  if (percent >= 70) return { label: translate("Approaching limit"), className: "warn", icon: "warning" };
  return { label: translate("Within limit"), className: "ok", icon: "check_circle" };
}

export default function CheckLimitPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [, setLocaleVersion] = useState(0);

  useEffect(() => onLocaleChange(() => setLocaleVersion((v) => v + 1)), []);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public/check-limit", { cache: "no-store", signal });
      const result = await response.json();
      if (response.status === 401) { router.replace("/login-key"); return; }
      if (!response.ok) throw new Error(result.error || translate("Could not load limit data."));
      setData(result);
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || translate("Could not load limit data."));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const locale = getCurrentLocale();
  const limits = data?.limits;
  const usage = data?.usage;
  const cycle = data?.cycle;

  const tokenLimit = Number(limits?.tokenLimit) || 0;
  const dailyLimit = Number(limits?.dailyLimit) || 0;
  const hourLimit = Number(limits?.hourLimit) || 0;
  const minuteLimit = Number(limits?.minuteLimit) || 0;
  const concurrentLimit = Number(limits?.maxConcurrentLimit) || 0;
  const spendLimit = Number(limits?.spendLimit) || 0;

  const tokenUsed = Number(usage?.tokensUsed) || 0;
  const dailyUsed = Number(usage?.dailyRequests) || 0;
  const hourUsed = Number(usage?.hourRequests) || 0;
  const minuteUsed = Number(usage?.minuteRequests) || 0;
  const concurrentUsed = Number(usage?.concurrentRequests) || 0;
  const spendUsed = Number(usage?.spend) || 0;

  const tokenPercent = tokenLimit > 0 ? Math.min(100, (tokenUsed / tokenLimit) * 100) : null;
  const dailyPercent = dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : null;
  const hourPercent = hourLimit > 0 ? Math.min(100, (hourUsed / hourLimit) * 100) : null;
  const minutePercent = minuteLimit > 0 ? Math.min(100, (minuteUsed / minuteLimit) * 100) : null;
  const concurrentPercent = concurrentLimit > 0 ? Math.min(100, (concurrentUsed / concurrentLimit) * 100) : null;
  const spendPercent = spendLimit > 0 ? Math.min(100, (spendUsed / spendLimit) * 100) : null;

  const worstTone = [tokenPercent, dailyPercent, hourPercent, minutePercent, concurrentPercent, spendPercent]
    .filter((p) => p != null)
    .reduce((acc, p) => {
      const t = toneFor(p);
      if (t === "danger") return "danger";
      if (t === "warn" && acc !== "danger") return "warn";
      return acc;
    }, "ok");

  const worstStatus = statusFor(
    Math.max(...[tokenPercent, dailyPercent, hourPercent, minutePercent, concurrentPercent, spendPercent].filter((p) => p != null))
  );

  return (
    <div className="an-scope an-shell check-limit-page min-h-screen">
      <div className="an-shell-bg" aria-hidden="true"><StarField /></div>
      <div className="check-limit-main max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
        <header className="check-limit-title-row mb-6">
          <div className="check-limit-title-copy">
            <p className="an-eyebrow"><span className="an-num">00</span><span className="an-rule" /><span>{translate("Quota & Rate Limits")}</span></p>
            <h1 className="an-h1">{translate("Check Limit")}</h1>
            <p className="an-hint">{translate("Current usage against configured rate limits and quotas for this API key.")}</p>
            {data?.key?.name && <p className="key-dashboard-key-name mt-2">{data.key.name}</p>}
          </div>
          <div className="check-limit-actions mt-4 flex flex-wrap gap-3">
            <AntaresButton type="button" icon="refresh" onClick={() => load()} disabled={loading}>
              {translate("Refresh")}
            </AntaresButton>
            <AntaresButton type="button" icon="arrow_back" variant="ghost" onClick={() => router.push("/dashboard-keys")}>
              {translate("Back to Dashboard")}
            </AntaresButton>
          </div>
        </header>

        {error && (
          <AntaresNotice
            variant="danger"
            icon="error"
            className="mb-4"
            action={<AntaresButton type="button" variant="ghost" size="sm" onClick={() => load()}>{translate("Retry")}</AntaresButton>}
          >
            <p>{error}</p>
          </AntaresNotice>
        )}

        {loading && !data && (
          <AntaresNotice variant="info" icon="progress_activity" className="mb-4">
            <p>{translate("Loading limit data…")}</p>
          </AntaresNotice>
        )}

        {data && (
          <div className={`check-limit-content${loading ? " is-refreshing" : ""}`} aria-busy={loading}>
            {/* Overall Status */}
            <AntaresPanel
              className="mb-6"
              icon="speed"
              title={translate("Overall Status")}
              subtitle={cycle?.resetAt ? translate("Current cycle resets {time}").replace("{time}", displayDate(cycle.resetAt)) : ""}
              action={worstStatus ? <span className={`billing-status ${worstStatus.className}`}><span className="material-symbols-outlined" aria-hidden="true">{worstStatus.icon}</span>{worstStatus.label}</span> : <span className="billing-status none">{translate("No limits set")}</span>}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <AntaresStat
                  icon="token"
                  label={translate("Token Quota")}
                  value={tokenLimit > 0 ? `${Math.round(tokenPercent || 0)}%` : translate("Unlimited")}
                  foot={tokenLimit > 0 ? `${compact(tokenUsed, locale)} / ${compact(tokenLimit, locale)}` : translate("No token limit")}
                  tone={tokenLimit > 0 ? toneFor(tokenPercent) : "default"}
                />
                <AntaresStat
                  icon="payments"
                  label={translate("Spend Limit")}
                  value={spendLimit > 0 ? `${Math.round(spendPercent || 0)}%` : translate("Unlimited")}
                  foot={spendLimit > 0 ? `$${spendUsed.toFixed(4)} / $${spendLimit.toFixed(2)}` : translate("No spend limit")}
                  tone={spendLimit > 0 ? toneFor(spendPercent) : "default"}
                />
                <AntaresStat
                  icon="swap_horiz"
                  label={translate("Concurrent Requests")}
                  value={concurrentLimit > 0 ? `${concurrentUsed} / ${concurrentLimit}` : translate("Unlimited")}
                  foot={concurrentLimit > 0 ? `${Math.round(concurrentPercent || 0)}% used` : translate("No concurrent limit")}
                  tone={concurrentLimit > 0 ? toneFor(concurrentPercent) : "default"}
                />
              </div>
            </AntaresPanel>

            {/* Request Rate Limits */}
            <AntaresPanel
              className="mb-6"
              icon="schedule"
              title={translate("Request Rate Limits")}
              subtitle={translate("Current request counts within rate limit windows")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Daily */}
                <div className="check-limit-quota-item">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--t-muted)]">{translate("Daily")}</span>
                    <span className="text-xs font-mono text-[var(--t-dim)]">{dailyLimit > 0 ? `${dailyUsed} / ${new Intl.NumberFormat(locale).format(dailyLimit)}` : translate("Unlimited")}</span>
                  </div>
                  {dailyLimit > 0 && (
                    <>
                      <div className={`billing-progress ${toneFor(dailyPercent)}`} role="progressbar" aria-valuenow={Math.round(dailyPercent || 0)} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${dailyPercent || 0}%` }} />
                      </div>
                      <p className="text-xs text-[var(--t-dim)] mt-1">{Math.round(dailyPercent || 0)}% {translate("used")}</p>
                    </>
                  )}
                </div>

                {/* Hourly */}
                <div className="check-limit-quota-item">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--t-muted)]">{translate("Hourly")}</span>
                    <span className="text-xs font-mono text-[var(--t-dim)]">{hourLimit > 0 ? `${hourUsed} / ${new Intl.NumberFormat(locale).format(hourLimit)}` : translate("Unlimited")}</span>
                  </div>
                  {hourLimit > 0 && (
                    <>
                      <div className={`billing-progress ${toneFor(hourPercent)}`} role="progressbar" aria-valuenow={Math.round(hourPercent || 0)} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${hourPercent || 0}%` }} />
                      </div>
                      <p className="text-xs text-[var(--t-dim)] mt-1">{Math.round(hourPercent || 0)}% {translate("used")}</p>
                    </>
                  )}
                </div>

                {/* Per Minute */}
                <div className="check-limit-quota-item">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--t-muted)]">{translate("Per Minute")}</span>
                    <span className="text-xs font-mono text-[var(--t-dim)]">{minuteLimit > 0 ? `${minuteUsed} / ${new Intl.NumberFormat(locale).format(minuteLimit)}` : translate("Unlimited")}</span>
                  </div>
                  {minuteLimit > 0 && (
                    <>
                      <div className={`billing-progress ${toneFor(minutePercent)}`} role="progressbar" aria-valuenow={Math.round(minutePercent || 0)} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${minutePercent || 0}%` }} />
                      </div>
                      <p className="text-xs text-[var(--t-dim)] mt-1">{Math.round(minutePercent || 0)}% {translate("used")}</p>
                    </>
                  )}
                </div>
              </div>
            </AntaresPanel>

            {/* Detailed Limits */}
            <AntaresPanel
              icon="info"
              title={translate("Configured Limits")}
              subtitle={translate("All rate limits and quotas for this key")}
            >
              <div className="billing-limit-grid">
                <div><span>{translate("Token quota")}</span><strong>{tokenLimit > 0 ? `${compact(tokenLimit, locale)} / ${translate(cycle?.window || "24h")}` : translate("Unlimited")}</strong></div>
                <div><span>{translate("Spend limit")}</span><strong>{spendLimit > 0 ? `$${spendLimit.toFixed(2)} / ${translate(cycle?.window || "24h")}` : translate("Unlimited")}</strong></div>
                <div><span>{translate("Daily requests")}</span><strong>{dailyLimit > 0 ? new Intl.NumberFormat(locale).format(dailyLimit) : translate("Unlimited")}</strong></div>
                <div><span>{translate("Hourly requests")}</span><strong>{hourLimit > 0 ? new Intl.NumberFormat(locale).format(hourLimit) : translate("Unlimited")}</strong></div>
                <div><span>{translate("Per-minute requests")}</span><strong>{minuteLimit > 0 ? new Intl.NumberFormat(locale).format(minuteLimit) : translate("Unlimited")}</strong></div>
                <div><span>{translate("Concurrent requests")}</span><strong>{concurrentLimit > 0 ? new Intl.NumberFormat(locale).format(concurrentLimit) : translate("Unlimited")}</strong></div>
              </div>
            </AntaresPanel>
          </div>
        )}
      </div>
    </div>
  );
}
