"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { Toggle, Button } from "@/shared/components";
import Modal from "@/shared/components/Modal";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";

function groupByProvider(models) {
  const map = {};
  for (const m of models) {
    const p = m.provider || "unknown";
    if (!map[p]) map[p] = { provider: p, models: [] };
    map[p].models.push(m);
  }
  return Object.values(map).sort((a, b) => a.provider.localeCompare(b.provider));
}

function TestBadge({ result }) {
  if (!result) return null;
  if (result === "pending")
    return <span className="text-[10px] font-mono text-[var(--color-text-muted)] animate-pulse">testing…</span>;
  if (result.ok)
    return (
      <span className="text-[10px] font-mono font-bold text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30 rounded px-1.5 py-0.5">
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

function ProviderCard({ group, selectedModels, onToggleModel, onTestModel, testResults }) {
  const [open, setOpen] = useState(false);
  const iconSrc = getProviderIconSrc(group.provider);
  const selectedCount = group.models.filter(m => selectedModels.has(m.routedModel || `${m.provider}/${m.model}`)).length;
  const allSelected = selectedCount === group.models.length;

  const toggleAll = (e) => {
    e.stopPropagation();
    const ids = group.models.map(m => m.routedModel || `${m.provider}/${m.model}`);
    ids.forEach(id => onToggleModel(id, !allSelected));
  };

  return (
    <div className="shrink-0 w-52 flex flex-col">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full text-left rounded-xl border-2 transition-all ${
          open
            ? "border-[#ff1a53] shadow-[3px_4px_0px_#ff1a53] bg-[var(--color-surface)]"
            : "border-[var(--color-border)] shadow-[2px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)] bg-[var(--color-surface)]"
        }`}
      >
        <div className="p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="size-8 rounded-lg bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] flex items-center justify-center overflow-hidden p-1 shrink-0">
              {iconSrc
                ? <ProviderIcon src={iconSrc} alt={group.provider} size={20} className="object-contain" />
                : <span className="material-symbols-outlined text-[16px] text-[var(--color-text-muted)]">hub</span>
              }
            </div>
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
              selectedCount > 0
                ? "text-[#ff1a53] bg-[#ff1a53]/10 border-[#ff1a53]/30"
                : "text-[var(--color-text-muted)] bg-[var(--color-surface-2)] border-[var(--color-border)]"
            }`}>
              {selectedCount}/{group.models.length}
            </span>
          </div>

          <div className="min-w-0">
            <div className="font-mono font-black text-xs text-[var(--color-text-main)] truncate uppercase tracking-wide">
              {group.provider}
            </div>
            <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
              {group.models.length} model{group.models.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="flex items-center justify-between gap-1">
            <button
              onClick={toggleAll}
              className="flex-1 text-[10px] font-mono font-bold py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface)] transition-colors"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
            <span className="material-symbols-outlined text-[16px] text-[#ff1a53]">
              {open ? "expand_less" : "expand_more"}
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-1 bg-[var(--color-surface)] border-2 border-[#ff1a53] rounded-xl shadow-[2px_3px_0px_#ff1a53] overflow-hidden max-h-64 overflow-y-auto">
          <div className="px-2 py-1.5 bg-[#ff1a53]/10 border-b border-[#ff1a53]/30 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px] text-[#ff1a53]">model_training</span>
            <span className="font-mono text-[10px] font-black uppercase text-[#ff1a53]">Models</span>
          </div>
          <div className="divide-y divide-[var(--color-border)]/40">
            {group.models.map(m => {
              const id = m.routedModel || `${m.provider}/${m.model}`;
              const on = selectedModels.has(id);
              const res = testResults?.[id];
              const busy = res === "pending";
              return (
                <div key={id} className={`flex items-center gap-2 px-2.5 py-2 transition-colors ${on ? "bg-[#ff1a53]/5" : "bg-[var(--color-surface)]"}`}>
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onClick={() => onToggleModel(id, !on)}>
                    <div
                      className="relative shrink-0 rounded-full border-2 transition-all"
                      style={{ width: 28, height: 16, background: on ? "#ff1a53" : "var(--color-surface-2)", borderColor: on ? "#ff1a53" : "var(--color-border)" }}
                    >
                      <div className={`absolute top-0.5 size-2.5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-3" : "translate-x-0.5"}`} />
                    </div>
                    <span className={`text-[11px] font-mono truncate ${on ? "text-[var(--color-text-main)] font-medium" : "text-[var(--color-text-muted)]"}`}>
                      {m.name || m.model}
                    </span>
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    {res && res !== "pending" && <TestBadge result={res} />}
                    <button
                      onClick={() => onTestModel(id)}
                      disabled={busy}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface)] text-[9px] font-mono font-bold transition-all hover:-translate-y-px disabled:opacity-50"
                    >
                      {busy
                        ? <span className="material-symbols-outlined text-[11px] animate-spin">progress_activity</span>
                        : <span className="material-symbols-outlined text-[11px]">play_arrow</span>
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TestModal({ isOpen, onClose, models }) {
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
      } catch {
        setResults(prev => ({ ...prev, [modelId]: { ok: false, ms: Date.now() - t0 } }));
      }
      await new Promise(r => setTimeout(r, 300));
    }
    setRunning(false);
    setDone(true);
  }, [models]);

  useEffect(() => {
    if (isOpen) runTests();
    return () => { abortRef.current = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = Object.values(results).filter(r => r && r !== "pending" && r.ok).length;
  const fail = Object.values(results).filter(r => r && r !== "pending" && !r.ok).length;
  const pending = Object.values(results).filter(r => r === "pending").length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Model Access Test" size="md">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] shadow-[2px_2px_0_var(--color-border)]">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-[var(--color-text-muted)]">Testing {models.length} model{models.length !== 1 ? "s" : ""}…</p>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
              <div className="h-full rounded-full bg-[#ff1a53] transition-all duration-300" style={{ width: `${models.length ? ((ok + fail) / models.length) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs font-mono font-bold">
            {ok > 0 && <span className="text-[#10b981]">✓ {ok}</span>}
            {fail > 0 && <span className="text-red-500">✗ {fail}</span>}
            {pending > 0 && <span className="text-[var(--color-text-muted)] animate-pulse">… {pending}</span>}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto flex flex-col gap-1 pr-1">
          {models.map(id => {
            const r = results[id];
            return (
              <div key={id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                r === "pending" ? "border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse" :
                r?.ok ? "border-[#10b981]/20 bg-[#10b981]/5" :
                r ? "border-red-500/25 bg-red-500/5" :
                "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}>
                <span className={`size-1.5 rounded-full shrink-0 ${
                  r === "pending" ? "bg-[var(--color-text-muted)]" :
                  r?.ok ? "bg-[#10b981]" :
                  r ? "bg-red-500" : "bg-[var(--color-border)]"
                }`} />
                <span className="text-xs font-mono text-[var(--color-text-main)] flex-1 min-w-0 truncate">{id}</span>
                <TestBadge result={r} />
              </div>
            );
          })}
        </div>

        {done && (
          <div className="flex gap-2">
            <button onClick={runTests} className="flex-1 h-9 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface)] text-xs font-mono font-bold text-[var(--color-text-muted)] shadow-[2px_2px_0_var(--color-border)] hover:-translate-y-px transition-all">
              Retest
            </button>
            <Button onClick={onClose} className="flex-1">Done</Button>
          </div>
        )}
        {running && (
          <button onClick={() => { abortRef.current = true; setRunning(false); setDone(true); }} className="w-full h-9 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-mono text-[var(--color-text-muted)] hover:text-red-500 transition-colors">
            Stop
          </button>
        )}
      </div>
    </Modal>
  );
}

export default function KeyAccessControls({ apiKey, onChange, onRequestRestrict }) {
  const access = apiKey.access || { restricted: false, allow: [] };
  const [allModels, setAllModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedModels, setSelectedModels] = useState(() => new Set(access.allow));
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [providerGroups, setProviderGroups] = useState([]);
  const [testResults, setTestResults] = useState({});
  const sliderRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, scrollLeft: 0 });

  useEffect(() => {
    setAllModels([]);
    setProviderGroups([]);
    setSelectedModels(new Set(access.allow));
    setTestResults({});
  }, [apiKey.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedModels(new Set(access.allow));
  }, [access.allow.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadModels = useCallback(() => {
    setLoading(true);
    return fetch("/api/models?activeOnly=true")
      .then(async (r) => {
        const data = await r.json();
        const models = data.models || [];
        setAllModels(models);
        setProviderGroups(groupByProvider(models));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (access.restricted) loadModels();
  }, [apiKey.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleModel = useCallback((id, on) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      onChange({ restricted: true, allow: [...next] });
      return next;
    });
  }, [onChange]);

  const handleTestModel = useCallback(async (id) => {
    setTestResults(prev => ({ ...prev, [id]: "pending" }));
    const t0 = Date.now();
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: id }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json().catch(() => ({}));
      setTestResults(prev => ({ ...prev, [id]: { ok: res.ok && data.ok !== false, ms: data.latencyMs || Date.now() - t0 } }));
    } catch {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, ms: Date.now() - t0 } }));
    }
  }, []);

  const handleToggleRestrict = (checked) => {
    if (checked) {
      loadModels();
      onRequestRestrict();
    } else {
      onChange({ restricted: false, allow: [...selectedModels] });
    }
  };

  const onMouseDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.pageX - sliderRef.current.offsetLeft, scrollLeft: sliderRef.current.scrollLeft };
  };
  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft;
    sliderRef.current.scrollLeft = dragStart.current.scrollLeft - (x - dragStart.current.x);
  };
  const onMouseUp = () => { isDragging.current = false; };

  const selectedList = [...selectedModels];

  return (
    <div className="mt-3" data-testid="key-access">
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
            className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#ff1a53] hover:underline"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>play_circle</span>
            Test {selectedList.length} model{selectedList.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {access.restricted && (
        <div className="mt-3 flex flex-col gap-2">
          {selectedList.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
              No models selected — key can call nothing.
            </p>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-3 text-xs text-[var(--color-text-muted)] font-mono animate-pulse">
              <span className="material-symbols-outlined text-[16px] animate-spin text-[#ff1a53]">progress_activity</span>
              Loading models…
            </div>
          )}

          {!loading && providerGroups.length > 0 && (
            <div
              ref={sliderRef}
              className="flex gap-3 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-border) transparent", cursor: "grab" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {providerGroups.map(group => (
                <ProviderCard
                  key={group.provider}
                  group={group}
                  selectedModels={selectedModels}
                  onToggleModel={handleToggleModel}
                  onTestModel={handleTestModel}
                  testResults={testResults}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <TestModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        models={selectedList}
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
