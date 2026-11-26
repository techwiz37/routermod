"use client";

import { useCallback, useEffect, useId, useRef, useState, useMemo } from "react";
import AntaresSelect from "@/shared/components/AntaresSelect";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { translate } from "@/i18n/runtime";
import { readJailbreakMarkdown } from "@/shared/utils/jailbreakMarkdown";

const PAGE_SIZE = 5;
// Keep the existing panel styling, but resolve its surfaces/text in the active theme.
const PANEL_THEME = {
  "--t-bg": "var(--color-bg)",
  "--t-card": "var(--color-surface)",
  "--t-raised": "var(--color-surface-2)",
  "--t-field": "var(--color-bg)",
  "--t-line": "var(--color-border)",
  "--t-ink": "var(--color-text-main)",
  "--t-muted": "var(--color-text-muted)",
  "--t-dim": "var(--color-text-muted)",
};

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
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [fetchingContent, setFetchingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePage, setTemplatePage] = useState(0);
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [error, setError] = useState("");
  const [templatesError, setTemplatesError] = useState("");
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);
  const editorVersion = useRef(0);
  const fieldId = useId();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const loadTemplates = useCallback(() => fetch("/api/jailbreaks")
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load templates. Try again.");
      return data;
    })
    .then((data) => {
      if (!isMounted.current) return;
      setTemplates(data.templates || []);
      setAssignments(data.assignments || {});
      setTemplatesError(data.templatesWarning || "");
    })
    .catch(() => {
      if (isMounted.current) setTemplatesError("Could not load templates. Try again or upload a .md file.");
    })
    .finally(() => { if (isMounted.current) setLoadingTemplates(false); }), []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    if (previewOpen) previewRef.current?.showModal();
  }, [previewOpen]);

  const handleModelChange = (value) => {
    editorVersion.current += 1;
    setModel(value);
    setSourceName("");
    setError("");
    setPreviewOpen(false);
    const existing = value ? assignments[`${providerId}/${value}`] : null;
    setCustomText(existing?.text || "");
    setSelectedTemplate("");
    setDirty(false);
  };

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
    const version = ++editorVersion.current;
    setError("");
    setFetchingContent(true);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(tmpl.path)}`);
      const data = await res.json();
      if (!res.ok || typeof data.content !== "string" || !data.content.trim()) throw new Error("Could not load this template. Try again.");
      if (!isMounted.current || version !== editorVersion.current) return;
      setCustomText(data.content);
      setSelectedTemplate(tmpl.path);
      setSourceName(tmpl.name);
      setShowTemplateList(false);
      setDirty(true);
    } catch {
      if (isMounted.current && version === editorVersion.current) setError("Could not load this template. Your draft has not changed.");
    }
    finally { if (isMounted.current) setFetchingContent(false); }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // Allow selecting the same file again after editing it.
    if (!file || !model) return;
    const version = ++editorVersion.current;
    setReadingFile(true);
    setError("");
    try {
      const text = await readJailbreakMarkdown(file);
      if (!isMounted.current || version !== editorVersion.current) return;
      setCustomText(text);
      setSelectedTemplate("");
      setSourceName(file.name);
      setShowTemplateList(false);
      setDirty(true);
    } catch (err) {
      if (isMounted.current && version === editorVersion.current) setError(err.message || "Could not read the Markdown file. Try again.");
    } finally {
      if (isMounted.current) setReadingFile(false);
    }
  };

  const handlePreview = async (tmpl) => {
    if (!tmpl) return;
    const version = ++editorVersion.current;
    setError("");
    setFetchingContent(true);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(tmpl.path)}`);
      const data = await res.json();
      if (!res.ok || typeof data.content !== "string" || !data.content.trim()) throw new Error("Could not preview this template.");
      if (!isMounted.current || version !== editorVersion.current) return;
      setPreviewContent(data.content);
      setPreviewTitle(tmpl.name);
      setPreviewOpen(true);
    } catch {
      if (isMounted.current && version === editorVersion.current) setError("Could not preview this template. Try again.");
    }
    finally { if (isMounted.current) setFetchingContent(false); }
  };

  const handleSave = async () => {
    if (!model || saving || fetchingContent || readingFile) return;
    setSaving(true);
    setError("");
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
      if (!res.ok) throw new Error("Could not save jailbreak. Try again.");
      if (!isMounted.current) return;
      if (res.ok) { setAssignments(data.assignments || {}); setDirty(false); }
    } catch {
      if (isMounted.current) setError("Could not save jailbreak. Your draft has been kept; try again.");
    }
    finally { if (isMounted.current) setSaving(false); }
  };

  const handleClear = async () => {
    if (!model || saving || fetchingContent || readingFile) return;
    setSaving(true);
    setError("");
    try {
      const key = `${providerId}/${model}`;
      const res = await fetch("/api/jailbreaks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: { [key]: null } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Could not clear jailbreak. Try again.");
      if (!isMounted.current) return;
      if (res.ok) {
        setAssignments(data.assignments || {});
        setCustomText(""); setSelectedTemplate(""); setSourceName(""); setDirty(false);
      }
    } catch {
      if (isMounted.current) setError("Could not clear jailbreak. Try again.");
    }
    finally { if (isMounted.current) setSaving(false); }
  };

  const currentKey = model ? `${providerId}/${model}` : null;
  const currentAssignment = currentKey ? assignments[currentKey] : null;
  const isActive = !!currentAssignment?.text;

  return (
    <div className="an-panel an-scope mb-3" style={PANEL_THEME}>
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
            <p className="flex gap-2"><span className="shrink-0 font-semibold text-primary">2.</span>{translate("Browse community templates, upload a .md file, or write your own instructions.")}</p>
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
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor={`${fieldId}-model`}>
          {translate("Target model")}
        </label>
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary">
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
          </span>
          <AntaresSelect
            id={`${fieldId}-model`}
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={loadingTemplates || saving || fetchingContent || readingFile}
            ariaLabel={translate("Target model")}
            buttonClassName="h-11 pl-10 font-mono"
            options={[
              { value: "", label: translate("Choose a model to configure") },
              ...modelOptions.map((opt) => ({ value: opt.value, label: opt.label })),
            ]}
          />
        </div>

        {/* ── Template browser ── */}
        <p className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          {translate("Instruction source")}
          {loadingTemplates && (
            <span className="ml-2 inline-flex items-center gap-1 text-text-muted/60 normal-case font-normal">
              <span className="material-symbols-outlined text-[13px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
              {translate("Loading...")}
            </span>
          )}
        </p>

        {/* Template toggle button */}
        <div className="mb-2 grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <button
          type="button"
          disabled={!model || loadingTemplates || saving || fetchingContent || readingFile}
          onClick={() => setShowTemplateList((v) => !v)}
          aria-label={translate("Browse templates")}
          aria-expanded={showTemplateList}
          aria-controls={`${fieldId}-templates`}
          className="an-btn an-ghost min-h-11 min-w-0 w-full justify-between px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">folder_open</span>
            <span>{translate("Browse templates")}</span>
          </span>
          <span className="flex items-center gap-1.5 text-text-muted">
            {!loadingTemplates && <span className="font-mono text-[10px]">{templates.length}</span>}
            <span className="material-symbols-outlined text-[15px]" style={{ transform: showTemplateList ? "rotate(180deg)" : undefined }}>
              expand_more
            </span>
          </span>
        </button>
        <button
          type="button"
          disabled={!model || saving || fetchingContent || readingFile}
          onClick={() => fileInputRef.current?.click()}
          className="an-btn an-ghost min-h-11 min-w-0 w-full justify-center gap-2 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">upload_file</span>
          {readingFile ? translate("Reading file...") : translate("Upload .md")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          aria-label={translate("Upload Markdown file")}
          onChange={handleUpload}
          hidden
        />
        </div>
        <p className="mb-3 text-xs leading-5 text-text-muted">
          {model
            ? translate("Templates and .md files replace the draft below. Review it, then save. Maximum file size: 1 MB.")
            : translate("Choose a target model to browse templates or upload a .md file.")}
        </p>
        {sourceName && (
          <p role="status" className="mb-3 break-words text-xs text-text-base">
            {translate("Loaded:")} {sourceName}
          </p>
        )}
        {error && <p role="alert" className="mb-3 text-sm text-text-base">{translate(error)}</p>}

        {/* Template list panel */}
        {showTemplateList && (
          <div id={`${fieldId}-templates`} className="mb-4 rounded-xl border border-border/70 bg-bg overflow-hidden">
            {templatesError && (
              <div className="border-b border-border/50 px-3 py-2">
                <p role="alert" className="text-xs leading-5 text-text-base">{translate(templatesError)}</p>
                <button type="button" onClick={() => { setLoadingTemplates(true); setTemplatesError(""); loadTemplates(); }} disabled={loadingTemplates} className="an-btn an-ghost mt-2 min-h-11 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                  {loadingTemplates ? translate("Loading...") : translate("Retry templates")}
                </button>
              </div>
            )}
            {/* Search */}
            <div className="border-b border-border/50 px-3 py-2">
              <label htmlFor={`${fieldId}-search`} className="mb-1 block text-xs text-text-muted">{translate("Search templates")}</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
                  <span className="material-symbols-outlined text-[14px]">search</span>
                </span>
                <input
                  id={`${fieldId}-search`}
                  type="text"
                  value={templateSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={translate("Search by name or category...")}
                  className="an-input min-h-11 w-full pl-7 text-xs !rounded-lg"
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
                    <p className="break-words text-[10px] text-text-muted font-mono">{t.folder}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePreview(t)}
                    disabled={fetchingContent}
                    title={translate("Preview")}
                    aria-label={`${translate("Preview")} ${t.name}`}
                    className="an-btn an-ghost min-h-11 w-11 p-0 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[14px]">preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(t)}
                    disabled={fetchingContent}
                    className="an-btn an-primary min-h-11 px-3 text-xs shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="an-btn an-ghost min-h-11 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
            <span aria-hidden="true" className="material-symbols-outlined text-[13px]">chevron_left</span>
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
                  className="an-btn an-ghost min-h-11 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {translate("Next")}
                  <span aria-hidden="true" className="material-symbols-outlined text-[13px]">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Text editor ── */}
        <label htmlFor={`${fieldId}-instructions`} className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          <span>{translate("Jailbreak instructions")}</span>
          <span className="font-normal normal-case tracking-normal text-text-muted">{customText.length} {translate("characters")}</span>
        </label>
        <textarea
          id={`${fieldId}-instructions`}
          value={customText}
          onChange={(e) => { setCustomText(e.target.value); setDirty(true); }}
          placeholder={translate("Paste or write jailbreak instructions here. Applied before system prompt.")}
          rows={5}
          disabled={!model || saving || fetchingContent || readingFile}
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
            disabled={!model || saving || fetchingContent || readingFile}
            className="an-btn an-primary min-h-11 rounded-[10px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]" style={saving ? { animation: "spin 1s linear infinite" } : undefined}>
              {saving ? "progress_activity" : "save"}
            </span>
            {saving ? translate("Saving...") : translate("Save jailbreak")}
          </button>
          {isActive && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving || fetchingContent || readingFile}
              className="an-btn an-ghost min-h-11 rounded-[10px] px-3 text-xs font-medium text-red-500 disabled:cursor-not-allowed disabled:opacity-55"
            >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">delete</span>
              {translate("Clear")}
            </button>
          )}
        </div>
      </div>

      {/* ── Preview modal ── */}
      {previewOpen && createPortal(
        <dialog
          ref={previewRef}
          aria-labelledby={`${fieldId}-preview-title`}
          onCancel={() => setPreviewOpen(false)}
          onClose={() => setPreviewOpen(false)}
          className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl rounded-xl border border-border bg-bg p-0 text-text-base backdrop:bg-black/60"
          onClick={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}
        >
          <div
            className="an-panel an-scope w-full max-h-[85dvh] overflow-hidden flex flex-col"
            style={PANEL_THEME}
          >
            <div className="an-panel-pad border-b border-border/60 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary shrink-0">security</span>
                <span id={`${fieldId}-preview-title`} className="font-semibold text-sm truncate">{previewTitle}</span>
              </div>
              <button type="button" aria-label={translate("Close preview")} onClick={() => setPreviewOpen(false)} className="an-btn an-ghost min-h-11 w-11 p-0 shrink-0">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="an-panel-pad overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-5 text-text-muted">{previewContent}</pre>
            </div>
            <div className="an-panel-pad border-t border-border/60 flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!model}
                onClick={() => { setCustomText(previewContent); setSelectedTemplate(""); setSourceName(previewTitle); setDirty(true); setPreviewOpen(false); setShowTemplateList(false); }}
                className="an-btn an-primary min-h-11 px-3 text-xs gap-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">south</span>
                {translate("Use this template")}
              </button>
              <span className="text-[11px] text-text-muted">{translate("Select a model first, then save.")}</span>
            </div>
          </div>
        </dialog>, document.body
      )}
    </div>
  );
}

JailbreakCard.propTypes = {
  modelOptions: PropTypes.array,
  providerDisplayAlias: PropTypes.string,
  providerId: PropTypes.string,
};
