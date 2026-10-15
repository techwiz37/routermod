"use client";

import { useEffect, useRef, useState } from "react";

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled || models.length === 0}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left min-w-[240px] max-w-[360px] disabled:opacity-50 cursor-pointer hover:border-primary/40 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">neurology</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-xs font-medium">{selected ? selected.name : models.length ? "Pilih model…" : "(belum ada model)"}</span>
          {selected && (
            <span className="mt-1 flex items-center gap-1.5 flex-wrap">
              {selected.providerName && <span className="text-[9px] text-text-muted shrink-0">{selected.providerName}</span>}
              <CapBadges caps={selected.caps} size="text-[9px]" />
              {selected.caps?.contextWindow ? <span className="text-[9px] text-text-muted">{fmtContext(selected.caps.contextWindow)}</span> : null}
            </span>
          )}
        </span>
        <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">expand_more</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-[360px] max-w-[90vw] rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari model…"
              className="w-full rounded-lg bg-surface-2 border border-border px-2.5 py-1.5 text-xs outline-none focus:border-primary/40"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">Tidak ada model.</p>}
            {filtered.map((m) => {
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
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-2 transition-colors ${active ? "bg-primary/5 text-primary font-medium" : "text-text"}`}
                >
                  <span className="block truncate">{m.name || friendlyModelName(m.id)}</span>
                </button>
              );
            })}
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
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 flex items-start gap-3">
        <span className="material-symbols-outlined text-rose-500">error</span>
        <div>
          <p className="text-sm font-medium text-rose-500">Gagal memuat agent</p>
          <p className="text-xs text-text-muted mt-0.5">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted p-6">
        <Spinner className="text-primary" /> Memuat agent…
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="max-w-2xl mx-auto mt-6 rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500">
            <span className="material-symbols-outlined">shield_lock</span>
          </div>
          <div>
            <h2 className="text-base font-semibold">AI Agent nonaktif</h2>
            <p className="text-xs text-text-muted">Fitur ini memberi akses file, terminal, dan eksekusi model ke server.</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-muted">Aktifkan lewat environment variable lalu restart server:</p>
          <pre className="text-xs leading-relaxed bg-surface-2 border border-border rounded-xl p-4 overflow-x-auto font-mono">
{`AGENT_ENABLED=1
AGENT_ROOT_MODE=projects        # "projects" atau "full" (seluruh disk)
AGENT_PROJECTS_ROOT=/root       # Windows: C:\\Users\\<kamu>\\Desktop
AGENT_ALLOW_TERMINAL=1          # izinkan jalankan command
AGENT_TERMINAL_TIMEOUT_MS=120000`}
          </pre>
          <p className="text-xs text-text-muted">
            Set lewat <code className="px-1 py-0.5 rounded bg-surface-2 font-mono">ecosystem.config.js</code> (blok <code className="px-1 py-0.5 rounded bg-surface-2 font-mono">env</code>) atau <code className="px-1 py-0.5 rounded bg-surface-2 font-mono">.env.local</code>, lalu{" "}
            <code className="px-1 py-0.5 rounded bg-surface-2 font-mono">pm2 restart routermod</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined">smart_toy</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold leading-none">AI Agent</h1>
              <StatusPill tone={status.rootMode === "full" ? "warn" : "ok"}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {status.rootMode === "full" ? "Full disk" : "Project-scoped"}
              </StatusPill>
              {status.terminalEnabled && <StatusPill tone="warn">Terminal</StatusPill>}
            </div>
            <p className="text-[11px] text-text-muted mt-1 font-mono truncate max-w-[320px]">{status.projectsRoot}</p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <span className="material-symbols-outlined text-[18px] text-text-muted">folder_open</span>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="bg-transparent text-sm outline-none min-w-[180px] cursor-pointer"
          >
            {projects.length === 0 && <option value="">(tidak ada folder project)</option>}
            {projects.map((p) => (
              <option key={p.path} value={p.path}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1 w-fit">
        {TABS.map((t) => {
          if (t.id === "terminal" && !status.terminalEnabled) return null;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                active ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
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
  const [statusText, setStatusText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef(null);
  const startedAtRef = useRef(0);

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

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return undefined;
    }
    startedAtRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [statusText]);

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

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !ready) return;
    setInput("");
    setBusy(true);
    setNotice("");
    const history = [
      ...log
        .filter((e) => (e.kind === "user" || e.kind === "assistant") && (e.text || "").trim())
        .map((e) => ({ role: e.kind, content: e.text })),
      { role: "user", content: text },
    ];
    setLog((l) => [...l, { kind: "user", text }]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, providerId, model, messages: history }),
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
          if (ev.type === "status") {
            setStatusText(ev.text || "");
          } else if (ev.type === "assistant_text") {
            assistantText += ev.text;
            setStatusText((s) => (s && s !== "Model sedang mengetik…" ? "Model sedang mengetik…" : s));
            setLog((l) => {
              const copy = [...l];
              if (copy[copy.length - 1]?.kind === "assistant") copy[copy.length - 1] = { kind: "assistant", text: assistantText };
              else copy.push({ kind: "assistant", text: assistantText });
              return copy;
            });
          } else if (ev.type === "tool_call") {
            assistantText = "";
            setStatusText(`${TOOL_META[ev.name]?.label || ev.name}…`);
            setLog((l) => [...l, { kind: "tool", id: ev.id, name: ev.name, args: ev.args, result: null, state: "running" }]);
          } else if (ev.type === "tool_result") {
            setStatusText("Menganalisis hasil…");
            setLog((l) => l.map((e) => (e.kind === "tool" && e.id === ev.id ? { ...e, result: ev.result, state: ev.ok ? "done" : "error" } : e)));
          } else if (ev.type === "error") {
            setStatusText("");
            setLog((l) => [...l, { kind: "error", text: ev.error }]);
          } else if (ev.type === "done") {
            setStatusText("");
            assistantText = "";
          }
        }
      }
    } catch (e) {
      setLog((l) => [...l, { kind: "error", text: e?.message || String(e) }]);
    } finally {
      setBusy(false);
      setStatusText("");
    }
  };

  return (
    <div className="h-full rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border bg-surface-2/40">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
          <span className="material-symbols-outlined text-[16px] text-text-muted">hub</span>
          <select value={providerId} onChange={(e) => onSelectProvider(e.target.value)} className="bg-transparent text-xs outline-none cursor-pointer min-w-[110px]">
            {providers.length === 0 && <option value="">(belum ada provider)</option>}
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <ModelPicker models={models} value={model} onChange={setModel} disabled={!models.length} />
        <button
          onClick={reload}
          disabled={reloading || !providerId}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {reloading ? <Spinner /> : <span className="material-symbols-outlined text-[16px]">refresh</span>}
          Reload Models
        </button>
        <div className="flex-1" />
        <button onClick={() => setLog([])} disabled={busy} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors disabled:opacity-50 cursor-pointer">
          Clear
        </button>
      </div>

      {notice && <div className="px-4 py-2 text-xs text-primary bg-primary/5 border-b border-border">{notice}</div>}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
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
          <div key={i} className="flex gap-3">
            {e.kind === "user" && (
              <>
                <div className="shrink-0 mt-0.5 grid place-items-center h-6 w-6 rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[15px]">person</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{e.text}</p>
              </>
            )}
            {e.kind === "assistant" && (
              <>
                <div className="shrink-0 mt-0.5 grid place-items-center h-6 w-6 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <span className="material-symbols-outlined text-[15px]">smart_toy</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {e.text}
                  {busy && i === log.length - 1 && (
                    <span className="inline-block ml-0.5 h-4 w-[7px] translate-y-[2px] bg-primary animate-pulse" />
                  )}
                </p>
              </>
            )}
            {e.kind === "tool" && <ToolCard entry={e} />}
            {e.kind === "error" && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-500/5 border border-rose-500/20 px-3 py-2 w-full">
                <span className="material-symbols-outlined text-[15px] text-rose-500">error</span>
                <span className="text-xs text-rose-500 whitespace-pre-wrap">{e.text}</span>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 w-full fade-in">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
            </span>
            <span className="text-xs text-text font-medium">
              {elapsed > 10 && (statusText === "Menghubungi model…" || statusText === "Model sedang berpikir…")
                ? "Menunggu model merespons…"
                : statusText || "Berpikir…"}
            </span>
            <span className="flex-1" />
            <span className="font-mono text-[11px] text-text-muted tabular-nums">{elapsed}s</span>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-2/40 focus-within:border-primary/40 transition-colors p-1.5 pl-3">
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
            placeholder={ready ? "Tulis instruksi… (Enter kirim, Shift+Enter baris baru)" : "Pilih provider & model dulu, atau klik Reload Models"}
            className="flex-1 bg-transparent py-1.5 text-sm resize-none outline-none max-h-40"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim() || !ready}
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
      <div className="flex flex-col rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] overflow-hidden min-h-[300px]">
        <div className="flex items-center gap-2 p-2.5 border-b border-border bg-surface-2/40">
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

      <div className="flex flex-col rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] overflow-hidden min-h-[300px]">
        {editing ? (
          <>
            <div className="flex items-center gap-2 p-2.5 border-b border-border bg-surface-2/40">
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
    <div className="h-full rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-surface-2/40">
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
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/40 focus-within:border-primary/40 transition-colors px-3 py-1">
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
      <div className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-5 space-y-3">
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

      <div className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-text-muted text-[20px]">database</span>
          <h3 className="font-semibold text-sm">Provider tersimpan</h3>
          <span className="text-[11px] text-text-muted">({providers.length})</span>
        </div>
        {providers.length === 0 && <p className="text-sm text-text-muted">Belum ada provider.</p>}
        {providers.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface-2/30 p-3.5 space-y-2">
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
