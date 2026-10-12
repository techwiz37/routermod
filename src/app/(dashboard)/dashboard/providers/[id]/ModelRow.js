import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { CapacityBadges } from "@/shared/components";

export default function ModelRow({
  model, fullModel, alias, copied, onCopy,
  testStatus, isCustom, isFree,
  onDeleteAlias, onTest, isTesting, onDisable, onRename,
  caps, thinkingSuffix,
}) {
  const displayModel = thinkingSuffix ? `${fullModel}(${thinkingSuffix})` : fullModel;
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef(null);

  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok" ? "#22c55e"
    : testStatus === "error" ? "#ef4444"
    : undefined;

  function startEdit() {
    setDraftName(model.name || model.id);
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitEdit() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== (model.name || model.id) && onRename) {
      onRename(trimmed);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  return (
    <div className={`group w-full sm:w-auto min-w-0 max-w-full rounded-lg border px-3 py-2 ${borderColor} hover:bg-sidebar/50`}>
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <span
          className="material-symbols-outlined shrink-0 text-base mt-0.5 sm:mt-0"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <code className="w-fit max-w-full break-all rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-muted sm:max-w-[360px] sm:truncate">
            {displayModel}
          </code>

          {/* Name row — inline edit or static */}
          {editing ? (
            <div className="flex items-center gap-1 pl-1">
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="min-w-0 flex-1 rounded border border-primary/60 bg-bg px-1.5 py-0.5 font-mono text-[11px] text-text-main outline-none focus:ring-1 focus:ring-primary/40"
                placeholder="Display name"
              />
              <button
                onClick={commitEdit}
                className="rounded p-0.5 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                title="Save"
              >
                <span className="material-symbols-outlined text-[13px]">check</span>
              </button>
              <button
                onClick={cancelEdit}
                className="rounded p-0.5 text-text-muted hover:bg-sidebar transition-colors"
                title="Cancel"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            </div>
          ) : (
            <span className="flex min-w-0 items-center text-[9px] gap-1 pl-1">
              {model.name && (
                <span className="break-all sm:truncate text-[9px] italic text-text-muted/70">{model.name}</span>
              )}
              <CapacityBadges caps={caps} colorOverride="text-text-muted/70" size={12} />
            </span>
          )}
        </div>

        {/* Action buttons */}
        {!editing && (
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

            {/* Rename / edit name */}
            {onRename && (
              <div className="relative shrink-0 group/btn">
                <button
                  onClick={startEdit}
                  className="rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-sidebar hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
                  title="Edit display name"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
                <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                  Rename
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
                title="Remove custom model"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            ) : onDisable ? (
              <button
                onClick={onDisable}
                className="rounded p-0.5 text-text-muted opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                title="Disable this model"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            ) : null}
          </div>
        )}
      </div>
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
  onRename: PropTypes.func,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
};
