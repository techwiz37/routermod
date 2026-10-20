"use client";

import { useState, useEffect, useCallback } from "react";
import { CardSkeleton } from "@/shared/components";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import {
  getModelsByProviderId,
  PROVIDER_ID_TO_ALIAS,
  getModelKind,
} from "@/shared/constants/models";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import ProviderIcon from "@/shared/components/ProviderIcon";

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [providersRes, disabledRes] = await Promise.all([
        fetch("/api/providers/client?pageSize=100", { cache: "no-store" }),
        fetch("/api/models/disabled", { cache: "no-store" }),
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

      setProviders(providersData);
      setDisabled(disabledData.disabled || disabledData || {});
    } catch (err) {
      setError(err.message || "Gagal memuat data models");
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <CardSkeleton />
      </div>
    );
  }

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
        pid.toLowerCase().includes(filter.toLowerCase()),
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
            <h2 className="an-panel-title">Models</h2>
            <p className="an-panel-sub">
              Kelola model yang tersedia per provider. Model yang dimatikan tidak
              akan muncul di daftar model API.
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
                placeholder="Cari provider atau model..."
                className="an-input"
                aria-label="Cari provider atau model"
              />
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="an-btn an-ghost h-[38px] px-3 text-[11px] gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Refresh
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
              className="an-panel flex flex-col min-w-0 overflow-hidden"
            >
              {/* Card header */}
              <div className="an-conn-head">
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
                      {info.alias} - {info.connections.length} koneksi
                    </p>
                  </div>
                </div>
                <span className={`an-chip ${isProviderActive ? "ok" : ""} shrink-0 ml-auto`}>
                  {isProviderActive ? "Aktif" : "Tidak Aktif"}
                </span>
              </div>

              {/* Model list */}
              {models.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[var(--t-muted)]">
                  <span className="material-symbols-outlined text-[40px] opacity-20 mb-2">
                    device_unknown
                  </span>
                  <p className="text-sm">Tidak ada model statis</p>
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
                              {model.name || modelId}
                            </span>
                            {isDisabledModel && (
                              <span className="an-chip !h-auto !px-1.5 !py-0.5 !text-[9px] danger shrink-0">
                                Dimatikan
                              </span>
                            )}
                            {testResult && (
                              <span
                                className={"an-chip !h-auto !px-1.5 !py-0.5 !text-[9px] shrink-0 " + (testResult.ok ? "ok" : "danger")}
                              >
                                {testResult.ok ? "OK " + testResult.latency + "ms" : "Gagal"}
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
                            aria-label={`Test ${model.name || modelId}`}
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
                            label={isDisabledModel ? "Off" : "On"}
                            title={isDisabledModel ? "Aktifkan model" : "Matikan model"}
                            ariaLabel={`Toggle ${model.name || modelId}`}
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
                    Tidak ada koneksi aktif untuk provider ini. Model tidak akan tersedia di API sampai ada koneksi aktif.
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
          <p className="text-sm font-medium">Tidak ada provider yang cocok</p>
          <p className="text-xs mt-1">Coba ubah kata kunci pencarian</p>
        </div>
      )}
    </div>
  );
}
