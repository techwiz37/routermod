"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { translate } from "@/i18n/runtime";

const GITHUB_REPO = "https://github.com/togg53192-cmd/jailbreaks";
const PAGE_SIZE = 5;

// ── Reusable atoms ───────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-600">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {translate("Active")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-bg px-2 py-0.5 text-[10px] font-semibold text-text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-text-muted/40" />
      {translate("Disabled")}
    </span>
  );
}

function CountBadge({ count }) {
  return (
    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
      {count}
    </span>
  );
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({ jailbreakKey, entry, onToggle, onDelete, onExpand, expanded }) {
  const slashIdx = jailbreakKey.indexOf("/");
  const provider = slashIdx >= 0 ? jailbreakKey.slice(0, slashIdx) : jailbreakKey;
  const model = slashIdx >= 0 ? jailbreakKey.slice(slashIdx + 1) : "";

  return (
    <div className="rounded-xl border border-border/60 bg-raised overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="material-symbols-outlined text-[18px] text-primary shrink-0">security</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-semibold text-text-base">{provider}</span>
            <span className="text-text-muted/50 text-xs">/</span>
            <span className="text-xs font-mono text-text-muted">{model}</span>
            <StatusBadge active={entry.enabled !== false} />
          </div>
          <p className="text-[11px] text-text-muted mt-0.5 truncate">
            {entry.text?.slice(0, 90)}{entry.text?.length > 90 ? "…" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onExpand(jailbreakKey)}
            title={translate("Expand")}
            className="an-btn an-ghost h-8 w-8 p-0"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ transform: expanded ? "rotate(180deg)" : undefined }}>
              expand_more
            </span>
          </button>
          <button
            type="button"
            onClick={() => onToggle(jailbreakKey, entry)}
            title={entry.enabled !== false ? translate("Disable") : translate("Enable")}
            className="an-btn an-ghost h-8 w-8 p-0"
          >
            <span className={`material-symbols-outlined text-[20px] ${entry.enabled !== false ? "text-primary" : "text-text-muted/50"}`}>
              {entry.enabled !== false ? "toggle_on" : "toggle_off"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(jailbreakKey)}
            title={translate("Delete")}
            className="an-btn an-ghost h-8 w-8 p-0 text-red-500"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border/40 bg-bg px-4 py-3">
          <pre className="whitespace-pre-wrap text-[11px] font-mono leading-5 text-text-muted max-h-48 overflow-y-auto">
            {entry.text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({ template, onPreview, onCopy, copiedPath, loadingPath }) {
  const isCopied = copiedPath === template.path;
  const isLoading = loadingPath === template.path;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-raised/60 transition-colors">
      <span className="material-symbols-outlined text-[16px] text-text-muted/60 shrink-0">description</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{template.name}</p>
        <p className="text-[10px] text-text-muted font-mono mt-0.5">{template.folder}</p>
      </div>
      {template.size > 0 && (
        <span className="shrink-0 text-[10px] text-text-muted/60 font-mono hidden sm:block">
          {(template.size / 1024).toFixed(1)}KB
        </span>
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onPreview(template)}
          disabled={!!loadingPath}
          className="an-btn an-ghost h-8 px-2.5 text-[11px] gap-1 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[13px]">preview</span>
          <span className="hidden sm:inline">{translate("Preview")}</span>
        </button>
        <button
          type="button"
          onClick={() => onCopy(template)}
          disabled={!!loadingPath}
          className="an-btn an-primary h-8 px-2.5 text-[11px] gap-1 disabled:opacity-50"
        >
          {isLoading
            ? <span className="material-symbols-outlined text-[13px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
            : <span className="material-symbols-outlined text-[13px]">{isCopied ? "check" : "content_copy"}</span>
          }
          <span className="hidden sm:inline">{isCopied ? translate("Copied!") : translate("Copy")}</span>
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function JailbreaksPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingContent, setLoadingContent] = useState("");
  const [copiedPath, setCopiedPath] = useState("");
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const load = () => {
    setLoading(true);
    fetch("/api/jailbreaks")
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted.current) return;
        setTemplates(data.templates || []);
        setAssignments(data.assignments || {});
      })
      .catch(() => {})
      .finally(() => { if (isMounted.current) setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const totalPages = Math.ceil(filteredTemplates.length / PAGE_SIZE);
  const pagedTemplates = filteredTemplates.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(0);
  };

  const fetchContent = async (path) => {
    setLoadingContent(path);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(path)}`);
      const data = await res.json();
      return data.content || "";
    } catch { return ""; }
    finally { if (isMounted.current) setLoadingContent(""); }
  };

  const handlePreview = async (template) => {
    const content = await fetchContent(template.path);
    if (!isMounted.current) return;
    setPreview({ template, content });
  };

  const handleCopy = async (template) => {
    const content = await fetchContent(template.path);
    if (!isMounted.current) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedPath(template.path);
      setTimeout(() => { if (isMounted.current) setCopiedPath(""); }, 2000);
    } catch { /* fail open */ }
  };

  const handleToggle = async (key, entry) => {
    const res = await fetch("/api/jailbreaks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: { [key]: { ...entry, enabled: entry.enabled === false } } }),
    });
    const data = await res.json();
    if (isMounted.current && res.ok) setAssignments(data.assignments || {});
  };

  const handleDelete = async (key) => {
    const res = await fetch("/api/jailbreaks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: { [key]: null } }),
    });
    const data = await res.json();
    if (isMounted.current && res.ok) {
      setAssignments(data.assignments || {});
      if (expandedKey === key) setExpandedKey(null);
    }
  };

  const handleExpand = (key) => setExpandedKey((prev) => (prev === key ? null : key));

  const assignmentEntries = Object.entries(assignments);

  // group templates by folder for display
  const grouped = useMemo(() =>
    pagedTemplates.reduce((acc, t) => {
      if (!acc[t.folder]) acc[t.folder] = [];
      acc[t.folder].push(t);
      return acc;
    }, {}),
    [pagedTemplates]
  );

  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-primary">security</span>
            {translate("Jailbreaks")}
          </h1>
          <p className="mt-1 text-xs text-text-muted max-w-lg leading-5">
            {translate("Assign community-sourced identity overrides to individual models. Each jailbreak is prepended to the system message before anything else, so your existing System Prompt is preserved and runs after it.")}
          </p>
        </div>
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noreferrer"
          className="an-btn an-ghost h-9 px-3 text-xs gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          {translate("GitHub repo")}
        </a>
      </div>

      {/* ── Tutorial card ── */}
      <div className="an-panel an-scope">
        <div className="an-panel-pad">
          <div className="mb-3 flex items-center gap-2">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined text-base">school</span>
            </span>
            <div>
              <span className="an-panel-title block">{translate("How to use")}</span>
              <span className="text-[11px] text-text-muted">{translate("Step-by-step guide")}</span>
            </div>
          </div>

          <ol className="space-y-3 text-xs leading-5 text-text-muted">
            <li className="flex gap-3">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">1</span>
              <span>
                <strong className="text-text-base">{translate("Open a provider page")}</strong>
                {" — "}{translate("go to Dashboard → Provider, then click any provider (e.g. Yeta, OpenAI-compatible).")}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">2</span>
              <span>
                <strong className="text-text-base">{translate("Find the Jailbreak card")}</strong>
                {" — "}{translate("it appears below the System Prompt card in the Models section.")}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">3</span>
              <span>
                <strong className="text-text-base">{translate("Select the model")}</strong>
                {" — "}{translate("choose which model to target. Only models in that provider are shown.")}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">4</span>
              <span>
                <strong className="text-text-base">{translate("Load a template or write your own")}</strong>
                {" — "}{translate('click "Browse templates", preview it, then click Load to fill the editor. You can also paste any text directly.')}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">5</span>
              <span>
                <strong className="text-text-base">{translate("Save")}</strong>
                {" — "}{translate("click Save jailbreak. It will be injected on every request to that model.")}
              </span>
            </li>
          </ol>

          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px]">order_play</span>
              {translate("Injection order on every request:")}
            </p>
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
              <span className="rounded-md bg-primary/15 px-2 py-0.5 text-primary">1. Jailbreak</span>
              <span className="text-text-muted/50">→</span>
              <span className="rounded-md bg-raised px-2 py-0.5 text-text-muted border border-border/60">2. System Prompt</span>
              <span className="text-text-muted/50">→</span>
              <span className="rounded-md bg-raised px-2 py-0.5 text-text-muted border border-border/60">3. Global injections</span>
            </div>
            <p className="text-[11px] text-text-muted">
              {translate("The System Prompt is never modified. Jailbreak only adds text in front of it.")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Active assignments ── */}
      <section className="an-panel an-scope">
        <div className="an-panel-pad border-b border-border/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined text-base">check_circle</span>
            </span>
            <div>
              <span className="an-panel-title block">{translate("Active assignments")}</span>
              <span className="text-[11px] text-text-muted">{translate("Jailbreaks currently assigned to models")}</span>
            </div>
          </div>
          {assignmentEntries.length > 0 && <CountBadge count={assignmentEntries.length} />}
        </div>
        <div className="an-panel-pad">
          {assignmentEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="material-symbols-outlined text-[36px] text-text-muted/30">security</span>
              <p className="text-sm text-text-muted">{translate("No jailbreaks assigned yet.")}</p>
              <p className="text-xs text-text-muted/70">
                {translate("Open a provider page → Jailbreak card to assign one.")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {assignmentEntries.map(([key, entry]) => (
                <AssignmentRow
                  key={key}
                  jailbreakKey={key}
                  entry={entry}
                  expanded={expandedKey === key}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onExpand={handleExpand}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Template library ── */}
      <section className="an-panel an-scope">
        <div className="an-panel-pad border-b border-border/40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="an-panel-ico" aria-hidden>
                <span className="material-symbols-outlined text-base">dataset</span>
              </span>
              <div>
                <span className="an-panel-title block">{translate("Template library")}</span>
                <span className="text-[11px] text-text-muted">
                  {translate("Community jailbreaks from GitHub")}
                  {!loading && templates.length > 0 && (
                    <span className="ml-1.5">
                      <CountBadge count={templates.length} />
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
                  <span className="material-symbols-outlined text-[13px]">search</span>
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={translate("Search...")}
                  className="an-input h-8 w-full pl-7 pr-2 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                title={translate("Refresh")}
                className="an-btn an-ghost h-8 w-8 p-0 shrink-0 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]" style={loading ? { animation: "spin 1s linear infinite" } : undefined}>
                  refresh
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Template rows */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
            <span className="material-symbols-outlined text-[20px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
            {translate("Loading templates from GitHub...")}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="py-10 text-center text-sm text-text-muted">
            {search ? translate("No templates match your search.") : translate("Could not load templates. Check your connection.")}
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {Object.entries(grouped).map(([folder, items]) => (
                <div key={folder}>
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted/60">{folder}</span>
                  </div>
                  {items.map((t) => (
                    <TemplateRow
                      key={t.path}
                      template={t}
                      onPreview={handlePreview}
                      onCopy={handleCopy}
                      copiedPath={copiedPath}
                      loadingPath={loadingContent}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-border/40 flex items-center justify-between px-4 py-3">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="an-btn an-ghost h-8 px-3 text-xs gap-1 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                  {translate("Previous")}
                </button>
                <div className="text-xs text-text-muted font-mono">
                  {translate("Page")} {page + 1} / {totalPages}
                  <span className="ml-2 text-text-muted/50">({filteredTemplates.length} {translate("total")})</span>
                </div>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="an-btn an-ghost h-8 px-3 text-xs gap-1 disabled:opacity-40"
                >
                  {translate("Next")}
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Preview modal ── */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="an-panel an-scope w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="an-panel-pad border-b border-border/60 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary shrink-0">security</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{preview.template.name}</p>
                  <p className="text-[10px] text-text-muted font-mono">{preview.template.folder}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="an-btn an-ghost h-8 w-8 p-0 shrink-0">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="an-panel-pad overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-xs font-mono leading-5 text-text-muted">{preview.content}</pre>
            </div>
            <div className="an-panel-pad border-t border-border/60 flex items-center gap-3 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(preview.content).catch(() => {});
                  setCopiedPath(preview.template.path);
                  setTimeout(() => { if (isMounted.current) setCopiedPath(""); }, 2000);
                }}
                className="an-btn an-primary h-9 px-3 text-xs gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copiedPath === preview.template.path ? "check" : "content_copy"}
                </span>
                {copiedPath === preview.template.path ? translate("Copied!") : translate("Copy text")}
              </button>
              <span className="text-[11px] text-text-muted">
                {translate("Paste this into the Jailbreak card on a provider page.")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
