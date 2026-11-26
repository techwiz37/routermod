"use client";

import { applyQoderModelNames } from "@/shared/utils/providerCustomModels";

import { useState, useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import AntaresPanel from "@/shared/components/AntaresPanel";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { getProviderAlias } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { translate, translateServerMessage } from "@/i18n/runtime";
import ModelTestButton from "@/shared/components/ModelTestButton";
import ModelCapabilities from "@/shared/components/ModelCapabilities";

export function ModelRow({ model, fullModel, copied, onCopy, testStatus, isCustom, isFree, onDeleteAlias, onTest, isTesting, onRemoveModel, kind }) {
  const iconColor = testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div className={`an-model ${testStatus === "ok" ? "is-ok" : testStatus === "error" ? "is-err" : ""}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="an-model-ico material-symbols-outlined" style={iconColor ? { color: iconColor } : undefined}>
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <code className="an-model-id">{fullModel}</code>
          {model.name && <span className="text-[9px] italic pl-1 text-[var(--t-muted)]">{model.name}</span>}
          <ModelCapabilities model={fullModel} caps={model.caps} />
        </div>
        {onTest && (
          <div className="relative group/btn">
            <ModelTestButton model={fullModel} kind={kind} onRemove={onRemoveModel} />
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
               {isTesting ? translate("Testing...") : translate("Test")}
            </span>
          </div>
        )}
        <div className="relative group/btn">
          <button onClick={() => onCopy(fullModel, `model-${model.id}`)} className="an-conn-btn !size-6 text-[var(--t-muted)] hover:text-[var(--t-star-ink)]">
            <span className="material-symbols-outlined text-sm">{copied === `model-${model.id}` ? "check" : "content_copy"}</span>
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
             {copied === `model-${model.id}` ? translate("Copied!") : translate("Copy")}
          </span>
        </div>
        {isFree && <span className="an-chip ok">FREE</span>}
        {isCustom && (
           <button onClick={onDeleteAlias} className="an-conn-btn danger ml-auto !size-6 opacity-60 hover:opacity-100 transition-opacity" title={translate("Remove custom model")}>
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  fullModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
};

function AddCustomModelModal({ isOpen, onSave, onClose }) {
  const [modelId, setModelId] = useState("");

  const handleSave = () => {
    if (!modelId.trim()) return;
    onSave(modelId.trim());
    setModelId("");
  };

  return (
     <Modal isOpen={isOpen} title={translate("Add Custom Model")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
           <label className="text-xs text-text-muted mb-1 block">{translate("Model ID")}</label>
          <input
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
             placeholder={translate("e.g. tts-1-hd")}
            autoFocus
          />
        </div>
        <div className="flex gap-2">
           <Button onClick={handleSave} fullWidth disabled={!modelId.trim()}>{translate("Add")}</Button>
           <Button onClick={onClose} variant="ghost" fullWidth>{translate("Cancel")}</Button>
        </div>
      </div>
    </Modal>
  );
}

AddCustomModelModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default function ModelsCard({ providerId, kindFilter, providerAliasOverride }) {
  const { copied, copy } = useCopyToClipboard();
  const [modelAliases, setModelAliases] = useState({});
  const [customModels, setCustomModels] = useState([]);
  const [modelTestResults, setModelTestResults] = useState({});
  const [testingModelId, setTestingModelId] = useState(null);
  const [testError, setTestError] = useState("");
  const [showAddCustomModel, setShowAddCustomModel] = useState(false);
  const [deletedIds, setDeletedIds] = useState([]);

  const providerAlias = providerAliasOverride || getProviderAlias(providerId);
  const effectiveType = kindFilter || "llm";

  const fetchData = useCallback(async () => {
    try {
      const [aliasRes, customRes] = await Promise.all([
        fetch("/api/models/alias"),
        fetch(`/api/models/custom?providerAlias=${encodeURIComponent(providerAlias)}`, { cache: "no-store" }),
      ]);
      const aliasData = await aliasRes.json();
      const customData = await customRes.json();
      if (aliasRes.ok) setModelAliases(aliasData.aliases || {});
      if (customRes.ok) { setCustomModels(customData.models || []); setDeletedIds(customData.deleted || []); }
    } catch (e) { console.log("ModelsCard fetch error:", e); }
  }, [providerAlias]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSetAlias = async (modelId, alias) => {
    const fullModel = `${providerAlias}/${modelId}`;
    try {
      const res = await fetch("/api/models/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: fullModel, alias }),
      });
      if (res.ok) await fetchData();
    } catch (e) { console.log("set alias error:", e); }
  };

  const handleDeleteAlias = async (alias) => {
    try {
      const res = await fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, { method: "DELETE" });
      if (res.ok) await fetchData();
    } catch (e) { console.log("delete alias error:", e); }
  };

  const handleAddCustomModel = async (modelId) => {
    try {
      const res = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias, id: modelId, type: effectiveType }),
      });
      if (res.ok) {
        await fetchData();
        window.dispatchEvent(new CustomEvent("customModelChanged"));
      }
    } catch (e) { console.log("add custom model error:", e); }
  };

  const handleDeleteCustomModel = async (modelId) => {
    try {
      const params = new URLSearchParams({ providerAlias, id: modelId, type: effectiveType });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (res.ok) {
        await fetchData();
        window.dispatchEvent(new CustomEvent("customModelChanged"));
      }
      else throw new Error("Failed to delete model");
    } catch (e) { console.log("delete custom model error:", e); throw e; }
  };

  const handleTestModel = async (modelId) => {
    if (testingModelId) return;
    setTestingModelId(modelId);
    setTestError("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerAlias}/${modelId}`, kind: kindFilter }),
        signal: controller.signal,
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      setTestError(data.ok ? "" : (translateServerMessage(data.error) || translate("Model not reachable")));
    } catch (err) {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      const timedOut = err?.name === "AbortError" || err?.name === "TimeoutError";
      setTestError(timedOut ? translateServerMessage("No response within 60 seconds") : translate("Network error"));
    } finally {
      clearTimeout(timeoutId);
      setTestingModelId(null);
    }
  };

  const allBuiltIn = getModelsByProviderId(providerId);
  const builtInModels = kindFilter
    ? allBuiltIn.filter((m) => {
        if (m.kinds) return m.kinds.includes(kindFilter);
        return getModelKind(m, "llm") === kindFilter;
      })
    : allBuiltIn;

  const myCustomModels = customModels.filter(
    (m) => m.providerAlias === providerAlias
      && getModelKind(m, "llm") === effectiveType
      && !builtInModels.some((b) => b.id === m.id)
  );

  const displayModels = applyQoderModelNames(builtInModels, customModels, providerAlias).filter((model) => !deletedIds.includes(model.id));

  const removeTestedModel = async (modelId) => {
    const params = new URLSearchParams({ providerAlias, id: modelId, type: effectiveType });
    const response = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Failed to delete model");
    await fetchData();
    window.dispatchEvent(new CustomEvent("customModelChanged"));
  };

  return (
    <>
      <AntaresPanel
        icon="deployed_code"
        title={`${translate("Models")}${kindFilter ? ` · ${kindFilter.toUpperCase()}` : ""}`}
        subtitle={`${displayModels.length + myCustomModels.length} ${translate("models available")}`}
        action={
          <button
            type="button"
            onClick={() => setShowAddCustomModel(true)}
            className="an-btn an-ghost h-8 gap-1 px-2.5 text-[11px]"
          >
            <span className="material-symbols-outlined">add</span>
            {translate("Add Model")}
          </button>
        }
      >
        {testError && (
          <p className="mb-3 break-words font-mono text-[11.5px] text-[var(--t-danger)]">{testError}</p>
        )}

        <div className="an-grid-models">
          {displayModels.map((model) => {
            const fullModel = `${providerAlias}/${model.id}`;
            const existingAlias = Object.entries(modelAliases).find(([, m]) => m === fullModel)?.[0];
            return (
              <ModelRow
                key={model.id}
                model={model}
                fullModel={`${providerAlias}/${model.id}`}
                alias={existingAlias}
                copied={copied}
                onCopy={copy}
                onSetAlias={(alias) => handleSetAlias(model.id, alias)}
                onDeleteAlias={() => handleDeleteAlias(existingAlias)}
                testStatus={modelTestResults[model.id]}
                onTest={() => handleTestModel(model.id)}
                kind={effectiveType}
                onRemoveModel={() => removeTestedModel(model.id)}
                isTesting={testingModelId === model.id}
                isFree={model.isFree}
              />
            );
          })}

          {myCustomModels.map((model) => (
            <ModelRow
              key={`${model.id}-${model.type}`}
              model={model}
              fullModel={`${providerAlias}/${model.id}`}
              copied={copied}
              onCopy={copy}
              onSetAlias={() => {}}
              onDeleteAlias={() => handleDeleteCustomModel(model.id)}
              testStatus={modelTestResults[model.id]}
              onTest={() => handleTestModel(model.id)}
              kind={effectiveType}
              onRemoveModel={() => removeTestedModel(model.id)}
              isTesting={testingModelId === model.id}
              isCustom
            />
          ))}

          {displayModels.length + myCustomModels.length === 0 && (
            <div className="an-empty an-empty-row">
              <span className="material-symbols-outlined">deployed_code</span>
              <p>{translate("No models available for this kind yet.")}</p>
            </div>
          )}
        </div>
      </AntaresPanel>

      <AddCustomModelModal
        isOpen={showAddCustomModel}
        onSave={async (modelId) => {
          await handleAddCustomModel(modelId);
          setShowAddCustomModel(false);
        }}
        onClose={() => setShowAddCustomModel(false)}
      />
    </>
  );
}

ModelsCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  kindFilter: PropTypes.string, // e.g. "tts", "embedding" — filters models shown
  providerAliasOverride: PropTypes.string, // override alias (e.g. for custom-embedding nodes using prefix)
};
