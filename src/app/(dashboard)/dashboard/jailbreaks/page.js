"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import AntaresStat from "@/shared/components/AntaresStat";
import AntaresSegmented from "@/shared/components/AntaresSegmented";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import StarField from "@/shared/components/StarField";
import { translate } from "@/i18n/runtime";

const GITHUB_REPO = "https://github.com/togg53192-cmd/jailbreaks";

// Rows per page. Templates come from GitHub in the hundreds and assignments
// can cover many models, so both lists are sliced instead of fully rendered.
const TEMPLATE_PAGE_SIZE = 8;
const ASSIGNMENT_PAGE_SIZE = 6;

/** Slice `items` into the requested page and describe the pagination state. */
function paginate(items, page, size) {
  const list = items || [];
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page || 1), pageCount);
  const start = (current - 1) * size;
  return {
    page: current,
    pageCount,
    total: list.length,
    start,
    items: list.slice(start, start + size),
  };
}

/** Compact page-number list with ellipsis for long ranges. */
function pageNumbers(page, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages = new Set([1, pageCount, page]);
  if (page <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => pages.add(n));
  const sorted = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

function Pager({ page, pageCount, total, unit, onChange }) {
  if (pageCount <= 1) return null;

  return (
    <nav className="an-pagination" aria-label={translate("Pagination")}>
      <button
        type="button"
        className="an-page-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={translate("Previous")}
        title={translate("Previous")}
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </button>

      {pageNumbers(page, pageCount).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="an-page-gap">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={`an-page-btn ${n === page ? "active" : ""}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        )
      )}

      <button
        type="button"
        className="an-page-btn"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label={translate("Next")}
        title={translate("Next")}
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </button>

      <span className="an-page-info">
        <span>{page}</span>
        <span>/</span>
        <span>{pageCount}</span>
        <span>·</span>
        <span>{total}</span>
        <span>{translate(unit)}</span>
      </span>
    </nav>
  );
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({ jailbreakKey, entry, onToggle, onDelete, onExpand, expanded }) {
  const slashIdx = jailbreakKey.indexOf("/");
  const provider = slashIdx >= 0 ? jailbreakKey.slice(0, slashIdx) : jailbreakKey;
  const model = slashIdx >= 0 ? jailbreakKey.slice(slashIdx + 1) : "";
  const enabled = entry.enabled !== false;

  return (
    <div className={`jailbreak-item ${expanded ? "is-open" : ""}`}>
      <div className={`an-conn jailbreak-row ${enabled ? "" : "is-off"}`}>
        <div className="an-conn-main">
          <div className="an-conn-ico" aria-hidden>
            <span className="material-symbols-outlined">security</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="an-conn-chips !mt-0">
              <p className="an-conn-name">{provider}</p>
              {model ? <span className="an-chip">{model}</span> : null}
              <span className={`an-chip ${enabled ? "ok" : ""}`}>
                {enabled ? translate("Active") : translate("Inactive")}
              </span>
            </div>
            <p className="an-conn-sub mt-1 jailbreak-snippet" title={entry.text}>
              {entry.text}
            </p>
          </div>
        </div>
        <div className="an-conn-actions">
          <button
            type="button"
            onClick={() => onExpand(jailbreakKey)}
            title={translate(expanded ? "Collapse" : "Expand")}
            aria-label={translate(expanded ? "Collapse" : "Expand")}
            aria-expanded={expanded}
            className="an-conn-btn"
          >
            <span
              className="material-symbols-outlined"
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
            >
              expand_more
            </span>
          </button>
          <AntaresSwitch
            on={enabled}
            onChange={() => onToggle(jailbreakKey, entry)}
            label={enabled ? translate("On") : translate("Off")}
            title={enabled ? translate("Disable") : translate("Enable")}
            ariaLabel={`${translate(enabled ? "Disable" : "Enable")} ${jailbreakKey}`}
          />
          <button
            type="button"
            onClick={() => onDelete(jailbreakKey)}
            title={translate("Delete")}
            aria-label={translate("Delete")}
            className="an-conn-btn danger"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
      {expanded && (
        <pre className="jailbreak-pre">{entry.text}</pre>
      )}
    </div>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({ template, onPreview, onCopy, copiedPath, loadingPath }) {
  const isCopied = copiedPath === template.path;
  const isLoading = loadingPath === template.path;
  return (
    <div className="an-conn jailbreak-row">
      <div className="an-conn-main">
        <div className="an-conn-ico" aria-hidden>
          <span className="material-symbols-outlined">description</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="an-conn-name">{template.name}</p>
          <p className="an-conn-sub mt-1 jailbreak-template-sub">
            <span>{template.folder}</span>
            <span aria-hidden>·</span>
            <span>{template.size > 0 ? `${(template.size / 1024).toFixed(1)} KB` : translate("Empty")}</span>
          </p>
        </div>
      </div>
      <div className="an-conn-actions">
        <button
          type="button"
          onClick={() => onPreview(template)}
          disabled={!!loadingPath}
          className="an-btn an-ghost h-8 px-2.5 text-[11px] gap-1.5 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">preview</span>
          <span className="hidden sm:inline">{translate("Preview")}</span>
        </button>
        <button
          type="button"
          onClick={() => onCopy(template)}
          disabled={!!loadingPath}
          className="an-btn an-primary h-8 px-2.5 text-[11px] gap-1.5 disabled:opacity-50"
        >
          {isLoading
            ? <span className="material-symbols-outlined text-[14px]" style={{ animation: "spin 1s linear infinite" }}>progress_activity</span>
            : <span className="material-symbols-outlined text-[14px]">{isCopied ? "check" : "content_copy"}</span>
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
  const [page, setPage] = useState(1);
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingContent, setLoadingContent] = useState("");
  const [copiedPath, setCopiedPath] = useState("");
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    fetch("/api/jailbreaks")
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted.current) return;
        setTemplates(data.templates || []);
        setAssignments(data.assignments || {});
      })
      .catch(() => {})
      .finally(() => { if (isMounted.current) setLoading(false); });
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

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const pagedTemplates = paginate(filteredTemplates, page, TEMPLATE_PAGE_SIZE);

  const assignmentEntries = useMemo(() => Object.entries(assignments), [assignments]);
  const activeAssignments = useMemo(
    () => assignmentEntries.filter(([, entry]) => entry.enabled !== false).length,
    [assignmentEntries]
  );
  const filteredAssignments = useMemo(() => {
    if (assignmentFilter === "active") return assignmentEntries.filter(([, entry]) => entry.enabled !== false);
    if (assignmentFilter === "inactive") return assignmentEntries.filter(([, entry]) => entry.enabled === false);
    return assignmentEntries;
  }, [assignmentEntries, assignmentFilter]);
  const pagedAssignments = paginate(filteredAssignments, assignmentPage, ASSIGNMENT_PAGE_SIZE);

  const folderCount = useMemo(
    () => new Set(templates.map((t) => t.folder).filter(Boolean)).size,
    [templates]
  );

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(1);
  };

  const handleFilterChange = (next) => {
    setAssignmentFilter(next);
    setAssignmentPage(1);
    setExpandedKey(null);
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

  const steps = [
    {
      title: translate("Open a provider page"),
      body: translate("go to Dashboard → Provider, then click any provider (e.g. Yeta, OpenAI-compatible)."),
    },
    {
      title: translate("Find the Jailbreak card"),
      body: translate("it appears below the System Prompt card in the Models section."),
    },
    {
      title: translate("Select the model"),
      body: translate("choose which model to target. Only models in that provider are shown."),
    },
    {
      title: translate("Load a template or write your own"),
      body: translate('click "Browse templates", preview it, then click Load to fill the editor. You can also paste any text directly.'),
    },
    {
      title: translate("Save"),
      body: translate("click Save jailbreak. It will be injected on every request to that model."),
    },
  ];

  const guideId = "jailbreak-guide";

  return (
    <div className="an-scope an-shell jailbreaks-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="jailbreak-hero">
        <div className="min-w-0 flex-1">
          <p className="an-eyebrow">
            <span className="an-num">08</span>
            <span className="an-rule" />
            <span>{translate("RouterMod · AI Gateway")}</span>
          </p>
          <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
            {translate("Jailbreaks")}
          </h1>
          <p className="an-hint max-w-[70ch]">
            {translate("Assign community-sourced identity overrides to individual models. Each jailbreak is prepended to the system message before anything else, so your existing System Prompt is preserved and runs after it.")}
          </p>
        </div>
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noreferrer"
          className="an-btn an-ghost h-9 px-3 text-[11px] gap-1.5 shrink-0"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          {translate("GitHub repo")}
        </a>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid jailbreak-stats gap-2.5 sm:gap-3">
        <AntaresStat
          label={translate("Templates")}
          icon="dataset"
          tone="default"
          value={loading ? "—" : templates.length}
          foot={translate("templates available")}
        />
        <AntaresStat
          label={translate("Folders")}
          icon="folder"
          tone="violet"
          value={loading ? "—" : folderCount}
          foot={translate("folders in the repo")}
        />
        <AntaresStat
          label={translate("Assigned")}
          icon="dns"
          tone="default"
          value={assignmentEntries.length}
          foot={translate("models with a jailbreak")}
        />
        <AntaresStat
          label={translate("Active")}
          icon="toggle_on"
          tone="ok"
          value={activeAssignments}
          foot={translate("enabled assignments")}
        />
      </div>

      {/* ---- How to use ---- */}
      <section className="an-panel jailbreak-guide">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">school</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("How to use")}</h2>
            <p className="an-panel-sub">{translate("Step-by-step guide")}</p>
          </div>
          <div className="an-panel-actions">
            <button
              type="button"
              onClick={() => setShowGuide((prev) => !prev)}
              aria-expanded={showGuide}
              aria-controls={guideId}
              className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
            >
              <span className="material-symbols-outlined text-[15px]">
                {showGuide ? "expand_less" : "expand_more"}
              </span>
              {translate(showGuide ? "Hide guide" : "Show guide")}
            </button>
          </div>
        </header>

        {showGuide && (
          <div className="an-panel-pad" id={guideId}>
            <ol className="jailbreak-steps">
              {steps.map((step, index) => (
                <li key={step.title} className="jailbreak-step">
                  <span className="jailbreak-step-num" aria-hidden>{index + 1}</span>
                  <span className="min-w-0">
                    <strong>{step.title}</strong>
                    {" — "}
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>

            <div className="jailbreak-order">
              <p className="jailbreak-order-title">
                <span className="material-symbols-outlined text-[14px]">order_play</span>
                {translate("Injection order on every request:")}
              </p>
              <div className="jailbreak-order-chips">
                <span className="an-chip accent">1. {translate("Jailbreak")}</span>
                <span className="jailbreak-arrow" aria-hidden>→</span>
                <span className="an-chip">2. {translate("System Prompt")}</span>
                <span className="jailbreak-arrow" aria-hidden>→</span>
                <span className="an-chip">3. {translate("Global injections")}</span>
              </div>
              <p className="an-panel-sub">
                {translate("The System Prompt is never modified. Jailbreak only adds text in front of it.")}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ---- Active assignments ---- */}
      <section className="an-panel">
        <header className="an-panel-head an-panel-head-stack">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">check_circle</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Active assignments")}</h2>
            <p className="an-panel-sub">
              {filteredAssignments.length} {translate("of")} {assignmentEntries.length}{" "}
              {translate("assignments")} · {activeAssignments} {translate("active")}
            </p>
          </div>
          {assignmentEntries.length > 0 && (
            <div className="an-panel-actions">
              <AntaresSegmented
                size="sm"
                value={assignmentFilter}
                onChange={handleFilterChange}
                options={[
                  { value: "all", label: translate("All") },
                  { value: "active", label: translate("Active") },
                  { value: "inactive", label: translate("Inactive") },
                ]}
              />
            </div>
          )}
        </header>

        <div className="an-panel-pad">
          {assignmentEntries.length === 0 ? (
            <div className="an-empty">
              <span className="material-symbols-outlined">security</span>
              <p>{translate("No jailbreaks assigned yet.")}</p>
              <p className="text-[12px]">
                {translate("Open a provider page → Jailbreak card to assign one.")}
              </p>
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="an-empty">
              <span className="material-symbols-outlined">filter_alt_off</span>
              <p>{translate("No assignments match this filter.")}</p>
            </div>
          ) : (
            <>
              <div className="an-conn-list">
                {pagedAssignments.items.map(([key, entry]) => (
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
              <div className="jailbreak-list-foot">
                <span className="jailbreak-list-range">
                  {translate("Showing")} {pagedAssignments.start + 1}–
                  {Math.min(pagedAssignments.start + ASSIGNMENT_PAGE_SIZE, pagedAssignments.total)}{" "}
                  {translate("of")} {pagedAssignments.total}
                </span>
                <Pager
                  page={pagedAssignments.page}
                  pageCount={pagedAssignments.pageCount}
                  total={pagedAssignments.total}
                  unit="assignments"
                  onChange={setAssignmentPage}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---- Template library ---- */}
      <section className="an-panel">
        <header className="an-panel-head an-panel-head-stack">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">dataset</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate("Template library")}</h2>
            <p className="an-panel-sub">
              {translate("Community jailbreaks from GitHub")} · {filteredTemplates.length}{" "}
              {translate("templates")}
            </p>
          </div>
          <div className="an-panel-actions an-actions-wrap jailbreak-search-row">
            <div className="an-search jailbreak-search">
              <span className="material-symbols-outlined" aria-hidden>search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={translate("Search templates…")}
                aria-label={translate("Search templates…")}
                className="an-input"
              />
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              title={translate("Refresh")}
              aria-label={translate("Refresh")}
              className="an-btn an-ghost h-9 w-9 shrink-0 p-0 disabled:opacity-50"
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={loading ? { animation: "spin 1s linear infinite" } : undefined}
              >
                refresh
              </span>
            </button>
          </div>
        </header>

        <div className="an-panel-pad">
          {loading ? (
            <div className="an-empty">
              <span
                className="material-symbols-outlined"
                style={{ animation: "spin 1s linear infinite" }}
              >
                progress_activity
              </span>
              <p>{translate("Loading templates from GitHub...")}</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="an-empty">
              <span className="material-symbols-outlined">search_off</span>
              <p>
                {search
                  ? translate("No templates match your search.")
                  : translate("Could not load templates. Check your connection.")}
              </p>
            </div>
          ) : (
            <>
              <div className="an-conn-list">
                {pagedTemplates.items.map((template) => (
                  <TemplateRow
                    key={template.path}
                    template={template}
                    onPreview={handlePreview}
                    onCopy={handleCopy}
                    copiedPath={copiedPath}
                    loadingPath={loadingContent}
                  />
                ))}
              </div>
              <div className="jailbreak-list-foot">
                <span className="jailbreak-list-range">
                  {translate("Showing")} {pagedTemplates.start + 1}–
                  {Math.min(pagedTemplates.start + TEMPLATE_PAGE_SIZE, pagedTemplates.total)}{" "}
                  {translate("of")} {pagedTemplates.total}
                </span>
                <Pager
                  page={pagedTemplates.page}
                  pageCount={pagedTemplates.pageCount}
                  total={pagedTemplates.total}
                  unit="templates"
                  onChange={setPage}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---- Preview modal ---- */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="an-panel an-scope flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="an-panel-head">
              <span className="an-panel-ico" aria-hidden>
                <span className="material-symbols-outlined">security</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="an-panel-title truncate">{preview.template.name}</p>
                <p className="an-panel-sub">{preview.template.folder}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label={translate("Close")}
                className="an-conn-btn shrink-0"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-[var(--t-muted)]">
                {preview.content}
              </pre>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--t-line-soft)] px-5 py-4">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(preview.content).catch(() => {});
                  setCopiedPath(preview.template.path);
                  setTimeout(() => { if (isMounted.current) setCopiedPath(""); }, 2000);
                }}
                className="an-btn an-primary h-9 px-3 text-[11px] gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copiedPath === preview.template.path ? "check" : "content_copy"}
                </span>
                {copiedPath === preview.template.path ? translate("Copied!") : translate("Copy text")}
              </button>
              <span className="text-[11px] text-[var(--t-muted)]">
                {translate("Paste this into the Jailbreak card on a provider page.")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
