"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardSkeleton,
  Badge,
  Button,
  Toggle,
  Input,
} from "@/shared/components";
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
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-text-main">Models</h1>
          <p className="text-[11px] text-text-muted">
            Kelola model yang tersedia per provider. Model yang dimatikan tidak akan muncul di daftar model API.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="material-symbols-outlined text-red-500 text-sm">error</span>
            <span className="text-xs text-red-500">{error}</span>
          </div>
        )}
      </div>

      {/* Search filter */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Cari provider atau model..."
            className="w-full text-xs"
          />
        </div>
        <Button variant="secondary" icon="refresh" onClick={fetchData} size="sm">
          Refresh
        </Button>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredProviders.map(([providerId, info]) => {
          const models = getProviderModels(providerId);
          const isProviderActive = info.connections.some((c) => c.isActive !== false);

          return (
            <Card
              key={providerId}
              padding="none"
              className="flex flex-col min-w-0 overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05] bg-surface-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-8 rounded-lg flex items-center justify-center p-1 bg-black/[0.03] dark:bg-white/[0.03]">
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
                    <h3 className="font-semibold text-text-main truncate text-sm">
                      {info.name}
                    </h3>
                    <p className="text-[10px] text-text-muted truncate">
                      {info.alias} - {info.connections.length} koneksi
                    </p>
                  </div>
                </div>
                <Badge
                  variant={isProviderActive ? "success" : "default"}
                  size="sm"
                >
                  {isProviderActive ? "Aktif" : "Tidak Aktif"}
                </Badge>
              </div>

              {/* Model list */}
              {models.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                  <span className="material-symbols-outlined text-[40px] opacity-20 mb-2">
                    device_unknown
                  </span>
                  <p className="text-sm">Tidak ada model statis</p>
                </div>
              ) : (
                <div className="flex-1 min-h-[200px] overflow-y-auto divide-y divide-black/[0.03] dark:divide-white/[0.03]">
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
                        className={"flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] " + (isDisabledModel ? "opacity-50 bg-red-500/5" : "")}
                      >
                        {/* Kind icon */}
                        <div className="size-7 rounded-md flex items-center justify-center text-xs shrink-0 bg-black/[0.03] dark:bg-white/[0.03]">
                          {kind === "image" ? "image" : kind === "tts" ? "tts" : "llm"}
                        </div>

                        {/* Model info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-main truncate">
                              {model.name || modelId}
                            </span>
                            {isDisabledModel && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-medium shrink-0">
                                Dimatikan
                              </span>
                            )}
                            {testResult && (
                              <span
                                className={"text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 " + (testResult.ok ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}
                              >
                                {testResult.ok ? "OK " + testResult.latency + "ms" : "Gagal"}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-text-muted/60 truncate">
                            {modelId}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => testModel(modelId, info.alias, kind)}
                            disabled={isTesting || isDisabledModel || !isProviderActive}
                            title="Test model"
                            icon={isTesting ? "progress_activity" : "bolt"}
                          >
                            {isTesting ? "" : "Test"}
                          </Button>
                          <Toggle
                            checked={!isDisabledModel}
                            onChange={() => toggleModel(info.alias, modelId, isDisabledModel)}
                            disabled={isSaving || !isProviderActive}
                            title={isDisabledModel ? "Aktifkan model" : "Matikan model"}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isProviderActive && (
                <div className="px-4 py-3 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/[0.05] dark:border-white/[0.05]">
                  <p className="text-xs text-text-muted">
                    Tidak ada koneksi aktif untuk provider ini. Model tidak akan tersedia di API sampai ada koneksi aktif.
                  </p>
                </div>
              )}
            </Card>
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
