"use client";

import { useState, useEffect } from "react";
import { usePageReady } from "@/shared/components/PageReadyContext";
import { useNotificationStore } from "@/store/notificationStore";
import AntaresSegmented from "@/shared/components/AntaresSegmented";
import AntaresStat from "@/shared/components/AntaresStat";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import StarField from "@/shared/components/StarField";
import { translate } from "@/i18n/runtime";

const DEFAULT_CONFIG = {
  enabled: false,
  failureThreshold: 4,
  timeWindowValue: 1,
  timeWindowUnit: "hours",
  timeWindowHours: 1,
  telegramBotToken: "",
  telegramChatId: "",
  whatsappRecipient: "",
  kiroFarmProxy: true,
  kiroFarmHuman: true,
};

/** Bounds and compact labels for the time-window unit selector. */
const WINDOW_UNITS = {
  minutes: { min: 1, max: 1440, short: "min", label: "minute(s)" },
  hours: { min: 1, max: 168, short: "h", label: "hour(s)" },
  days: { min: 1, max: 30, short: "d", label: "day(s)" },
};

function getWindowUnit(key) {
  return WINDOW_UNITS[key] ? key : "hours";
}

function windowLabel(key) {
  return WINDOW_UNITS[getWindowUnit(key)].label;
}

/** Parse a numeric input, allowing an empty draft while editing. */
function clampInt(raw, min, max) {
  if (raw === "" || raw === null || raw === undefined) return NaN;
  const value = parseInt(raw, 10);
  if (!Number.isFinite(value)) return NaN;
  return Math.min(max, Math.max(min, value));
}

function displayInt(value) {
  return value === "" || value === null || value === undefined ? "—" : value;
}

function Field({ id, label, icon, hint, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="an-label">{label}</label>
      <div className="an-field">
        <span className="fi" aria-hidden="true">
          <span className="material-symbols-outlined">{icon}</span>
        </span>
        {children}
      </div>
      {hint && <p className="lf-card-desc mt-2">{hint}</p>}
    </div>
  );
}

function CardHead({ icon, title, description, action }) {
  return (
    <div className="an-card-head automate-heading">
      <div className="flex items-center gap-3 min-w-0">
        <span className="an-ic" aria-hidden="true">
          <span className="material-symbols-outlined">{icon}</span>
        </span>
        <div className="min-w-0">
          <h2 className="an-card-title">{title}</h2>
          {description && <p className="lf-card-desc mt-1">{description}</p>}
        </div>
      </div>
      {action && <div className="an-panel-actions shrink-0">{action}</div>}
    </div>
  );
}

export default function AutomatePage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [activeTab, setActiveTab] = useState("config");
  const [waState, setWaState] = useState("loading");
  const [botNumber, setBotNumber] = useState("");
  const [pairing, setPairing] = useState(null);
  const [freshPairing, setFreshPairing] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const addNotification = useNotificationStore((state) => state.addNotification);
  const notify = (type, message) => addNotification({ type, message: translate(message || "") });

  usePageReady(loading);

  useEffect(() => {
    loadConfig();
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const response = await fetch("/api/automate/whatsapp", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const { state } = await response.json();
        if (controller.signal.aborted) return;
        setWaState(state);
        if (state === "connected") setPairing(null);
      } catch {
        if (!controller.signal.aborted) setWaState("unavailable");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => { controller.abort(); clearTimeout(timer); setWaState("loading"); };
  }, [activeTab]);

  useEffect(() => {
    if (!pairing) return;
    const timer = setTimeout(() => setPairing(null), Math.max(0, pairing.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pairing]);

  const handlePair = async (event, fresh = false) => {
    event.preventDefault();
    setPairingError("");
    setPairingBusy(true);
    try {
      const response = await fetch("/api/automate/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: botNumber, fresh }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || translate("Could not request a pairing code"));
      setPairing(data);
    } catch (error) {
      setPairingError(error.message);
    } finally {
      setPairingBusy(false);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/automate/config");
      if (!res.ok) {
        setConfig(DEFAULT_CONFIG);
        return;
      }
      const data = await res.json();
      setConfig({ ...DEFAULT_CONFIG, ...(data || {}) });
    } catch (error) {
      console.error("Failed to load config:", error);
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch("/api/automate/stats?hours=24");
      if (!res.ok) return;
      const data = await res.json();
      setStats(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load stats:", error);
      setStats([]);
    }
  };

  const handleSave = async () => {
    const failureThreshold = clampInt(config.failureThreshold, 1, 20);
    const timeWindowUnit = getWindowUnit(config.timeWindowUnit);
    const limits = WINDOW_UNITS[timeWindowUnit];
    const timeWindowValue = clampInt(config.timeWindowValue, limits.min, limits.max);
    if (!Number.isFinite(failureThreshold) || !Number.isFinite(timeWindowValue)) {
      notify("warning", "Failure threshold and time window are required");
      return;
    }
    const payload = { ...config, failureThreshold, timeWindowValue, timeWindowUnit };
    setSaving(true);
    try {
      const res = await fetch("/api/automate/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig((current) => current.whatsappRecipient === payload.whatsappRecipient
          ? { ...current, failureThreshold, timeWindowValue, timeWindowUnit, whatsappRecipient: data.whatsappRecipient }
          : { ...current, failureThreshold, timeWindowValue, timeWindowUnit });
        notify("success", "Configuration saved successfully");
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || translate("Failed to save"));
      }
    } catch (error) {
      notify("error", error.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const changeWindowUnit = (nextUnit) => {
    const unit = getWindowUnit(nextUnit);
    const limits = WINDOW_UNITS[unit];
    const current = parseInt(config.timeWindowValue, 10);
    const value = Number.isFinite(current)
      ? Math.min(limits.max, Math.max(limits.min, current))
      : limits.min;
    setConfig({ ...config, timeWindowUnit: unit, timeWindowValue: value });
  };

  const handleTestTelegram = async () => {
    if (!config.telegramBotToken || !config.telegramChatId) {
      notify("warning", "Bot token and chat ID are required");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/automate/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: config.telegramBotToken, chatId: config.telegramChatId }),
      });
      const data = await res.json();
      if (res.ok) notify("success", "Test message sent to Telegram");
      else notify("error", data.error || "Failed to send test message");
    } catch (error) {
      notify("error", error.message || "Failed to send test message");
    } finally {
      setTesting(false);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!config.whatsappRecipient) {
      notify("warning", "WhatsApp recipient is required");
      return;
    }
    setTestingWa(true);
    try {
      const res = await fetch("/api/automate/test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: config.whatsappRecipient }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.delivered) notify("success", "Test message delivered on WhatsApp");
        else notify("warning", data.error || "Test message queued for WhatsApp");
      } else notify("error", data.error || "Failed to queue test message");
    } catch (error) {
      notify("error", error.message || "Failed to queue test message");
    } finally {
      setTestingWa(false);
    }
  };

  if (loading) {
    return (
      <div className="an-scope an-shell automate-page flex min-w-0 flex-col gap-5">
        <div className="an-shell-bg" aria-hidden>
          <StarField />
        </div>
        <section className="an-card lf-card">
          <div className="lf-card-body items-center justify-center py-14">
            <span className="material-symbols-outlined lf-spin text-[var(--t-accent)] text-[28px]">autorenew</span>
            <p className="lf-card-desc">{translate("Loading configuration…")}</p>
          </div>
        </section>
      </div>
    );
  }

  const tabs = [
    { value: "config", label: translate("Configuration"), icon: "tune" },
    { value: "notifications", label: translate("Notifications"), icon: "notifications" },
    { value: "stats", label: translate("Statistics"), icon: "bar_chart" },
  ];

  const waStatusText = translate({
    loading: "Checking WhatsApp connection…",
    unavailable: "WhatsApp bot service unavailable. Checking again automatically.",
    reconnecting: "Reconnecting the existing WhatsApp session…",
    disconnected: "WhatsApp bot not connected",
    connected: "WhatsApp bot connected",
  }[waState] || "Checking WhatsApp connection…");

  return (
    <div className="an-scope an-shell automate-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="flex min-w-0 flex-col gap-2">
        <p className="an-eyebrow">
          <span className="an-num">07</span>
          <span className="an-rule" />
          <span>{translate("RouterMod · AI Gateway")}</span>
        </p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
          {translate("Automate")}{" "}
          <span className="an-dim">&amp;</span>{" "}
          {translate("Notifications")}
        </h1>
        <p className="an-hint max-w-[70ch]">
          {translate("Auto-disable failing models and send real-time notifications")}
        </p>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid automate-stats gap-2.5 sm:gap-3">
        <div className="an-stat">
          <div className="flex items-center justify-between gap-2">
            <span className="an-stat-label truncate">{translate("Automation")}</span>
            <AntaresSwitch
              on={!!config.enabled}
              onChange={(next) => setConfig({ ...config, enabled: next })}
              ariaLabel={translate("Enable auto-disable")}
            />
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              className="an-stat-value truncate"
              style={{ color: config.enabled ? "var(--t-ok)" : "var(--t-muted)" }}
            >
              {config.enabled ? translate("Active") : translate("Inactive")}
            </span>
          </div>
          <div className="an-stat-foot">{translate("Auto-disable failing models")}</div>
        </div>

        <AntaresStat
          label={translate("Failure Threshold")}
          icon="error"
          tone="warn"
          value={displayInt(config.failureThreshold)}
          unit="x"
          foot={translate("Number of failures before auto-disabling a model")}
        />

        <AntaresStat
          label={translate("Time Window")}
          icon="schedule"
          tone="default"
          value={displayInt(config.timeWindowValue)}
          unit={WINDOW_UNITS[getWindowUnit(config.timeWindowUnit)].short}
          foot={translate("Time window for counting failures")}
        />

        <AntaresStat
          label={translate("Kiro proxy")}
          icon="public"
          tone="violet"
          value={config.kiroFarmProxy !== false ? translate("Proxy") : translate("Direct")}
          foot={translate("proxies.txt then WARP, otherwise direct connection")}
        />
      </div>

      <AntaresSegmented
        className="automate-tabs"
        options={tabs}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "config" && (
        <section className="an-card lf-card sk-anim">
          <CardHead
            icon="tune"
            title={translate("Failure control")}
            description={translate("Choose when a model is automatically disabled")}
          />
          <div className="lf-card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field
                id="automate-threshold"
                label={translate("Failure Threshold")}
                icon="error_outline"
                hint={translate("Number of failures before auto-disabling a model")}
              >
                <input
                  id="automate-threshold"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="20"
                  value={config.failureThreshold}
                  onChange={(e) => setConfig({ ...config, failureThreshold: e.target.value })}
                  className="an-input"
                />
              </Field>
              <Field
                id="automate-window"
                label={translate("Time Window")}
                icon="schedule"
                hint={translate("Time window for counting failures")}
              >
                <input
                  id="automate-window"
                  type="number"
                  inputMode="numeric"
                  min={WINDOW_UNITS[getWindowUnit(config.timeWindowUnit)].min}
                  max={WINDOW_UNITS[getWindowUnit(config.timeWindowUnit)].max}
                  value={config.timeWindowValue}
                  onChange={(e) => setConfig({ ...config, timeWindowValue: e.target.value })}
                  className="an-input an-window-value"
                />
                <select
                  aria-label={translate("Time window unit")}
                  value={getWindowUnit(config.timeWindowUnit)}
                  onChange={(e) => changeWindowUnit(e.target.value)}
                  className="an-select an-window-unit"
                >
                  <option value="minutes">{translate("Minutes")}</option>
                  <option value="hours">{translate("Hours")}</option>
                  <option value="days">{translate("Days")}</option>
                </select>
              </Field>
            </div>
            <div className="an-msg ok">
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">info</span>
              <span>
                {translate("Models will be automatically disabled after")}{" "}
                <strong>{displayInt(config.failureThreshold)}x</strong>{" "}
                {translate("failures within")}{" "}
                <strong>
                  {displayInt(config.timeWindowValue)} {translate(windowLabel(config.timeWindowUnit))}
                </strong>.
              </span>
            </div>
          </div>
        </section>
      )}

      {activeTab === "config" && (
        <section className="an-card lf-card sk-anim">
          <CardHead
            icon="sports_esports"
            title={translate("Kiro Farming")}
            description={translate("Options passed to the auto-registration script when a Kiro account is suspended or out of quota")}
          />
          <div className="lf-card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--t-line)] bg-[var(--t-raised)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--t-ink)]">{translate("Use proxy")}</p>
                  <p className="lf-card-desc">{translate("proxies.txt then WARP, otherwise direct connection")}</p>
                </div>
                <AntaresSwitch
                  on={config.kiroFarmProxy !== false}
                  onChange={(next) => setConfig({ ...config, kiroFarmProxy: next })}
                  ariaLabel={translate("Kiro farming proxy")}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--t-line)] bg-[var(--t-raised)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--t-ink)]">{translate("Human-like mode")}</p>
                  <p className="lf-card-desc">{translate("Slow keyboard typing, better captcha pass rate")}</p>
                </div>
                <AntaresSwitch
                  on={config.kiroFarmHuman !== false}
                  onChange={(next) => setConfig({ ...config, kiroFarmHuman: next })}
                  ariaLabel={translate("Kiro farming human mode")}
                />
              </div>
            </div>
            <div className="an-msg ok">
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">info</span>
              <span>
                {translate("Applies to")}{" "}
                <code className="font-mono">/root/reg/krg.js</code>{" "}
                {translate("on the next auto-registration trigger. No restart needed.")}
              </span>
            </div>
          </div>
        </section>
      )}

      {activeTab === "notifications" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="an-card lf-card sk-anim">
            <CardHead
              icon="send"
              title={translate("Telegram Notifications")}
              description={translate("Send alerts via Telegram bot")}
            />
            <div className="lf-card-body">
              <form className="lf-form" onSubmit={(event) => event.preventDefault()}>
                <Field
                  id="automate-telegram-token"
                  label={translate("Bot Token")}
                  icon="key"
                  hint={translate("Get from @BotFather on Telegram")}
                >
                  <input
                    id="automate-telegram-token"
                    type="password"
                    value={config.telegramBotToken}
                    onChange={(e) => setConfig({ ...config, telegramBotToken: e.target.value })}
                    placeholder="123456:ABC-DEF1234..."
                    className="an-input mono"
                  />
                </Field>
                <Field
                  id="automate-telegram-chat"
                  label={translate("Chat ID / Username")}
                  icon="alternate_email"
                  hint={translate("Numeric ID or @username for channel/group")}
                >
                  <input
                    id="automate-telegram-chat"
                    type="text"
                    value={config.telegramChatId}
                    onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                    placeholder="@username or 123456789"
                    className="an-input mono"
                  />
                </Field>
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testing || !config.telegramBotToken || !config.telegramChatId}
                  className="an-btn an-primary an-full lf-submit-btn"
                >
                  {testing && <span className="material-symbols-outlined lf-spin">autorenew</span>}
                  {testing ? translate("Sending...") : translate("Send Test Message")}
                </button>
              </form>
            </div>
          </section>

          <section className="an-card lf-card sk-anim">
            <CardHead
              icon="chat"
              title={translate("WhatsApp Notifications")}
              description={translate("Send alerts via this project's WhatsApp bot")}
            />
            <div className="lf-card-body">
              <p role="status" className="lf-card-desc">{waStatusText}</p>

              {(waState !== "connected" && waState !== "loading" || freshPairing) && (
                <form onSubmit={(event) => handlePair(event, freshPairing || waState !== "disconnected")} className="lf-form">
                  <Field
                    id="automate-wa-bot"
                    label={translate("Bot phone number")}
                    icon="phone_iphone"
                    hint={translate("This project creates and stores its own WhatsApp session. The number you enter is the account that will send alerts.")}
                  >
                    <input
                      id="automate-wa-bot"
                      type="tel"
                      autoComplete="off"
                      required
                      maxLength={32}
                      value={botNumber}
                      onChange={(event) => setBotNumber(event.target.value)}
                      disabled={pairingBusy || !!pairing}
                      placeholder="+62 …"
                      className="an-input mono"
                    />
                  </Field>
                  {!pairing && (
                    <button type="submit" disabled={pairingBusy || !botNumber.trim()} className="an-btn an-primary an-full lf-submit-btn">
                      {pairingBusy && <span className="material-symbols-outlined lf-spin">autorenew</span>}
                      {translate(pairingBusy ? "Requesting code…" : freshPairing || waState !== "disconnected" ? "Reset session and request pairing code" : "Request pairing code")}
                    </button>
                  )}
                  {freshPairing && waState === "connected" && !pairing && (
                    <button type="button" onClick={() => setFreshPairing(false)} className="an-btn an-ghost an-full lf-submit-btn">
                      {translate("Cancel")}
                    </button>
                  )}
                  {pairingError && (
                    <div className="an-msg err" role="alert">
                      <span className="material-symbols-outlined text-[15px]" aria-hidden="true">error</span>
                      <span>{pairingError}</span>
                    </div>
                  )}
                  {pairing && (
                    <div className="an-cmd" role="status">
                      <span className="k">{translate("Pairing code")}</span>
                      <code className="select-all text-base font-semibold tracking-wider">{pairing.code}</code>
                    </div>
                  )}
                  {pairing && (
                    <p className="lf-card-desc">
                      {translate("On the bot’s phone, open WhatsApp → Linked devices → Link a device → Link with phone number instead. Do not share this code.")}
                    </p>
                  )}
                </form>
              )}

              {waState === "connected" && !freshPairing && (
                <form className="lf-form" onSubmit={(event) => event.preventDefault()}>
                  <Field
                    id="automate-wa-target"
                    label={translate("Recipient number or group invite link")}
                    icon="group"
                    hint={translate("Save a group invite first so the bot can join. A group admin may need to approve the request.")}
                  >
                    <input
                      id="automate-wa-target"
                      type="text"
                      autoComplete="off"
                      maxLength={256}
                      value={config.whatsappRecipient.replace(/@s\.whatsapp\.net$/, "")}
                      onChange={(event) => setConfig({ ...config, whatsappRecipient: event.target.value })}
                      placeholder="+62 … / https://chat.whatsapp.com/…"
                      className="an-input mono"
                    />
                  </Field>
                  <Field
                    id="automate-wa-admins"
                    label={translate("Admin numbers for .keys")}
                    icon="admin_panel_settings"
                    hint={translate("Comma separated. Only these numbers may use .keys in private chat; group admins always can.")}
                  >
                    <input
                      id="automate-wa-admins"
                      type="text"
                      autoComplete="off"
                      maxLength={512}
                      value={config.whatsappAdminNumbers || ""}
                      onChange={(event) => setConfig({ ...config, whatsappAdminNumbers: event.target.value })}
                      placeholder="628123456789, 628987654321"
                      className="an-input mono"
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={handleTestWhatsApp}
                    disabled={testingWa || saving || !config.whatsappRecipient || /^https?:/i.test(config.whatsappRecipient.trim())}
                    className="an-btn an-primary an-full lf-submit-btn"
                  >
                    {testingWa && <span className="material-symbols-outlined lf-spin">autorenew</span>}
                    {translate(testingWa ? "Queuing..." : "Queue Test Message")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPairingError(""); setPairing(null); setFreshPairing(true); }}
                    className="an-btn an-ghost an-full lf-submit-btn"
                  >
                    {translate("Use a different number")}
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "stats" && (
        <section className="an-card lf-card sk-anim">
          <CardHead
            icon="bar_chart"
            title={translate("Failure Statistics")}
            description={translate("Model failures in the last 24 hours")}
            action={
              <button type="button" onClick={loadStats} className="an-btn an-ghost h-9 px-3 text-[11px] gap-1.5">
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">refresh</span>
                {translate("Refresh")}
              </button>
            }
          />
          {stats.length === 0 ? (
            <div className="lf-card-body items-center justify-center py-14 text-center">
              <span className="material-symbols-outlined text-[40px] opacity-25 mb-2" aria-hidden="true">check_circle</span>
              <p className="text-sm text-[var(--t-ink)]">{translate("No failures in the last 24 hours")}</p>
              <p className="lf-card-desc">{translate("All models are operating normally")}</p>
            </div>
          ) : (
            <div className="automate-failures-scroll custom-scrollbar">
              <div className="hidden sm:grid sticky top-0 z-10 grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_68px] items-center gap-x-4 px-5 py-3 border-b border-[var(--t-line)] bg-[var(--t-raised)]">
                <span className="an-label">{translate("Provider")}</span>
                <span className="an-label">{translate("Model")}</span>
                <span className="an-label text-right">{translate("Failures")}</span>
              </div>
              <ul>
                {stats.map((stat, idx) => (
                  <li
                    key={`${stat.provider}-${stat.model}-${idx}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 border-b border-[var(--t-line)] last:border-b-0 hover:bg-white/[0.02] transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_68px] sm:gap-x-4 sm:px-5"
                  >
                    <div className="min-w-0 flex items-center gap-2 sm:col-start-1 sm:row-start-1">
                      <span className="text-sm font-medium text-[var(--t-ink)] truncate" title={stat.providerName || stat.provider}>
                        {stat.providerName || stat.provider}
                      </span>
                      {stat.providerPrefix && stat.providerPrefix.toLowerCase() !== String(stat.providerName || "").toLowerCase() ? (
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--t-dim)]">
                          {stat.providerPrefix}
                        </span>
                      ) : null}
                    </div>
                    <span className="justify-self-end inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 font-bold text-xs sm:col-start-3 sm:row-start-1">
                      <span className="size-1.5 rounded-full bg-red-400" />
                      {stat.count}
                    </span>
                    <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                      <span className="block truncate font-mono text-[11px] text-[var(--t-muted)] sm:text-xs" title={stat.model}>
                        {stat.model}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="automate-actions flex flex-col sm:flex-row justify-end gap-3">
        <button
          type="button"
          onClick={loadConfig}
          disabled={saving}
          className="an-btn an-ghost min-h-11 px-5 text-xs gap-2"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">restart_alt</span>
          {translate("Reset")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="an-btn an-primary an-full sm:w-auto min-h-11 px-6 text-xs gap-2 lf-submit-btn"
        >
          {saving && <span className="material-symbols-outlined lf-spin">autorenew</span>}
          {saving ? translate("Saving...") : translate("Save Configuration")}
        </button>
      </div>
    </div>
  );
}
