import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { CapacityBadges, VisionSelector, visionFromCaps } from "@/shared/components";
import { translate } from "@/i18n/runtime";
import ModelTestButton from "@/shared/components/ModelTestButton";
import ModelCapabilities from "@/shared/components/ModelCapabilities";

function EditPopover({ model, alias, isCustom, providerAlias, caps, capsEditable, onSave, onClose }) {
  // Support both old format (alias) and new format (custom ID with slash)
  const initCustomId = alias || `${providerAlias || ""}/${model.id}`;

  const [customId, setCustomId] = useState(initCustomId);
  const [originalId, setOriginalId] = useState(model.id);
  const [vision,   setVision]   = useState(visionFromCaps(caps));
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  // Parse customId to extract prefix and modelId for backward compatibility
  const customIdParts = customId.trim().split("/");
  const hasSlash = customIdParts.length > 1;
  const previewAlias = customId.trim();

  function handleSave(e) {
    e.preventDefault();
    if (!originalId.trim() || !previewAlias) return;
    const payload = { modelId: model.id, newId: originalId.trim(), name: hasSlash ? previewAlias : `${providerAlias}/${previewAlias}`, customId: hasSlash ? previewAlias : `${providerAlias}/${previewAlias}` };
    // Custom models store a caps override; only send a patch when the user
    // changed the selector. A `null` vision value removes the override.
    if (capsEditable && vision !== visionFromCaps(caps)) {
      payload.caps = { vision: vision === "yes" ? true : vision === "no" ? false : null };
    }
    onSave(payload);
  }

  return (
    <form
      onSubmit={handleSave}
      className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-border bg-surface p-3 shadow-[3px_3px_0px_var(--color-border)]"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{translate("Original ID")}</span>
        <input
          value={originalId}
          required
          onChange={(e) => setOriginalId(e.target.value)}
          className="min-h-11 rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
          placeholder={model.id}
        />
        <span className="text-[10px] text-text-muted mt-0.5">{translate("The model ID sent to the upstream provider.")}</span>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{translate("Custom ID")}</span>
        <input
          ref={firstRef}
          value={customId}
          required
          onChange={(e) => setCustomId(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
          placeholder={`${providerAlias || "model"}/${model.id} or custom/name`}
        />
        <span className="text-[10px] text-text-muted/60 mt-0.5">{translate("The ID used by the API. Can include alias (e.g. coa/gpt4) or just the name.")}</span>
      </label>

      {capsEditable && (
        <div className="rounded border border-border/60 bg-bg/40 p-2">
          <VisionSelector value={vision} onChange={setVision} hint={translate("Auto keeps the catalog default.")} />
        </div>
      )}
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
          {translate("Cancel")}
        </button>
        <button
          type="submit"
          className="px-2.5 py-1 rounded border-2 border-primary bg-primary text-[11px] font-bold text-white hover:bg-primary-hover transition-colors shadow-[1.5px_1.5px_0px_var(--color-border)]"
        >
          {translate("Save")}
        </button>
      </div>
    </form>
  );
}

export default function ModelRow({
  model, fullModel, alias, copied, onCopy,
  testStatus, isCustom, isFree,
  onDeleteAlias, onTest, isTesting, onRemoveTestedModel,
  onDisable, onEnable, onEdit, providerAlias,
  caps, capsEditable, thinkingSuffix, prefix, isDisabled, canonicalModel,
}) {
  const publicId = alias || fullModel;
  const rawModel = thinkingSuffix ? `${publicId}(${thinkingSuffix})` : publicId;
  const displayName = model.name || alias || null;
  const displayModel = rawModel;
  const modelPath = publicId;
  const [editing, setEditing] = useState(false);

  const borderColor = testStatus === "ok"  ? "border-green-500/40"
    : testStatus === "error" ? "border-red-500/40"
    : "border-border";
  const iconColor = testStatus === "ok" ? "#22c55e"
    : testStatus === "error" ? "#ef4444"
    : undefined;

  return (
    <div className={`group w-full sm:w-auto min-w-0 max-w-full rounded-lg border px-3 py-2 ${borderColor} hover:bg-sidebar/50 ${isDisabled ? 'opacity-50' : ''}`}>
      <div className="flex min-w-0 items-start gap-2">
        <span
          className="material-symbols-outlined shrink-0 text-base mt-0.5 sm:mt-0"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="w-full min-w-0 break-all text-xs font-semibold text-text-main">
            <span className="text-primary">#{prefix || "model"}</span>
            <span className="px-1 text-text-muted">-</span>
            {displayName || displayModel}
          </span>
          <code className="w-full min-w-0 break-all rounded bg-sidebar px-1.5 py-0.5 font-mono text-[10px] text-text-muted/70">
            {modelPath}
          </code>
          <span className="flex min-w-0 items-center gap-1 pl-0.5">
            {isDisabled && (
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
                DISABLED
              </span>
            )}
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
            <ModelCapabilities model={canonicalModel || fullModel} caps={caps} size={14} />
          </span>
        </div>

      </div>

      <div className="mt-2 flex min-h-7 flex-wrap items-center justify-end gap-1 border-t border-border/60 pt-1.5">
        <ModelTestButton model={fullModel} resultModel={canonicalModel || fullModel} disabled={isDisabled} hideControl={!onTest} onRemove={onRemoveTestedModel || onDeleteAlias} />
        <button onClick={() => onCopy(displayModel, `model-${model.id}`)} className="rounded p-1 text-text-muted hover:bg-sidebar hover:text-primary" title={copied === `model-${model.id}` ? translate("Copied!") : translate("Copy")}>
          <span className="material-symbols-outlined text-sm">
            {copied === `model-${model.id}` ? "check" : "content_copy"}
          </span>
        </button>
        {onEdit && !isDisabled && (
          <button
            onClick={() => setEditing((v) => !v)}
            className={`rounded p-1 ${editing ? "text-primary" : "text-text-muted hover:bg-sidebar hover:text-primary"}`}
            title={translate("Edit model")}
          >
              <span className="material-symbols-outlined text-sm">edit</span>
          </button>
        )}
        {isDisabled && onEnable ? (
          <button onClick={onEnable} className="rounded p-1 text-text-muted hover:bg-green-500/10 hover:text-green-500" title={translate("Enable")}>
            <span className="material-symbols-outlined text-sm">restart_alt</span>
          </button>
        ) : onDisable ? (
          <button onClick={onDisable} className="rounded p-1 text-text-muted hover:bg-orange-500/10 hover:text-orange-500" title={translate("Disable")}>
            <span className="material-symbols-outlined text-sm">block</span>
          </button>
        ) : null}
        {isCustom && (
          <button onClick={onDeleteAlias} className="rounded p-1 text-red-500 hover:bg-red-500/10" title={translate("Remove")}>
              <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        )}
      </div>

      {/* Edit popover — inline below row */}
      {editing && onEdit && (
        <EditPopover
          model={model}
          alias={alias}
          isCustom={!!isCustom}
          providerAlias={providerAlias}
          caps={caps}
          capsEditable={capsEditable}
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
  onEnable: PropTypes.func,
  onEdit: PropTypes.func,
  providerAlias: PropTypes.string,
  caps: PropTypes.object,
  capsEditable: PropTypes.bool,
  thinkingSuffix: PropTypes.string,
  prefix: PropTypes.string,
  isDisabled: PropTypes.bool,
};
