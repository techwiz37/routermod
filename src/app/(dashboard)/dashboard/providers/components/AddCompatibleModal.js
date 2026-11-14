"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Input, Select } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import { useNotificationStore } from "@/store/notificationStore";
import { onLocaleChange, getCurrentLocale, translate } from "@/i18n/runtime";

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
  const [checkKey, setCheckKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [, bumpLocale] = useState(0);

  useEffect(() => onLocaleChange(() => bumpLocale((value) => value + 1)), []);

  useEffect(() => {
    if (config.hasApiType) {
      setFormData((prev) => ({ ...prev, baseUrl: config.defaultBaseUrl }));
    } else if (isOpen) {
      setValidationResult(null);
      setCheckKey("");
    }
  }, [config.hasApiType ? formData.apiType : isOpen]);

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
        setCheckKey("");
        setValidationResult(null);
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

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-locale": getCurrentLocale() },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: config.type,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: translate("Network error") });
    } finally {
      setValidating(false);
    }
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;
    if (valid) {
      return (
        <>
          <Badge variant="success">{translate("Valid")}</Badge>
          {method === "chat" && (
            <span className="text-sm text-text-muted">(via inference test)</span>
          )}
        </>
      );
    }
    return (
      <div className="flex flex-col gap-1">
          <Badge variant="error">{translate("Invalid")}</Badge>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  };

  return (
    <AntaresModal
      isOpen={isOpen}
       title={translate(config.title)}
       subtitle={translate("Configure endpoint, model prefix, and connection validation.")}
      onClose={onClose}
      size="lg"
    >
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
          <Select
             label={translate("API Type")}
            options={API_TYPE_OPTIONS.map((o) => ({ ...o, label: translate(o.label) }))}
            value={formData.apiType}
            onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
            placeholder={translate("Select an option")}
          />
        )}
        <Input
           label={translate("Base URL")}
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder={config.defaultBaseUrl}
           hint={translate(config.baseUrlHint)}
        />
        <Input
           label={translate("API Key (for Check)")}
          type="password"
          value={checkKey}
          onChange={(e) => setCheckKey(e.target.value)}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            onClick={handleValidate}
            disabled={!checkKey || validating || !formData.baseUrl.trim()}
            variant="secondary"
            className="w-full sm:w-auto"
          >
             {validating ? translate("Checking...") : translate("Check")}
          </Button>
          {renderValidationResult()}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={
              !formData.name.trim() ||
              !formData.prefix.trim() ||
              !formData.baseUrl.trim() ||
              submitting
            }
          >
             {submitting ? translate("Creating...") : translate("Create")}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
             {translate("Cancel")}
          </Button>
        </div>
      </div>
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
