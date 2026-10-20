import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { CapacityBadges } from "@/shared/components";

function EditPopover({ model, alias, isCustom, providerAlias, onSave, onClose }) {
  const aliasParts = alias ? alias.split("/") : [];
  const initPrefix  = aliasParts.length > 1 ? aliasParts.slice(0, -1).join("/") : (providerAlias || "");
  const initModelId = aliasParts.length > 1 ? aliasParts[aliasParts.length - 1] : (alias || model.id);

  const [prefix,  setPrefix]  = useState(initPrefix);
  const [modelId, setModelId] = useState(initModelId);
  const [name,    setName]    = useState(model.name || model.id);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const previewAlias = [prefix.trim(), modelId.trim()].filter(Boolean).join("/");

  function handleSave(e) {
    e.preventDefault();
    onSave({ prefix: prefix.trim(), modelId: modelId.trim(), name: name.trim(), aliasKey: previewAlias });
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-border bg-surface p-3 shadow-[3px_3px_0px_var(--color-border)]"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Prefix</span>
        <input
          ref={firstRef}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
          placeholder={providerAlias || "ag"}
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Model ID</span>
        <input
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
          placeholder={model.id}
        />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Display Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1 text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
          placeholder={isCustom ? "e.g. Gemini 3.8 High" : "e.g. Claude Sonnet 4.6"}
        />
      </label>
      {previewAlias && (
        <p className="font-mono text-[10px] text-text-muted">
          alias: <span className="text-primary">{previewAlias}</span>
        </p>
      )}

      <div className="flex items-center gap-1.5 justify-end pt-0.5">
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1 rounded border border-border text-[11px] text-text-muted hover:bg-surface-2 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-2.5 py-1 rounded border-2 border-primary bg-primary text-[11px] font-bold text-white hover:bg-primary-hover transition-colors shadow-[1.5px_1.5px_0px_var(--color-border)]"
        >
          Save
        </button>
      </div>
    </form>
  );
}

export default function ModelRow({
  model, fullModel, alias, copied, onCopy,
  testStatus, isCustom, isFree,
  onDeleteAlias, onTest, isTesting,
  onDisable, onEdit, providerAlias,
  caps, thinkingSuffix,
}) {
  const rawModel = thinkingSuffix ? `${fullModel}(${thinkingSuffix})` : fullModel;
  const displayName = model.name || alias || null;
  const displayModel = rawModel;
  const [editing, setEditing] = useState(false);

  const borderColor = testStatus === "ok"  ? "border-green-500/40"
    : testStatus === "error" ? "border-red-500/40"
    : "border-border";
  const iconColor = testStatus === "ok" ? "#22c55e"
    : testStatus === "error" ? "#ef4444"
    : undefined;

  return (
    <div className={`group w-full sm:w-auto min-w-0 max-w-full rounded-lg border px-3 py-2 ${borderColor} hover:bg-sidebar/50`}>
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <span
          className="material-symbols-outlined shrink-0 text-base mt-0.5 sm:mt-0"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Primary label: display name if set, else model path */}
          {displayName ? (
            <>
              <span className="w-fit max-w-full break-all text-xs font-semibold text-text-main sm:max-w-[360px] sm:truncate">
                {displayName}
              </span>
              <code className="w-fit max-w-full break-all rounded bg-sidebar px-1.5 py-0.5 font-mono text-[10px] text-text-muted/70 sm:max-w-[360px] sm:truncate">
                {displayModel}
              </code>
            </>
          ) : (
            <code className="w-fit max-w-full break-all rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-muted sm:max-w-[360px] sm:truncate">
              {displayModel}
            </code>
          )}
          <span className="flex min-w-0 items-center gap-1 pl-0.5">
            {isFree === true && (
              <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-bold text-green-500">
                FREE
              </span>
            )}
            {isFree === false && (
              <span className="rounded bg-sidebar px-1.5 py-0.5 text-[10px] font-bold text-text-muted/70">
                PAID
              </span>
            )}
            <CapacityBadges caps={caps} colorOverride="text-text-muted/70" size={12} />
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {/* Test */}
          {onTest && (
            <div className="relative shrink-0 group/btn">
              <button
                onClick={onTest}
                disabled={isTesting}
                className={`rounded p-0.5 text-text-muted transition-opacity hover:bg-sidebar hover:text-primary ${isTesting ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"}`}
              >
                <span className="material-symbols-outlined text-sm" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                  {isTesting ? "progress_activity" : "science"}
                </span>
              </button>
              <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {isTesting ? "Testing..." : "Test"}
              </span>
            </div>
          )}

          {/* Edit */}
          {onEdit && (
            <div className="relative shrink-0 group/btn">
              <button
                onClick={() => setEditing((v) => !v)}
                className={`rounded p-0.5 transition-colors hover:bg-sidebar opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${editing ? "text-primary" : "text-text-muted hover:text-primary"}`}
                title="Edit model"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
              </button>
              <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                Edit
              </span>
            </div>
          )}

          {/* Copy */}
          <div className="relative shrink-0 group/btn">
            <button
              onClick={() => onCopy(displayModel, `model-${model.id}`)}
              className="rounded p-0.5 text-text-muted hover:bg-sidebar hover:text-primary"
            >
              <span className="material-symbols-outlined text-sm">
                {copied === `model-${model.id}` ? "check" : "content_copy"}
              </span>
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {copied === `model-${model.id}` ? "Copied!" : "Copy"}
            </span>
          </div>

          {/* Delete / disable */}
          {isCustom ? (
            <button
              onClick={onDeleteAlias}
              className="rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              title="Remove"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          ) : onDisable ? (
            <button
              onClick={onDisable}
              className="rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
              title="Disable"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Edit popover — inline below row */}
      {editing && onEdit && (
        <EditPopover
          model={model}
          alias={alias}
          isCustom={!!isCustom}
          providerAlias={providerAlias}
          onClose={() => setEditing(false)}
          onSave={(vals) => {
            onEdit(vals);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  onDisable: PropTypes.func,
  onEdit: PropTypes.func,
  providerAlias: PropTypes.string,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
};
