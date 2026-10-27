"use client";

import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "./MarkdownText";
import { translate } from "@/i18n/runtime";

const MAX_ATTACH_FILES = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Gagal membaca ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function fmtSize(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : {};
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/** One-line summary of an error payload for the chat bubble. */
function shortenError(text) {
  let s = String(text || "").trim();
  if (!s) return "Terjadi kesalahan";
  try {
    const j = JSON.parse(s);
    const msg = j?.error?.message || j?.message || j?.error;
    if (typeof msg === "string" && msg.trim()) s = msg.trim();
  } catch {
    /* plain text */
  }
  s = s
    .replace(/<!doctype html>[\s\S]*?<\/head>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > 140) s = `${s.slice(0, 140)}…`;
  return s || "Terjadi kesalahan";
}

/** Remember the run that is currently executing so a reload can re-attach. */
function runKey(project) {
  return `routermod:agent-run:${project || ""}`;
}

function sessionKey(project) {
  return `routermod:agent-session:${project || ""}`;
}

/** Remember the model the user picked, so it survives reloads. */
function modelKey(project) {
  return `routermod:agent-model:${project || ""}`;
}

function readRememberedModel(project) {
  try {
    return localStorage.getItem(modelKey(project)) || "";
  } catch {
    return "";
  }
}

function rememberModel(project, id) {
  try {
    if (id) localStorage.setItem(modelKey(project), id);
  } catch {
    /* ignore */
  }
}

const TABS = [
  { id: "chat", label: "Agent", icon: "smart_toy" },
  { id: "files", label: "Files", icon: "folder" },
  { id: "terminal", label: "Terminal", icon: "terminal" },
  { id: "settings", label: "Models", icon: "tune" },
];

function Spinner({ className = "" }) {
  return (
    <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />
  );
}

function StatusPill({ tone = "neutral", children, className = "" }) {
  const tones = {
    neutral: "bg-surface-2 text-text-muted border-border",
    ok: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    warn: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    danger: "bg-rose-500/10 text-rose-500 border-rose-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${tones[tone]} ${className || ""}`}>
      {children}
    </span>
  );
}

const CAP_BADGES = [
  { key: "vision", icon: "visibility", label: "Vision", tone: "text-sky-500 bg-sky-500/10 border-sky-500/20" },
  { key: "reasoning", icon: "psychology", label: "Thinking", tone: "text-violet-500 bg-violet-500/10 border-violet-500/20" },
  { key: "audioInput", icon: "graphic_eq", label: "Audio", tone: "text-teal-500 bg-teal-500/10 border-teal-500/20" },
  { key: "videoInput", icon: "movie", label: "Video", tone: "text-fuchsia-500 bg-fuchsia-500/10 border-fuchsia-500/20" },
  { key: "imageOutput", icon: "image", label: "Image out", tone: "text-pink-500 bg-pink-500/10 border-pink-500/20" },
  { key: "search", icon: "public", label: "Search", tone: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  { key: "tools", icon: "handyman", label: "Tools", tone: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
];

function CapBadges({ caps, size = "text-[10px]", dot = false }) {
  if (!caps) return null;
  const active = CAP_BADGES.filter((b) => caps[b.key]);
  if (!active.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {active.map((b) => (
        <span key={b.key} title={b.label} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium ${size} ${b.tone}`}>
          <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>{b.icon}</span>
          {!dot && b.label}
        </span>
      ))}
    </span>
  );
}

function fmtContext(n) {
  if (!n) return "";
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 ? 1 : 0)}M ctx`;
  if (n >= 1000) return `${Math.round(n / 1000)}K ctx`;
  return `${n} ctx`;
}

function friendlyModelName(id) {
  const raw = String(id).split("/").pop().split(":")[0];
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TOOL_META = {
  list_dir: { icon: "folder_open", label: "Menelusuri folder", tone: "text-sky-500" },
  read_file: { icon: "description", label: "Membaca file", tone: "text-sky-500" },
  write_file: { icon: "edit_document", label: "Menulis file", tone: "text-amber-500" },
  delete_path: { icon: "delete", label: "Menghapus path", tone: "text-rose-500" },
  run_command: { icon: "terminal", label: "Menjalankan perintah", tone: "text-violet-500" },
};

function toolTarget(entry) {
  return entry?.args?.path || entry?.args?.command || "";
}

function toolResultText(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (r.error) return r.error;
  if (Array.isArray(r.entries)) return r.entries.join("\n");
  if (typeof r.content === "string") return r.content;
  if (r.stdout !== undefined || r.stderr !== undefined) {
    return [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
  }
  return JSON.stringify(r, null, 2);
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function ToolCard({ entry }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[entry.name] || { icon: "build", label: entry.name || "tool", tone: "text-text-muted" };
  const running = entry.state === "running";
  const failed = entry.state === "error";
  const done = entry.state === "done";
  const out = toolResultText(entry.result);
  const target = toolTarget(entry);
  const bytes = done ? entry.result?.bytes : null;
  const duration =
    done && entry.startedAt ? fmtDuration(Date.now() - entry.startedAt) : "";

  return (
    <div className="w-full rounded-xl border border-border bg-surface-2/40 overflow-hidden slide-in-right">
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className={`grid place-items-center size-6 rounded-lg shrink-0 ${failed ? "bg-rose-500/10 text-rose-500" : done ? "bg-primary/10 " + meta.tone : "bg-primary/10 text-primary"}`}
        >
          <span className={`material-symbols-outlined text-[14px] ${running ? "animate-pulse" : ""}`}>{meta.icon}</span>
        </span>
        <span className="text-[11.5px] font-medium shrink-0 text-text-main">{meta.label}</span>
        {target && (
          <span className="font-mono text-[10.5px] text-text-muted truncate flex-1 min-w-0" title={target}>
            {target}
          </span>
        )}
        {!target && <span className="flex-1" />}
        {typeof bytes === "number" && <span className="text-[10px] text-text-muted shrink-0">{fmtSize(bytes)}</span>}
        {duration ? (
          <span className="text-[10px] text-text-muted/80 tabular-nums shrink-0">{duration}</span>
        ) : null}
        {done && <span className="material-symbols-outlined text-[14px] text-emerald-500 shrink-0">check_circle</span>}
        {failed && <span className="material-symbols-outlined text-[14px] text-rose-500 shrink-0">cancel</span>}
        {running && <Spinner className="text-primary shrink-0" />}
        {entry.result != null && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title={open ? "Sembunyikan hasil" : "Lihat hasil"}
            className="material-symbols-outlined text-[14px] text-text-muted hover:text-primary transition-colors cursor-pointer shrink-0"
          >
            {open ? "expand_less" : "expand_more"}
          </button>
        )}
      </div>
      {running && (
        <div className="h-0.5 overflow-hidden bg-primary/10">
          <div className="h-full w-1/3 bg-primary animate-[ctaShimmer_1.4s_linear_infinite]" />
        </div>
      )}
      {open && out && (
        <pre className="px-3 py-2 border-t border-border bg-surface font-mono text-[11px] leading-relaxed text-text-muted whitespace-pre-wrap max-h-56 overflow-y-auto">{out}</pre>
      )}
    </div>
  );
}

function ModelPicker({ models, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = models.find((m) => m.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? models.filter((m) => (m.id || "").toLowerCase().includes(q) || (m.name || "").toLowerCase().includes(q)) : models;

  const groups = [];
  const byName = new Map();
  for (const m of filtered) {
    const key = m.providerName || m.provider || "Lainnya";
    if (!byName.has(key)) {
      const g = { name: key, items: [] };
      byName.set(key, g);
      groups.push(g);
    }
    byName.get(key).items.push(m);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div ref={ref} className="relative min-w-0 w-full">
      <button
        type="button"
        disabled={disabled || models.length === 0}
        onClick={() => setOpen((o) => !o)}
        className="an-btn an-ghost h-8 w-full min-w-0 gap-1.5 px-2.5 py-0 justify-start disabled:opacity-50 cursor-pointer"
        title={selected ? selected.name : "Pilih model"}
      >
        <span className="material-symbols-outlined text-[15px] text-text-muted shrink-0">neurology</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
          {selected ? selected.name : models.length ? "Pilih model…" : "(belum ada model)"}
        </span>
        <span className="material-symbols-outlined text-[14px] text-text-muted shrink-0">expand_more</span>
      </button>

      {open && (
        <div className="an-panel absolute z-30 mt-1 left-0 w-[300px] sm:w-[380px] max-w-[calc(100vw-32px)] overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari model…"
              className="an-input !py-1.5 !px-2.5 !text-[12px] !font-sans w-full"
            />
          </div>
          <div className="max-h-[60vh] sm:max-h-72 overflow-y-auto py-1 overscroll-contain">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">Tidak ada model.</p>}
            {groups.map((g) => (
              <div key={g.name}>
                <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-surface-2/95 backdrop-blur px-3 py-1.5 border-y border-border">
                  <span className="material-symbols-outlined text-[13px] text-primary">dns</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{g.name}</span>
                  <span className="text-[10px] text-text-muted/70">({g.items.length})</span>
                </div>
                {g.items.map((m) => {
                  const active = m.id === value;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onChange(m.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-start gap-2 text-left px-3 py-2 text-xs hover:bg-surface-2 transition-colors ${active ? "bg-primary/5 text-primary" : "text-text"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-medium ${active ? "" : "text-text"}`}>
                          {m.name || friendlyModelName(m.id)}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 flex-wrap text-text-muted">
                          <span className="text-[9px] font-mono opacity-70 truncate max-w-[160px]">{m.id}</span>
                          {m.caps?.contextWindow ? (
                            <span className="text-[9px] opacity-70">{fmtContext(m.caps.contextWindow)}</span>
                          ) : null}
                          <CapBadges caps={m.caps} size="text-[9px]" />
                        </span>
                      </span>
                      {active && <span className="material-symbols-outlined text-[15px] shrink-0 mt-0.5">check</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentPageClient() {
  const [status, setStatus] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState("");
  const [tab, setTab] = useState("chat");
  // Files the agent created / changed / deleted in this session.
  const [changedFiles, setChangedFiles] = useState([]);
  const [showChanged, setShowChanged] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await api("/api/agent/status");
        setStatus(s);
        if (!s.enabled) return;
        const p = await api("/api/agent/projects");
        setProjects(p.projects || []);
        if ((p.projects || []).length) setProject(p.projects[0].path);
      } catch (e) {
        setLoadError(e?.message || String(e));
      }
    })();
  }, []);

  if (loadError) {
    return (
      <div className="an-notice danger">
        <span className="an-notice-ico" aria-hidden>
          <span className="material-symbols-outlined">error</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--t-ink)]">Gagal memuat agent</p>
          <p className="text-[12px] text-[var(--t-muted)] mt-0.5">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="an-scope flex min-w-0 flex-col gap-5">
        <div className="an-panel h-[140px] animate-pulse" />
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="an-scope flex min-w-0 flex-col gap-5">
        <section className="an-panel">
          <header className="an-panel-head">
            <span className="an-panel-ico bg-amber-500/10 border-amber-500/20" aria-hidden>
              <span className="material-symbols-outlined text-amber-500">warning</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="an-panel-title">AI Agent Nonaktif</h2>
              <p className="an-panel-sub">
                Fitur ini memberikan akses file, terminal, dan eksekusi model AI ke server.
              </p>
            </div>
          </header>
          <div className="an-panel-pad flex flex-col gap-5">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <span className="material-symbols-outlined text-amber-500 text-xl shrink-0 mt-0.5">info</span>
              <div className="flex-1 text-sm">
                <p className="font-semibold text-[var(--t-ink)] mb-1">Cara Mengaktifkan</p>
                <p className="text-[var(--t-muted)] leading-relaxed">
                  Tambahkan environment variables berikut, lalu restart server untuk mengaktifkan AI Agent.
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[var(--t-ink)] mb-2 uppercase tracking-wider">Environment Variables</p>
              <div className="rounded-xl border border-[var(--t-line)] bg-[var(--t-raised)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--t-line)] bg-[var(--t-surface)]">
                  <span className="text-xs font-mono font-semibold text-[var(--t-muted)]">.env.local</span>
                  <button
                    onClick={() => {
                      const text = `AGENT_ENABLED=1\nAGENT_ROOT_MODE=projects\nAGENT_PROJECTS_ROOT=/root\nAGENT_ALLOW_TERMINAL=1\nAGENT_TERMINAL_TIMEOUT_MS=120000`;
                      navigator.clipboard.writeText(text);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">content_copy</span>
                    Copy
                  </button>
                </div>
                <pre className="text-[11px] leading-relaxed p-4 overflow-x-auto font-mono text-[var(--t-ink)]">
{`AGENT_ENABLED=1
AGENT_ROOT_MODE=projects        # "projects" atau "full" (seluruh disk)
AGENT_PROJECTS_ROOT=/root       # Windows: C:\\Users\\<user>\\Desktop
AGENT_ALLOW_TERMINAL=1          # izinkan jalankan command
AGENT_TERMINAL_TIMEOUT_MS=120000`}
                </pre>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--t-surface)] border border-[var(--t-line)]">
                <span className="material-symbols-outlined text-blue-400 text-lg shrink-0">folder_open</span>
                <div className="text-xs">
                  <p className="font-semibold text-[var(--t-ink)] mb-0.5">AGENT_ROOT_MODE</p>
                  <p className="text-[var(--t-muted)] leading-relaxed">
                    <code className="text-[var(--t-accent)]">projects</code> = akses terbatas folder project, 
                    <code className="text-[var(--t-accent)]">full</code> = akses seluruh disk
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--t-surface)] border border-[var(--t-line)]">
                <span className="material-symbols-outlined text-green-400 text-lg shrink-0">terminal</span>
                <div className="text-xs">
                  <p className="font-semibold text-[var(--t-ink)] mb-0.5">AGENT_ALLOW_TERMINAL</p>
                  <p className="text-[var(--t-muted)] leading-relaxed">
                    <code className="text-[var(--t-accent)]">1</code> = izinkan eksekusi command terminal,
                    <code className="text-[var(--t-accent)]">0</code> = file access saja
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
              <span className="material-symbols-outlined text-red-400 text-xl shrink-0 mt-0.5">security</span>
              <div className="flex-1 text-xs">
                <p className="font-semibold text-[var(--t-ink)] mb-1">⚠️ Peringatan Keamanan</p>
                <p className="text-[var(--t-muted)] leading-relaxed">
                  AI Agent memberikan akses penuh ke file system dan terminal server. 
                  Pastikan password admin kuat dan jangan expose port ke internet publik tanpa firewall/VPN.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--t-line)]">
              <p className="text-xs text-[var(--t-dim)]">Setelah set environment variables, restart server untuk apply changes</p>
              <a
                href="https://github.com/techwiz37/routermod#ai-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] border border-[var(--t-line)] transition-colors"
              >
                <span className="material-symbols-outlined text-base">help</span>
                Dokumentasi
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
        <div className="an-scope flex flex-col h-full min-h-0">
      <section className="an-panel flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
        {/* Header ringkas */}
        <header className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-[var(--t-line-soft)] min-w-0">
          <span
            className="grid place-items-center size-8 sm:size-9 rounded-[10px] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] shrink-0"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
          </span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <h1 className="text-[13px] sm:text-[14px] font-semibold text-[var(--t-ink)] truncate">AI Agent</h1>
            <span
              className="hidden md:inline-flex items-center gap-1 rounded-full border border-[var(--t-line)] px-2 py-[2px] text-[9.5px] font-medium uppercase tracking-wider text-[var(--t-muted)] shrink-0"
              title={status.projectsRoot}
            >
              <span className="size-1.5 rounded-full bg-[var(--t-star-ink)]" />
              {status.rootMode === "full" ? "Full disk" : "Project scope"}
            </span>
            {status.terminalEnabled ? (
              <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-[var(--t-line)] px-2 py-[2px] text-[9.5px] font-medium uppercase tracking-wider text-[var(--t-muted)] shrink-0">
                Terminal
              </span>
            ) : null}
            {changedFiles.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowChanged((v) => !v)}
                title="Lihat file yang diubah agent"
                className={`an-chip ${showChanged ? "accent" : "ok"} cursor-pointer shrink-0`}
              >
                <span className="material-symbols-outlined text-[13px]">edit_document</span>
                <span className="tabular-nums">{changedFiles.length}</span>
                <span className="hidden sm:inline">file diubah</span>
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 rounded-[9px] border border-[var(--t-line)] bg-[var(--t-field)] pl-2 pr-1 h-8 min-w-0 w-[148px] sm:w-[240px] shrink-0">
            <span className="material-symbols-outlined text-[15px] text-[var(--t-muted)] shrink-0">folder_open</span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="bg-transparent text-[11.5px] font-medium outline-none cursor-pointer w-full min-w-0 truncate"
              aria-label="Pilih project"
            >
              {projects.length === 0 && <option value="">(tidak ada folder project)</option>}
              {projects.map((p) => (
                <option key={p.path} value={p.path}>{p.name}</option>
              ))}
            </select>
          </div>
        </header>

        {/* Tab: selalu satu baris, bisa digeser */}
        <div className="px-2 sm:px-3 py-2 border-b border-[var(--t-line-soft)] overflow-x-auto scroll-thin-x">
          <div className="an-segmented an-segmented-sm w-max min-w-full sm:min-w-0">
            {TABS.map((t) => {
              if (t.id === "terminal" && !status.terminalEnabled) return null;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-pressed={active}
                  className={`an-segmented-btn ${active ? "active" : ""}`}
                >
                  <span className="material-symbols-outlined">{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {showChanged && changedFiles.length > 0 ? (
          <div className="border-b border-[var(--t-line-soft)] bg-[var(--t-raised)] max-h-[160px] overflow-y-auto custom-scrollbar px-3 sm:px-4 py-2 flex flex-col gap-1">
            {changedFiles.map((f) => (
              <div key={f.path} className="flex items-center gap-2 text-[11px] min-w-0">
                <span className="material-symbols-outlined text-[13px] shrink-0 text-[var(--t-star-ink)]">
                  {f.action === "dihapus" ? "delete" : f.action === "dibuat" ? "note_add" : "edit"}
                </span>
                <span className="font-mono truncate text-[var(--t-muted)]" title={f.path}>{f.path}</span>
                <span className="ml-auto shrink-0 text-[9.5px] uppercase tracking-wider text-[var(--t-dim)]">{f.action}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 flex flex-col min-w-0">
          {tab === "chat" && (
            <AgentChat
              project={project}
              terminalEnabled={status.terminalEnabled}
              onChangedFiles={setChangedFiles}
            />
          )}
          {tab === "files" && <FileManager project={project} />}
          {tab === "terminal" && <Terminal project={project} />}
          {tab === "settings" && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 sm:p-4">
              <ProviderSettings />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AgentChat({ project, terminalEnabled, onChangedFiles }) {
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [notice, setNotice] = useState("");
  // Index of the prompt that is being edited (-1 = none).
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editText, setEditText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sessions, setSessions] = useState([]);
  // Popup with the session history (each entry can be deleted).
  const [sessionOpen, setSessionOpen] = useState(false);
  const sessionMenuRef = useRef(null);
  const [sessionId, setSessionId] = useState("");
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  // Apakah chat sedang di posisi paling bawah?
  const [atBottom, setAtBottom] = useState(true);
  const saveTimer = useRef(null);
  const openingRef = useRef(false);
  // Provider + model remembered for the opened session.
  const sessionModelRef = useRef(null);
  // Run id of the turn that is currently executing (re-attach target).
  const runIdRef = useRef("");
  // Aborts the running chat request when the user presses Stop.
  const abortRef = useRef(null);
  // Last time the agent produced an event (used by the watchdog).
  const lastEventRef = useRef(0);
  const runStreamRef = useRef(null);

  const applyProviders = (list, preferredId) => {
    const wanted = sessionModelRef.current;
    const id =
      (wanted?.providerId && list.some((x) => x.id === wanted.providerId)
        ? wanted.providerId
        : null) ||
      preferredId ||
      providerId ||
      list[0]?.id ||
      "";
    const p = list.find((x) => x.id === id);
    setProviders(list);
    setProviderId(id);
    setModel((m) => {
      const valid = (p?.models || []).some((x) => x.id === m);
      if (valid) return m;
      const wantedModel = wanted?.model;
      if (
        wantedModel &&
        (p?.models || []).some((x) => x.id === wantedModel)
      ) {
        return wantedModel;
      }
      // The model the user picked earlier - never silently fall back to the
      // provider default while that model is still available.
      const remembered = readRememberedModel(project);
      if (remembered && (p?.models || []).some((x) => x.id === remembered)) {
        return remembered;
      }
      return p?.defaultModel || p?.models?.[0]?.id || "";
    });
  };

  useEffect(() => {
    api("/api/agent/providers").then((d) => applyProviders(d.providers || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [log]);

  // Close the session popup when clicking outside of it.
  useEffect(() => {
    if (!sessionOpen) return;
    const onDoc = (e) => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target)) {
        setSessionOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [sessionOpen]);

  const openSession = async (id) => {
    if (!id) return;
    openingRef.current = true;
    try {
      const d = await api(`/api/agent/sessions?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`);
      const s = d.session || {};
      setSessionId(s.id);
      setLog(Array.isArray(s.log) ? s.log : []);
      localStorage.setItem(sessionKey(project), s.id);
      // The session keeps the provider + model it used, so the next turn
      // continues with the very same model.
      if (s.providerId || s.model) {
        sessionModelRef.current = { providerId: s.providerId || "", model: s.model || "" };
        if (s.providerId) setProviderId(s.providerId);
        if (s.model) setModel(s.model);
      } else {
        // The session has no model yet: reuse the one the user picked before.
        const remembered = readRememberedModel(project);
        if (remembered) {
          sessionModelRef.current = {
            providerId: s.providerId || providerId,
            model: remembered,
          };
          setModel(remembered);
        }
      }
      setNotice("");
    } catch (e) {
      setNotice(e?.message || String(e));
    } finally {
      openingRef.current = false;
    }
  };

  const newSession = async () => {
    openingRef.current = true;
    setSessionId("");
    setLog([]);
    setAttachments([]);
    try {
      const d = await api("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, log: [], providerId, model }),
      });
      setSessionId(d.id);
      setSessions((s) => [{ id: d.id, title: d.title, updatedAt: d.updatedAt, turns: 0 }, ...s]);
      localStorage.setItem(sessionKey(project), d.id);
    } catch (e) {
      setNotice(e?.message || String(e));
    } finally {
      openingRef.current = false;
    }
  };

  const deleteSession = async (id, title) => {
    if (!id) return;
    if (!confirm(`Hapus sesi \"${(title || "Sesi").slice(0, 40)}\"? Riwayatnya hilang permanen.`)) {
      return;
    }
    setSessions((s) => s.filter((x) => x.id !== id));
    if (id === sessionId) {
      setSessionId("");
      setLog([]);
    }
    try {
      await api("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
    } catch {
      /* ignore */
    }
  };

  const forgetSession = async () => {
    if (!sessionId || busy) return;
    if (!confirm("Hapus sesi chat ini? Riwayatnya hilang permanen.")) return;
    const id = sessionId;
    openingRef.current = true;
    setSessions((s) => s.filter((x) => x.id !== id));
    setSessionId("");
    setLog([]);
    localStorage.removeItem(sessionKey(project));
    try {
      await api("/api/agent/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    } catch {
      /* eslint-disable-next-line no-empty */
    } finally {
      openingRef.current = false;
    }
  };

  useEffect(() => {
    if (!project) return;
    let alive = true;
    (async () => {
      try {
        const d = await api(`/api/agent/sessions?project=${encodeURIComponent(project)}`);
        if (!alive) return;
        const list = d.sessions || [];
        setSessions(list);
        const remembered = localStorage.getItem(sessionKey(project));
        const pick = list.find((s) => s.id === remembered) || list[0];
        if (pick) await openSession(pick.id);
        else {
          setSessionId("");
          setLog([]);
        }
      } catch {
        if (alive) {
          setSessions([]);
          setSessionId("");
          setLog([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // After a reload the agent may still be working: re-attach to that run so
  // the work continues and the result shows up in the chat.
  useEffect(() => {
    if (!project || busy) return;
    let disposed = false;
    let source = null;

    (async () => {
      let runId = "";
      try {
        runId = localStorage.getItem(runKey(project)) || "";
      } catch {
        /* ignore */
      }
      if (!runId) return;

      let info = null;
      try {
        const res = await fetch(`/api/agent/runs/${runId}`);
        if (!res.ok) throw new Error("not found");
        info = await res.json();
      } catch {
        try {
          localStorage.removeItem(runKey(project));
        } catch {
          /* ignore */
        }
        return;
      }

      if (disposed) return;
      if (info.status !== "running") {
        try {
          localStorage.removeItem(runKey(project));
        } catch {
          /* ignore */
        }
        return;
      }

      // Still running: re-attach and keep showing the output.
      setBusy(true);
      runIdRef.current = runId;
      setNotice("Agent masih berjalan dari sebelumnya — melanjutkan…");
      source = new EventSource(`/api/agent/runs/${runId}/stream`);
      let assistantText = "";
      source.onmessage = (e) => {
        let ev = null;
        try {
          ev = JSON.parse(e.data);
        } catch {
          return;
        }
        lastEventRef.current = Date.now();
        if (ev.type === "assistant_text") {
          if (!ev.text) return;
          assistantText += ev.text;
          setLog((l) => {
            const copy = [...l];
            if (copy[copy.length - 1]?.kind === "assistant") {
              copy[copy.length - 1] = { kind: "assistant", text: assistantText };
            } else {
              copy.push({ kind: "assistant", text: assistantText });
            }
            return copy;
          });
        } else if (ev.type === "tool_call") {
          assistantText = "";
          setLog((l) => [
            ...l,
            { kind: "tool", id: ev.id, name: ev.name, args: ev.args, result: null, state: "running" },
          ]);
        } else if (ev.type === "tool_result") {
          setLog((l) =>
            l.map((e) =>
              e.kind === "tool" && e.id === ev.id
                ? { ...e, result: ev.result, state: ev.ok ? "done" : "error" }
                : e
            )
          );
        } else if (ev.type === "error") {
          setLog((l) => [
            ...l,
            { kind: "error", text: ev.error, short: shortenError(ev.error) },
          ]);
        } else if (ev.type === "model_switch") {
          if (ev.model && ev.reason === "gone") {
            setModel(ev.model);
            rememberModel(project, ev.model);
          }
        } else if (ev.type === "cancelled") {
          runIdRef.current = "";
          try {
            localStorage.removeItem(runKey(project));
          } catch {
            /* ignore */
          }
          setBusy(false);
          setNotice("");
          setLog((l) => [...l, { kind: "notice", text: "Proses dihentikan." }]);
        } else if (ev.type === "__end__") {
          runIdRef.current = "";
          try {
            localStorage.removeItem(runKey(project));
          } catch {
            /* ignore */
          }
          setBusy(false);
          setNotice("");
        }
      };
      source.onerror = () => {
        setBusy(false);
      };

      // Watchdog: if the run is over (or silent for too long) the agent
      // must not keep spinning - the user can always stop it.
      lastEventRef.current = Date.now();
      const watchdog = setInterval(async () => {
        if (disposed) {
          clearInterval(watchdog);
          return;
        }
        const silentFor = Date.now() - lastEventRef.current;
        if (silentFor > 90000) {
          setNotice("Model sedang lambat merespons - proses masih berjalan. Tekan Stop jika ingin membatalkan.");
        }
        try {
          const res = await fetch(`/api/agent/runs/${runId}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.status !== "running") {
            clearInterval(watchdog);
            runIdRef.current = "";
            try {
              localStorage.removeItem(runKey(project));
            } catch {
              /* ignore */
            }
            setBusy(false);
            setNotice("");
          }
        } catch {
          /* ignore */
        }
      }, 5000);
    })();

    return () => {
      disposed = true;
      try {
        source?.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (openingRef.current || busy || !project) return;
    if (!log.length && !sessionId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (openingRef.current) return;
      try {
        const d = await api("/api/agent/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionId || undefined, project, log, providerId, model }),
        });
        if (!sessionId) setSessionId(d.id);
        localStorage.setItem(sessionKey(project), d.id || sessionId);
        setSessions((s) => {
          const rest = s.filter((x) => x.id !== (d.id || sessionId));
          const meta = { id: d.id || sessionId, title: d.title, updatedAt: d.updatedAt, turns: log.filter((e) => e.kind === "user").length };
          return [meta, ...rest];
        });
      } catch {
        /* eslint-disable-next-line no-empty */
      }
    }, 900);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // model/providerId are part of the session state, so a manual model
    // switch has to be persisted as well.
  }, [log, busy, sessionId, project, model, providerId]);

  const activeProvider = providers.find((p) => p.id === providerId);
  const models = activeProvider?.models || [];
  const ready = providerId && model;

  const onSelectProvider = (id) => {
    const p = providers.find((x) => x.id === id);
    setProviderId(id);
    // Re-selecting the same provider (or a provider that still has the
    // current model) must not throw the model away.
    setModel((current) => {
      if (id === providerId && current) return current;
      if ((p?.models || []).some((x) => x.id === current)) return current;
      return p?.defaultModel || p?.models?.[0]?.id || "";
    });
  };

  const reload = async () => {
    if (!providerId) return;
    setReloading(true);
    setNotice("");
    try {
      const d = await api("/api/agent/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reload-models", id: providerId }),
      });
      const fresh = await api("/api/agent/providers");
      applyProviders(fresh.providers || [], providerId);
      setNotice(`${d.models.length} model dimuat.`);
    } catch (e) {
      setNotice(e?.message || String(e));
    }
    setReloading(false);
  };

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setNotice("");
    const accepted = [];
    for (const f of files) {
      if (attachments.length + accepted.length >= MAX_ATTACH_FILES) {
        setNotice(`Maksimal ${MAX_ATTACH_FILES} lampiran per pesan.`);
        break;
      }
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      if (!isImage && !isVideo) {
        setNotice(`${f.name}: hanya gambar atau video yang didukung.`);
        continue;
      }
      const cap = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      if (f.size > cap) {
        setNotice(`${f.name}: ${fmtSize(f.size)} melebihi batas ${fmtSize(cap)}.`);
        continue;
      }
      try {
        const data = await fileToBase64(f);
        accepted.push({ id: `${f.name}-${f.size}-${Date.now()}`, name: f.name, mime: f.type, size: f.size, kind: isImage ? "image" : "video", data });
      } catch (err) {
        setNotice(err?.message || String(err));
      }
    }
    if (accepted.length) setAttachments((a) => [...a, ...accepted].slice(0, MAX_ATTACH_FILES));
  };

  const dropAttachment = (id) => setAttachments((a) => a.filter((x) => x.id !== id));

  // The composer grows with the text (max 10 lines).
  const growInput = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) growInput(inputRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // Which files did the agent touch? (created / changed / deleted)
  useEffect(() => {
    const map = new Map();
    for (const e of log) {
      if (e.kind !== "tool" || !e.args?.path) continue;
      if (e.name === "write_file") map.set(e.args.path, "dibuat");
      else if (e.name === "edit_file") map.set(e.args.path, "diubah");
      else if (e.name === "delete_path") map.set(e.args.path, "dihapus");
    }
    const list = [...map.entries()].map(([p, action]) => ({ path: p, action }));
    onChangedFiles?.(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  // Follow a running turn: the events are rendered into the chat.
  const attachToRun = (runId) => {
    if (!runId) return;
    setBusy(true);
    runIdRef.current = runId;
    lastEventRef.current = Date.now();
    const source = new EventSource(`/api/agent/runs/${runId}/stream`);
    let assistantText = "";
    source.onmessage = (e) => {
      let ev = null;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      lastEventRef.current = Date.now();
      if (ev.type === "assistant_text") {
        if (!ev.text) return;
        assistantText += ev.text;
        setLog((l) => {
          const copy = [...l];
          if (copy[copy.length - 1]?.kind === "assistant") {
            copy[copy.length - 1] = { kind: "assistant", text: assistantText };
          } else {
            copy.push({ kind: "assistant", text: assistantText });
          }
          return copy;
        });
      } else if (ev.type === "tool_call") {
        assistantText = "";
        setLog((l) => [
          ...l,
          {
            kind: "tool",
            id: ev.id,
            name: ev.name,
            args: ev.args,
            result: null,
            state: "running",
            startedAt: Date.now(),
          },
        ]);
      } else if (ev.type === "tool_result") {
        setLog((l) =>
          l.map((x) =>
            x.kind === "tool" && x.id === ev.id
              ? { ...x, result: ev.result, state: ev.ok ? "done" : "error" }
              : x
          )
        );
      } else if (ev.type === "error") {
        setLog((l) => [
          ...l,
          { kind: "error", text: ev.error, short: shortenError(ev.error) },
        ]);
      } else if (ev.type === "model_switch") {
        if (ev.model && ev.reason === "gone") {
          setModel(ev.model);
          rememberModel(project, ev.model);
        }
      } else if (ev.type === "cancelled") {
        runIdRef.current = "";
        setBusy(false);
        setNotice("");
        setLog((l) => [...l, { kind: "notice", text: "Proses dihentikan." }]);
      } else if (ev.type === "__end__") {
        runIdRef.current = "";
        setBusy(false);
        setNotice("");
        try {
          source.close();
        } catch {
          /* ignore */
        }
      }
    };
    source.onerror = () => {
      setBusy(false);
    };
    return source;
  };

  // Continue the process in the background: the server sends the continue
  // prompt to the model by itself, so the work keeps going even when the
  // browser is closed.
  const continueProcess = async () => {
    if (busy) return;
    setBusy(true);
    setNotice("Melanjutkan di background…");
    try {
      const d = await api("/api/agent/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, sessionId, providerId, model }),
      });
      if (!d?.runId) throw new Error("Gagal memulai proses lanjutan");
      runIdRef.current = d.runId;
      try {
        localStorage.setItem(runKey(project), d.runId);
      } catch {
        /* ignore */
      }
      setLog((l) => [
        ...l,
        { kind: "notice", text: "Melanjutkan pekerjaan di background…" },
      ]);
      attachToRun(d.runId);
    } catch (e) {
      setBusy(false);
      setNotice("");
      setLog((l) => [...l, { kind: "error", text: e?.message || String(e) }]);
    }
  };

  // Restart the process: run the last prompt again from the start.
  const restartProcess = async () => {
    if (busy) return;
    const index = log.map((e) => e.kind === "user").lastIndexOf(true);
    if (index < 0) return;
    await retryMessage(index);
  };

  // Run a prompt again from that point: the later messages are dropped and
  // the very same prompt is sent once more.
  const retryMessage = async (index) => {
    if (busy) return;
    const entry = log[index];
    if (!entry || entry.kind !== "user") return;
    const text = (entry.text || "").trim();
    if (!text) return;
    const next = log.slice(0, index + 1);
    setLog(next);
    setEditingIndex(-1);
    await send({ text, history: next });
  };

  // Edit a prompt and run the new version.
  const startEdit = (index) => {
    if (busy) return;
    const entry = log[index];
    if (!entry || entry.kind !== "user") return;
    setEditingIndex(index);
    setEditText(entry.text || "");
  };

  const applyEdit = async () => {
    if (editingIndex < 0) return;
    const text = editText.trim();
    if (!text) return;
    const index = editingIndex;
    const next = log
      .slice(0, index + 1)
      .map((e, i) => (i === index ? { ...e, text } : e));
    setEditingIndex(-1);
    setEditText("");
    setLog(next);
    await send({ text, history: next });
  };

  // Stop the running turn: abort the request and tell the server to stop
  // the run, so the work really ends (also after a page reload).
  const stopRun = async () => {
    let runId = runIdRef.current;
    if (!runId) {
      try {
        runId = localStorage.getItem(runKey(project)) || "";
      } catch {
        /* ignore */
      }
    }
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    abortRef.current = null;
    if (runId) {
      try {
        await fetch(`/api/agent/runs/${runId}/stop`, { method: "POST" });
      } catch {
        /* ignore */
      }
    }
    runIdRef.current = "";
    try {
      localStorage.removeItem(runKey(project));
    } catch {
      /* ignore */
    }
    setBusy(false);
    setNotice("");
    setLog((l) => [
      ...l,
      { kind: "notice", text: "Proses dihentikan." },
    ]);
  };

  const send = async (opts = {}) => {
    const text = String(opts.text ?? input).trim();
    const isRetry = Array.isArray(opts.history);
    if ((!text && !attachments.length) || busy || !ready) return;
    const outgoing = attachments;
    if (!isRetry) {
      setInput("");
      setAttachments([]);
    }
    setBusy(true);
    setNotice("");
    const baseLog = isRetry ? opts.history : log;
    const history = [
      ...baseLog
        .filter((e) => (e.kind === "user" || e.kind === "assistant") && ((e.text || "").trim() || e.media?.length))
        .map((e) => ({
          role: e.kind,
          content: (e.text || "").trim() || (e.kind === "user" ? "(melampirkan media)" : ""),
        })),
      ...(isRetry ? [] : [{ role: "user", content: text || "(melampirkan media)" }]),
    ];
    setLog(
      isRetry
        ? baseLog
        : (l) => [...l, { kind: "user", text, media: outgoing.map((m) => ({ name: m.name, kind: m.kind, data: m.data })) }]
    );

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          project,
          sessionId,
          providerId,
          model,
          messages: history,
          attachments: outgoing.map((m) => ({ name: m.name, mime: m.mime, data: m.data })),
          // Enough room for read -> edit -> verify loops.
          maxSteps: 30,
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let assistantText = "";
      let sawText = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          lastEventRef.current = Date.now();
          if (ev.type === "run") {
            if (ev.id) {
              runIdRef.current = ev.id;
              try {
                localStorage.setItem(runKey(project), ev.id);
              } catch {
                /* ignore */
              }
            }
          } else if (ev.type === "assistant_text") {
            if (!ev.text) continue;
            sawText = true;
            assistantText += ev.text;
            setLog((l) => {
              const copy = [...l];
              if (copy[copy.length - 1]?.kind === "assistant") copy[copy.length - 1] = { kind: "assistant", text: assistantText };
              else copy.push({ kind: "assistant", text: assistantText });
              return copy;
            });
          } else if (ev.type === "tool_call") {
            assistantText = "";
            setLog((l) => [
              ...l,
              {
                kind: "tool",
                id: ev.id,
                name: ev.name,
                args: ev.args,
                result: null,
                state: "running",
                startedAt: Date.now(),
              },
            ]);
          } else if (ev.type === "tool_result") {
            setLog((l) => l.map((e) => (e.kind === "tool" && e.id === ev.id ? { ...e, result: ev.result, state: ev.ok ? "done" : "error" } : e)));
          } else if (ev.type === "attachments") {
            if (ev.files?.length) {
              setLog((l) => {
                const copy = [...l];
                for (let k = copy.length - 1; k >= 0; k--) {
                  if (copy[k]?.kind === "user") {
                    copy[k] = { ...copy[k], saved: [...(copy[k].saved || []), ...ev.files] };
                    break;
                  }
                }
                return copy;
              });
            }
            if (ev.skipped?.length) setLog((l) => [...l, { kind: "error", text: `Lampiran dilewati: ${ev.skipped.join("; ")}` }]);
          } else if (ev.type === "error") {
            setLog((l) => [
              ...l,
              {
                kind: "error",
                text: ev.error,
                short: shortenError(ev.error),
              },
            ]);
          } else if (ev.type === "model_switch") {
            // Only a model that really is gone may replace the choice,
            // and no alert is shown - the picker simply follows the server.
            if (ev.model && ev.reason === "gone") {
              setModel(ev.model);
              rememberModel(project, ev.model);
            }
          } else if (ev.type === "cancelled") {
            setLog((l) => [
              ...l,
              { kind: "notice", text: "Proses dihentikan." },
            ]);
            setBusy(false);
          } else if (ev.type === "done") {
            setLog((l) => {
              const last = l[l.length - 1];
              const copy =
                last?.kind === "assistant" && !(last.text || "").trim() ? l.slice(0, -1) : [...l];
              if (ev.note) {
                copy.push({
                  kind: "notice",
                  text: `Pekerjaan belum selesai: ${ev.note}. Kirim "lanjutkan" untuk melanjutkan.`,
                });
              } else if (!sawText) {
                copy.push({
                  kind: "notice",
                  text: "Model tidak mengembalikan balasan. Coba kirim ulang atau pilih model lain.",
                });
              }
              return copy;
            });
            assistantText = "";
            runIdRef.current = "";
            try {
              localStorage.removeItem(runKey(project));
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch (e) {
      const aborted = e?.name === "AbortError" || /stopped/i.test(e?.message || "");
      if (!aborted) {
        setLog((l) => [...l, { kind: "error", text: e?.message || String(e) }]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
            <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-[var(--t-line-soft)] flex flex-wrap items-center gap-1.5 min-w-0">
        {/* Baris 1 - provider + model */}
        <div className="flex items-center gap-1.5 min-w-0 w-full sm:w-auto sm:flex-none">
          <div className="flex items-center gap-1.5 rounded-[9px] border border-[var(--t-line)] bg-[var(--t-field)] px-2 h-8 min-w-0 flex-1 sm:flex-none sm:w-[180px]">
            <span className="material-symbols-outlined text-[15px] text-[var(--t-muted)] shrink-0">hub</span>
            <select
              value={providerId}
              onChange={(e) => onSelectProvider(e.target.value)}
              aria-label="Provider"
              className="bg-transparent text-[11.5px] outline-none cursor-pointer w-full min-w-0 truncate"
            >
              {providers.length === 0 && <option value="">(belum ada provider)</option>}
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1 sm:flex-none sm:w-[250px]">
            <ModelPicker
              models={models}
              value={model}
              disabled={!models.length}
              onChange={(id) => {
                setModel(id);
                rememberModel(project, id);
              }}
            />
          </div>
        </div>

        {/* Baris 2 - sesi + aksi */}
        <div className="flex items-center gap-1.5 min-w-0 w-full sm:w-auto sm:flex-1">
          <div className="relative min-w-0 flex-1 sm:max-w-[240px]" ref={sessionMenuRef}>
            <button
              type="button"
              onClick={() => setSessionOpen((o) => !o)}
              title={sessions.find((s) => s.id === sessionId)?.title || "Sesi chat"}
              className="an-btn an-ghost h-8 w-full min-w-0 gap-1.5 px-2.5 justify-start"
            >
              <span className="material-symbols-outlined text-[16px] text-[var(--t-muted)] shrink-0">history</span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-left">
                {sessions.find((s) => s.id === sessionId)?.title?.slice(0, 40) || "Sesi chat"}
              </span>
              <span className="material-symbols-outlined text-[14px] text-[var(--t-muted)] shrink-0">expand_more</span>
            </button>
            {sessionOpen ? (
              <div className="an-panel absolute z-30 mt-1 left-0 w-[290px] max-w-[calc(100vw-32px)] overflow-hidden">
                <div className="px-3 py-2 border-b border-[var(--t-line-soft)] text-[10px] font-mono uppercase tracking-wider text-[var(--t-muted)]">
                  Riwayat chat ({sessions.length})
                </div>
                <div className="max-h-[260px] overflow-y-auto py-1">
                  {sessions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-[var(--t-muted)]">Belum ada sesi.</p>
                  ) : null}
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-1 px-1.5 ${s.id === sessionId ? "bg-primary/5" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSessionOpen(false);
                          openSession(s.id);
                        }}
                        className="flex-1 min-w-0 text-left px-2 py-2 text-xs truncate hover:text-[var(--t-ink)]"
                      >
                        {(s.title || "Sesi").slice(0, 40)}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(s.id, s.title);
                        }}
                        title="Hapus sesi ini"
                        aria-label={`Hapus sesi ${(s.title || "Sesi").slice(0, 40)}`}
                        className="grid place-items-center h-7 w-7 rounded-lg text-[var(--t-muted)] hover:text-[var(--t-star-ink)] hover:bg-[var(--t-accent-soft)] shrink-0 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={reload}
              disabled={reloading || !providerId}
              title="Muat ulang daftar model"
              aria-label="Muat ulang daftar model"
              className="grid place-items-center size-8 rounded-[9px] border border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            >
              {reloading ? <Spinner /> : <span className="material-symbols-outlined text-[17px]">refresh</span>}
            </button>
            <button
              onClick={newSession}
              disabled={busy}
              title="Sesi baru"
              aria-label="Sesi baru"
              className="grid place-items-center size-8 rounded-[9px] border border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            >
              <span className="material-symbols-outlined text-[17px]">add_comment</span>
            </button>
            <button
              onClick={forgetSession}
              disabled={busy || !sessionId || sessions.length === 0}
              title="Hapus sesi ini"
              aria-label="Hapus sesi ini"
              className="grid place-items-center size-8 rounded-[9px] border border-[rgba(232,0,31,0.28)] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            >
              <span className="material-symbols-outlined text-[17px]">delete_sweep</span>
            </button>
            <button
              onClick={() => setLog([])}
              disabled={busy}
              title="Bersihkan obrolan"
              aria-label="Bersihkan obrolan"
              className="grid place-items-center size-8 rounded-[9px] border border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            >
              <span className="material-symbols-outlined text-[17px]">mop</span>
            </button>
          </div>
        </div>
      </div>

      {notice && <div className="px-4 py-2 text-xs text-primary bg-primary/5 border-b border-border">{notice}</div>}

      <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
        className="an-chat-log h-full overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 text-sm lg:[&>*]:mx-auto lg:[&>*]:w-full lg:[&>*]:max-w-[900px]"
      >
        {log.length === 0 && (
          <div className="h-full grid place-items-center text-center px-1 py-4">
            <div className="w-full max-w-[430px] space-y-3">
              <div className="mx-auto grid place-items-center h-11 w-11 rounded-[13px] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)]">
                <span className="material-symbols-outlined text-[23px]">robot_2</span>
              </div>
              <div className="space-y-1">
                <p className="text-[13px] font-medium text-[var(--t-ink)]">Mulai dengan satu instruksi</p>
                <p className="text-[11.5px] leading-relaxed text-[var(--t-muted)]">
                  Agent bisa membaca, menulis, dan menghapus file{terminalEnabled ? ", serta menjalankan command" : ""} di project ini.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {[
                  "Jelaskan struktur project ini",
                  "Cari bug lalu perbaiki",
                  "Jalankan build dan laporkan",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setInput(q);
                      inputRef.current?.focus();
                    }}
                    className="an-chip cursor-pointer hover:!text-[var(--t-ink)]"
                  >
                    <span className="material-symbols-outlined text-[13px]">bolt</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {log.map((e, i) => (
          // A command that failed is not shown - it only clutters the chat.
          e.kind === "tool" && e.state === "error" ? null : (
          <div key={i} className="flex gap-3 min-w-0 max-w-full">
            {e.kind === "user" && (
              <>
                <div className="shrink-0 mt-0.5 grid place-items-center h-6 w-6 rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[15px]">person</span>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {e.media?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {e.media.map((m, mi) =>
                        m.kind === "image" && m.data ? (
                          <img
                            key={mi}
                            src={m.data}
                            alt={m.name}
                            title={m.name}
                            className="h-24 w-24 object-cover rounded-xl border border-border"
                          />
                        ) : (
                          <div
                            key={mi}
                            className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 max-w-[220px]"
                          >
                            <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                              {m.kind === "video" ? "movie" : "image"}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[11px] font-medium truncate">{m.name}</span>
                              <span className="block text-[10px] text-text-muted">{m.kind === "video" ? "video" : "gambar"}</span>
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                  {editingIndex === i ? (
                    <div className="an-panel !rounded-[10px] p-2 flex flex-col gap-2">
                      <textarea
                        value={editText}
                        onChange={(ev) => setEditText(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" && !ev.shiftKey) {
                            ev.preventDefault();
                            applyEdit();
                          }
                          if (ev.key === "Escape") {
                            ev.preventDefault();
                            setEditingIndex(-1);
                          }
                        }}
                        rows={3}
                        autoFocus
                        className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={applyEdit}
                          disabled={busy || !editText.trim()}
                          className="an-btn an-primary h-7 px-2.5 text-[11px] gap-1 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[14px]">send</span>
                          Kirim ulang
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingIndex(-1)}
                          disabled={busy}
                          className="an-btn an-ghost h-7 px-2.5 text-[11px] disabled:opacity-50"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {e.text?.trim() && (
                        <p className="whitespace-pre-wrap leading-relaxed break-words [overflow-wrap:anywhere] min-w-0">
                          {e.text}
                        </p>
                      )}
                      <div className="flex items-center gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => retryMessage(i)}
                          disabled={busy}
                          title="Jalankan ulang prompt ini"
                          className="an-chip !h-auto !px-1.5 !py-0.5 gap-1 cursor-pointer disabled:opacity-40 hover:!text-[var(--t-ink)]"
                        >
                          <span className="material-symbols-outlined text-[13px]">refresh</span>
                          <span>Ulangi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          disabled={busy}
                          title="Edit prompt lalu jalankan ulang"
                          className="an-chip !h-auto !px-1.5 !py-0.5 gap-1 cursor-pointer disabled:opacity-40 hover:!text-[var(--t-ink)]"
                        >
                          <span className="material-symbols-outlined text-[13px]">edit</span>
                          <span>Edit</span>
                        </button>
                      </div>
                    </>
                  )}
                  {e.saved?.length > 0 && (
                    <p className="text-[11px] text-text-muted">
                      Tersimpan di project:{" "}
                      {e.saved.map((s, si) => (
                        <span key={si}>
                          {si > 0 && ", "}
                          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono break-all">{s}</code>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </>
            )}
            {e.kind === "assistant" && (
              <>
                <div className="shrink-0 mt-0.5 grid place-items-center h-6 w-6 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <span className="material-symbols-outlined text-[15px]">smart_toy</span>
                </div>
                <div className="flex-1 min-w-0 space-y-1 leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {renderMarkdown(e.text)}
                  {busy && i === log.length - 1 && (
                    <span className="inline-block ml-0.5 h-4 w-[7px] translate-y-[3px] bg-primary animate-pulse" />
                  )}
                </div>
              </>
            )}
            {e.kind === "tool" && <ToolCard entry={e} />}
            {e.kind === "notice" && (
              <div className="an-notice info !items-start !py-2 !px-3 min-w-0 max-w-full">
                <span className="an-notice-ico" aria-hidden>
                  <span className="material-symbols-outlined">info</span>
                </span>
                <p className="text-[11.5px] leading-relaxed text-[var(--t-muted)] break-words [overflow-wrap:anywhere]">
                  {e.text}
                </p>
              </div>
            )}
            {e.kind === "error" && (
              <div className="an-notice danger !items-start !py-2 !px-3 min-w-0 max-w-full">
                <span className="an-notice-ico" aria-hidden>
                  <span className="material-symbols-outlined">error</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] leading-relaxed text-[var(--t-danger)] break-words [overflow-wrap:anywhere]">
                    {e.short || e.text}
                  </p>
                  {e.text && e.text !== e.short && (
                    <details className="mt-1 group">
                      <summary className="cursor-pointer text-[10.5px] text-[var(--t-muted)] hover:text-[var(--t-ink)] select-none">
                        Detail teknis
                      </summary>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-[8px] border border-[var(--t-line)] bg-[var(--t-raised)] p-2 text-[10px] leading-snug text-[var(--t-muted)]">
                        {e.text}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            )}
          </div>
          )
        ))}
        {busy && (
          <div className="flex items-center gap-3 px-1 py-1 w-full">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
            </span>
            <div className="flex-1 h-1 rounded-full bg-primary/10 overflow-hidden">
              <div className="h-full w-1/3 bg-primary/50 animate-[ctaShimmer_1.4s_linear_infinite]" />
            </div>
          </div>
        )}
      </div>
      {!atBottom && log.length > 0 ? (
        <div className="absolute right-3 bottom-3 z-20 pointer-events-none">
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            aria-label="Scroll ke bawah"
            title="Scroll ke bawah"
            className="pointer-events-auto grid place-items-center size-9 rounded-full border border-[var(--t-line)] bg-[var(--t-card)]/95 backdrop-blur shadow-[0_8px_20px_rgba(0,0,0,0.4)] text-[var(--t-muted)] hover:text-[var(--t-ink)] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">keyboard_double_arrow_down</span>
          </button>
        </div>
      ) : null}
      </div>

      {false ? (
        <div className="px-3 py-2 border-t border-[var(--t-line-soft)] flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={continueProcess}
            title="Lanjutkan proses dari titik terakhir"
            className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">skip_next</span>
            Lanjutkan
          </button>
          <button
            type="button"
            onClick={restartProcess}
            title="Ulangi proses dari awal"
            className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            Ulangi proses
          </button>
          <span className="text-[10.5px] text-text-muted">
            {"Lanjutkan untuk melanjutkan, Ulangi untuk mengulang dari awal"}
          </span>
        </div>
      ) : null}

      {log.length > 0 && !busy ? (
        <div className="px-3 sm:px-4 pt-2 flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={continueProcess}
            title="Lanjutkan proses dari titik terakhir"
            className="an-btn an-ghost h-7 px-2.5 text-[10.5px] gap-1"
          >
            <span className="material-symbols-outlined text-[15px]">skip_next</span>
            Lanjutkan
          </button>
          <button
            type="button"
            onClick={restartProcess}
            title="Ulangi proses dari awal"
            className="an-btn an-ghost h-7 px-2.5 text-[10.5px] gap-1"
          >
            <span className="material-symbols-outlined text-[15px]">restart_alt</span>
            Ulangi proses
          </button>
          <span className="text-[10px] text-[var(--t-dim)] hidden sm:inline">
            Lanjutkan melanjutkan dari titik terakhir, Ulangi mengulang dari awal.
          </span>
        </div>
      ) : null}

      <div className="p-3 border-t border-border">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {attachments.map((a) => (
              <div key={a.id} className="relative group">
                {a.kind === "image" ? (
                  <img src={a.data} alt={a.name} className="h-16 w-16 object-cover rounded-lg border border-border" />
                ) : (
                  <div className="flex h-16 w-28 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2">
                    <span className="material-symbols-outlined text-[16px] text-primary shrink-0">movie</span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-medium truncate">{a.name}</span>
                      <span className="block text-[9px] text-text-muted">{fmtSize(a.size)}</span>
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => dropAttachment(a.id)}
                  aria-label={`Hapus ${a.name}`}
                  className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>close</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-[14px] border border-[var(--t-line)] bg-[var(--t-field)] focus-within:border-[var(--t-accent)] focus-within:shadow-[0_0_0_3px_var(--t-accent-soft)] transition-all p-1.5 pl-2 min-w-0">
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={pickFiles} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || attachments.length >= MAX_ATTACH_FILES}
            aria-label="Lampirkan gambar atau video"
            title="Lampirkan gambar atau video"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">attach_file</span>
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              growInput(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={ready ? "Tulis instruksi untuk agent…" : "Pilih model dulu"}
            title="Enter untuk kirim, Shift+Enter untuk baris baru"
            className="flex-1 min-w-0 bg-transparent py-2 text-[13.5px] leading-relaxed resize-none outline-none max-h-40 placeholder:text-[var(--t-dim)]"
          />
          {busy ? (
            <button
              onClick={stopRun}
              title="Hentikan proses agent"
              className="flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-3 rounded-[10px] border border-[rgba(232,0,31,0.4)] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] hover:bg-[var(--t-accent)] hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[17px]">stop_circle</span>
              <span className="hidden sm:inline text-[12px] font-medium">Stop</span>
            </button>
          ) : null}
          <button
            onClick={send}
            disabled={busy || (!input.trim() && !attachments.length) || !ready}
            title="Kirim (Enter)"
            className="flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-3.5 rounded-[10px] bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
          >
            {busy ? (
              <Spinner className="text-white" />
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px] sm:text-[17px]">arrow_upward</span>
                <span className="hidden sm:inline text-[12px] font-medium">Kirim</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileManager({ project }) {
  const [cwd, setCwd] = useState(".");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [creating, setCreating] = useState(null);
  const [newName, setNewName] = useState("");

  const load = async (p = cwd) => {
    setErr("");
    try {
      const d = await api(`/api/agent/files?action=list&project=${encodeURIComponent(project)}&path=${encodeURIComponent(p)}`);
      setData(d);
      setCwd(p);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  useEffect(() => {
    if (project) load(".");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const join = (name) => (cwd === "." ? name : `${cwd}/${name}`);

  // Opening a file closes the sidebar so the content takes over the screen.
  const openFile = async (name) => {
    const p = join(name);
    try {
      const d = await api(`/api/agent/files?action=read&project=${encodeURIComponent(project)}&path=${encodeURIComponent(p)}`);
      if (d.binary) {
        setErr("File biner, tidak bisa dibuka di editor.");
        return;
      }
      setEditing({ path: p, content: d.content });
      setSidebarOpen(false);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api("/api/agent/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", project, path: editing.path, content: editing.content }),
      });
      setEditing(null);
      load(cwd);
    } catch (e) {
      setErr(e?.message || String(e));
    }
    setSaving(false);
  };

  const remove = async (name) => {
    const label = name || cwd;
    if (!confirm(`Hapus "${label}"?`)) return;
    const p = name ? join(name) : cwd;
    try {
      await api("/api/agent/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", project, path: p, recursive: true }),
      });
      if (!name && editing) setEditing(null);
      load(cwd);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  const rename = async () => {
    if (!renaming) return;
    // Nama baru ada di input (newName), bukan di nama lama.
    const to = (newName || "").trim();
    const current = renaming.path.split("/").pop();
    if (!to) return;
    if (to === current) {
      setRenaming(null);
      setNewName("");
      return;
    }
    if (!to) return;
    try {
      await api("/api/agent/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", project, path: renaming.path, to: join(to) }),
      });
      setRenaming(null);
      setNewName("");
      load(cwd);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  const create = async () => {
    if (!creating) return;
    const name = newName.trim();
    if (!name) return;
    try {
      if (creating === "dir") {
        await api("/api/agent/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mkdir", project, path: join(name) }),
        });
      } else {
        await api("/api/agent/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "write", project, path: join(name), content: "" }),
        });
      }
      setCreating(null);
      setNewName("");
      load(cwd);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  const up = () => {
    if (cwd === "." || !cwd) return;
    const parts = cwd.split("/").filter(Boolean);
    parts.pop();
    load(parts.length ? parts.join("/") : ".");
  };

  const crumbs = cwd === "." ? [] : cwd.split("/").filter(Boolean);

  const list = (
    <div className="flex-1 overflow-y-auto min-h-0">
      {err && <p className="text-[11px] text-rose-500 p-3">{err}</p>}
      {creating ? (
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="material-symbols-outlined text-[15px] text-primary shrink-0">
            {creating === "dir" ? "folder" : "draft"}
          </span>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") {
                setCreating(null);
                setNewName("");
              }
            }}
            placeholder={creating === "dir" ? "nama folder" : "nama file"}
            className="flex-1 min-w-0 bg-[var(--t-field)] border border-[var(--t-line)] rounded-lg px-2 py-1 font-mono text-[12px] outline-none"
          />
          <button
            onClick={create}
            className="grid place-items-center size-7 rounded-lg bg-primary text-white cursor-pointer"
            title="Buat"
          >
            <span className="material-symbols-outlined text-[14px]">check</span>
          </button>
          <button
            onClick={() => {
              setCreating(null);
              setNewName("");
            }}
            className="grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted cursor-pointer"
            title="Batal"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      ) : null}
      {renaming ? (
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="material-symbols-outlined text-[15px] text-primary shrink-0">drive_file_rename_outline</span>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") {
                setRenaming(null);
                setNewName("");
              }
            }}
            placeholder="nama baru"
            className="flex-1 min-w-0 bg-[var(--t-field)] border border-[var(--t-line)] rounded-lg px-2 py-1 font-mono text-[12px] outline-none"
          />
          <button
            onClick={rename}
            className="grid place-items-center size-7 rounded-lg bg-primary text-white cursor-pointer"
            title="Simpan nama"
          >
            <span className="material-symbols-outlined text-[14px]">check</span>
          </button>
          <button
            onClick={() => {
              setRenaming(null);
              setNewName("");
            }}
            className="grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted cursor-pointer"
            title="Batal"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      ) : null}
      {data?.entries?.map((e) => (
        <div key={e.name} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--t-raised)] text-sm group">
          <span className={`material-symbols-outlined text-[17px] shrink-0 ${e.type === "dir" ? "text-primary" : "text-text-muted"}`}>
            {e.type === "dir" ? "folder" : "draft"}
          </span>
          <button
            className="flex-1 min-w-0 text-left truncate font-mono text-[12.5px]"
            onClick={() => (e.type === "dir" ? load(join(e.name)) : openFile(e.name))}
            title={e.name}
          >
            {e.name}
          </button>
          <span className="text-[10px] text-text-muted tabular-nums shrink-0">
            {e.type === "file" ? fmtSize(e.size) : ""}
          </span>
          <button
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-text-muted hover:text-primary transition-opacity cursor-pointer shrink-0 grid place-items-center size-6 rounded-md"
            onClick={() => {
              setRenaming({ path: join(e.name), name: e.name });
              setNewName(e.name);
            }}
            title="Rename"
          >
            <span className="material-symbols-outlined text-[15px]">drive_file_rename_outline</span>
          </button>
          <button
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-[var(--t-muted)] hover:text-rose-500 transition-colors cursor-pointer shrink-0 grid place-items-center size-6 rounded-md"
            onClick={() => remove(e.name)}
            title="Hapus"
          >
            <span className="material-symbols-outlined text-[15px]">delete</span>
          </button>
        </div>
      ))}
      {data && data.entries?.length === 0 && !creating && (
        <p className="text-[11px] text-text-muted p-3">(folder kosong)</p>
      )}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative min-w-0 bg-[var(--t-card)]">
      <div className="an-panel-pad !py-2.5 flex items-center gap-2 border-b border-[var(--t-line-soft)]">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="lg:hidden grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted hover:text-primary cursor-pointer shrink-0"
          title="Buka daftar file"
        >
          <span className="material-symbols-outlined text-[17px]">menu</span>
        </button>
        <button
          onClick={up}
          disabled={cwd === "."}
          className="max-sm:hidden grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted hover:text-primary disabled:opacity-40 cursor-pointer shrink-0"
          title="Naik satu folder"
        >
          <span className="material-symbols-outlined text-[17px]">arrow_upward</span>
        </button>
        <div className="flex items-center gap-1 text-[11px] font-mono text-text-muted truncate flex-1 min-w-0">
          <button onClick={() => load(".")} className="hover:text-primary cursor-pointer truncate">
            {project?.split(/[\\/]/).pop() || "root"}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              <span className="text-text-muted/50">/</span>
              <button
                onClick={() => load(crumbs.slice(0, i + 1).join("/"))}
                className="hover:text-primary truncate cursor-pointer"
              >
                {c}
              </button>
            </span>
          ))}
        </div>
        <button
          onClick={() => {
            setCreating("file");
            setNewName("");
          }}
          className="grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted hover:text-primary cursor-pointer shrink-0"
          title="Buat file"
        >
          <span className="material-symbols-outlined text-[17px]">note_add</span>
        </button>
        <button
          onClick={() => {
            setCreating("dir");
            setNewName("");
          }}
          className="grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted hover:text-primary cursor-pointer shrink-0"
          title="Buat folder"
        >
          <span className="material-symbols-outlined text-[17px]">create_new_folder</span>
        </button>
        <button
          onClick={() => load(cwd)}
          className="grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted hover:text-primary cursor-pointer shrink-0"
          title="Muat ulang"
        >
          <span className="material-symbols-outlined text-[17px]">refresh</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 relative flex">
        {/* Sidebar: slides in on a phone, always visible on a desktop */}
        <aside
          data-testid="file-sidebar"
          className={`absolute inset-y-0 left-0 z-30 w-[88%] max-w-[340px] min-w-0 flex flex-col shadow-[8px_0_24px_rgba(0,0,0,0.28)] border-r border-[var(--t-line-soft)] bg-[var(--t-card)] transition-transform duration-300 ease-out lg:relative lg:z-auto lg:w-[300px] lg:max-w-none lg:shadow-none lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-line-soft)]">
            <span className="material-symbols-outlined text-[16px] text-primary">folder_open</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">File &amp; folder</span>
            <div className="flex-1" />
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden grid place-items-center size-6 rounded-lg text-text-muted cursor-pointer"
              title="Tutup daftar"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          {list}
        </aside>
        {sidebarOpen ? (
          <div
            className="lg:hidden absolute inset-0 z-20 bg-black/55"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {/* Content */}
        <div className={`flex-1 min-w-0 min-h-0 flex-col bg-[var(--t-field)] ${sidebarOpen ? "hidden lg:flex" : "flex"}`}>
          {editing ? (
            <>
              <div className="an-panel-pad !py-2.5 flex items-center gap-2 border-b border-[var(--t-line-soft)]">
                <span className="material-symbols-outlined text-[17px] text-text-muted shrink-0">draft</span>
                <span className="font-mono text-[11.5px] truncate flex-1 min-w-0" title={editing.path}>
                  {editing.path}
                </span>
                <button
                  onClick={() => {
                    setRenaming({ path: editing.path, name: editing.path.split("/").pop() });
                    setNewName(editing.path.split("/").pop());
                  }}
                  className="grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted hover:text-primary cursor-pointer shrink-0"
                  title="Rename file"
                >
                  <span className="material-symbols-outlined text-[16px]">drive_file_rename_outline</span>
                </button>
                <button
                  onClick={() => remove()}
                  className="grid place-items-center size-7 rounded-lg border border-[rgba(232,0,31,0.32)] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] cursor-pointer shrink-0"
                  title="Hapus file"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="grid place-items-center size-7 rounded-lg border border-[var(--t-line)] text-text-muted hover:text-primary cursor-pointer shrink-0"
                  title="Tutup"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-white hover:bg-primary/90 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {saving ? <Spinner className="text-white" /> : <span className="material-symbols-outlined text-[15px]">save</span>}
                  Simpan
                </button>
              </div>
              <textarea
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                className="flex-1 w-full bg-transparent p-3 font-mono text-[12px] resize-none outline-none leading-relaxed"
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-center p-6">
              <div className="space-y-2">
                <span className="material-symbols-outlined text-[34px] text-text-muted/40">edit_document</span>
                <p className="text-sm text-text-muted">
                  Pilih file di sidebar untuk membuka isinya, atau folder untuk masuk.
                </p>
                <p className="text-[11px] text-text-muted/70">
                  File bisa diedit, disimpan, di-rename, dihapus, dan dibuat baru.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function Terminal({ project }) {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef(0);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const projectName = project?.split(/[\\/]/).pop() || "project";
  const cmdCount = lines.filter((l) => l.t === "cmd").length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines, busy]);

  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200);
    return () => clearInterval(t);
  }, [busy]);

  const run = async () => {
    const c = command.trim();
    if (!c || busy) return;
    setLines((l) => [...l, { t: "cmd", v: c }]);
    setHistory((h) => [c, ...h.filter((x) => x !== c)].slice(0, 30));
    setHistIdx(-1);
    setCommand("");
    setBusy(true);
    startedAtRef.current = Date.now();
    setElapsed(0);
    const t0 = Date.now();
    try {
      const d = await api("/api/agent/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, command: c }),
      });
      if (d.stdout) setLines((l) => [...l, { t: "out", v: d.stdout }]);
      if (d.stderr) setLines((l) => [...l, { t: "err", v: d.stderr }]);
      setLines((l) => [
        ...l,
        { t: "meta", code: d.code, ms: Date.now() - t0, timedOut: !!d.timedOut, truncated: !!d.truncated },
      ]);
    } catch (e) {
      setLines((l) => [...l, { t: "err", v: e?.message || String(e) }]);
    }
    setBusy(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setCommand(history[next]);
      return;
    }
    if (e.key === "ArrowDown" && histIdx >= 0) {
      e.preventDefault();
      if (histIdx === 0) {
        setHistIdx(-1);
        setCommand("");
        return;
      }
      const next = histIdx - 1;
      setHistIdx(next);
      setCommand(history[next]);
    }
  };

  const copyAll = async () => {
    const text = lines
      .map((l) => (l.t === "cmd" ? `$ ${l.v}` : l.t === "meta" ? `# exit ${l.code} (${l.ms}ms)` : l.v))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
      {/* Header ringkas */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-[var(--t-line-soft)] min-w-0">
        <span className="grid place-items-center size-7 rounded-[8px] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] shrink-0" aria-hidden>
          <span className="material-symbols-outlined text-[16px]">terminal</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-[var(--t-ink)] leading-tight truncate">Terminal</p>
          <p className="text-[10.5px] font-mono text-[var(--t-muted)] truncate leading-tight" title={project}>
            {projectName}
          </p>
        </div>
        {cmdCount > 0 && (
          <span className="an-chip shrink-0 tabular-nums">
            {cmdCount} perintah
          </span>
        )}
        <button
          type="button"
          onClick={copyAll}
          disabled={!lines.length}
          title="Salin semua output"
          aria-label="Salin semua output"
          className="grid place-items-center size-7 rounded-[8px] border border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
        >
          <span className="material-symbols-outlined text-[15px]">{copied ? "check" : "content_copy"}</span>
        </button>
        <button
          type="button"
          onClick={() => setLines([])}
          disabled={busy || !lines.length}
          title="Bersihkan output"
          aria-label="Bersihkan output"
          className="grid place-items-center size-7 rounded-[8px] border border-[var(--t-line)] text-[var(--t-muted)] hover:text-[var(--t-ink)] hover:bg-[var(--t-raised)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
        >
          <span className="material-symbols-outlined text-[15px]">mop</span>
        </button>
      </div>

      {/* Output console */}
      <div className="flex-1 min-h-0 overflow-auto overscroll-contain scroll-thin-x bg-[#05070a] px-3 sm:px-4 py-2.5 font-mono text-[11px] sm:text-[11.5px] leading-[1.55]">
        {lines.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div className="max-w-[320px] space-y-2">
              <span className="material-symbols-outlined text-[28px] text-[#3d444d]">terminal</span>
              <p className="text-[12px] text-[#8b949e]">Belum ada perintah dijalankan.</p>
              <p className="text-[10.5px] text-[#6e7681]">
                Command dijalankan di folder project ({projectName}). Tekan Enter untuk menjalankan.
              </p>
            </div>
          </div>
        ) : null}
        {lines.map((l, i) => {
          if (l.t === "cmd") {
            return (
              <div key={i} className="flex gap-2 pt-1">
                <span className="text-[#7ee787] select-none shrink-0">$</span>
                <pre className="whitespace-pre text-[#e6edf3] min-w-0">{l.v}</pre>
              </div>
            );
          }
          if (l.t === "meta") {
            const ok = l.code === 0 && !l.timedOut;
            return (
              <div key={i} className="flex items-center gap-2 py-1">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[9.5px] font-medium ${
                    ok ? "bg-[#1f6f3a]/25 text-[#7ee787]" : "bg-[#8b2c2c]/30 text-[#ff7b72]"
                  }`}
                >
                  <span className="material-symbols-outlined text-[11px]">
                    {ok ? "check_circle" : l.timedOut ? "timer_off" : "error"}
                  </span>
                  {l.timedOut ? "timeout" : `exit ${l.code}`}
                </span>
                <span className="text-[9.5px] text-[#6e7681] tabular-nums">{l.ms}ms</span>
                {l.truncated ? <span className="text-[9.5px] text-[#6e7681]">output dipotong</span> : null}
              </div>
            );
          }
          return (
            <pre
              key={i}
              className={`whitespace-pre ${
                l.t === "err" ? "text-[#ff7b72]" : "text-[#c9d1d9]"
              }`}
            >
              {l.v}
            </pre>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 py-1 text-[#8b949e]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7ee787] animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#7ee787]/70 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#7ee787]/40 animate-bounce [animation-delay:300ms]" />
            </span>
            <span>menjalankan…</span>
            <span className="tabular-nums text-[#6e7681]">{(elapsed / 1000).toFixed(1)}s</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-3 sm:px-4 py-2.5 border-t border-[var(--t-line-soft)] bg-[var(--t-card)]">
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] focus-within:border-[var(--t-accent)] transition-colors pl-2.5 pr-1.5 h-10 min-w-0">
          <span className="font-mono text-[13px] text-[var(--t-star-ink)] shrink-0 select-none">$</span>
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="mis. npm run build"
            aria-label="Perintah terminal"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 min-w-0 bg-transparent font-mono text-[12.5px] text-[var(--t-ink)] outline-none placeholder:font-sans placeholder:text-[var(--t-dim)]"
          />
          <button
            type="button"
            onClick={run}
            disabled={busy || !command.trim()}
            title="Jalankan perintah"
            className="flex items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3.5 rounded-[8px] bg-primary text-white text-[11.5px] font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
          >
            {busy ? (
              <Spinner className="text-white" />
            ) : (
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            )}
            <span className="hidden sm:inline">Jalankan</span>
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-[var(--t-dim)] truncate hidden sm:block">
          Enter untuk menjalankan &middot; ↑/↓ riwayat perintah &middot; cwd: {projectName}
        </p>
      </div>
    </div>
  );
}

function ProviderSettings() {
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState({ id: "", name: "", baseUrl: "", apiKey: "" });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () =>
    api("/api/agent/providers").then((d) => setProviders(d.providers || [])).catch((e) => setErr(e?.message || String(e)));
  useEffect(() => {
    load();
  }, []);

  const normName = form.name.trim().toLowerCase();
  const normUrl = form.baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  const isDup = (p) => (p.name || "").trim().toLowerCase() === normName && (p.baseUrl || "").trim().replace(/\/+$/, "").toLowerCase() === normUrl;
  const duplicate = Boolean(normName && normUrl) && providers.some((p) => p.id !== form.id && isDup(p));
  const canSave = form.name.trim() && form.baseUrl.trim() && !duplicate && busy !== "save";

  const save = async () => {
    setErr("");
    setMsg("");
    setBusy("save");
    try {
      await api("/api/agent/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: form.id || undefined }),
      });
      setMsg("Tersimpan.");
      setForm({ id: "", name: "", baseUrl: "", apiKey: "" });
      load();
    } catch (e) {
      setErr(e?.message || String(e));
    }
    setBusy("");
  };

  const reload = async (id) => {
    setErr("");
    setMsg("");
    setBusy(id);
    try {
      const d = await api("/api/agent/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reload-models", id }),
      });
      setMsg(`Ditemukan ${d.models.length} model.`);
      load();
    } catch (e) {
      setErr(e?.message || String(e));
    }
    setBusy("");
  };

  const del = async (id) => {
    if (!confirm("Hapus provider ini?")) return;
    await api("/api/agent/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    load();
  };

  const edit = (p) => setForm({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: "" });

  const inputCls = "w-full rounded-xl border border-border bg-surface-2/40 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div className="an-panel p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">{form.id ? "edit" : "add_circle"}</span>
          <h3 className="font-semibold text-sm">{form.id ? "Edit provider" : "Tambah provider"}</h3>
        </div>
        <input placeholder="Nama (mis. OpenAI, DeepSeek, lokal)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        <input placeholder="Base URL (mis. https://api.openai.com/v1)" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} className={`${inputCls} font-mono`} />
        <input type="password" placeholder={form.id ? "API key (kosongkan = tidak diubah)" : "API key"} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} className={`${inputCls} font-mono`} />
        {duplicate && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2">
            <span className="material-symbols-outlined text-[16px] text-amber-500">warning</span>
            <p className="text-[11px] text-amber-600">Provider dengan nama + base URL yang sama sudah ada. Ubah nama atau base URL-nya.</p>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={!canSave} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 cursor-pointer">
            {busy === "save" ? <Spinner className="text-white" /> : <span className="material-symbols-outlined text-[17px]">save</span>}
            Simpan
          </button>
          {form.id && (
            <button onClick={() => setForm({ id: "", name: "", baseUrl: "", apiKey: "" })} className="rounded-xl px-4 py-2 text-sm font-medium text-text-muted hover:text-text cursor-pointer">
              Batal
            </button>
          )}
        </div>
        {err && <p className="text-xs text-rose-500">{err}</p>}
        {msg && <p className="text-xs text-emerald-500">{msg}</p>}
        <p className="text-[11px] text-text-muted pt-1 border-t border-border">
          Endpoint harus kompatibel OpenAI: <code className="font-mono">GET /models</code> + <code className="font-mono">POST /chat/completions</code>.
        </p>
      </div>

      <div className="an-panel p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-text-muted text-[20px]">database</span>
          <h3 className="font-semibold text-sm">Provider tersimpan</h3>
          <span className="text-[11px] text-text-muted">({providers.length})</span>
        </div>
        {providers.length === 0 && <p className="text-sm text-text-muted">Belum ada provider.</p>}
        {providers.map((p) => (
          <div key={p.id} className="an-panel p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary shrink-0">
                <span className="material-symbols-outlined text-[17px]">hub</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{p.name}</p>
                <p className="text-[11px] font-mono text-text-muted truncate">{p.baseUrl}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <span className="font-mono truncate flex-1">key {p.apiKey || "—"}</span>
              <StatusPill tone={p.models?.length ? "ok" : "neutral"}>{p.models?.length || 0} model</StatusPill>
            </div>
            <div className="flex items-center gap-1 pt-1">
              <button onClick={() => edit(p)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text cursor-pointer">Edit</button>
              <button onClick={() => reload(p.id)} disabled={busy === p.id} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50 cursor-pointer">
                {busy === p.id && <Spinner />}
                Reload models
              </button>
              <div className="flex-1" />
              <button onClick={() => del(p.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 cursor-pointer">Hapus</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
