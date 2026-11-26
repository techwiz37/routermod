"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Modal, Select, Toggle } from "@/shared/components";
import { CAPACITY_META, STT_TRANSPORT_META, STT_TRANSPORTS } from "@/shared/constants/models";
import { translate, translateServerMessage } from "@/i18n/runtime";
import { testModel } from "@/shared/utils/testModel";
import { notifyModelTestSuccess } from "@/shared/utils/modelTestNotification";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities";
import { resolveProviderId } from "@/shared/constants/providers";

const defaultCaps = () => Object.fromEntries(Object.keys(CAPACITY_META).map((key) => [key, false]));

export default function AddCustomModelModal({ isOpen, providerAlias, providerDisplayAlias, onSave, onClose }) {
  const [modelId, setModelId] = useState("");
  const [caps, setCaps] = useState(defaultCaps);
  const [editedCaps, setEditedCaps] = useState({});
  const [modelType, setModelType] = useState("llm");
  const [testStatus, setTestStatus] = useState(null);
  const [testError, setTestError] = useState("");
  const [saving, setSaving] = useState(false);
  const [transport, setTransport] = useState("");

  useEffect(() => {
    if (isOpen) { setModelId(""); setCaps(defaultCaps()); setEditedCaps({}); setModelType("llm"); setTransport(""); setTestStatus(null); setTestError(""); }
  }, [isOpen]);

  useEffect(() => {
    const prefix = `${providerAlias}/`;
    const id = modelId.trim().startsWith(prefix) ? modelId.trim().slice(prefix.length) : modelId.trim();
    const inferred = getCapabilitiesForModel(resolveProviderId(providerAlias) || providerAlias, id);
    setCaps({ vision: inferred.vision === true, reasoning: inferred.reasoning === true, ...editedCaps });
  }, [modelId, providerAlias, editedCaps]);

  const stripAlias = (id) => {
    const prefix = `${providerAlias}/`;
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
  };

  const handleTest = async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId || testStatus === "testing") return;
    setTestStatus("testing");
    setTestError("");
    const model = `${providerAlias}/${cleanId}`;
    const data = await testModel(model, modelType);
    setTestStatus(data.ok ? "ok" : "error");
    setTestError(translateServerMessage(data.error) || "");
    if (data.ok) notifyModelTestSuccess(model, data.latencyMs);
  };

  const handleSave = async () => {
    const cleanId = stripAlias(modelId.trim());
    if (!cleanId || saving) return;
    setSaving(true);
    try {
      await onSave(cleanId, modelType, modelType === "llm" && Object.keys(editedCaps).length ? editedCaps : undefined, modelType === "stt" ? transport : null);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleTest();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={translate("Add Custom Model")}>
      <div className="flex flex-col gap-4">
        <Select
          label={translate("Model type")}
          value={modelType}
          options={[
            { value: "llm", label: translate("Chat / LLM") },
            { value: "stt", label: translate("Speech to text (STT)") },
          ]}
          onChange={(e) => {
            setModelType(e.target.value);
            setCaps(defaultCaps());
            setEditedCaps({});
            setTransport("");
            setTestStatus(null);
            setTestError("");
          }}
          disabled={saving || testStatus === "testing"}
          hint={modelType === "llm"
            ? translate("Chat models appear in this provider's Available Models.")
            : translate("Audio transcription models use /v1/audio/transcriptions.")}
        />
        <div>
          <label className="text-sm font-medium mb-1.5 block">{translate("Model ID")}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={modelId}
              disabled={testStatus === "testing"}
              onChange={(e) => { setModelId(e.target.value); setTestStatus(null); setTestError(""); }}
              onKeyDown={handleKeyDown}
              placeholder={translate("e.g. claude-opus-4-5")}
              className="min-w-0 flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              autoFocus
            />
            <button
              type="button"
              aria-label={`${translate(testStatus === "testing" ? "Testing..." : "Test model")} ${modelId.trim()}`}
              aria-busy={testStatus === "testing"}
              title={translate("Send a short prompt and wait up to 60 seconds for an answer.")}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleTest}
              disabled={!modelId.trim() || testStatus === "testing"}
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[18px]${testStatus === "testing" ? " animate-spin motion-reduce:animate-none" : ""}`}>
                {testStatus === "testing" ? "progress_activity" : "science"}
              </span>
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            {translate("Sent to provider as:")} <code className="font-mono bg-sidebar px-1 rounded">{stripAlias(modelId.trim()) || "model-id"}</code>
          </p>
        </div>

        {modelType === "llm" && (
        <div>
          <label className="text-sm font-medium mb-1.5 block">{translate("Capabilities")}</label>
          <div className="flex flex-wrap gap-4">
            {Object.entries(CAPACITY_META).map(([key, meta]) => (
              <Toggle
                key={key}
                checked={!!caps[key]}
                onChange={(v) => setEditedCaps((prev) => ({ ...prev, [key]: v }))}
                label={meta.label}
                description={meta.desc}
                size="sm"
              />
            ))}
          </div>
        </div>
        )}

        {modelType === "stt" && (
          <Select
            label={translate("Transport")}
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            placeholder={translate("Provider default (REST)")}
            options={STT_TRANSPORTS.map((t) => ({ value: t, label: STT_TRANSPORT_META[t].label }))}
            hint={translate("Realtime transport marker for the STT dispatcher. Empty keeps the provider's REST format.")}
          />
        )}

        {testStatus === "error" && (
          <div className="flex items-start gap-2 text-sm text-red-500">
            <span className="material-symbols-outlined text-base shrink-0">cancel</span>
             <span>{testError || translate("Model not reachable")}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
           <Button onClick={onClose} variant="ghost" fullWidth size="sm">{translate("Cancel")}</Button>
          <Button
            onClick={handleSave}
            fullWidth
            size="sm"
            disabled={!modelId.trim() || saving}
          >
             {saving ? translate("Adding...") : translate("Add Model")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

AddCustomModelModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  providerAlias: PropTypes.string.isRequired,
  providerDisplayAlias: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
