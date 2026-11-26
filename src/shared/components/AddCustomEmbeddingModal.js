"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Input, Button } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import { SurfaceSkinContext } from "@/shared/components/SurfaceSkinContext";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export default function AddCustomEmbeddingModal({ isOpen, onClose, onCreated, onSaved, node }) {
  const isEdit = !!node;
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    baseUrl: DEFAULT_BASE_URL,
    systemPrompt: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit) {
      setFormData({
        name: node.name || "",
        prefix: node.prefix || "",
        baseUrl: node.baseUrl || DEFAULT_BASE_URL,
        systemPrompt: node.systemPrompt || "",
      });
    } else {
      setFormData({ name: "", prefix: "", baseUrl: DEFAULT_BASE_URL, systemPrompt: "" });
    }
  }, [isOpen, isEdit, node]);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const url = isEdit ? `/api/provider-nodes/${node.id}` : "/api/provider-nodes";
      const method = isEdit ? "PUT" : "POST";
      const payload = {
        name: formData.name,
        prefix: formData.prefix,
        baseUrl: formData.baseUrl,
        systemPrompt: formData.systemPrompt || null,
      };
      if (!isEdit) payload.type = "custom-embedding";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        if (isEdit) onSaved?.(data.node);
        else onCreated?.(data.node);
      }
    } catch (error) {
      console.log("Error saving custom embedding node:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || submitting;

  return (
    <AntaresModal
      isOpen={isOpen}
      title={isEdit ? "Edit Custom Embedding" : "Add Custom Embedding"}
      subtitle={isEdit ? "Update the endpoint details for this embedding provider." : "Add an OpenAI-compatible embedding provider."}
      onClose={onClose}
      size="lg"
      hideScrollbar
      footer={
        <SurfaceSkinContext.Provider value="antares">
          <div className="flex w-full gap-2">
            <Button skin="antares" onClick={handleSubmit} fullWidth disabled={disabled}>
              {submitting ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save" : "Create")}
            </Button>
            <Button skin="antares" variant="ghost" onClick={onClose} fullWidth>Cancel</Button>
          </div>
        </SurfaceSkinContext.Provider>
      }
    >
      <SurfaceSkinContext.Provider value="antares">
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Voyage AI"
            hint="Required. A friendly label for this embedding provider."
          />
          <Input
            label="Prefix"
            value={formData.prefix}
            onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
            placeholder="voyage"
            hint="Required. Used as the provider prefix for model IDs (e.g. voyage/voyage-3)."
          />
          <Input
            label="Base URL"
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder="https://api.voyageai.com/v1"
            hint="Most embedding APIs are OpenAI-compatible: Voyage, Cohere, Jina, Mistral, Together..."
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--t-ink)]">System Prompt (Optional)</label>
            <textarea
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              placeholder="You are a devtalk AI created by Techwiz. Your model is named asolole"
              rows={3}
              className="w-full resize-none rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] px-3.5 py-2.5 text-[16px] text-[var(--t-ink)] placeholder:text-[var(--t-dim)] focus:border-[var(--t-accent)] focus:outline-none sm:text-sm"
            />
            <p className="text-xs text-[var(--t-muted)]">Injected into every request for this provider. Leave empty to use the default system prompt.</p>
          </div>
        </div>
      </SurfaceSkinContext.Provider>
    </AntaresModal>
  );
}

AddCustomEmbeddingModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func,
  onSaved: PropTypes.func,
  node: PropTypes.object,
};
