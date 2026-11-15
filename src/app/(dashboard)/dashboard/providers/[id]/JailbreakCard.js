"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";

const PAGE_SIZE = 5;

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
  const [previewTitle, setPreviewTitle] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePage, setTemplatePage] = useState(0);
  const [showTemplateList, setShowTemplateList] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

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
    setCustomText(existing?.text || "");
    setSelectedTemplate("");
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, providerId]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.toLowerCase().trim();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q)
    );
  }, [templates, templateSearch]);

  const totalPages = Math.ceil(filteredTemplates.length / PAGE_SIZE);
  const pagedTemplates = filteredTemplates.slice(
    templatePage * PAGE_SIZE,
    (templatePage + 1) * PAGE_SIZE
  );

  const handleSearchChange = (val) => {
    setTemplateSearch(val);
    setTemplatePage(0);
  };

  const handleLoadTemplate = async (tmpl) => {
    setSelectedTemplate(tmpl.path);
    setShowTemplateList(false);
    setFetchingContent(true);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(tmpl.path)}`);
      const data = await res.json();
      if (!isMounted.current) return;
      setCustomText(data.content || "");
      setDirty(true);
    } catch { /* fail open */ }
    finally { if (isMounted.current) setFetchingContent(false); }
  };

  const handlePreview = async (tmpl) => {
    if (!tmpl) return;
    setFetchingContent(true);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(tmpl.path)}`);
      const data = await res.json();
      if (!isMounted.current) return;
      setPreviewContent(data.content || "");
      setPreviewTitle(tmpl.name);
      setPreviewOpen(true);
    } catch { /* fail open */ }
    finally { if (isMounted.current) setFetchingContent(false); }
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
      if (res.ok) { setAssignments(data.assignments || {}); setDirty(false); }
    } catch { /* fail open */ }
    finally { if (isMounted.current) setSaving(false); }
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
        setCustomText(""); setSelectedTemplate(""); setDirty(false);
      }
    } catch { /* fail open */ }
    finally { if (isMounted.current) setSaving(false); }
  };

  const currentKey = model ? `${providerId}/${model}` : null;
  const currentAssignment = currentKey ? assignments[currentKey] : null;
  const isActive = !!currentAssignment?.text;
  const selectedTmpl = selectedTemplate
    ? templates.find((t) => t.path === selectedTemplate)
    : null;

  return (
    <div className="an-panel an-scope mb-3">
      <div className="an-panel-pad">

        {/* ── Header ── */}
        <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined text-base">security</span>
            </span>
            <div className="min-w-0">
              <span className="an-panel-title block">{translate("Jailbreak")}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">
                {translate("Injected before system prompt to override model identity")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isActive && (
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-[10px] font-semibold text-green-600">
                ● {translate("ACTIVE")}
              </span>
            )}
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
              {translate("MODEL-SPECIFIC")}
            </span>
          </div>
        </div>

        {/* ── How it works ── */}
        <details className="mb-4 group rounded-xl border border-border/60 bg-bg/50">
          <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted hover:text-text-base">
            <span className="material-symbols-outlined text-[14px]">help_outline</span>
            {translate("How to use")}
            <span className="material-symbols-outlined text-[13px] ml-auto transition-transform group-open:rotate-180">expand_more</span>
          </summary>
          <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-1.5 text-[11px] text-text-muted leading-5">
            <p className="flex gap-2"><span className="shrink-0 font-semibold text-primary">1.</span>{translate("Select the model you want to apply a jailbreak to.")}</p>
            <p className="flex gap-2"><span className="shrink-0 font-semibold text-primary">2.</span>{translate("Load a community template from the list below, or write your own instructions.")}</p>
            <p className="flex gap-2"><span className="shrink-0 font-semibold text-primary">3.</span>{translate("Click Preview to read the full template before loading it.")}</p>
            <p className="flex gap-2"><span className="shrink-0 font-semibold text-primary">4.</span>{translate("Click Save. The jailbreak is prepended to the system message on every request to that model.")}</p>
            <p className="flex gap-2"><span className="shrink-0 font-semibold text-primary">5.</span>{translate("Your existing System Prompt is not changed — it still runs after the jailbreak.")}</p>
            <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-2.5 py-1.5 text-[10px] text-amber-600">
              <span className="font-semibold">{translate("Injection order:")} </span>
              {translate("Jailbreak → Provider system prompt → Global injections")}
            </div>
          </div>
        </details>

        {/* ── Model picker ── */}
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

        {/* ── Template browser ── */}
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          {translate("Community templates")}
          {loadingTemplates && (
            <span className="ml-2 inline-flex items-center gap-1 text-text-muted/60 normal-case font-normal">
              <span className="material-symbols-outlined text-[13px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
              {translate("Loading...")}
            </span>
          )}
        </label>

        {/* Template toggle button */}
        <button
          type="button"
          disabled={!model || loadingTemplates}
          onClick={() => setShowTemplateList((v) => !v)}
          className="an-btn an-ghost h-9 w-full mb-3 justify-between text-xs disabled:opacity-40"
        >
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[15px]">dataset</span>
            {selectedTmpl ? selectedTmpl.name : translate("Browse templates...")}
          </span>
          <span className="flex items-center gap-1.5 text-text-muted">
            {!loadingTemplates && <span className="font-mono text-[10px]">{templates.length}</span>}
            <span className="material-symbols-outlined text-[15px]" style={{ transform: showTemplateList ? "rotate(180deg)" : undefined }}>
              expand_more
            </span>
          </span>
        </button>

        {/* Template list panel */}
        {showTemplateList && (
          <div className="mb-4 rounded-xl border border-border/70 bg-bg overflow-hidden">
            {/* Search */}
            <div className="border-b border-border/50 px-3 py-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
                  <span className="material-symbols-outlined text-[14px]">search</span>
                </span>
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={translate("Search by name or category...")}
                  className="an-input h-8 w-full pl-7 text-xs !rounded-lg"
                  autoFocus
                />
              </div>
            </div>

            {/* Items */}
            <div className="divide-y divide-border/40">
              {pagedTemplates.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-text-muted">{translate("No templates found.")}</p>
              ) : pagedTemplates.map((t) => (
                <div key={t.path} className="flex items-center gap-2 px-3 py-2 hover:bg-raised/60 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                    <p className="text-[10px] text-text-muted font-mono">{t.folder}</p>
                  </div>
                  {t.size > 0 && (
                    <span className="shrink-0 text-[10px] text-text-muted font-mono">
                      {Math.round(t.size / 1024 * 10) / 10}KB
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePreview(t)}
                    disabled={fetchingContent}
                    title={translate("Preview")}
                    className="an-btn an-ghost h-7 w-7 p-0 shrink-0 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[14px]">preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(t)}
                    disabled={fetchingContent}
                    className="an-btn an-primary h-7 px-2 text-[10px] shrink-0 disabled:opacity-40"
                  >
                    {fetchingContent && selectedTemplate === t.path
                      ? <span className="material-symbols-outlined text-[13px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
                      : translate("Load")}
                  </button>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-border/50 flex items-center justify-between px-3 py-2">
                <button
                  type="button"
                  disabled={templatePage === 0}
                  onClick={() => setTemplatePage((p) => p - 1)}
                  className="an-btn an-ghost h-7 px-2 text-[10px] disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[13px]">chevron_left</span>
                  {translate("Prev")}
                </button>
                <span className="text-[10px] text-text-muted font-mono">
                  {templatePage + 1} / {totalPages}
                  <span className="ml-1 text-text-muted/60">({filteredTemplates.length})</span>
                </span>
                <button
                  type="button"
                  disabled={templatePage >= totalPages - 1}
                  onClick={() => setTemplatePage((p) => p + 1)}
                  className="an-btn an-ghost h-7 px-2 text-[10px] disabled:opacity-40"
                >
                  {translate("Next")}
                  <span className="material-symbols-outlined text-[13px]">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Text editor ── */}
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

        {/* Status line */}
        {model && (
          <div className="mt-2 flex items-center gap-2">
            {isActive && !dirty && (
              <span className="text-[11px] text-green-600 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                {translate("Active")} · {currentAssignment.text.length} {translate("characters")}
              </span>
            )}
            {dirty && (
              <span className="text-[11px] text-amber-500 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">edit</span>
                {translate("Unsaved changes")}
              </span>
            )}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!model || saving}
            className="an-btn an-primary h-9 rounded-[10px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined text-[16px]" style={saving ? { animation: "spin 1s linear infinite" } : undefined}>
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
        </div>
      </div>

      {/* ── Preview modal ── */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="an-panel an-scope w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="an-panel-pad border-b border-border/60 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary shrink-0">security</span>
                <span className="font-semibold text-sm truncate">{previewTitle}</span>
              </div>
              <button type="button" onClick={() => setPreviewOpen(false)} className="an-btn an-ghost h-8 w-8 p-0 shrink-0">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="an-panel-pad overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-xs font-mono leading-5 text-text-muted">{previewContent}</pre>
            </div>
            <div className="an-panel-pad border-t border-border/60 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setCustomText(previewContent); setDirty(true); setPreviewOpen(false); }}
                className="an-btn an-primary h-9 px-3 text-xs gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">south</span>
                {translate("Use this template")}
              </button>
              <span className="text-[11px] text-text-muted">{translate("Select a model first, then save.")}</span>
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
