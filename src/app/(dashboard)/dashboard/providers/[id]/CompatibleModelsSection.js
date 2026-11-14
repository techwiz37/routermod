"use client";

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, VisionSelector, visionFromCaps } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { useNotificationStore } from "@/store/notificationStore";
import { translate } from "@/i18n/runtime";
import ModelListPagination from "./ModelListPagination";

const MODELS_PER_PAGE = 5;

function CompatibleModelRow({ modelId, modelName, fullModel, copied, onCopy, onDeleteAlias, onEdit, onTest, testStatus, isTesting, isFree, isPaid, prefix, aliasKey, isDisabled, onDisable, onEnable, caps, canEditCaps }) {
  const [editing, setEditing] = useState(false);
  const [draftId,   setDraftId]   = useState(modelId);
  const [draftName, setDraftName] = useState(modelName || modelId);
  const [draftVision, setDraftVision] = useState("auto");
  const [initialVision, setInitialVision] = useState("auto");
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
    const initial = visionFromCaps(caps);
    setInitialVision(initial);
    setDraftVision(initial);
    setEditing(true);
  }
  useEffect(() => { if (editing) firstRef.current?.focus(); }, [editing]);

  function commitEdit(e) {
    e?.preventDefault();
    if (!onEdit) { setEditing(false); return; }
    const payload = { modelId: draftId.trim(), name: draftName.trim(), aliasKey: aliasKey };
    // Only send a caps patch when the user actually changed the selector; a
    // `null` vision value removes the override (back to catalog default).
    if (canEditCaps && draftVision !== initialVision) {
      payload.caps = { vision: draftVision === "yes" ? true : draftVision === "no" ? false : null };
    }
    onEdit(payload);
    setEditing(false);
  }

  return (
    <div className={`group flex flex-col gap-0 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50 ${isDisabled ? 'opacity-50' : ''}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="material-symbols-outlined text-base text-text-muted shrink-0" style={iconColor ? { color: iconColor } : undefined}>
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="min-w-0">
            <p className="break-all text-sm font-medium"><span className="text-primary">#{prefix || "model"}</span><span className="px-1 text-text-muted">-</span>{modelName || modelId}</p>
            <div className="flex items-center gap-1 mt-1">
              {isDisabled && (
                <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
                  DISABLED
                </span>
              )}
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
          </div>
          <code className="mt-1 block break-all text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{`${prefix || "model"}/${modelName || modelId}`}</code>
        </div>
      </div>

      <div className="mt-2 flex min-h-7 items-center justify-end gap-1 border-t border-border/60 pt-1.5">
         {onTest && !isDisabled && <button onClick={onTest} disabled={isTesting} className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary" title={isTesting ? translate("Testing...") : translate("Test")}><span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>{isTesting ? "progress_activity" : "science"}</span></button>}
         <button onClick={() => onCopy(fullModel, `model-${modelId}`)} className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary" title={copied === `model-${modelId}` ? translate("Copied!") : translate("Copy")}><span className="material-symbols-outlined text-sm">{copied === `model-${modelId}` ? "check" : "content_copy"}</span></button>
         {onEdit && !isDisabled && <button onClick={() => editing ? setEditing(false) : startEdit()} className={`rounded p-1 ${editing ? "text-primary" : "text-text-muted hover:bg-sidebar hover:text-primary"}`} title={translate("Edit")}><span className="material-symbols-outlined text-sm">edit</span></button>}
         {isDisabled && onEnable ? (
           <button onClick={onEnable} className="rounded p-1 text-text-muted hover:bg-green-500/10 hover:text-green-500" title={translate("Enable")}><span className="material-symbols-outlined text-sm">restart_alt</span></button>
         ) : onDisable ? (
           <button onClick={onDisable} className="rounded p-1 text-text-muted hover:bg-orange-500/10 hover:text-orange-500" title={translate("Disable")}><span className="material-symbols-outlined text-sm">block</span></button>
         ) : null}
         <button onClick={onDeleteAlias} className="rounded p-1 text-red-500 hover:bg-red-500/10" title={translate("Delete model")}><span className="material-symbols-outlined text-sm">delete</span></button>
      </div>

      {editing && (
        <form
          onSubmit={commitEdit}
          className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-border bg-surface p-3 shadow-[3px_3px_0px_var(--color-border)]"
        >
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{translate("Original ID")}</span>
            <input
              ref={firstRef}
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
              placeholder={translate("e.g. gpt-4o-mini")}
            />
            <span className="text-[10px] text-text-muted/60 mt-0.5">{translate("The provider's original ID — change only if needed.")}</span>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{translate("Custom ID")}</span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
              placeholder={translate("e.g. GPT-4o Mini")}
            />
            <span className="text-[10px] text-text-muted/60 mt-0.5">{translate("The ID used by the API — this is what shows in the model list.")}</span>
          </label>
          {canEditCaps && (
            <div className="rounded border border-border/60 bg-bg/40 p-2">
              <VisionSelector value={draftVision} onChange={setDraftVision} hint={translate("Auto keeps the catalog default.")} />
            </div>
          )}
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

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, modelNames, customModels, copied, onCopy, onSetAlias, onDeleteAlias, onAddCustomModel, onEditAlias, onEditCustomModel, onEditBuiltinModel, onDeleteCustomModel, onDeleteAllModels, connections, isAnthropic, modelPrefix, onAdd, onImport, onImporting = false, disabledModelIds = [], onDisable, onEnable }) {
  const [newModel, setNewModel] = useState("");
  const [newVision, setNewVision] = useState("auto");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsPage, setModelsPage] = useState(1);
  const addNotification = useNotificationStore((s) => s.addNotification);

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
          title: translate("Test Sukses"),
          message: `${modelId} ${translate("berhasil merespon")} (${data.latencyMs || data.latency || 0}ms)`,
          duration: 4000,
        });
      } else {
        addNotification({
          type: "error",
          title: translate("Test Gagal"),
          message: `${modelId}: ${data.error || translate("Model tidak merespon")}`,
          duration: 6000,
        });
      }
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      addNotification({
        type: "error",
        title: translate("Test Gagal"),
        message: `${modelId}: ${translate("Network error")}`,
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
  }).map((row) => {
    // A saved display name must win over the raw model id so renames persist.
    const customName =
      modelNames?.[`${providerStorageAlias}/${row.id}`] ||
      modelNames?.[`${providerDisplayAlias}/${row.id}`] ||
      null;
    return customName ? { ...row, name: customName } : row;
  });

  const visibleModels = allModels;

  const totalPages = Math.max(1, Math.ceil(visibleModels.length / MODELS_PER_PAGE));
  const safePage = Math.min(modelsPage, totalPages);
  const pagedModels = visibleModels.slice((safePage - 1) * MODELS_PER_PAGE, safePage * MODELS_PER_PAGE);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setModelsPage(1); }, [allModels.length]);

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    if (allModels.some((model) => model.id === modelId)) {
      addNotification({ type: "warning", title: translate("Already exists"), message: translate("Model already exists for this provider."), duration: 3000 });
      return;
    }

    const caps = newVision === "auto" ? undefined : { vision: newVision === "yes" };
    setAdding(true);
    try {
      await onAddCustomModel(modelId, caps);
      setNewModel("");
      setNewVision("auto");
    } catch (error) {
      console.log("Error adding model:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to add model"), duration: 5000 });
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
        addNotification({ type: "error", title: translate("Error"), message: data.error || translate("Failed to import models"), duration: 5000 });
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        addNotification({ type: "info", title: translate("No models"), message: translate("No models returned from /models."), duration: 4000 });
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
        addNotification({ type: "info", title: translate("No new models"), message: translate("No new models were added."), duration: 4000 });
      } else {
        addNotification({ type: "success", title: translate("Imported"), message: `${importedCount} ${translate("models")}`, duration: 3000 });
      }
    } catch (error) {
      console.log("Error importing models:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to import models"), duration: 5000 });
    } finally {
      setImporting(false);
    }
  };

  const canImport = connections.some((conn) => conn.isActive !== false);

  const onAddLocal = async () => {
    const caps = newVision === "auto" ? undefined : { vision: newVision === "yes" };
    if (onAdd) return onAdd(newModel.trim(), caps);
    await handleAdd();
  };

  const onImportLocal = async () => {
    if (onImport) return onImport();
    await handleImport();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Add Model Form */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-primary">add</span>
          <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{translate("Add Model")}</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="new-compatible-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddLocal()}
            placeholder={isAnthropic ? "claude-3-opus-20240229" : "gpt-4o"}
            title={translate("Model ID")}
            className="h-10 min-w-0 flex-1 rounded border border-border bg-bg px-3 font-mono text-sm text-text-main outline-none transition-colors focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={onAddLocal}
            disabled={!newModel.trim() || adding}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded border border-primary bg-primary px-4 text-xs font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">{adding ? "progress_activity" : "add"}</span>
            {adding ? translate("Adding...") : translate("Add")}
          </button>
        </div>
        <div className="mt-2">
          <VisionSelector value={newVision} onChange={setNewVision} hint={translate("Auto keeps the catalog default.")} />
        </div>
      </div>

      {/* Import Button */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onImportLocal}
          disabled={!canImport || importing || !!onImporting}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded border border-border bg-surface px-4 text-xs font-bold text-text-main transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">{(importing || onImporting) ? "progress_activity" : "download"}</span>
          {importing ? translate("Importing...") : translate("Import from /models")}
        </button>

        <button
          onClick={onDeleteAllModels}
          disabled={!allModels.length}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded border border-red-500/40 bg-red-500/5 px-4 text-xs font-bold text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
          {translate("Delete All Models")}
        </button>

        {!canImport && !onAdd && (
          <p className="text-xs text-text-muted">
            {translate("Add a connection to enable importing models.")}{" "}
            {translate("Auto-detect Models works without one if this endpoint allows anonymous access.")}
          </p>
        )}
      </div>

      {allModels.length > 0 && (
        <div className="flex flex-col">
          <div className="flex flex-col gap-3">
            {pagedModels.map(({ id, alias, source, name, isFree, caps }) => {
              const isDisabled = disabledModelIds.includes(id);
              return (
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
                  onEdit={(vals) => source === "custom"
                    ? onEditCustomModel?.({ modelId: id, name: vals.name, aliasKey: alias, prefix: providerDisplayAlias, providerAlias: providerDisplayAlias, caps: vals.caps })
                    : onEditBuiltinModel?.({ modelId: id, name: vals.name, aliasKey: alias, prefix: providerDisplayAlias, providerAlias: providerDisplayAlias })}
                  onTest={connections.length > 0 ? () => handleTestModel(id) : undefined}
                  testStatus={modelTestResults[id]}
                  isTesting={testingModelId === id}
                  prefix={modelPrefix || providerDisplayAlias}
                  aliasKey={alias}
                  isDisabled={isDisabled}
                  onDisable={() => onDisable?.(id)}
                  onEnable={() => onEnable?.(id)}
                  caps={caps}
                  canEditCaps={source === "custom"}
                />
              );
            })}
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
  modelNames: PropTypes.object,
  customModels: PropTypes.arrayOf(PropTypes.object),
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onEditAlias: PropTypes.func,
  onEditCustomModel: PropTypes.func,
  onEditBuiltinModel: PropTypes.func,
  onAddCustomModel: PropTypes.func.isRequired,
  onDeleteCustomModel: PropTypes.func.isRequired,
  onDeleteAllModels: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    isActive: PropTypes.bool,
  })).isRequired,
  isAnthropic: PropTypes.bool,
  onAdd: PropTypes.func,
  onImport: PropTypes.func,
  onImporting: PropTypes.bool,
  modelPrefix: PropTypes.string,
  onSetAlias: PropTypes.func,
  disabledModelIds: PropTypes.arrayOf(PropTypes.string),
  onDisable: PropTypes.func,
  onEnable: PropTypes.func,
};
