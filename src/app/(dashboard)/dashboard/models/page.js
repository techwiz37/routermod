"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CardSkeleton } from "@/shared/components";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import {
  getModelsByProviderId,
  PROVIDER_ID_TO_ALIAS,
  getModelKind,
} from "@/shared/constants/models";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getCurrentLocale, onLocaleChange, translate } from "@/i18n/runtime";

const LLM_KIND = "llm";

export default function ModelsPage() {
  const [providers, setProviders] = useState([]);
  const [disabled, setDisabled] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(new Set());
  const [testing, setTesting] = useState(new Set());
  const [testResults, setTestResults] = useState({});
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [modelNames, setModelNames] = useState({});
  const [, setLocaleVersion] = useState(0);

  useEffect(() => onLocaleChange(() => setLocaleVersion((value) => value + 1)), []);

  const localizedOptions = useMemo(() => ({
    cache: "no-store",
    headers: { "Accept-Language": getCurrentLocale(), "x-locale": getCurrentLocale() },
  }), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [providersRes, disabledRes, namesRes] = await Promise.all([
        fetch("/api/providers/client?pageSize=100", localizedOptions),
        fetch("/api/models/disabled", localizedOptions),
        fetch("/api/models/name", localizedOptions),
      ]);

      let providersData = [];
      if (providersRes.ok) {
        const j = await providersRes.json();
        providersData = j.connections || [];
      }

      let disabledData = {};
      if (disabledRes.ok) {
        disabledData = await disabledRes.json();
      }
      let namesData = {};
      if (namesRes.ok) namesData = await namesRes.json();

      setProviders(providersData);
      setDisabled(disabledData.disabled || disabledData || {});
      setModelNames(namesData.names || {});
    } catch (err) {
      setError(err.message || "Gagal memuat data models");
    } finally {
      setLoading(false);
    }
  }, [localizedOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isDisabled = (providerAlias, modelId) => {
    const arr = disabled[providerAlias];
    return Array.isArray(arr) && arr.includes(modelId);
  };

  const toggleModel = async (providerAlias, modelId, currentlyDisabled) => {
    setSaving((prev) => new Set([...prev, providerAlias + ":" + modelId]));
    try {
      if (currentlyDisabled) {
        await fetch(
          "/api/models/disabled?providerAlias=" + encodeURIComponent(providerAlias) + "&id=" + encodeURIComponent(modelId),
          { method: "DELETE", cache: "no-store" },
        );
        setDisabled((prev) => {
          const next = { ...prev };
          const arr = next[providerAlias];
          if (Array.isArray(arr)) {
            next[providerAlias] = arr.filter((id) => id !== modelId);
          }
          return next;
        });
      } else {
        await fetch("/api/models/disabled", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerAlias, ids: [modelId] }),
          cache: "no-store",
        });
        setDisabled((prev) => {
          const next = { ...prev };
          if (!Array.isArray(next[providerAlias])) next[providerAlias] = [];
          if (!next[providerAlias].includes(modelId)) {
            next[providerAlias] = [...next[providerAlias], modelId];
          }
          return next;
        });
      }
    } catch (err) {
      setError(err.message || "Gagal mengubah status model");
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(providerAlias + ":" + modelId);
        return next;
      });
    }
  };

  const testModel = async (modelId, providerAlias, kind) => {
    const fullModel = providerAlias + "/" + modelId;
    setTesting((prev) => new Set([...prev, fullModel]));
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: fullModel, kind: kind || "llm" }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [fullModel]: data.ok
          ? { ok: true, latency: data.latencyMs || data.latency || 0 }
          : { ok: false, error: data.error || "Gagal merespon" },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [fullModel]: { ok: false, error: err.message || "Network error" },
      }));
    } finally {
      setTesting((prev) => {
        const next = new Set(prev);
        next.delete(fullModel);
        return next;
      });
    }
  };

  const getProviderModels = (providerId) => {
    const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
    const models = getModelsByProviderId(alias) || [];
    return models.filter((m) => getModelKind(m) === LLM_KIND || !m.kind);
  };

  const providerDisplayName = (providerId) => {
    const p = AI_PROVIDERS[providerId];
    return p ? p.name || providerId : providerId;
  };

  const displayModelName = (alias, model) => modelNames[`${alias}/${model.id}`] || model.name || model.id;

  // Group providers
  const providerMap = new Map();
  for (const conn of providers) {
    const pid = conn.provider;
    if (!providerMap.has(pid)) {
      providerMap.set(pid, {
        id: pid,
        name: providerDisplayName(pid),
        alias: PROVIDER_ID_TO_ALIAS[pid] || pid,
        connections: [],
      });
    }
    providerMap.get(pid).connections.push(conn);
  }

  const filteredProviders = filter
    ? [...providerMap.entries()].filter(([pid, info]) =>
        info.name.toLowerCase().includes(filter.toLowerCase()) ||
        pid.toLowerCase().includes(filter.toLowerCase()) ||
        getProviderModels(pid).some((model) =>
          `${displayModelName(info.alias, model)} ${model.id}`.toLowerCase().includes(filter.toLowerCase())
        ),
      )
    : [...providerMap.entries()];

  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">
      {/* Header */}
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">model_training</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Model Control Center")}</h2>
            <p className="an-panel-sub">
              {translate("Manage provider models and control which models are exposed through the API.")}
            </p>
          </div>
          <div className="an-panel-actions">
            {error && (
              <span className="an-chip danger">
                <span className="size-1.5 rounded-full bg-[var(--t-danger)] shrink-0" />
                <span className="truncate max-w-[220px]">{error}</span>
              </span>
            )}
          </div>
        </header>

        <div className="an-panel-pad">
          <div className="an-toolbar">
            <div className="an-search">
              <span className="material-symbols-outlined">search</span>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={translate("Search providers or models...")}
                className="an-input"
                aria-label={translate("Search providers or models")}
              />
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="an-btn an-ghost h-[38px] px-3 text-[11px] gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              {translate("Refresh")}
            </button>
          </div>
        </div>
      </section>

      {/* Provider cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredProviders.map(([providerId, info]) => {
          const models = getProviderModels(providerId);
          const isProviderActive = info.connections.some((c) => c.isActive !== false);

          return (
            <section
              key={providerId}
              className="an-panel flex min-w-0 flex-col overflow-hidden border border-[var(--t-line)] bg-[radial-gradient(circle_at_top_right,rgba(232,0,31,0.08),transparent_42%),var(--t-panel)] shadow-[0_16px_44px_rgba(0,0,0,0.12)]"
            >
              {/* Card header */}
              <div className="an-conn-head border-b border-[var(--t-line-soft)]">
                <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-full sm:basis-auto">
                  <div className="an-conn-ico !size-8 !w-8 !h-8 !rounded-[9px]">
                    <ProviderIcon
                      src={"/providers/" + providerId + ".png"}
                      alt={providerId}
                      size={32}
                      className="object-contain rounded-lg"
                      fallbackText={providerId.slice(0, 2).toUpperCase()}
                      fallbackColor="#6B7280"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="an-conn-name">{info.name}</h3>
                     <p className="an-conn-sub">
                       {info.alias} · {info.connections.length} {translate("connections")}
                    </p>
                  </div>
                </div>
                <span className={`an-chip ${isProviderActive ? "ok" : ""} shrink-0 ml-auto`}>
                   {isProviderActive ? translate("Active") : translate("Inactive")}
                </span>
              </div>

              {/* Model list */}
              {models.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[var(--t-muted)]">
                  <span className="material-symbols-outlined text-[40px] opacity-20 mb-2">
                    device_unknown
                  </span>
                   <p className="text-sm">{translate("No static models")}</p>
                </div>
              ) : (
               <div className="an-conn-list !gap-0 flex-1 min-h-[200px] max-h-[420px] overflow-y-auto">
                  {models.map((model) => {
                    const modelId = model.id;
                    const isDisabledModel = isDisabled(info.alias, modelId);
                    const kind = getModelKind(model);
                    const isSaving = saving.has(info.alias + ":" + modelId);
                    const fullModel = info.alias + "/" + modelId;
                    const isTesting = testing.has(fullModel);
                    const testResult = testResults[fullModel];

                    return (
                      <div
                        key={modelId}
                        className={"an-conn-row flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors hover:bg-white/[0.015] " + (isDisabledModel ? "opacity-50" : "")}
                      >
                        {/* Kind icon */}
                        <div className="an-conn-ico !size-7 !w-7 !h-7 !rounded-[7px] !text-[11px]">
                          {kind === "image" ? "image" : kind === "tts" ? "tts" : "llm"}
                        </div>

                        {/* Model info */}
                        <div className="flex-1 min-w-0 basis-full sm:basis-auto">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-[var(--t-ink)] truncate">
                               {displayModelName(info.alias, model)}
                            </span>
                            {isDisabledModel && (
                              <span className="an-chip !h-auto !px-1.5 !py-0.5 !text-[9px] danger shrink-0">
                                 {translate("Disabled")}
                              </span>
                            )}
                            {testResult && (
                              <span
                                className={"an-chip !h-auto !px-1.5 !py-0.5 !text-[9px] shrink-0 " + (testResult.ok ? "ok" : "danger")}
                              >
                                 {testResult.ok ? "OK " + testResult.latency + "ms" : translate("Failed")}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-[var(--t-dim)] truncate">
                            {modelId}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                          <button
                            type="button"
                            onClick={() => testModel(modelId, info.alias, kind)}
                            disabled={isTesting || isDisabledModel || !isProviderActive}
                            title="Test model"
                            aria-label={`${translate("Test")} ${displayModelName(info.alias, model)}`}
                            className="an-conn-btn disabled:opacity-40"
                          >
                            <span className="material-symbols-outlined">
                              {isTesting ? "progress_activity" : "bolt"}
                            </span>
                          </button>
                          <AntaresSwitch
                            on={!isDisabledModel}
                            onChange={() => toggleModel(info.alias, modelId, isDisabledModel)}
                            disabled={isSaving || !isProviderActive}
                             label={isDisabledModel ? translate("Off") : translate("On")}
                             title={isDisabledModel ? translate("Enable model") : translate("Disable model")}
                             ariaLabel={`${translate("Toggle")} ${displayModelName(info.alias, model)}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isProviderActive && (
                <div className="px-4 py-3 bg-[var(--t-raised)] border-t border-[var(--t-line-soft)]">
                  <p className="text-xs text-[var(--t-muted)]">
                     {translate("No active connection for this provider. Models will remain unavailable in the API until a connection is active.")}
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {filteredProviders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <span className="material-symbols-outlined text-[64px] opacity-20 mb-3">
            search_off
          </span>
           <p className="text-sm font-medium">{translate("No matching providers")}</p>
           <p className="text-xs mt-1">{translate("Try changing your search")}</p>
        </div>
      )}
    </div>
  );
}
