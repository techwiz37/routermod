"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { translate } from "@/i18n/runtime";

const GITHUB_REPO = "https://github.com/togg53192-cmd/jailbreaks";

function Badge({ children, color = "primary" }) {
  const cls =
    color === "green"
      ? "border-green-500/20 bg-green-500/10 text-green-600"
      : color === "amber"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
      : "border-primary/20 bg-primary/10 text-primary";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function TemplateCard({ template, onUse }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-raised p-4 hover:border-primary/40 transition-colors flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{template.name}</p>
          <p className="text-[11px] text-text-muted font-mono mt-0.5">{template.folder}</p>
        </div>
        <span className="shrink-0 text-[10px] text-text-muted font-mono">
          {template.size > 0 ? `${Math.round(template.size / 1024 * 10) / 10} KB` : ""}
        </span>
      </div>
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={() => onUse(template, "preview")}
          className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 flex-1"
        >
          <span className="material-symbols-outlined text-[13px]">preview</span>
          {translate("Preview")}
        </button>
        <button
          type="button"
          onClick={() => onUse(template, "copy")}
          className="an-btn an-primary h-8 px-3 text-[11px] gap-1.5 flex-1"
        >
          <span className="material-symbols-outlined text-[13px]">content_copy</span>
          {translate("Copy")}
        </button>
      </div>
    </div>
  );
}

function AssignmentRow({ jailbreakKey, entry, onToggle, onDelete }) {
  const [provider, ...rest] = jailbreakKey.split("/");
  const model = rest.join("/");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-raised px-4 py-3">
      <span className="material-symbols-outlined text-[18px] text-text-muted">security</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-mono font-semibold truncate">{jailbreakKey}</p>
        <p className="text-[11px] text-text-muted mt-0.5 truncate">{entry.text?.slice(0, 80)}{entry.text?.length > 80 ? "…" : ""}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge color={entry.enabled !== false ? "green" : "amber"}>
          {entry.enabled !== false ? translate("Active") : translate("Disabled")}
        </Badge>
        <button
          type="button"
          onClick={() => onToggle(jailbreakKey, entry)}
          title={entry.enabled !== false ? translate("Disable") : translate("Enable")}
          className="an-btn an-ghost h-8 w-8 p-0"
        >
          <span className="material-symbols-outlined text-[16px]">
            {entry.enabled !== false ? "toggle_on" : "toggle_off"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDelete(jailbreakKey)}
          title={translate("Delete")}
          className="an-btn an-ghost h-8 w-8 p-0 text-red-500"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    </div>
  );
}

export default function JailbreaksPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState(null); // { template, content }
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copied, setCopied] = useState("");
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
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.folder.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const grouped = useMemo(() =>
    filteredTemplates.reduce((acc, t) => {
      if (!acc[t.folder]) acc[t.folder] = [];
      acc[t.folder].push(t);
      return acc;
    }, {}),
    [filteredTemplates]
  );

  const handleUse = async (template, action) => {
    if (action === "copy") {
      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(template.path)}`);
        const data = await res.json();
        await navigator.clipboard.writeText(data.content || "");
        setCopied(template.path);
        setTimeout(() => { if (isMounted.current) setCopied(""); }, 2000);
      } catch {}
      finally { if (isMounted.current) setPreviewLoading(false); }
      return;
    }
    // preview
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/jailbreaks?content=${encodeURIComponent(template.path)}`);
      const data = await res.json();
      if (!isMounted.current) return;
      setPreview({ template, content: data.content || "" });
    } catch {}
    finally { if (isMounted.current) setPreviewLoading(false); }
  };

  const handleToggle = async (key, entry) => {
    const res = await fetch("/api/jailbreaks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignments: { [key]: { ...entry, enabled: entry.enabled === false } },
      }),
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
    if (isMounted.current && res.ok) setAssignments(data.assignments || {});
  };

  const assignmentEntries = Object.entries(assignments);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-[26px] text-primary">security</span>
            {translate("Jailbreaks")}
          </h1>
          <p className="mt-1 text-sm text-text-muted max-w-xl">
            {translate("Override model identity using community-sourced system prompts. Active jailbreaks are injected before the system prompt on every request.")}
          </p>
        </div>
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noreferrer"
          className="an-btn an-ghost h-9 px-3 text-xs gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[15px]">open_in_new</span>
          {translate("Source repo")}
        </a>
      </div>

      {/* Active assignments */}
      {assignmentEntries.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-green-500">check_circle</span>
            {translate("Active assignments")}
            <Badge color="green">{assignmentEntries.length}</Badge>
          </h2>
          <div className="space-y-2">
            {assignmentEntries.map(([key, entry]) => (
              <AssignmentRow
                key={key}
                jailbreakKey={key}
                entry={entry}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] text-text-muted">
            {translate("To assign a jailbreak to a model, open the provider page and use the Jailbreak card.")}
          </p>
        </section>
      )}

      {/* Template library */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">dataset</span>
            {translate("Template library")}
            {!loading && <Badge>{templates.length}</Badge>}
          </h2>
          <div className="relative w-64">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <span className="material-symbols-outlined text-[16px]">search</span>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={translate("Search templates...")}
              className="an-input h-9 w-full pl-8 text-xs"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-8 justify-center">
            <span className="material-symbols-outlined text-[20px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
            {translate("Loading templates from GitHub...")}
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-2xl border border-border/60 p-8 text-center text-sm text-text-muted">
            {translate("Could not load templates. Check your internet connection.")}
            <button type="button" onClick={load} className="an-btn an-ghost h-8 px-3 text-xs mt-3 mx-auto block">
              {translate("Retry")}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([folder, items]) => (
              <div key={folder}>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted mb-2">{folder}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((t) => (
                    <TemplateCard
                      key={t.path}
                      template={t}
                      onUse={handleUse}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preview modal */}
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
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{preview.template.name}</p>
                <p className="text-[11px] text-text-muted font-mono">{preview.template.folder}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="an-btn an-ghost h-8 w-8 p-0 shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="an-panel-pad overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-xs font-mono leading-5 text-text-muted">{preview.content}</pre>
            </div>
            <div className="an-panel-pad border-t border-border/60 flex gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(preview.content);
                  setCopied(preview.template.path);
                  setTimeout(() => { if (isMounted.current) setCopied(""); }, 2000);
                }}
                className="an-btn an-ghost h-9 px-3 text-xs gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {copied === preview.template.path ? "check" : "content_copy"}
                </span>
                {copied === preview.template.path ? translate("Copied!") : translate("Copy")}
              </button>
              <span className="text-[11px] text-text-muted self-center">
                {translate("Go to a provider page → Jailbreak card to assign this to a model.")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay for copy */}
      {previewLoading && !preview && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-raised border border-border/60 shadow-xl px-4 py-3 text-sm">
          <span className="material-symbols-outlined text-[18px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
          {translate("Loading...")}
        </div>
      )}
    </div>
  );
}
