"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { translate } from "@/i18n/runtime";

function PassthroughModelRow({ modelId, fullModel, copied, onCopy, onDeleteAlias, onTest, testStatus, isTesting }) {
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;

  return (
    <div className={`flex flex-col gap-0 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <div className="flex min-w-0 items-start gap-3">
      <span
        className="material-symbols-outlined text-base text-text-muted"
        style={iconColor ? { color: iconColor } : undefined}
      >
        {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{modelId}</p>

        <code className="mt-1 block break-all text-xs text-text-muted font-mono bg-sidebar px-1.5 py-0.5 rounded">{fullModel}</code>
      </div>

      </div>
      <div className="mt-2 flex min-h-7 items-center justify-end gap-1 border-t border-border/60 pt-1.5">
         {onTest && <button onClick={onTest} disabled={isTesting} className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary" title={isTesting ? translate("Testing...") : translate("Test")}><span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>{isTesting ? "progress_activity" : "science"}</span></button>}
         <button onClick={() => onCopy(fullModel, `model-${modelId}`)} className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary" title={copied === `model-${modelId}` ? translate("Copied!") : translate("Copy")}><span className="material-symbols-outlined text-sm">{copied === `model-${modelId}` ? "check" : "content_copy"}</span></button>
         <button onClick={onDeleteAlias} className="rounded p-1 text-red-500 hover:bg-red-500/10" title={translate("Delete model")}><span className="material-symbols-outlined text-sm">delete</span></button>
      </div>
      </div>
  );
}

PassthroughModelRow.propTypes = {
  modelId: PropTypes.string.isRequired,
  fullModel: PropTypes.string.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onTest: PropTypes.func,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isTesting: PropTypes.bool,
};

export default function PassthroughModelsSection({ providerAlias, modelAliases, customModels, copied, onCopy, onDeleteAlias, onAddCustomModel, onDeleteCustomModel }) {
  const [newModel, setNewModel] = useState("");
  const [adding, setAdding] = useState(false);

  const allModels = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias,
    type: "llm",
  });

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

  return (
    <div className="flex flex-col gap-4">
       <p className="text-sm text-text-muted">
         {translate("OpenRouter supports any model. Add models and create aliases for quick access.")}
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
           <label htmlFor="new-model-input" className="text-xs text-text-muted mb-1 block">{translate("Model ID (from OpenRouter)")}</label>
          <input
            id="new-model-input"
            type="text"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
             placeholder={translate("anthropic/claude-3-opus")}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" icon="add" onClick={handleAdd} disabled={!newModel.trim() || adding}>
           {adding ? translate("Adding...") : translate("Add")}
        </Button>
      </div>

      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ id, fullModel, alias, source }) => (
            <PassthroughModelRow
              key={`${source}-${fullModel}`}
              modelId={id}
              fullModel={fullModel}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() => source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

PassthroughModelsSection.propTypes = {
  providerAlias: PropTypes.string.isRequired,
  modelAliases: PropTypes.object.isRequired,
  customModels: PropTypes.arrayOf(PropTypes.object),
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  onDeleteAlias: PropTypes.func.isRequired,
  onAddCustomModel: PropTypes.func.isRequired,
  onDeleteCustomModel: PropTypes.func.isRequired,
};
