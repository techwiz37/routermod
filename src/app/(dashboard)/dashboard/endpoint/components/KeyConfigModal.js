"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Button, Input, Toggle } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresSelect from "@/shared/components/AntaresSelect";
import { translate } from "@/i18n/runtime";
import { TOKEN_WINDOWS } from "@/shared/constants/keyQuota.js";
import { cn } from "@/shared/utils/cn";
import { formatTokens, tokenPeriodLabel } from "@/shared/utils/formatTokens.js";

function formatNumber(num) {
  if (!num || isNaN(num)) return "0";
  return Number(num).toLocaleString("en-US");
}

// Expiry is expressed as an amount plus a unit so operators can issue very
// short-lived keys (minutes) as easily as monthly ones.
const EXPIRY_UNITS = {
  minutes: { seconds: 60, label: "minutes" },
  hours: { seconds: 3600, label: "hours" },
  days: { seconds: 86400, label: "days" },
};

const EXPIRY_PRESETS = {
  minutes: [5, 15, 30, 60],
  hours: [1, 6, 12, 24],
  days: [7, 30, 90],
};

// Derive a readable amount/unit from the stored absolute expiry. The value is
// only used to prefill the form; saving an untouched form keeps the original
// timestamp because the field is omitted from the payload.
function splitExpiry(expiresAt) {
  if (!expiresAt) return { amount: 0, unit: "days" };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return { amount: 0, unit: "days" };
  const seconds = ms / 1000;
  if (seconds >= EXPIRY_UNITS.days.seconds) {
    return { amount: Math.max(1, Math.ceil(seconds / EXPIRY_UNITS.days.seconds)), unit: "days" };
  }
  if (seconds >= EXPIRY_UNITS.hours.seconds) {
    return { amount: Math.max(1, Math.ceil(seconds / EXPIRY_UNITS.hours.seconds)), unit: "hours" };
  }
  return { amount: Math.max(1, Math.ceil(seconds / EXPIRY_UNITS.minutes.seconds)), unit: "minutes" };
}

const KeyConfigForm = forwardRef(function KeyConfigForm({ apiKey, onClose, onSaved, addNotification, onSavingChange }, ref) {
  const [activeTab, setActiveTab] = useState("requests");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // The name is the only human-readable handle for this credential, so it is
  // editable right here instead of forcing a delete/recreate cycle.
  const [keyName, setKeyName] = useState(() => apiKey.name || "");

  // Keep the parent's loading state in sync so the sticky footer can show it.
  useEffect(() => { onSavingChange?.(saving); }, [onSavingChange, saving]);

  // Rate Limits
  const [minuteLimit, setMinuteLimit] = useState(() => apiKey.minuteLimit || 0);
  const [hourLimit, setHourLimit] = useState(() => apiKey.hourLimit || 0);
  const [dailyLimit, setDailyLimit] = useState(() => apiKey.dailyLimit || 0);
  const [monthLimit, setMonthLimit] = useState(() => apiKey.monthLimit || 0);
  const [maxConcurrent, setMaxConcurrent] = useState(() => apiKey.maxConcurrentLimit || 0);

  // Token & Spend Quota
  const [tokenLimit, setTokenLimit] = useState(() => apiKey.tokenLimit || 0);
  const [tokenWindow, setTokenWindow] = useState(() => apiKey.tokenLimitWindow || "24h");
  const [tokenResetEnabled, setTokenResetEnabled] = useState(() => apiKey.tokenResetEnabled !== false);
  const [spendLimit, setSpendLimit] = useState(() => apiKey.spendLimit || 0);
  const [tokensPerMinute, setTokensPerMinute] = useState(() => apiKey.tokensPerMinuteLimit || 0);

  // Access & Expiry
  const [expiresAmount, setExpiresAmount] = useState(() => splitExpiry(apiKey.expiresAt).amount);
  const [expiresUnit, setExpiresUnit] = useState(() => splitExpiry(apiKey.expiresAt).unit);
  // Only send expiry when the operator actually edits it, so merely opening
  // this dialog cannot shift an existing deadline.
  const [expiresTouched, setExpiresTouched] = useState(false);
  const [maintenance, setMaintenance] = useState(() => !!apiKey.maintenanceEnabled);
  const [maintenanceMessage, setMaintenanceMessage] = useState(() => apiKey.maintenanceMessage || "");
  // Default on: existing keys keep the ability to rotate their own secret.
  const [changeKey, setChangeKey] = useState(() => apiKey.changeKeyEnabled !== false);
  // Default on: existing keys keep control of their own IP blacklist.
  const [manageIp, setManageIp] = useState(() => apiKey.manageIpEnabled !== false);

  const changeExpiry = (amount, unit = expiresUnit) => {
    setExpiresAmount(amount);
    setExpiresUnit(unit);
    setExpiresTouched(true);
  };

  // Indicator helpers
  const hasRequestsConfig =
    Number(minuteLimit) > 0 ||
    Number(hourLimit) > 0 ||
    Number(dailyLimit) > 0 ||
    Number(monthLimit) > 0 ||
    Number(maxConcurrent) > 0;

  const hasQuotaConfig =
    Number(tokenLimit) > 0 ||
    Number(spendLimit) > 0 ||
    Number(tokensPerMinute) > 0;

  const hasAccessConfig =
    Number(expiresAmount) > 0 || maintenance || !changeKey || !manageIp;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/keys/${apiKey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyName.trim(),
          minuteLimit: Math.max(0, Number(minuteLimit) || 0),
          hourLimit: Math.max(0, Number(hourLimit) || 0),
          dailyLimit: Math.max(0, Number(dailyLimit) || 0),
          monthLimit: Math.max(0, Number(monthLimit) || 0),
          tokenLimit: Math.max(0, Number(tokenLimit) || 0),
          tokenLimitWindow: tokenWindow,
          tokenResetEnabled: tokenResetEnabled,
          spendLimit: Math.max(0, Number(spendLimit) || 0),
          tokensPerMinuteLimit: Math.max(0, Number(tokensPerMinute) || 0),
          maxConcurrentLimit: Math.max(0, Number(maxConcurrent) || 0),
          maintenanceEnabled: maintenance,
          maintenanceMessage: maintenanceMessage,
          changeKeyEnabled: changeKey,
          manageIpEnabled: manageIp,
          ...(expiresTouched
            ? {
                expiresInSeconds: Number(expiresAmount) > 0
                  ? Math.round(Number(expiresAmount) * EXPIRY_UNITS[expiresUnit].seconds)
                  : 0,
              }
            : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || translate("Failed to save API key configuration"));
      }

      onSaved(data.key);
      if (addNotification) {
        addNotification({
          type: "success",
          title: translate("Configuration Saved"),
          message: translate("API key rate limits and maintenance updated"),
        });
      }
    } catch (e) {
      setError(e.message || translate("Error"));
      if (addNotification) {
        addNotification({
          type: "error",
          title: translate("Error"),
          message: e.message,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // Expose save to the modal footer, which lives outside the scroll area.
  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

  return (
    <div className="flex flex-col gap-4">
      {/* Key name — surfaced first because it labels every other view. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="api-key-name" className="text-xs font-medium text-[var(--t-ink)]">
            {translate("Key name")}
          </label>
          <span className="shrink-0 text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
            {keyName.trim().length}/60
          </span>
        </div>
        <Input
          id="api-key-name"
          variant="antares"
          type="text"
          maxLength={60}
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder={translate("e.g. Production bot")}
        />
        <p className="text-[11px] leading-relaxed text-[var(--t-muted)]">
          {translate("Shown in the key list and the live request feed. Leave empty to use the default label.")}
        </p>
      </div>

      {/* Navigation Tabs (Responsive Segmented Control) */}
      <div className="grid grid-cols-3 p-1 rounded-xl bg-[var(--t-field)] border border-[var(--t-line)] gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={cn(
            "relative flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-medium rounded-lg transition-all select-none",
            activeTab === "requests"
              ? "bg-[var(--t-raised)] text-[var(--t-ink)] shadow-sm border border-[var(--t-line)]"
              : "text-[var(--t-muted)] hover:text-[var(--t-ink)]"
          )}
        >
          <span className="material-symbols-outlined text-[15px] sm:text-[16px]">speed</span>
          <span className="truncate">{translate("Requests")}</span>
          {hasRequestsConfig && (
            <span className="hidden sm:block size-1.5 rounded-full bg-[var(--t-accent)] shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("quota")}
          className={cn(
            "relative flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-medium rounded-lg transition-all select-none",
            activeTab === "quota"
              ? "bg-[var(--t-raised)] text-[var(--t-ink)] shadow-sm border border-[var(--t-line)]"
              : "text-[var(--t-muted)] hover:text-[var(--t-ink)]"
          )}
        >
          <span className="material-symbols-outlined text-[15px] sm:text-[16px]">toll</span>
          <span className="truncate">{translate("Token Quota")}</span>
          {hasQuotaConfig && (
            <span className="hidden sm:block size-1.5 rounded-full bg-[var(--t-accent)] shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("access")}
          className={cn(
            "relative flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 sm:px-2 text-[11px] sm:text-xs font-medium rounded-lg transition-all select-none",
            activeTab === "access"
              ? "bg-[var(--t-raised)] text-[var(--t-ink)] shadow-sm border border-[var(--t-line)]"
              : "text-[var(--t-muted)] hover:text-[var(--t-ink)]"
          )}
        >
          <span className="material-symbols-outlined text-[15px] sm:text-[16px]">tune</span>
          <span className="truncate">{translate("Rules")}</span>
          {hasAccessConfig && (
            <span className="hidden sm:block size-1.5 rounded-full bg-[var(--t-accent)] shrink-0" />
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--t-danger)]/40 bg-[var(--t-danger)]/10 p-3 text-xs text-[var(--t-danger)] flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Tab 1: Requests & Rate Limits */}
      {activeTab === "requests" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[var(--t-raised)]/60 border border-[var(--t-line-soft)] text-xs text-[var(--t-muted)]">
            <span className="material-symbols-outlined text-[18px] text-[var(--t-star-ink)] shrink-0 mt-0.5">info</span>
            <p className="leading-relaxed">
              {translate("Use 0 for unlimited requests. Each window resets automatically (per minute, hour, day, and month).")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--t-ink)]">
                  {translate("Maximum requests per minute")}
                </label>
                <span className="text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
                  req/min
                </span>
              </div>
              <Input
                variant="antares"
                type="number"
                min="0"
                value={minuteLimit}
                onChange={(e) => setMinuteLimit(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--t-ink)]">
                  {translate("Maximum requests per hour")}
                </label>
                <span className="text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
                  req/hr
                </span>
              </div>
              <Input
                variant="antares"
                type="number"
                min="0"
                value={hourLimit}
                onChange={(e) => setHourLimit(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--t-ink)]">
                  {translate("Maximum requests per day")}
                </label>
                <span className="text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
                  req/day
                </span>
              </div>
              <Input
                variant="antares"
                type="number"
                min="0"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--t-ink)]">
                  {translate("Maximum requests per month")}
                </label>
                <span className="text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
                  req/mo
                </span>
              </div>
              <Input
                variant="antares"
                type="number"
                min="0"
                value={monthLimit}
                onChange={(e) => setMonthLimit(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="border-t border-[var(--t-line-soft)] pt-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--t-ink)]">
                {translate("Max concurrent requests")}
              </label>
              <span className="text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
                concurrent
              </span>
            </div>
            <Input
              variant="antares"
              type="number"
              min="0"
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(e.target.value)}
              placeholder={translate("0 = unlimited")}
            />
            <p className="text-[11px] text-[var(--t-muted)]">
              {translate("Maximum simultaneous requests allowed. 0 for unlimited.")}
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Token Quota & Spend */}
      {activeTab === "quota" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[var(--t-raised)]/60 border border-[var(--t-line-soft)] text-xs text-[var(--t-muted)]">
            <span className="material-symbols-outlined text-[18px] text-[var(--t-star-ink)] shrink-0 mt-0.5">pie_chart</span>
            <p className="leading-relaxed">
              {translate("Cap how many tokens this key may consume inside a rolling window. 0 = unlimited.")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--t-ink)]">{translate("Max tokens")}</label>
                {Number(tokenLimit) > 0 && (
                  <span className="text-[11px] font-mono text-[var(--t-star-ink)] font-medium">
                    {formatTokens(tokenLimit)} / {translate(tokenPeriodLabel(tokenWindow))}
                  </span>
                )}
              </div>
              <Input
                variant="antares"
                type="number"
                min="0"
                value={tokenLimit}
                onChange={(e) => setTokenLimit(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--t-ink)]">{translate("Window")}</label>
              <AntaresSelect
                value={tokenWindow}
                onChange={(e) => setTokenWindow(e.target.value)}
                ariaLabel={translate("Window")}
                buttonClassName="h-[42px] font-mono"
                options={Object.entries(TOKEN_WINDOWS).map(([value, meta]) => ({ value, label: translate(meta.label) }))}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--t-line-soft)] bg-[var(--t-field)] px-3 py-2.5 sm:col-span-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--t-ink)]">{translate("Reset token")}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--t-muted)]">
                  {translate("When on, the token quota resets each window. When off, the key has a fixed lifetime and expires when that window ends, even if tokens are left.")}
                </p>
              </div>
              <Toggle
                checked={tokenResetEnabled}
                onChange={setTokenResetEnabled}
                ariaLabel={translate("Reset token")}
              />
            </div>

            {!tokenResetEnabled && Number(tokenLimit) > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[var(--t-line-soft)] bg-[var(--t-raised)]/60 p-3 text-xs text-[var(--t-muted)] sm:col-span-2">
                <span className="material-symbols-outlined text-[18px] text-[var(--t-star-ink)] shrink-0 mt-0.5">event_busy</span>
                <p className="leading-relaxed">
                  {translate("With reset off, this key expires at the end of the {window} window.").replace("{window}", translate(tokenPeriodLabel(tokenWindow)))}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--t-ink)]">{translate("Max spend (USD)")}</label>
                <span className="text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
                  USD ($)
                </span>
              </div>
              <Input
                variant="antares"
                type="number"
                min="0"
                step="0.01"
                value={spendLimit}
                onChange={(e) => setSpendLimit(e.target.value)}
                placeholder={translate("0 = no cap")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--t-ink)]">{translate("Max tokens per minute")}</label>
                <span className="text-[10px] font-mono text-[var(--t-muted)] px-1.5 py-0.5 rounded bg-[var(--t-field)] border border-[var(--t-line-soft)]">
                  TPM
                </span>
              </div>
              <Input
                variant="antares"
                type="number"
                min="0"
                value={tokensPerMinute}
                onChange={(e) => setTokensPerMinute(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Access Rules, Expiry & Maintenance */}
      {activeTab === "access" && (
        <div className="flex flex-col gap-4">
          {/* Expiry section */}
          <div className="p-3.5 rounded-xl bg-[var(--t-field)] border border-[var(--t-line)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[var(--t-muted)]">schedule</span>
                <span className="text-xs font-medium text-[var(--t-ink)]">{translate("Expire after")}</span>
              </div>
              {Number(expiresAmount) > 0 && (
                <span className="text-[11px] font-mono text-[var(--t-star-ink)] font-medium">
                  {expiresAmount} {translate(EXPIRY_UNITS[expiresUnit].label)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
              <Input
                id="api-key-expiry-amount"
                variant="antares"
                type="number"
                min="0"
                value={expiresAmount}
                onChange={(e) => changeExpiry(e.target.value)}
                placeholder={translate("0 = never expires")}
                aria-label={translate("Expire after")}
              />
              <AntaresSelect
                id="api-key-expiry-unit"
                value={expiresUnit}
                onChange={(e) => changeExpiry(expiresAmount, e.target.value)}
                ariaLabel={translate("Unit")}
                buttonClassName="h-[42px] font-mono"
                options={Object.entries(EXPIRY_UNITS).map(([value, meta]) => ({ value, label: translate(meta.label) }))}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {[{ label: translate("Never (0)"), value: 0 }, ...EXPIRY_PRESETS[expiresUnit].map((n) => ({
                label: `${n} ${translate(EXPIRY_UNITS[expiresUnit].label)}`,
                value: n,
              }))].map((preset) => (
                <button
                  key={`${preset.value}-${expiresUnit}`}
                  type="button"
                  onClick={() => changeExpiry(preset.value)}
                  className={cn(
                    "text-[11px] font-mono py-1 px-2.5 rounded-md border transition-colors",
                    Number(expiresAmount) === preset.value
                      ? "bg-[var(--t-raised)] border-[var(--t-hover-line)] text-[var(--t-ink)] font-medium"
                      : "bg-transparent border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:border-[var(--t-hover-line)]"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[var(--t-muted)]">
              {translate("The countdown starts when you save. After expiry, the key is automatically disabled.")}
            </p>
          </div>

          {/* Maintenance mode section */}
          <div
            className={cn(
              "p-3.5 rounded-xl border transition-all flex flex-col gap-3",
              maintenance
                ? "bg-[var(--t-danger-soft)]/20 border-[var(--t-danger)]/40"
                : "bg-[var(--t-field)] border-[var(--t-line)]"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px]",
                      maintenance ? "text-[var(--t-danger)]" : "text-[var(--t-muted)]"
                    )}
                  >
                    construction
                  </span>
                  <p className="text-xs font-medium text-[var(--t-ink)]">{translate("Maintenance mode")}</p>
                </div>
                <p className="text-[11px] text-[var(--t-muted)] mt-1">
                  {translate("Reject requests using this key with your custom message.")}
                </p>
              </div>
              <Toggle checked={maintenance} onChange={setMaintenance} />
            </div>

            {maintenance && (
              <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--t-line-soft)] animate-fadeIn">
                <label className="text-xs font-medium text-[var(--t-ink)]">
                  {translate("Maintenance message")}
                </label>
                <Input
                  variant="antares"
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                  placeholder={translate("API is under maintenance, please try again later.")}
                />
                <div className="mt-1 p-2 rounded-lg bg-[var(--t-field)] border border-[var(--t-line)] text-[11px] font-mono text-[var(--t-muted)]">
                  <span className="text-[var(--t-danger)]">503 Service Unavailable:</span>{" "}
                  {maintenanceMessage || translate("API is under maintenance, please try again later.")}
                </div>
              </div>
            )}
          </div>

          {/* Change key section */}
          <div className="p-3.5 rounded-xl bg-[var(--t-field)] border border-[var(--t-line)] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px]",
                      changeKey ? "text-[var(--t-muted)]" : "text-[var(--t-star-ink)]"
                    )}
                  >
                    key
                  </span>
                  <p className="text-xs font-medium text-[var(--t-ink)]">{translate("Change key")}</p>
                </div>
                <p className="text-[11px] text-[var(--t-muted)] mt-1">
                  {translate("Allow the key owner to replace this key in Manage Keys.")}
                </p>
              </div>
              <Toggle checked={changeKey} onChange={setChangeKey} />
            </div>

            {!changeKey && (
              <p className="text-[11px] text-[var(--t-muted)] pt-2.5 border-t border-[var(--t-line-soft)] leading-relaxed">
                {translate("When off, the owner keeps using this key but cannot replace it. Only an admin can change it.")}
              </p>
            )}
          </div>

          {/* Manage IP section */}
          <div className="p-3.5 rounded-xl bg-[var(--t-field)] border border-[var(--t-line)] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px]",
                      manageIp ? "text-[var(--t-muted)]" : "text-[var(--t-star-ink)]"
                    )}
                  >
                    lan
                  </span>
                  <p className="text-xs font-medium text-[var(--t-ink)]">{translate("Manage IP")}</p>
                </div>
                <p className="text-[11px] text-[var(--t-muted)] mt-1">
                  {translate("Allow the key owner to block or unblock IP addresses from the key dashboard.")}
                </p>
              </div>
              <Toggle checked={manageIp} onChange={setManageIp} />
            </div>

            {!manageIp && (
              <p className="text-[11px] text-[var(--t-muted)] pt-2.5 border-t border-[var(--t-line-soft)] leading-relaxed">
                {translate("When off, the owner can still see the IP list but cannot change the blacklist. Only an admin can change it.")}
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
});

KeyConfigForm.propTypes = {
  apiKey: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  addNotification: PropTypes.func,
  onSavingChange: PropTypes.func,
};

export default function KeyConfigModal({ apiKey, onClose, onSaved, addNotification }) {
  const formRef = useRef(null);
  const [saving, setSaving] = useState(false);
  if (!apiKey) return null;

  const paused = apiKey.isActive === false || apiKey.disabled;

  return (
    <AntaresModal
      isOpen={!!apiKey}
      size="lg"
      className="!max-h-[78dvh] sm:!max-h-[86dvh]"
      hideScrollbar
      title={translate("API Key Configuration")}
      subtitle={
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--t-raised)] border border-[var(--t-line)] text-xs font-mono text-[var(--t-ink)]">
            <span className="material-symbols-outlined text-[13px] text-[var(--t-muted)]">key</span>
            {apiKey.name || "Default Key"}
          </span>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${paused ? "bg-[var(--t-danger-soft)] text-[var(--t-danger)]" : "bg-[var(--t-ok-soft)] text-[var(--t-ok)]"}`}>
            <span className="size-1.5 rounded-full bg-current" />
            {paused ? translate("Paused") : translate("Active")}
          </span>
        </div>
      }
      onClose={onClose}
      footer={
        <div className="flex w-full items-center gap-2">
          <Button skin="antares" variant="ghost" onClick={onClose} disabled={saving} fullWidth>
            {translate("Cancel")}
          </Button>
          <Button skin="antares" onClick={() => formRef.current?.save()} loading={saving} fullWidth>
            {translate("Save")}
          </Button>
        </div>
      }
    >
      <KeyConfigForm
        ref={formRef}
        key={apiKey.id}
        apiKey={apiKey}
        onClose={onClose}
        onSaved={onSaved}
        addNotification={addNotification}
        onSavingChange={setSaving}
      />
    </AntaresModal>
  );
}

KeyConfigModal.propTypes = {
  apiKey: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  addNotification: PropTypes.func,
};
