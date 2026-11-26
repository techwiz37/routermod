"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";
import AntaresPanel from "@/shared/components/AntaresPanel";
import Button from "@/shared/components/Button";

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

  const preview = `${prefixDraft ? prefixDraft + "/" : ""}<model-id>`;
  const dirty = !!prefixOverride && prefixDraft !== prefixOverride;

  return (
    <AntaresPanel
      icon="tag"
      title={translate("Global Model Prefix")}
      subtitle={translate("Sets the display prefix for all models in this provider.")}
      className="an-prefix-card"
    >
      <div className="an-prefix-body flex flex-col gap-3">
        <div className="an-prefix-preview flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-[var(--t-line-soft)] bg-[var(--t-field)] px-3 py-2.5">
          <span className="an-meta shrink-0">{translate("Models will appear as")}</span>
          <code className="an-prefix-code min-w-0 truncate font-mono text-[12px] text-[var(--t-accent)]" title={preview}>
            {preview}
          </code>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="an-global-prefix" className="an-field-label">
            {translate("Prefix")}
          </label>
          <div className="an-prefix-controls flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="an-global-prefix"
              type="text"
              value={prefixDraft}
              onChange={(e) => setPrefixDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
              placeholder={providerDisplayAlias}
              className="an-input an-prefix-input w-full min-w-0 sm:flex-1"
              title={translate("Set prefix for all models in this provider")}
            />
            <Button
              skin="antares"
              size="sm"
              icon="check"
              onClick={apply}
              disabled={!prefixDraft.trim() || prefixDraft.trim() === (prefixOverride || "") || savingPrefix}
              className="w-full shrink-0 sm:w-auto"
            >
              {savingPrefix ? translate("Saving...") : translate("Apply")}
            </Button>
          </div>
        </div>

        {dirty && (
          <p className="an-prefix-dirty text-[10px] text-[var(--t-star-ink)]">
            {translate("Unsaved change — current prefix is")} <code className="font-mono">{prefixOverride}</code>
          </p>
        )}
      </div>
    </AntaresPanel>
  );
}

GlobalPrefixCard.propTypes = {
  prefixOverride: PropTypes.string,
  providerDisplayAlias: PropTypes.string,
  onBulkPrefixChange: PropTypes.func,
};
