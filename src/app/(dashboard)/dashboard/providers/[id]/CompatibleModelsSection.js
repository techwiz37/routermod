"use client";

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { useNotificationStore } from "@/store/notificationStore";
import { translate } from "@/i18n/runtime";
import ModelListPagination from "./ModelListPagination";

const MODELS_PER_PAGE = 5;

function CompatibleModelRow({ modelId, modelName, fullModel, copied, onCopy, onDeleteAlias, onEdit, onTest, testStatus, isTesting, isFree, isPaid, prefix }) {
  const [editing, setEditing] = useState(false);
  const [draftId,   setDraftId]   = useState(modelId);
  const [draftName, setDraftName] = useState(modelName || modelId);
  const firstRef = useRef(null);

  const borderColor = testStatus === "ok" ? "border-green-500/40"
    : testStatus === "error" ? "border-red-500/40"
    : "border-border";
  const iconColor = testStatus === "ok" ? "#22c55e"
    : testStatus === "error" ? "#ef4444"
    : undefined;

  function startEdit() {
    setDraftId(modelId);
    setDraftName(modelName || modelId);
    setEditing(true);
  }
  useEffect(() => { if (editing) firstRef.current?.focus(); }, [editing]);

  function commitEdit(e) {
    e?.preventDefault();
    if (onEdit) onEdit({ modelId: draftId.trim(), name: draftName.trim() });
    setEditing(false);
  }

  return (
    <div className={`group flex flex-col gap-0 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="material-symbols-outlined text-base text-text-muted shrink-0" style={iconColor ? { color: iconColor } : undefined}>
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="min-w-0">
            <p className="break-all text-sm font-medium"><span className="text-primary">#{prefix || "model"}</span><span className="px-1 text-text-muted">-</span>{modelName || modelId}</p>
            {isFree === true && (
              <span className="shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-bold text-green-500">
                FREE
              </span>
            )}
            {isPaid === true && (
              <span className="shrink-0 rounded bg-sidebar px-1.5 py-0.5 text-[10px] font-bold text-text-muted/70">
                PAID
              </span>
            )}
          </div>
          <code className="mt-1 block break-all text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{`${prefix || "model"}/${modelName || modelId}`}</code>
        </div>
      </div>

      <div className="mt-2 flex min-h-7 items-center justify-end gap-1 border-t border-border/60 pt-1.5">
         {onTest && <button onClick={onTest} disabled={isTesting} className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary" title={isTesting ? translate("Testing...") : translate("Test")}><span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>{isTesting ? "progress_activity" : "science"}</span></button>}
         <button onClick={() => onCopy(fullModel, `model-${modelId}`)} className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary" title={copied === `model-${modelId}` ? translate("Copied!") : translate("Copy")}><span className="material-symbols-outlined text-sm">{copied === `model-${modelId}` ? "check" : "content_copy"}</span></button>
         {onEdit && <button onClick={() => editing ? setEditing(false) : startEdit()} className={`rounded p-1 ${editing ? "text-primary" : "text-text-muted hover:bg-sidebar hover:text-primary"}`} title={translate("Edit")}><span className="material-symbols-outlined text-sm">edit</span></button>}
         <button onClick={onDeleteAlias} className="rounded p-1 text-red-500 hover:bg-red-500/10" title={translate("Delete model")}><span className="material-symbols-outlined text-sm">delete</span></button>
      </div>

      {editing && (
        <form
          onSubmit={commitEdit}
          className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-border bg-surface p-3 shadow-[3px_3px_0px_var(--color-border)]"
        >
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Original ID</span>
            <input
              ref={firstRef}
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
              placeholder="e.g. gpt-4o-mini"
            />
            <span className="text-[10px] text-text-muted/60 mt-0.5">ID asli dari provider — ubah hanya jika perlu.</span>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Custom ID</span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
              placeholder="e.g. GPT-4o Mini"
            />
            <span className="text-[10px] text-text-muted/60 mt-0.5">ID yang dipakai di API — ini yang tampil di daftar model.</span>
          </label>
          <div className="flex items-center gap-1.5 justify-end">
            <button type="button" onClick={() => setEditing(false)} className="px-2.5 py-1 rounded border border-border text-[11px] text-text-muted hover:bg-surface-2 transition-colors">
               {translate("Cancel")}
            </button>
            <button type="submit" className="px-2.5 py-1 rounded border-2 border-primary bg-primary text-[11px] font-bold text-white hover:bg-primary-hover transition-colors shadow-[1.5px_1.5px_0px_var(--color-border)]">
               {translate("Save")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onEditAlias, onEditCustomModel, onAddCustomModel, onDeleteCustomModel, connections, isAnthropic, modelPrefix, onBulkPrefixChange, systemPromptModel, setSystemPromptModel, systemPromptDraft, setSystemPromptDraft, systemPrompts, savingSystemPrompt, onSaveSystemPrompt }) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsPage, setModelsPage] = useState(1);
  const [prefixDraft, setPrefixDraft] = useState(modelPrefix || "");
  const [savingPrefix, setSavingPrefix] = useState(false);
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    setPrefixDraft(modelPrefix || "");
  }, [modelPrefix]);

  const handleTestModel = async (modelId) => {
    if (testingModelId) return;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      if (data.ok) {
        addNotification({
          type: "success",
          title: "Test Sukses",
          message: `${modelId} berhasil merespon (${data.latencyMs || data.latency || 0}ms)`,
          duration: 4000,
        });
      } else {
        addNotification({
          type: "error",
          title: "Test Gagal",
          message: `${modelId}: ${data.error || "Model tidak merespon"}`,
          duration: 6000,
        });
      }
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      addNotification({
        type: "error",
        title: "Test Gagal",
        message: `${modelId}: Network error`,
        duration: 6000,
      });
    } finally {
      setTestingModelId(null);
    }
  };

  const allModels = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias: providerStorageAlias,
    type: "llm",
  });

  const visibleModels = allModels;

  const totalPages = Math.max(1, Math.ceil(visibleModels.length / MODELS_PER_PAGE));
  const safePage = Math.min(modelsPage, totalPages);
  const pagedModels = visibleModels.slice((safePage - 1) * MODELS_PER_PAGE, safePage * MODELS_PER_PAGE);

  useEffect(() => { setModelsPage(1); }, [allModels.length]);

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    if (allModels.some((model) => model.id === modelId)) {
       alert(translate("Model already exists for this provider."));
      return;
    }

    setAdding(true);
    try {
      await onAddCustomModel(modelId);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) return;

    setImporting(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
         alert(data.error || translate("Failed to import models"));
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
         alert(translate("No models returned from /models."));
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        if (allModels.some((entry) => entry.id === modelId)) continue;
        await onAddCustomModel(modelId);
        importedCount += 1;
      }
      if (importedCount === 0) {
         alert(translate("No new models were added."));
      }
    } catch (error) {
      console.log("Error importing models:", error);
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
           <p className="text-sm text-text-muted">
             {translate("Add models manually, or import them from the /models endpoint.")}
        </p>
        {onBulkPrefixChange && (
          <div className="rounded-lg border-2 border-border bg-surface p-4 shadow-[3px_3px_0px_var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-base text-primary">tag</span>
               <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{translate("Global Model Prefix")}</span>
            </div>
            <p className="text-[11px] text-text-muted mb-3">
               {translate("Sets the display prefix for all models in this provider. Models will appear as")}{" "}
              <code className="font-mono text-primary">{prefixDraft ? prefixDraft + "/" : ""}&lt;model-id&gt;</code>.
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={prefixDraft}
                onChange={(e) => setPrefixDraft(e.target.value)}
                placeholder={providerDisplayAlias}
                className="flex-1 rounded border border-border bg-bg px-2.5 py-1.5 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
                title="Set prefix for all models in this provider"
              />
              <button
                onClick={async () => {
                  if (!prefixDraft.trim() || savingPrefix) return;
                  setSavingPrefix(true);
                  await onBulkPrefixChange(prefixDraft.trim());
                  setSavingPrefix(false);
                }}
                disabled={!prefixDraft.trim() || prefixDraft.trim() === modelPrefix || savingPrefix}
                className="shrink-0 rounded border-2 border-primary bg-primary px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary-hover transition-colors shadow-[1.5px_1.5px_0px_var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                 {savingPrefix ? translate("Saving...") : translate("Apply")}
              </button>
            </div>
            {modelPrefix && prefixDraft !== modelPrefix && (
              <p className="mt-2 text-[10px] text-warning">
                 {translate("Unsaved change — current prefix is")} <code className="font-mono">{modelPrefix}</code>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="an-panel an-scope mb-3">
        <div className="an-panel-pad">
          <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="an-panel-ico" aria-hidden><span className="material-symbols-outlined text-base">text_fields</span></span>
               <div className="min-w-0"><span className="an-panel-title block">{translate("System Prompt")}</span><span className="mt-0.5 block text-[11px] leading-4 text-text-muted">{translate("Special instructions for the selected model")}</span></div>
            </div>
             <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{translate("MODEL-SPECIFIC")}</span>
          </div>
           <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor="compatible-system-prompt-model">{translate("Target model")}</label>
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary"><span className="material-symbols-outlined text-[18px]">smart_toy</span></span>
            <select id="compatible-system-prompt-model" value={systemPromptModel} onChange={(e) => setSystemPromptModel(e.target.value)} className="an-select system-prompt-select h-11 w-full font-mono text-xs">
               <option value="">{translate("Choose a model to configure")}</option>
              {allModels.map(({ id }) => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
           <label className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor="compatible-system-prompt-textarea"><span>{translate("System instructions")}</span><span className="font-normal normal-case tracking-normal text-text-muted/60">{systemPromptDraft.length}/4000</span></label>
           <textarea id="compatible-system-prompt-textarea" maxLength={4000} value={systemPromptDraft} onChange={(e) => setSystemPromptDraft(e.target.value)} placeholder={translate("Example: You are model XX from Techwiz. Explain answers clearly and accurately.")} rows={5} className="an-input system-prompt-textarea min-h-[132px] w-full resize-y !rounded-xl !border-border/80 !bg-bg text-sm leading-6 placeholder:text-text-muted/45 focus:!border-primary/70" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={onSaveSystemPrompt}
              disabled={!systemPromptModel || savingSystemPrompt}
              className="an-btn an-primary h-9 rounded-[10px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="material-symbols-outlined text-[16px]">{savingSystemPrompt ? "progress_activity" : "save"}</span>
               {savingSystemPrompt ? translate("Saving...") : translate("Save prompt")}
            </button>
            {systemPromptModel && systemPrompts[systemPromptModel] !== systemPromptDraft.trim() && (
               <p className="text-[10px] text-warning">{translate("Unsaved system prompt changes")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label htmlFor="new-compatible-model-input" className="text-xs text-text-muted mb-1 block">Model ID</label>
          <input
            id="new-compatible-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          {adding ? "Adding..." : "Add"}
        </Button>
        <Button size="sm" variant="secondary" icon="download" onClick={handleImport} disabled={!canImport || importing}>
           {importing ? translate("Importing...") : translate("Import from /models")}
        </Button>
      </div>

      {!canImport && (
        <p className="text-xs text-text-muted">
          Add a connection to enable importing models.{" "}
          Auto-detect Models works without one if this endpoint allows anonymous access.
        </p>
      )}

      {allModels.length > 0 && (
        <div className="flex flex-col">
          <div className="flex flex-col gap-3">
            {pagedModels.map(({ id, alias, source, name, isFree }) => (
              <CompatibleModelRow
                key={`${source}-${providerStorageAlias}/${id}`}
                modelId={id}
                modelName={name}
                fullModel={`${providerDisplayAlias}/${id}`}
                copied={copied}
                onCopy={onCopy}
                isFree={isFree === true}
                isPaid={isFree === false}
                onDeleteAlias={() => source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)}
                onEdit={(vals) => source === "custom" ? onEditCustomModel?.(id, vals) : onEditAlias?.(id, vals)}
                onTest={connections.length > 0 ? () => handleTestModel(id) : undefined}
                testStatus={modelTestResults[id]}
                isTesting={testingModelId === id}
                prefix={modelPrefix}
              />
            ))}
            {pagedModels.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
                {translate("No models match this filter")}
              </p>
            )}
          </div>

          <ModelListPagination
            page={safePage}
            totalPages={totalPages}
            onPageChange={setModelsPage}
          />
        </div>
      )}
    </div>
  );
}

CompatibleModelsSection.propTypes = {
  providerStorageAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  customModels: PropTypes.arrayOf(PropTypes.object),
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onEditAlias: PropTypes.func,
  onEditCustomModel: PropTypes.func,
  onAddCustomModel: PropTypes.func.isRequired,
  onDeleteCustomModel: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    isActive: PropTypes.bool,
  })).isRequired,
  isAnthropic: PropTypes.bool,
  modelPrefix: PropTypes.string,
  onBulkPrefixChange: PropTypes.func,
  onTestAllModels: PropTypes.func,
  onDeleteAllModels: PropTypes.func,
  testAllRunning: PropTypes.bool,
  testAllStopping: PropTypes.bool,
};
