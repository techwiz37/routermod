"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";

export default function JailbreakCard({
  modelOptions = [],
  providerDisplayAlias = "",
  providerId = "",
}) {
  const [model, setModel] = useState("");
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [customText, setCustomText] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [fetchingContent, setFetchingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Load templates + assignments on mount
  useEffect(() => {
    setLoadingTemplates(true);
    fetch("/api/jailbreaks")
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted.current) return;
        setTemplates(data.templates || []);
        setAssignments(data.assignments || {});
      })
      .catch(() => {})
      .finally(() => { if (isMounted.current) setLoadingTemplates(false); });
  }, []);

  // Seed editor when model changes
  useEffect(() => {
    if (!model) { setCustomText(""); setSelectedTemplate(""); setDirty(false); return; }
    const key = `${providerId}/${model}`;
    const existing = assignments[key];
    if (existing) {
      setCustomText(existing.text || "");
      setSelectedTemplate("");
    } else {
      setCustomText("");
      setSelectedTemplate("");
    }
    setDirty(false);
  }, [model, assignments, providerId]);

  const handleTemplateChange = async (path) => {
    setSelectedTemplate(path);
    if (!path) return;
    setFetchingContent(true);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!isMounted.current) return;
      setCustomText(data.content || "");
      setDirty(true);
    } catch {
      // fail open
    } finally {
      if (isMounted.current) setFetchingContent(false);
    }
  };

  const handlePreview = async (path) => {
    if (!path) return;
    setFetchingContent(true);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!isMounted.current) return;
      setPreviewContent(data.content || "");
      setPreviewOpen(true);
    } catch {
      // fail open
    } finally {
      if (isMounted.current) setFetchingContent(false);
    }
  };

  const handleSave = async () => {
    if (!model || saving) return;
    setSaving(true);
    try {
      const key = `${providerId}/${model}`;
      const res = await fetch("/api/jailbreaks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: { [key]: customText.trim() ? { text: customText.trim(), enabled: true } : null },
        }),
      });
      const data = await res.json();
      if (!isMounted.current) return;
      if (res.ok) {
        setAssignments(data.assignments || {});
        setDirty(false);
      }
    } catch {
      // fail open
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!model) return;
    setSaving(true);
    try {
      const key = `${providerId}/${model}`;
      const res = await fetch("/api/jailbreaks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: { [key]: null } }),
      });
      const data = await res.json();
      if (!isMounted.current) return;
      if (res.ok) {
        setAssignments(data.assignments || {});
        setCustomText("");
        setSelectedTemplate("");
        setDirty(false);
      }
    } catch {
      // fail open
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  const currentKey = model ? `${providerId}/${model}` : null;
  const currentAssignment = currentKey ? assignments[currentKey] : null;
  const isActive = !!currentAssignment?.text;

  // Group templates by folder for the select
  const grouped = templates.reduce((acc, t) => {
    if (!acc[t.folder]) acc[t.folder] = [];
    acc[t.folder].push(t);
    return acc;
  }, {});

  return (
    <div className="an-panel an-scope mb-3">
      <div className="an-panel-pad">
        {/* Header */}
        <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined text-base">security</span>
            </span>
            <div className="min-w-0">
              <span className="an-panel-title block">{translate("Jailbreak")}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">
                {translate("Override model identity — injected before system prompt")}
              </span>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
            {translate("MODEL-SPECIFIC")}
          </span>
        </div>

        {/* Model picker */}
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor="jailbreak-model">
          {translate("Target model")}
        </label>
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary">
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
          </span>
          <select
            id="jailbreak-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="an-select system-prompt-select h-11 w-full font-mono text-xs"
          >
            <option value="">{translate("Choose a model to configure")}</option>
            {modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Template picker */}
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          {translate("Load template")}
          {loadingTemplates && (
            <span className="ml-2 inline-flex items-center gap-1 text-text-muted/60 normal-case">
              <span className="material-symbols-outlined text-[13px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
              {translate("Loading...")}
            </span>
          )}
        </label>
        <div className="relative mb-4 flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-muted">
              <span className="material-symbols-outlined text-[18px]">dataset</span>
            </span>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              disabled={!model || loadingTemplates || fetchingContent}
              className="an-select system-prompt-select h-11 w-full font-mono text-xs disabled:opacity-50"
            >
              <option value="">{translate("Select a jailbreak template...")}</option>
              {Object.entries(grouped).map(([folder, items]) => (
                <optgroup key={folder} label={folder}>
                  {items.map((t) => (
                    <option key={t.path} value={t.path}>{t.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => handlePreview(selectedTemplate)}
            disabled={!selectedTemplate || fetchingContent}
            title={translate("Preview template")}
            className="an-btn an-ghost h-11 px-3 shrink-0 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">
              {fetchingContent ? "progress_activity" : "preview"}
            </span>
          </button>
        </div>

        {/* Text editor */}
        <label className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          <span>{translate("Jailbreak instructions")}</span>
          <span className="font-normal normal-case tracking-normal text-text-muted/60">{customText.length} {translate("characters")}</span>
        </label>
        <textarea
          value={customText}
          onChange={(e) => { setCustomText(e.target.value); setDirty(true); }}
          placeholder={translate("Paste or write jailbreak instructions here. Applied before system prompt.")}
          rows={5}
          disabled={!model}
          className="an-input system-prompt-textarea min-h-[132px] w-full resize-y !rounded-xl !border-border/80 !bg-bg text-sm leading-6 placeholder:text-text-muted/45 focus:!border-primary/70 disabled:opacity-50"
        />

        {/* Active badge */}
        {isActive && !dirty && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-600">
            <span className="material-symbols-outlined text-[13px]">check_circle</span>
            {translate("Active")} — {currentAssignment.text.length} {translate("characters")}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!model || saving}
            className="an-btn an-primary h-9 rounded-[10px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span
              className="material-symbols-outlined text-[16px]"
              style={saving ? { animation: "spin 1s linear infinite" } : undefined}
            >
              {saving ? "progress_activity" : "save"}
            </span>
            {saving ? translate("Saving...") : translate("Save jailbreak")}
          </button>
          {isActive && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="an-btn an-ghost h-9 rounded-[10px] px-3 text-xs font-medium text-red-500 disabled:opacity-55"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              {translate("Clear")}
            </button>
          )}
          {dirty && (
            <span className="text-[11px] text-amber-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">edit</span>
              {translate("Unsaved changes")}
            </span>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="an-panel an-scope w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="an-panel-pad border-b border-border/60 flex items-center justify-between gap-2">
              <span className="font-semibold text-sm">{selectedTemplate.replace(/\.md$/i, "").split("/").pop()}</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="an-btn an-ghost h-8 w-8 p-0 shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="an-panel-pad overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-xs font-mono leading-5 text-text-muted">{previewContent}</pre>
            </div>
            <div className="an-panel-pad border-t border-border/60">
              <button
                type="button"
                onClick={() => { setCustomText(previewContent); setDirty(true); setPreviewOpen(false); }}
                className="an-btn an-primary h-9 px-3 text-xs"
              >
                <span className="material-symbols-outlined text-[16px]">south</span>
                {translate("Use this template")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

JailbreakCard.propTypes = {
  modelOptions: PropTypes.array,
  providerDisplayAlias: PropTypes.string,
  providerId: PropTypes.string,
};
