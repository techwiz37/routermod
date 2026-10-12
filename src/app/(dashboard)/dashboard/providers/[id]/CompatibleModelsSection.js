"use client";

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";

function CompatibleModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onRename, onTest, testStatus, isTesting }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef(null);

  const borderColor = testStatus === "ok" ? "border-green-500/40"
    : testStatus === "error" ? "border-red-500/40"
    : "border-border";
  const iconColor = testStatus === "ok" ? "#22c55e"
    : testStatus === "error" ? "#ef4444"
    : undefined;

  function startEdit() {
    setDraftName(modelId);
    setEditing(true);
  }
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commitEdit() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== modelId && onRename) onRename(trimmed);
    setEditing(false);
  }

  return (
    <div className={`group flex items-center gap-3 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <span className="material-symbols-outlined text-base text-text-muted shrink-0" style={iconColor ? { color: iconColor } : undefined}>
        {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{modelId}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
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
        {/* Inline edit row */}
        {editing && (
          <div className="flex items-center gap-1 mt-1.5">
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
              className="min-w-0 flex-1 rounded border border-primary/60 bg-bg px-1.5 py-0.5 font-mono text-[11px] text-text-main outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Display name"
            />
            <button onClick={commitEdit} className="rounded p-0.5 text-emerald-500 hover:bg-emerald-500/10">
              <span className="material-symbols-outlined text-[13px]">check</span>
            </button>
            <button onClick={() => setEditing(false)} className="rounded p-0.5 text-text-muted hover:bg-sidebar">
              <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
          </div>
        )}
      </div>
      {/* Action buttons */}
      {!editing && (
        <div className="flex items-center gap-0.5 shrink-0">
          {onRename && (
            <button onClick={startEdit} className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:bg-sidebar hover:text-primary transition-all" title="Rename">
              <span className="material-symbols-outlined text-sm">edit</span>
            </button>
          )}
          <button onClick={onDeleteAlias} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500" title="Remove model">
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function CompatibleModelsSection({ providerStorageAlias, providerDisplayAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onRenameAlias, onRenameCustomModel, onAddCustomModel, onDeleteCustomModel, connections, isAnthropic }) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testingModelId, setTestingModelId] = useState(null);
  const [modelTestResults, setModelTestResults] = useState({});

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
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
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
        Add {isAnthropic ? "Anthropic" : "OpenAI"}-compatible models manually or import them from the /models endpoint.
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
          Add a connection to enable importing models.
        </p>
      )}

      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ id, alias, source, name }) => (
            <CompatibleModelRow
              key={`${source}-${providerStorageAlias}/${id}`}
              modelId={id}
              fullModel={`${providerDisplayAlias}/${id}`}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() => source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)}
              onRename={(newName) => source === "custom" ? onRenameCustomModel(id, newName) : onRenameAlias(id, newName)}
              onTest={connections.length > 0 ? () => handleTestModel(id) : undefined}
              testStatus={modelTestResults[id]}
              isTesting={testingModelId === id}
            />
          ))}
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
  onRenameAlias: PropTypes.func,
  onRenameCustomModel: PropTypes.func,
  onAddCustomModel: PropTypes.func.isRequired,
  onDeleteCustomModel: PropTypes.func.isRequired,
  connections: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    isActive: PropTypes.bool,
  })).isRequired,
  isAnthropic: PropTypes.bool,
};
