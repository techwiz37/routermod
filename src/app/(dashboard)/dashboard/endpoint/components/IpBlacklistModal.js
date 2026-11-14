"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import { translate, translateServerMessage } from "@/i18n/runtime";
import { parseIpBlacklistInput } from "@/shared/utils/ipBlacklist.js";

function BlacklistForm({ apiKey, onSaved, onClose }) {
  const [text, setText] = useState(() => (apiKey.ipBlacklist || []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { valid, invalid } = parseIpBlacklistInput(text);

  const save = async () => {
    if (invalid.length) {
      setError(`${translate("Invalid IP")}: ${invalid.slice(0, 10).join(", ")}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/keys/${apiKey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipBlacklist: valid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(translateServerMessage(data.error) || translate("Failed to save IP blacklist"));
      onSaved(data.key);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-sm font-medium" htmlFor="ip-blacklist-input">{translate("Blocked IP list")}</label>
        <p className="text-xs text-[var(--t-muted)] mt-1">
          {translate("Separate each IP with a comma or a new line. Supports IPv4, IPv6 and IPv4 CIDR ranges (e.g. 10.0.0.0/24). Requests from these IPs using this API key will be rejected.")}
        </p>
        <textarea
          id="ip-blacklist-input"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(""); }}
          rows={8}
          spellCheck={false}
          placeholder={"203.0.113.10, 198.51.100.7\n192.168.1.0/24"}
          className="mt-2 w-full rounded-lg border border-[var(--t-line)] bg-[var(--t-raised)] p-3 font-mono text-xs text-[var(--t-ink)] outline-none focus:border-[var(--t-accent)] resize-y"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
          <span className="text-[var(--t-muted)]">{valid.length} {translate("valid IPs")}</span>
          {invalid.length > 0 && (
            <span className="text-[var(--t-danger)] truncate" title={invalid.join(", ")}>
              {invalid.length} {translate("invalid")}: {invalid.slice(0, 3).join(", ")}{invalid.length > 3 ? "…" : ""}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--t-danger)]/40 bg-[var(--t-danger)]/10 p-3 text-xs text-[var(--t-danger)]">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button skin="antares" onClick={save} loading={saving} fullWidth>{translate("Save")}</Button>
        <Button skin="antares" variant="ghost" onClick={onClose} disabled={saving} fullWidth>{translate("Cancel")}</Button>
      </div>
    </div>
  );
}

BlacklistForm.propTypes = {
  apiKey: PropTypes.object.isRequired,
  onSaved: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default function IpBlacklistModal({ apiKey, onSaved, onClose }) {
  return (
    <AntaresModal
      isOpen={!!apiKey}
      title={translate("IP Blacklist")}
      subtitle={apiKey ? apiKey.name : ""}
      onClose={onClose}
    >
      {apiKey && <BlacklistForm key={apiKey.id} apiKey={apiKey} onSaved={onSaved} onClose={onClose} />}
    </AntaresModal>
  );
}

IpBlacklistModal.propTypes = {
  apiKey: PropTypes.object,
  onSaved: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
