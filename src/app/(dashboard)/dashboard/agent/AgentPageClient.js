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

function sessionKey(project) {
  return `routermod:agent-session:${project || ""}`;
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

function StatusPill({ tone = "neutral", children }) {
  const tones = {
    neutral: "bg-surface-2 text-text-muted border-border",
    ok: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    warn: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    danger: "bg-rose-500/10 text-rose-500 border-rose-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${tones[tone]}`}>
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

function ToolCard({ entry }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[entry.name] || { icon: "build", label: entry.name || "tool", tone: "text-text-muted" };
  const running = entry.state === "running";
  const failed = entry.state === "error";
  const done = entry.state === "done";
  const out = toolResultText(entry.result);
  const target = toolTarget(entry);
  const bytes = done ? entry.result?.bytes : null;

  return (
    <div className="w-full rounded-xl border border-border bg-surface-2/50 overflow-hidden slide-in-right">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`material-symbols-outlined text-[15px] shrink-0 ${failed ? "text-rose-500" : done ? meta.tone : "text-primary"} ${running ? "animate-pulse" : ""}`}>
          {meta.icon}
        </span>
        <span className="text-xs font-medium shrink-0">{meta.label}</span>
        {target && <span className="font-mono text-[11px] text-text-muted truncate flex-1" title={target}>{target}</span>}
        {!target && <span className="flex-1" />}
        {typeof bytes === "number" && <span className="text-[10px] text-text-muted shrink-0">{fmtSize(bytes)}</span>}
        {done && <span className="material-symbols-outlined text-[15px] text-emerald-500 shrink-0">check_circle</span>}
        {failed && <span className="material-symbols-outlined text-[15px] text-rose-500 shrink-0">cancel</span>}
        {running && <Spinner className="text-primary shrink-0" />}
        {entry.result != null && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[10px] font-medium text-text-muted hover:text-primary transition-colors cursor-pointer shrink-0"
          >
            {open ? "Sembunyikan" : "Hasil"}
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
    <div ref={ref} className="relative w-full sm:w-auto min-w-0 basis-full sm:basis-auto">
      <button
        type="button"
        disabled={disabled || models.length === 0}
        onClick={() => setOpen((o) => !o)}
        className="an-btn an-ghost h-auto min-h-[38px] w-full sm:w-auto sm:min-w-[240px] sm:max-w-[360px] justify-start gap-2 px-2.5 py-2 sm:py-1.5 text-left disabled:opacity-50 cursor-pointer items-start sm:items-center"
      >
        <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">neurology</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-xs font-medium">{selected ? selected.name : models.length ? "Pilih model…" : "(belum ada model)"}</span>
          {selected && (
            <span className="mt-1 flex items-center gap-1.5 flex-wrap min-w-0">
              {selected.providerName && <span className="text-[9px] text-text-muted shrink-0">{selected.providerName}</span>}
              <CapBadges caps={selected.caps} size="text-[9px]" />
              {selected.caps?.contextWindow ? <span className="text-[9px] text-text-muted">{fmtContext(selected.caps.contextWindow)}</span> : null}
            </span>
          )}
        </span>
        <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">expand_more</span>
      </button>

      {open && (
        <div className="an-panel absolute z-30 mt-1 left-0 right-0 sm:right-auto sm:w-[360px] sm:max-w-[90vw] max-w-[calc(100vw-32px)] overflow-hidden">
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
                      className={`flex w-full items-center gap-2 text-left px-3 py-2 text-xs hover:bg-surface-2 transition-colors ${active ? "bg-primary/5 text-primary font-medium" : "text-text"}`}
                    >
                      <span className="flex-1 min-w-0 truncate">{m.name || friendlyModelName(m.id)}</span>
                      {active && <span className="material-symbols-outlined text-[15px] shrink-0">check</span>}
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
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">shield_lock</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="an-panel-title">AI Agent nonaktif</h2>
              <p className="an-panel-sub">
                Fitur ini memberi akses file, terminal, dan eksekusi model ke server.
              </p>
            </div>
          </header>
          <div className="an-panel-pad flex flex-col gap-4">
            <p className="text-[13px] text-[var(--t-muted)]">
              Aktifkan lewat environment variable lalu restart server:
            </p>
            <pre className="text-[11px] leading-relaxed rounded-[10px] border border-[var(--t-line)] bg-[var(--t-raised)] p-4 overflow-x-auto font-mono text-[var(--t-ink)]">
{`AGENT_ENABLED=1
AGENT_ROOT_MODE=projects        # "projects" atau "full" (seluruh disk)
AGENT_PROJECTS_ROOT=/root       # Windows: C:\\Users\\<kamu>\\Desktop
AGENT_ALLOW_TERMINAL=1          # izinkan jalankan command
AGENT_TERMINAL_TIMEOUT_MS=120000`}
          </pre>
          <p className="text-xs text-[var(--t-muted)]">
            Set lewat <code className="px-1 py-0.5 rounded bg-[var(--t-raised)] font-mono">.env.local</code>, lalu
            restart server.
          </p>
        </div>
      </section>
      </div>
    );
  }

  return (
    <div className="an-scope flex flex-col gap-4 h-full min-h-0">
      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">smart_toy</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="an-panel-title">AI Agent</h2>
              <StatusPill tone={status.rootMode === "full" ? "warn" : "ok"}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {status.rootMode === "full" ? "Full disk" : "Project-scoped"}
              </StatusPill>
              {status.terminalEnabled && <StatusPill tone="warn">Terminal</StatusPill>}
            </div>
            <p className="an-panel-sub font-mono truncate">{status.projectsRoot}</p>
          </div>
        </header>
        <div className="an-panel-pad !py-3">
          <div className="flex items-center gap-2 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] px-3 py-2 min-w-0 w-full sm:w-auto sm:max-w-[280px]">
            <span className="material-symbols-outlined text-[16px] text-[var(--t-muted)] shrink-0">
              folder_open
            </span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="an-select !w-full !h-6 !border-0 !bg-transparent !pl-0 !pr-6 !text-[12px] cursor-pointer truncate"
              aria-label="Pilih project"
            >
              {projects.length === 0 && <option value="">(tidak ada folder project)</option>}
              {projects.map((p) => (
                <option key={p.path} value={p.path}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="-mx-1 px-1 overflow-x-auto">
        <div className="an-segmented an-segmented-sm w-fit min-w-full sm:min-w-0">
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

      <div className="flex-1 min-h-0">
        {tab === "chat" && <AgentChat project={project} terminalEnabled={status.terminalEnabled} />}
        {tab === "files" && <FileManager project={project} />}
        {tab === "terminal" && <Terminal project={project} />}
        {tab === "settings" && <ProviderSettings />}
      </div>
    </div>
  );
}

function AgentChat({ project, terminalEnabled }) {
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [notice, setNotice] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const saveTimer = useRef(null);
  const openingRef = useRef(false);

  const applyProviders = (list, preferredId) => {
    const id = preferredId || providerId || list[0]?.id || "";
    const p = list.find((x) => x.id === id);
    setProviders(list);
    setProviderId(id);
    setModel((m) => {
      const valid = (p?.models || []).some((x) => x.id === m);
      return valid ? m : p?.defaultModel || p?.models?.[0]?.id || "";
    });
  };

  useEffect(() => {
    api("/api/agent/providers").then((d) => applyProviders(d.providers || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [log]);

  const openSession = async (id) => {
    if (!id) return;
    openingRef.current = true;
    try {
      const d = await api(`/api/agent/sessions?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`);
      setSessionId(d.session.id);
      setLog(Array.isArray(d.session.log) ? d.session.log : []);
      localStorage.setItem(sessionKey(project), d.session.id);
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
  }, [log, busy, sessionId, project]);

  const activeProvider = providers.find((p) => p.id === providerId);
  const models = activeProvider?.models || [];
  const ready = providerId && model;

  const onSelectProvider = (id) => {
    const p = providers.find((x) => x.id === id);
    setProviderId(id);
    setModel(p?.defaultModel || p?.models?.[0]?.id || "");
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

  const send = async () => {
    const text = input.trim();
    if ((!text && !attachments.length) || busy || !ready) return;
    const outgoing = attachments;
    setInput("");
    setAttachments([]);
    setBusy(true);
    setNotice("");
    const history = [
      ...log
        .filter((e) => (e.kind === "user" || e.kind === "assistant") && ((e.text || "").trim() || e.media?.length))
        .map((e) => ({
          role: e.kind,
          content: (e.text || "").trim() || (e.kind === "user" ? "(melampirkan media)" : ""),
        })),
      { role: "user", content: text || "(melampirkan media)" },
    ];
    setLog((l) => [...l, { kind: "user", text, media: outgoing.map((m) => ({ name: m.name, kind: m.kind, data: m.data })) }]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          providerId,
          model,
          messages: history,
          attachments: outgoing.map((m) => ({ name: m.name, mime: m.mime, data: m.data })),
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
          if (ev.type === "assistant_text") {
            assistantText += ev.text;
            setLog((l) => {
              const copy = [...l];
              if (copy[copy.length - 1]?.kind === "assistant") copy[copy.length - 1] = { kind: "assistant", text: assistantText };
              else copy.push({ kind: "assistant", text: assistantText });
              return copy;
            });
          } else if (ev.type === "tool_call") {
            assistantText = "";
            setLog((l) => [...l, { kind: "tool", id: ev.id, name: ev.name, args: ev.args, result: null, state: "running" }]);
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
            if (ev.model) {
              setModel(ev.model);
              setLog((l) => [
                ...l,
                {
                  kind: "notice",
                  text: `Model ${ev.model} dipakai (model sebelumnya tidak tersedia).`,
                },
              ]);
            }
          } else if (ev.type === "done") {
            assistantText = "";
          }
        }
      }
    } catch (e) {
      setLog((l) => [...l, { kind: "error", text: e?.message || String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="an-panel h-full flex flex-col overflow-hidden">
      <div className="an-panel-pad !py-3 flex flex-wrap items-center gap-2 min-w-0">
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] px-2.5 py-1.5 basis-full sm:basis-auto">
          <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">hub</span>
          <select value={providerId} onChange={(e) => onSelectProvider(e.target.value)} className="bg-transparent text-xs outline-none cursor-pointer w-full sm:w-auto sm:min-w-[110px]">
            {providers.length === 0 && <option value="">(belum ada provider)</option>}
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <ModelPicker models={models} value={model} onChange={setModel} disabled={!models.length} />
        <button
          onClick={reload}
          disabled={reloading || !providerId}
          className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 disabled:opacity-50"
        >
          {reloading ? <Spinner /> : <span className="material-symbols-outlined text-[16px]">refresh</span>}
          Reload Models
        </button>
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] px-2.5 py-1.5 min-w-0">
          <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">history</span>
          <select
            value={sessionId}
            onChange={(e) => openSession(e.target.value)}
            className="bg-transparent text-xs outline-none cursor-pointer w-full sm:w-auto sm:max-w-[160px] truncate"
            title={sessions.find((s) => s.id === sessionId)?.title || "Sesi chat"}
          >
            {sessions.length === 0 && <option value="">(sesi kosong)</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.title || "Sesi").slice(0, 40)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={newSession}
          disabled={busy}
          title="Sesi baru"
          className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">add_comment</span>
          Sesi baru
        </button>
        <button
          onClick={forgetSession}
          disabled={busy || !sessionId || sessions.length === 0}
          title="Hapus sesi ini"
          className="an-btn h-8 px-3 text-[11px] gap-1.5 border border-[rgba(232,0,31,0.32)] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
          Hapus
        </button>
        <div className="hidden sm:block sm:flex-1" />
        <button onClick={() => setLog([])} disabled={busy} className="an-btn an-ghost h-8 px-3 text-[11px] disabled:opacity-50">
          {translate("Clear chat")}
        </button>
      </div>

      {notice && <div className="px-4 py-2 text-xs text-primary bg-primary/5 border-b border-border">{notice}</div>}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 text-sm">
        {log.length === 0 && (
          <div className="h-full grid place-items-center text-center">
            <div className="max-w-sm space-y-3">
              <div className="mx-auto grid place-items-center h-12 w-12 rounded-2xl bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-[26px]">robot_2</span>
              </div>
              <p className="text-sm text-text-muted">Tanya apa saja soal project. Agent bisa baca, tulis, hapus file{terminalEnabled ? ", dan menjalankan command" : ""}.</p>
              <p className="text-xs text-text-muted/70 font-mono">&ldquo;baca package.json lalu tambahkan script test&rdquo;</p>
            </div>
          </div>
        )}
        {log.map((e, i) => (
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
                  {e.text?.trim() && (
                    <p className="whitespace-pre-wrap leading-relaxed break-words [overflow-wrap:anywhere] min-w-0">
                      {e.text}
                    </p>
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
        <div className="flex items-end gap-2 rounded-[12px] border border-[var(--t-line)] bg-[var(--t-field)] focus-within:border-[var(--t-accent)] transition-colors p-1.5 pl-3 min-w-0">
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={ready ? "Tulis instruksi…" : "Pilih model dulu"}
            title="Enter untuk kirim, Shift+Enter untuk baris baru"
            className="flex-1 min-w-0 bg-transparent py-1.5 text-sm resize-none outline-none max-h-40 placeholder:text-[var(--t-dim)]"
          />
          <button
            onClick={send}
            disabled={busy || (!input.trim() && !attachments.length) || !ready}
            className="grid place-items-center h-9 w-9 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
          >
            {busy ? <Spinner className="text-white" /> : <span className="material-symbols-outlined text-[18px]">arrow_upward</span>}
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

  const openFile = async (name) => {
    const p = cwd === "." ? name : `${cwd}/${name}`;
    try {
      const d = await api(`/api/agent/files?action=read&project=${encodeURIComponent(project)}&path=${encodeURIComponent(p)}`);
      if (d.binary) {
        setErr("File biner, tidak bisa dibuka di editor.");
        return;
      }
      setEditing({ path: p, content: d.content });
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  const save = async () => {
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
    if (!confirm(`Hapus "${name}"?`)) return;
    const p = cwd === "." ? name : `${cwd}/${name}`;
    try {
      await api("/api/agent/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", project, path: p, recursive: true }),
      });
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

  const crumbs = (cwd === "." ? [] : cwd.split("/").filter(Boolean));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0">
      <div className="an-panel flex flex-col overflow-hidden min-h-[300px]">
        <div className="an-panel-pad !py-2.5 flex items-center gap-2">
          <button onClick={up} disabled={cwd === "."} className="grid place-items-center h-7 w-7 rounded-lg border border-border text-text-muted hover:text-primary disabled:opacity-40 cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
          </button>
          <div className="flex items-center gap-1 text-xs font-mono text-text-muted truncate flex-1 min-w-0">
            <button onClick={() => load(".")} className="hover:text-primary cursor-pointer">{project?.split(/[\\/]/).pop() || "root"}</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                <span className="text-text-muted/50">/</span>
                <button onClick={() => load(crumbs.slice(0, i + 1).join("/"))} className="hover:text-primary truncate cursor-pointer">{c}</button>
              </span>
            ))}
          </div>
          <button onClick={() => load(cwd)} className="grid place-items-center h-7 w-7 rounded-lg border border-border text-text-muted hover:text-primary cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {err && <p className="text-xs text-rose-500 p-3">{err}</p>}
          {data?.entries?.map((e) => (
            <div key={e.name} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 text-sm group">
              <span className={`material-symbols-outlined text-[18px] ${e.type === "dir" ? "text-primary" : "text-text-muted"}`}>
                {e.type === "dir" ? "folder" : "draft"}
              </span>
              <button
                className="flex-1 text-left truncate font-mono text-[13px]"
                onClick={() => (e.type === "dir" ? load(cwd === "." ? e.name : `${cwd}/${e.name}`) : openFile(e.name))}
              >
                {e.name}
              </button>
              <span className="text-[10px] text-text-muted tabular-nums">{e.type === "file" ? fmtSize(e.size) : ""}</span>
              <button className="opacity-0 group-hover:opacity-100 text-rose-500 cursor-pointer" onClick={() => remove(e.name)} title="Hapus">
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          ))}
          {data && data.entries?.length === 0 && <p className="text-xs text-text-muted p-3">(folder kosong)</p>}
        </div>
      </div>

      <div className="an-panel flex flex-col overflow-hidden min-h-[300px]">
        {editing ? (
          <>
            <div className="an-panel-pad !py-2.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-text-muted">draft</span>
              <span className="font-mono text-xs truncate flex-1">{editing.path}</span>
              <button onClick={() => setEditing(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text cursor-pointer">
                Tutup
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Spinner className="text-white" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
                Simpan
              </button>
            </div>
            <textarea
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              className="flex-1 w-full bg-surface-2/40 p-3 font-mono text-xs resize-none outline-none leading-relaxed"
              spellCheck={false}
            />
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-center p-6">
            <div className="space-y-2">
              <span className="material-symbols-outlined text-[34px] text-text-muted/40">edit_document</span>
              <p className="text-sm text-text-muted">Pilih file di kiri untuk mengedit, atau folder untuk masuk.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Terminal({ project }) {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const run = async () => {
    const c = command.trim();
    if (!c || busy) return;
    setLines((l) => [...l, { t: "cmd", v: c }]);
    setCommand("");
    setBusy(true);
    try {
      const d = await api("/api/agent/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, command: c }),
      });
      if (d.stdout) setLines((l) => [...l, { t: "out", v: d.stdout }]);
      if (d.stderr) setLines((l) => [...l, { t: "err", v: d.stderr }]);
      setLines((l) => [...l, { t: "meta", v: `exit ${d.code}${d.timedOut ? " · TIMEOUT" : ""}` }]);
    } catch (e) {
      setLines((l) => [...l, { t: "err", v: e?.message || String(e) }]);
    }
    setBusy(false);
  };

  return (
    <div className="an-panel h-full flex flex-col overflow-hidden">
      <div className="an-panel-pad !py-2.5 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-primary">terminal</span>
        <span className="text-xs font-medium">Terminal</span>
        <span className="text-[11px] font-mono text-text-muted truncate">{project?.split(/[\\/]/).pop()}</span>
        <div className="flex-1" />
        <button onClick={() => setLines([])} disabled={busy} className="rounded-lg px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text disabled:opacity-50 cursor-pointer">
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1.5 bg-black/20">
        {lines.length === 0 && <p className="text-text-muted">Command dijalankan dengan cwd = folder project.</p>}
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            {l.t === "cmd" && <span className="text-primary shrink-0">$</span>}
            <pre className={`whitespace-pre-wrap ${l.t === "cmd" ? "text-text" : l.t === "err" ? "text-rose-400" : l.t === "meta" ? "text-amber-500" : "text-text-muted"}`}>{l.v}</pre>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-text-muted">
            <Spinner /> menjalankan…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] focus-within:border-[var(--t-accent)] transition-colors px-3 py-1">
          <span className="text-primary font-mono text-sm">$</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="mis. npm run build"
            className="flex-1 bg-transparent py-1.5 font-mono text-sm outline-none"
          />
          <button onClick={run} disabled={busy || !command.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-40 cursor-pointer">
            Run
          </button>
        </div>
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
