"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Input } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresSelect from "@/shared/components/AntaresSelect";
import { SurfaceSkinContext } from "@/shared/components/SurfaceSkinContext";
import { useNotificationStore } from "@/store/notificationStore";
import { getCurrentLocale, translate } from "@/i18n/runtime";

const VARIANT_CONFIG = {
  openai: {
    title: "Add OpenAI Compatible",
    type: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    namePlaceholder: "OpenAI Compatible (Prod)",
    prefixPlaceholder: "oc-prod",
    baseUrlHint: "Use the base URL (ending in /v1) for your OpenAI-compatible API.",
    errorLabel: "OpenAI Compatible",
    hasApiType: true,
  },
  anthropic: {
    title: "Add Anthropic Compatible",
    type: "anthropic-compatible",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    namePlaceholder: "Anthropic Compatible (Prod)",
    prefixPlaceholder: "ac-prod",
    baseUrlHint: "Use the base URL (ending in /v1) for your Anthropic-compatible API. The system will append /messages.",
    errorLabel: "Anthropic Compatible",
    hasApiType: false,
  },
};

const API_TYPE_OPTIONS = [
  { value: "chat", label: "Chat Completions" },
  { value: "responses", label: "Responses API" },
];

function AddCompatibleModal({ variant, isOpen, onClose, onCreated }) {
  const config = VARIANT_CONFIG[variant];
  const notify = useNotificationStore();
  const initialFormData = () => ({
    name: "",
    prefix: "",
    ...(config.hasApiType ? { apiType: "chat" } : {}),
    baseUrl: config.defaultBaseUrl,
  });

  const [formData, setFormData] = useState(initialFormData);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-locale": getCurrentLocale() },
        body: JSON.stringify({
          name: formData.name,
          prefix: formData.prefix,
          ...(config.hasApiType ? { apiType: formData.apiType } : {}),
          baseUrl: formData.baseUrl,
          type: config.type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onCreated(data.node);
        window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
        try {
          localStorage.setItem("routermod:providers-changed", String(Date.now()));
        } catch {}
        setFormData(initialFormData());
        notify.success(
          translate("{name} was created successfully.").replace("{name}", formData.name),
          translate("Provider created")
        );
      } else {
        notify.error(
          data?.error || translate("We could not create the provider. Please try again."),
          translate("Failed to create provider")
        );
      }
    } catch (error) {
      console.log(`Error creating ${config.errorLabel} node:`, error);
      notify.error(
        translate("There is a network problem. Check the URL and try again."),
        translate("Failed to create provider")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim() || submitting;

  return (
    <AntaresModal
      isOpen={isOpen}
      title={translate(config.title)}
      subtitle={translate("Configure endpoint details and model prefix for this provider.")}
      onClose={onClose}
      size="lg"
      hideScrollbar
      footer={
        <SurfaceSkinContext.Provider value="antares">
          <div className="flex w-full gap-2">
            <Button skin="antares" onClick={handleSubmit} fullWidth disabled={disabled}>
              {submitting ? translate("Creating...") : translate("Create")}
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
            placeholder={config.namePlaceholder}
            hint={translate("Required. A friendly label for this node.")}
          />
          <Input
            label={translate("Prefix")}
            value={formData.prefix}
            onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
            placeholder={config.prefixPlaceholder}
            hint={translate("Required. Used as the provider prefix for model IDs.")}
          />
          {config.hasApiType && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--t-ink)]">{translate("API Type")}</label>
              <AntaresSelect
                value={formData.apiType}
                onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
                ariaLabel={translate("API Type")}
                buttonClassName="h-[42px]"
                options={API_TYPE_OPTIONS.map((o) => ({ ...o, label: translate(o.label) }))}
              />
            </div>
          )}
          <Input
            label={translate("Base URL")}
            value={formData.baseUrl}
            onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
            placeholder={config.defaultBaseUrl}
            hint={translate(config.baseUrlHint)}
          />
        </div>
      </SurfaceSkinContext.Provider>
    </AntaresModal>
  );
}

AddCompatibleModal.propTypes = {
  variant: PropTypes.oneOf(["openai", "anthropic"]).isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

export default AddCompatibleModal;
