"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";
import { useNotificationStore } from "@/store/notificationStore";

function formatWindow(windowMinutes) {
  const mins = Number(windowMinutes) || 1;
  if (mins >= 60 && mins % 60 === 0) {
    const hrs = mins / 60;
    return `${hrs} ${hrs === 1 ? translate("hour") : translate("hours")}`;
  }
  return `${mins} ${mins === 1 ? translate("min") : translate("mins")}`;
}

export default function SessionRateLimitCard({
  providerId,
  providerNode,
  providerDisplayAlias = "",
  modelOptions = [],
  onNodeUpdated,
}) {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [rateLimits, setRateLimits] = useState(() => providerNode?.modelRateLimits || {});
  const [selectedModel, setSelectedModel] = useState("");
  const [maxRequests, setMaxRequests] = useState("10");
  const [windowValue, setWindowValue] = useState("1");
  const [windowUnit, setWindowUnit] = useState("minutes");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRateLimits(providerNode?.modelRateLimits || {});
  }, [providerNode?.modelRateLimits]);

  const handleSelectModel = (value) => {
    setSelectedModel(value);
    const existing = value ? rateLimits[value] : null;
    if (existing) {
      setMaxRequests(String(existing.maxRequests || 10));
      const mins = Number(existing.windowMinutes) || 1;
      if (mins >= 60 && mins % 60 === 0) {
        setWindowValue(String(mins / 60));
        setWindowUnit("hours");
      } else {
        setWindowValue(String(mins));
        setWindowUnit("minutes");
      }
    }
  };

  const persistLimits = async (nextLimits, successMsg) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/provider-nodes/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelRateLimits: nextLimits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || translate("Failed to save rate limit"));
      }
      setRateLimits(nextLimits);
      if (data.node && onNodeUpdated) {
        onNodeUpdated(data.node);
      }
      addNotification({
        type: "success",
        title: translate("Saved"),
        message: successMsg,
        duration: 2500,
      });
    } catch (err) {
      addNotification({
        type: "error",
        title: translate("Error"),
        message: err.message || translate("Failed to save rate limit"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRule = async () => {
    const modelKey = selectedModel.trim();
    if (!modelKey) {
      addNotification({
        type: "error",
        title: translate("Error"),
        message: translate("Please choose a target model first"),
      });
      return;
    }

    const parsedMax = parseInt(maxRequests, 10);
    const parsedWindow = parseInt(windowValue, 10);
    if (!Number.isFinite(parsedMax) || parsedMax <= 0) {
      addNotification({
        type: "error",
        title: translate("Error"),
        message: translate("Max requests must be greater than 0"),
      });
      return;
    }
    if (!Number.isFinite(parsedWindow) || parsedWindow <= 0) {
      addNotification({
        type: "error",
        title: translate("Error"),
        message: translate("Time window must be greater than 0"),
      });
      return;
    }

    const windowMinutes = windowUnit === "hours" ? parsedWindow * 60 : parsedWindow;
    const nextLimits = {
      ...rateLimits,
      [modelKey]: {
        maxRequests: parsedMax,
        windowMinutes,
      },
    };

    await persistLimits(nextLimits, translate("Session rate limit updated"));
  };

  const handleDeleteRule = async (modelKey) => {
    const nextLimits = { ...rateLimits };
    delete nextLimits[modelKey];
    await persistLimits(nextLimits, translate("Session rate limit removed"));
  };

  const entries = Object.entries(rateLimits);
  const prefixLabel = providerDisplayAlias ? `${providerDisplayAlias}/` : "";

  const formatModelDisplay = (modelKey) => {
    if (modelKey === "*") {
      return `${prefixLabel}* (${translate("All models")})`;
    }
    const found = modelOptions.find((m) => m.value === modelKey);
    if (found && found.label && found.label !== modelKey) {
      return `${prefixLabel}${modelKey} (${found.label})`;
    }
    return `${prefixLabel}${modelKey}`;
  };

  return (
    <div className="an-panel an-scope mb-3">
      <div className="an-panel-pad">
        {/* Header — matches SystemPromptCard */}
        <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined text-base">speed</span>
            </span>
            <div className="min-w-0">
              <span className="an-panel-title block">{translate("Session Rate Limit")}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">
                {translate("Cap requests per session for a specific model before hitting upstream")}
              </span>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
            {translate("PER-SESSION")}
          </span>
        </div>

        {/* Target model selector — matches SystemPromptCard */}
        <label
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted"
          htmlFor="session-rate-limit-model"
        >
          {translate("Target model")}
        </label>
        <div className="relative mb-3">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary">
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
          </span>
          <select
            id="session-rate-limit-model"
            value={selectedModel}
            onChange={(e) => handleSelectModel(e.target.value)}
            disabled={saving}
            className="an-select system-prompt-select h-11 w-full font-mono text-xs"
          >
            <option value="">{translate("Choose a model to configure")}</option>
            <option value="*">
              {prefixLabel}* — {translate("All models in this provider")}
            </option>
            {modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {prefixLabel}{opt.value}{opt.label && opt.label !== opt.value ? ` — ${opt.label}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Quota & Window controls */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label
              htmlFor="session-rate-limit-max"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-text-muted"
            >
              {translate("Max requests / session")}
            </label>
            <input
              id="session-rate-limit-max"
              type="number"
              min="1"
              value={maxRequests}
              onChange={(e) => setMaxRequests(e.target.value)}
              disabled={saving}
              placeholder="10"
              className="an-input h-9 w-full font-mono text-xs"
            />
          </div>

          <div className="sm:col-span-4">
            <label
              htmlFor="session-rate-limit-window"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-text-muted"
            >
              {translate("Time window")}
            </label>
            <input
              id="session-rate-limit-window"
              type="number"
              min="1"
              value={windowValue}
              onChange={(e) => setWindowValue(e.target.value)}
              disabled={saving}
              placeholder="1"
              className="an-input h-9 w-full font-mono text-xs"
            />
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="session-rate-limit-unit"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-text-muted"
            >
              {translate("Unit")}
            </label>
            <select
              id="session-rate-limit-unit"
              value={windowUnit}
              onChange={(e) => setWindowUnit(e.target.value)}
              disabled={saving}
              className="an-select h-9 w-full text-xs"
            >
              <option value="minutes">{translate("Minutes")}</option>
              <option value="hours">{translate("Hours")}</option>
            </select>
          </div>
        </div>

        {/* Action bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSaveRule}
            disabled={!selectedModel || saving}
            className="an-btn an-primary h-9 rounded-[10px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span
              className="material-symbols-outlined text-[16px]"
              style={saving ? { animation: "spin 1s linear infinite" } : undefined}
            >
              {saving ? "progress_activity" : rateLimits[selectedModel] ? "save" : "add"}
            </span>
            {saving
              ? translate("Saving...")
              : rateLimits[selectedModel]
                ? translate("Update limit")
                : translate("Save limit")}
          </button>

          <span className="text-[11px] text-text-muted">
            {selectedModel ? (
              <>
                <code className="font-mono text-primary">{formatModelDisplay(selectedModel)}</code>
                {" → "}
                <strong className="text-text-main">{maxRequests || 0}x</strong> /{" "}
                <strong className="text-text-main">
                  {windowValue || 1} {windowUnit === "hours" ? translate("hr") : translate("min")}
                </strong>
              </>
            ) : (
              translate("Select a model above to add or update its session limit")
            )}
          </span>
        </div>

        {/* Configured rules list */}
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              {translate("Active session rules")} ({entries.length})
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-[10px] border border-border/70 bg-bg px-3 py-2.5 text-xs text-text-muted">
              {translate("No session rate limits configured for this provider.")}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {entries.map(([modelKey, rule]) => (
                <div
                  key={modelKey}
                  onClick={() => handleSelectModel(modelKey)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-[10px] border px-3 py-2 transition-colors ${
                    selectedModel === modelKey
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/70 bg-bg hover:border-primary/40"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      {modelKey === "*" ? "all_inclusive" : "smart_toy"}
                    </span>
                    <code className="truncate font-mono text-xs text-text-main">
                      {formatModelDisplay(modelKey)}
                    </code>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                      {rule.maxRequests} req / {formatWindow(rule.windowMinutes)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRule(modelKey);
                      }}
                      disabled={saving}
                      title={translate("Remove limit")}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-surface text-text-muted transition-colors hover:border-red-500 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

SessionRateLimitCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  providerNode: PropTypes.object,
  providerDisplayAlias: PropTypes.string,
  modelOptions: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  onNodeUpdated: PropTypes.func,
};
