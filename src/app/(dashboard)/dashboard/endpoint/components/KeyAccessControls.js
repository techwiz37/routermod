"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { Toggle, Button } from "@/shared/components";
import Modal from "@/shared/components/Modal";

// ─── helpers ────────────────────────────────────────────────────────────────

function groupByProvider(models) {
  const map = {};
  for (const m of models) {
    const p = m.provider || "unknown";
    if (!map[p]) map[p] = { provider: p, name: p, models: [] };
    map[p].models.push(m);
  }
  return Object.values(map).sort((a, b) => a.provider.localeCompare(b.provider));
}

function providerLabel(id) {
  const labels = {
    antigravity: "Antigravity", "gemini-cli": "Gemini CLI", openai: "OpenAI",
    anthropic: "Anthropic", google: "Google", mistral: "Mistral",
    groq: "Groq", cohere: "Cohere", xai: "xAI", deepseek: "DeepSeek",
    openrouter: "OpenRouter", perplexity: "Perplexity", together: "Together AI",
    fireworks: "Fireworks", "azure-openai": "Azure OpenAI",
  };
  return labels[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

// ─── Test result badge ───────────────────────────────────────────────────────

function TestBadge({ result }) {
  if (!result) return null;
  if (result === "pending")
    return <span className="text-[10px] font-mono text-text-muted animate-pulse">testing…</span>;
  if (result.ok)
    return (
      <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
        {result.ms < 1000 ? `${result.ms}ms` : `${(result.ms / 1000).toFixed(1)}s`}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold text-red-500 bg-red-500/10 border border-red-500/25 rounded px-1.5 py-0.5">
      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>error</span>
      fail
    </span>
  );
}

// ─── Provider section ────────────────────────────────────────────────────────

function ProviderSection({ group, selectedModels, onToggleModel, testResults }) {
  const allSelected = group.models.every(m => selectedModels.has(m.routedModel || `${m.provider}/${m.model}`));
  const someSelected = group.models.some(m => selectedModels.has(m.routedModel || `${m.provider}/${m.model}`));
  const [open, setOpen] = useState(someSelected);

  const toggleAll = () => {
    const ids = group.models.map(m => m.routedModel || `${m.provider}/${m.model}`);
    ids.forEach(id => onToggleModel(id, !allSelected));
  };

  return (
    <div className="border-2 border-border rounded-xl overflow-hidden shadow-[2px_2px_0_var(--color-border)]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 bg-surface-2 cursor-pointer select-none hover:bg-surface-3 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className={`size-1.5 rounded-full shrink-0 ${someSelected ? "bg-primary" : "bg-border"}`} />
        <span className="font-mono font-bold text-xs uppercase tracking-wider text-text-main flex-1">
          {providerLabel(group.provider)}
        </span>
        <span className="text-[10px] text-text-muted tabular-nums">
          {group.models.filter(m => selectedModels.has(m.routedModel || `${m.provider}/${m.model}`)).length}/{group.models.length}
        </span>
        {/* Select all toggle */}
        <label
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={e => { e.stopPropagation(); toggleAll(); }}
        >
          <div className={`relative w-7 h-4 rounded-full border-2 border-border transition-colors ${allSelected ? "bg-primary border-primary" : "bg-surface"}`}>
            <div className={`absolute top-0.5 size-2.5 rounded-full bg-white shadow transition-transform ${allSelected ? "translate-x-3" : "translate-x-0.5"}`} />
          </div>
          <span className="text-[10px] text-text-muted">{allSelected ? "All" : "None"}</span>
        </label>
        <span className="material-symbols-outlined text-[14px] text-text-muted transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>
          expand_more
        </span>
      </div>

      {/* Models */}
      {open && (
        <div className="divide-y divide-border/40">
          {group.models.map(m => {
            const id = m.routedModel || `${m.provider}/${m.model}`;
            const on = selectedModels.has(id);
            const res = testResults?.[id];
            return (
              <div key={id} className={`flex items-center gap-3 px-3 py-2 transition-colors ${on ? "bg-primary/5" : "bg-surface"}`}>
                {/* slider toggle */}
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onClick={() => onToggleModel(id, !on)}>
                  <div className={`relative w-8 h-4.5 rounded-full border-2 border-border transition-all shrink-0 ${on ? "bg-primary border-primary shadow-[0_0_0_1px_var(--color-primary)]" : "bg-surface-2"}`}
                    style={{ height: "18px", width: "32px" }}
                  >
                    <div className={`absolute top-0.5 size-2.5 rounded-full shadow transition-transform duration-200 ${on ? "bg-white translate-x-3.5" : "bg-text-muted translate-x-0.5"}`} />
                  </div>
                  <span className={`text-xs font-mono truncate ${on ? "text-text-main font-medium" : "text-text-muted"}`}>
                    {m.name || m.model}
                  </span>
                </label>
                {res && <TestBadge result={res} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Test results modal ──────────────────────────────────────────────────────

function TestModal({ isOpen, onClose, models, apiKeyId }) {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);

  const runTests = useCallback(async () => {
    if (!models.length) return;
    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setResults({});

    for (const modelId of models) {
      if (abortRef.current) break;
      setResults(prev => ({ ...prev, [modelId]: "pending" }));
      const t0 = Date.now();
      try {
        const res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json().catch(() => ({}));
        const ms = Date.now() - t0;
        setResults(prev => ({ ...prev, [modelId]: { ok: res.ok && data.ok !== false, ms } }));
      } catch (e) {
        setResults(prev => ({ ...prev, [modelId]: { ok: false, ms: Date.now() - t0 } }));
      }
      // small gap between tests
      await new Promise(r => setTimeout(r, 300));
    }
    setRunning(false);
    setDone(true);
  }, [models]);

  useEffect(() => {
    if (isOpen) runTests();
    return () => { abortRef.current = true; };
  }, [isOpen, runTests]);

  const ok = Object.values(results).filter(r => r && r !== "pending" && r.ok).length;
  const fail = Object.values(results).filter(r => r && r !== "pending" && !r.ok).length;
  const pending = Object.values(results).filter(r => r === "pending").length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Model Access Test"
      size="md"
    >
      <div className="flex flex-col gap-4">
        {/* summary bar */}
        <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-border bg-surface-2 shadow-[2px_2px_0_var(--color-border)]">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-text-muted">
              Testing {models.length} model{models.length !== 1 ? "s" : ""}…
            </p>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${models.length ? ((ok + fail) / models.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs font-mono font-bold">
            {ok > 0 && <span className="text-emerald-600 dark:text-emerald-400">✓ {ok}</span>}
            {fail > 0 && <span className="text-red-500">✗ {fail}</span>}
            {pending > 0 && <span className="text-text-muted animate-pulse">… {pending}</span>}
          </div>
        </div>

        {/* model list */}
        <div className="max-h-80 overflow-y-auto flex flex-col gap-1 pr-1 custom-scrollbar">
          {models.map(id => {
            const r = results[id];
            return (
              <div key={id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                r === "pending" ? "border-border bg-surface animate-pulse" :
                r?.ok ? "border-emerald-500/20 bg-emerald-500/5" :
                r ? "border-red-500/25 bg-red-500/5" :
                "border-border bg-surface"
              }`}>
                <span className={`size-1.5 rounded-full shrink-0 ${
                  r === "pending" ? "bg-text-muted" :
                  r?.ok ? "bg-emerald-500" :
                  r ? "bg-red-500" : "bg-border"
                }`} />
                <span className="text-xs font-mono text-text-main flex-1 min-w-0 truncate">{id}</span>
                <TestBadge result={r} />
              </div>
            );
          })}
        </div>

        {done && (
          <div className="flex gap-2">
            <button
              onClick={runTests}
              className="flex-1 h-9 rounded-xl border-2 border-border bg-surface-2 hover:bg-surface-3 text-xs font-mono font-bold text-text-muted shadow-[2px_2px_0_var(--color-border)] hover:-translate-y-px hover:shadow-[3px_3px_0_var(--color-border)] active:translate-y-0 transition-all"
            >
              Retest
            </button>
            <Button onClick={onClose} className="flex-1">Done</Button>
          </div>
        )}
        {running && (
          <button
            onClick={() => { abortRef.current = true; setRunning(false); setDone(true); }}
            className="w-full h-9 rounded-xl border-2 border-border bg-surface-2 text-xs font-mono text-text-muted hover:text-red-500 transition-colors"
          >
            Stop
          </button>
        )}
      </div>
    </Modal>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function KeyAccessControls({ apiKey, onChange, onRequestRestrict }) {
  const access = apiKey.access || { restricted: false, allow: [] };
  const [allModels, setAllModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedModels, setSelectedModels] = useState(() => new Set(access.allow));
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [providerGroups, setProviderGroups] = useState([]);

  // Reset when switching keys
  useEffect(() => {
    setAllModels([]);
    setProviderGroups([]);
    setSelectedModels(new Set(access.allow));
  }, [apiKey.id]);

  // Sync allow list when parent updates
  useEffect(() => {
    setSelectedModels(new Set(access.allow));
  }, [access.allow.join(",")]);

  const loadModels = useCallback(() => {
    setLoading(true);
    return fetch("/api/models?activeOnly=true")
      .then(async (r) => {
        const models = (await r.json()).models || [];
        setAllModels(models);
        setProviderGroups(groupByProvider(models));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load if already restricted on mount / key change
  useEffect(() => {
    if (access.restricted) loadModels();
  }, [apiKey.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleModel = useCallback((id, on) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      // propagate immediately
      onChange({ restricted: true, allow: [...next] });
      return next;
    });
  }, [onChange]);

  const handleToggleRestrict = (checked) => {
    if (checked) {
      // Pre-fetch models immediately so list is ready when confirm dialog closes
      loadModels();
      onRequestRestrict();
    } else {
      onChange({ restricted: false, allow: [...selectedModels] });
    }
  };

  const selectedList = [...selectedModels];

  return (
    <div className="mt-3" data-testid="key-access">
      {/* Restrict toggle */}
      <div className="flex items-center justify-between gap-3">
        <Toggle
          size="sm"
          checked={access.restricted}
          label="Restrict models"
          onChange={handleToggleRestrict}
        />
        {access.restricted && selectedList.length > 0 && (
          <button
            onClick={() => setTestModalOpen(true)}
            className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-primary hover:underline"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>play_circle</span>
            Test {selectedList.length} model{selectedList.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {access.restricted && (
        <div className="mt-3 flex flex-col gap-2">
          {/* warning */}
          {selectedList.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
              No models selected — key can call nothing.
            </p>
          )}

          {loading && (
            <p className="text-xs text-text-muted font-mono animate-pulse">Loading models…</p>
          )}

          {/* Per-provider sliders */}
          {!loading && providerGroups.map(group => (
            <ProviderSection
              key={group.provider}
              group={group}
              selectedModels={selectedModels}
              onToggleModel={handleToggleModel}
              testResults={null}
            />
          ))}
        </div>
      )}

      {/* Test popup */}
      <TestModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        models={selectedList}
        apiKeyId={apiKey.id}
      />
    </div>
  );
}

KeyAccessControls.propTypes = {
  apiKey: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    access: PropTypes.shape({ restricted: PropTypes.bool, allow: PropTypes.arrayOf(PropTypes.string) }),
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onRequestRestrict: PropTypes.func.isRequired,
};
