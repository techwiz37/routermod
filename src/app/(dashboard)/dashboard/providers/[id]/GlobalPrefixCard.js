"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";

export default function GlobalPrefixCard({ prefixOverride, providerDisplayAlias, onBulkPrefixChange }) {
  const [prefixDraft, setPrefixDraft] = useState(prefixOverride || "");
  const [savingPrefix, setSavingPrefix] = useState(false);

  useEffect(() => {
    setPrefixDraft(prefixOverride || "");
  }, [prefixOverride]);

  if (!onBulkPrefixChange) return null;

  const apply = async () => {
    if (!prefixDraft.trim() || savingPrefix || prefixDraft.trim() === (prefixOverride || "")) return;
    setSavingPrefix(true);
    try {
      await onBulkPrefixChange(prefixDraft.trim());
    } finally {
      setSavingPrefix(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-border bg-surface p-4 shadow-[3px_3px_0px_var(--color-border)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-primary">tag</span>
        <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{translate("Global Model Prefix")}</span>
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        {translate("Sets the display prefix for all models in this provider. Models will appear as")}{" "}
        <code className="font-mono text-primary">{prefixDraft ? prefixDraft + "/" : ""}&lt;model-id&gt;</code>.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={prefixDraft}
          onChange={(e) => setPrefixDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
          placeholder={providerDisplayAlias}
          className="flex-1 rounded border border-border bg-bg px-2.5 py-1.5 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
          title={translate("Set prefix for all models in this provider")}
        />
        <button
          type="button"
          onClick={apply}
          disabled={!prefixDraft.trim() || prefixDraft.trim() === (prefixOverride || "") || savingPrefix}
          className="shrink-0 rounded border-2 border-primary bg-primary px-3 py-1.5 text-[11px] font-bold text-white shadow-[1.5px_1.5px_0px_var(--color-border)] transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {savingPrefix ? translate("Saving...") : translate("Apply")}
        </button>
      </div>
      {prefixOverride && prefixDraft !== prefixOverride && (
        <p className="mt-2 text-[10px] text-warning">
          {translate("Unsaved change — current prefix is")} <code className="font-mono">{prefixOverride}</code>
        </p>
      )}
    </div>
  );
}

GlobalPrefixCard.propTypes = {
  prefixOverride: PropTypes.string,
  providerDisplayAlias: PropTypes.string,
  onBulkPrefixChange: PropTypes.func,
};
