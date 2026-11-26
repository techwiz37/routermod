"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Button, Input } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresSelect from "@/shared/components/AntaresSelect";
import { SurfaceSkinContext } from "@/shared/components/SurfaceSkinContext";
import { translate } from "@/i18n/runtime";

export default function EditCompatibleNodeModal({ isOpen, node, onSave, onClose, isAnthropic }) {
  const [formData, setFormData] = useState({
    name: "",
    prefix: "",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (node) {
      setFormData({
        name: node.name || "",
        prefix: node.prefix || "",
        apiType: node.apiType || "chat",
        baseUrl: node.baseUrl || (isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"),
      });
    }
  }, [node, isAnthropic]);

  const apiTypeOptions = [
    { value: "chat", label: translate("Chat Completions") },
    { value: "responses", label: translate("Responses API") },
  ];

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        prefix: formData.prefix,
        baseUrl: formData.baseUrl,
      };
      if (!isAnthropic) {
        payload.apiType = formData.apiType;
      }
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  if (!node) return null;

  const disabled = !formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || saving;

  return (
    <AntaresModal
      isOpen={isOpen}
      title={`Edit ${node?.name || (isAnthropic ? "Anthropic" : "OpenAI")}${node?.name ? `: ${node.name}` : " Compatible"}`}
      subtitle={translate("Update endpoint details for this provider connection.")}
      onClose={onClose}
      size="lg"
      hideScrollbar
      footer={
        <SurfaceSkinContext.Provider value="antares">
          <div className="flex w-full gap-2">
            <Button skin="antares" onClick={handleSubmit} fullWidth disabled={disabled}>
              {saving ? translate("Saving...") : translate("Save")}
            </Button>
            <Button skin="antares" variant="ghost" onClick={onClose} fullWidth>
              {translate("Cancel")}
            </Button>
          </div>
        </SurfaceSkinContext.Provider>
      }
    >
      <SurfaceSkinContext.Provider value="antares">
        <div className="flex flex-col gap-4">
          <Input
            label={translate("Name")}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={`${isAnthropic ? "Anthropic" : "OpenAI"} Compatible (Prod)`}
            hint={translate("Required. A friendly label for this node.")}
          />
          <Input
            label={translate("Prefix")}
            value={formData.prefix}
            onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
            placeholder={isAnthropic ? "ac-prod" : "oc-prod"}
            hint={translate("Required. Used as the provider prefix for model IDs.")}
          />
          {!isAnthropic && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--t-ink)]">{translate("API Type")}</label>
              <AntaresSelect
                value={formData.apiType}
                onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
                ariaLabel={translate("API Type")}
                buttonClassName="h-[42px]"
                options={apiTypeOptions}
              />
            </div>
          )}
          <Input
            label={translate("Base URL")}
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder={isAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"}
            hint={translate("Use the base URL (ending in /v1) for your compatible API.")}
          />
        </div>
      </SurfaceSkinContext.Provider>
    </AntaresModal>
  );
}

EditCompatibleNodeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  node: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    prefix: PropTypes.string,
    apiType: PropTypes.string,
    baseUrl: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  isAnthropic: PropTypes.bool,
};
