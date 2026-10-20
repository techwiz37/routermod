"use client";

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { useNotificationStore } from "@/store/notificationStore";
import { translate } from "@/i18n/runtime";
import ModelListPagination from "./ModelListPagination";

const MODELS_PER_PAGE = 5;

function CompatibleModelRow({ modelId, modelName, fullModel, copied, onCopy, onDeleteAlias, onEdit, onTest, testStatus, isTesting, isFree, isPaid }) {
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
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-base text-text-muted shrink-0" style={iconColor ? { color: iconColor } : undefined}>
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{modelName || modelId}</p>
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
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <code className="text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{fullModel}</code>
            {/* Copy */}
            <div className="relative group/btn">
              <button onClick={() => onCopy(fullModel, `model-${modelId}`)} className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary">
                <span className="material-symbols-outlined text-sm">{copied === `model-${modelId}` ? "check" : "content_copy"}</span>
              </button>
              <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {copied === `model-${modelId}` ? "Copied!" : "Copy"}
              </span>
            </div>
            {/* Test */}
            {onTest && (
              <div className="relative group/btn">
                <button onClick={onTest} disabled={isTesting} className="p-0.5 hover:bg-sidebar rounded text-text-muted hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                    {isTesting ? "progress_activity" : "science"}
                  </span>
                </button>
                <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                  {isTesting ? "Testing..." : "Test"}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {onEdit && (
            <button
              onClick={() => editing ? setEditing(false) : startEdit()}
              className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-sidebar ${editing ? "text-primary" : "text-text-muted hover:text-primary"}`}
              title="Edit"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
            </button>
          )}
          <button onClick={onDeleteAlias} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500" title="Remove model">
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </div>

      {/* Edit popover */}
      {editing && (
        <form
          onSubmit={commitEdit}
          className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-border bg-surface p-3 shadow-[3px_3px_0px_var(--color-border)]"
        >
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Model ID</span>
            <input
              ref={firstRef}
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
              placeholder="e.g. gpt-4o-mini"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Display Name</span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
              placeholder="e.g. GPT-4o Mini"
            />
          </label>
          <div className="flex items-center gap-1.5 justify-end">
            <button type="button" onClick={() => setEditing(false)} className="px-2.5 py-1 rounded border border-border text-[11px] text-text-muted hover:bg-surface-2 transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-2.5 py-1 rounded border-2 border-primary bg-primary text-[11px] font-bold text-white hover:bg-primary-hover transition-colors shadow-[1.5px_1.5px_0px_var(--color-border)]">
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onEditAlias, onEditCustomModel, onAddCustomModel, onDeleteCustomModel, connections, isAnthropic, detectFilter = "all" }) {
  const [newModel, setNewModel] = useState("");
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

  // The All / Free / Paid filter also applies to the list below. "Paid" keeps
  // models whose pricing is unknown too — those are almost never free.
  const visibleModels = detectFilter === "all"
    ? allModels
    : detectFilter === "free"
      ? allModels.filter((m) => m.isFree === true)
      : allModels.filter((m) => m.isFree !== true);
  const hiddenCount = allModels.length - visibleModels.length;
  const unknownCount = detectFilter === "paid"
    ? visibleModels.filter((m) => typeof m.isFree !== "boolean").length
    : 0;

  const totalPages = Math.max(1, Math.ceil(visibleModels.length / MODELS_PER_PAGE));
  const safePage = Math.min(modelsPage, totalPages);
  const pagedModels = visibleModels.slice((safePage - 1) * MODELS_PER_PAGE, safePage * MODELS_PER_PAGE);

  useEffect(() => { setModelsPage(1); }, [detectFilter]);

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();
    if (allModels.some((model) => model.id === modelId)) {
      alert("Model already exists for this provider.");
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
        alert(data.error || "Failed to import models");
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        alert("No models returned from /models.");
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
        alert("No new models were added.");
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
      <p className="text-sm text-text-muted">
        Add models manually, or import them from the /models endpoint.
      </p>

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
          {importing ? "Importing..." : "Import from /models"}
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
          {hiddenCount > 0 && (
            <p className="mb-2 rounded-md bg-sidebar px-2.5 py-1.5 text-[11px] text-text-muted">
              {hiddenCount} {translate("models hidden by this filter")}
            </p>
          )}
          {unknownCount > 0 && (
            <p className="mb-2 rounded-md bg-sidebar px-2.5 py-1.5 text-[11px] text-text-muted">
              {unknownCount} {translate("models without pricing info included")}
            </p>
          )}

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
  detectFilter: PropTypes.oneOf(["all", "free", "paid"]),
};
