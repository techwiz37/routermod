"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { Toggle, Button } from "@/shared/components";
import Modal from "@/shared/components/Modal";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getProviderIconSrc, getCompatibleIconSrc, getDynamicProviderName } from "@/shared/utils/providerIcon";
import { getProviderByAlias } from "@/shared/constants/providers";
import { useNotificationStore } from "@/store/notificationStore";
import { getCurrentLocale, translate } from "@/i18n/runtime";

const TOAST_TEXT = {
  id: {
    testDone: "Test Selesai",
    summary: (ok, fail, total) => `${ok} sukses · ${fail} gagal dari ${total} model`,
    testOk: "Test Sukses",
    testFail: "Test Gagal",
    responded: (label, ms) => `${label} merespon (${ms}ms)`,
    noResponse: "Model tidak merespon",
    netError: "Network error",
  },
  en: {
    testDone: "Test Complete",
    summary: (ok, fail, total) => `${ok} passed · ${fail} failed out of ${total} models`,
    testOk: "Test Passed",
    testFail: "Test Failed",
    responded: (label, ms) => `${label} responded (${ms}ms)`,
    noResponse: "Model did not respond",
    netError: "Network error",
  },
};
const tt = () => TOAST_TEXT[getCurrentLocale()] || TOAST_TEXT.id;

function providerMeta(aliasOrId, dynamicNames = {}) {
  const p = getProviderByAlias(aliasOrId);
  const id = p?.id || aliasOrId;
  const dynamicName = getDynamicProviderName(id);
  const iconSrc = getCompatibleIconSrc(id) || getProviderIconSrc(id);
  const name =
    p?.name ||
    dynamicNames[id]?.name ||
    dynamicName ||
    (dynamicNames[id]?.prefix ? `${String(dynamicNames[id].prefix).toUpperCase()} (Custom)` : null) ||
    aliasOrId?.toUpperCase() ||
    "Unknown";
  return {
    id,
    name,
    iconSrc,
    fallbackIcon: p?.icon || "hub",
    color: p?.color || null,
  };
}

function groupByProvider(models, dynamicNames = {}) {
  const map = {};
  for (const m of models) {
    const p = m.provider || "unknown";
    if (!map[p]) map[p] = { provider: p, meta: providerMeta(p, dynamicNames), models: [] };
    map[p].models.push(m);
  }
  return Object.values(map).sort((a, b) => a.meta.name.localeCompare(b.meta.name));
}

// The configured provider prefix is the public/routable identifier. The
// provider connection id is only an internal storage key and must not be the
// only value persisted in an API-key allow-list.
function getModelRequestId(m, dynamicNames = {}) {
  // The server computes the exact identifier clients must send (provider
  // prefix + canonical model id, or its explicit alias). Prefer it over any
  // locally reconstructed value.
  if (m?.publicId) return m.publicId;
  if (m?.isCustom && m.customId && m.providerPrefix) {
    return `${m.providerPrefix}/${m.customId}`;
  }
  if (m?.isCustom && m.customId && m.provider) {
    return `${m.provider}/${m.customId}`;
  }
  const node = dynamicNames[m.provider];
  if (node?.prefix) {
    return `${node.prefix}/${m.model}`;
  }
  return m.routedModel || m.fullModel || `${m.provider}/${m.model}`;
}

function getModelIdCandidates(m, dynamicNames = {}) {
  const publicId = getModelRequestId(m, dynamicNames);
  const internalId = m.fullModel || m.routedModel || `${m.provider}/${m.model}`;
  return [...new Set([publicId, m.publicId, m.displayId, m.routedModel, internalId].filter(Boolean))];
}

function TestBadge({ result }) {
  if (!result) return null;
  if (result === "pending")
    return <span className="text-[10px] font-mono text-[var(--color-text-muted)] animate-pulse">testing…</span>;
  if (result.ok)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded px-1.5 py-0.5">
        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>bolt</span>
        {result.ms < 1000 ? `${result.ms}ms` : `${(result.ms / 1000).toFixed(1)}s`}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded px-1.5 py-0.5">
      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>error</span>
      fail
    </span>
  );
}

function ProviderCard({ group, selectedModels, dynamicNames, active, onClick }) {
  const { meta } = group;
  const selectedCount = group.models.filter(m => getModelIdCandidates(m, dynamicNames).some(id => selectedModels.has(id))).length;

  return (
    <button
      onClick={onClick}
      className={`shrink-0 w-40 text-left rounded-xl border-2 transition-all bg-[var(--color-surface)] ${
        active
          ? "border-[var(--color-primary)] shadow-[3px_4px_0px_var(--color-primary)] -translate-y-0.5"
          : "border-[var(--color-border)] shadow-[2px_3px_0px_var(--color-border)] hover:-translate-y-0.5 hover:shadow-[3px_4px_0px_var(--color-border)]"
      }`}
    >
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="size-8 rounded-lg bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] flex items-center justify-center overflow-hidden p-1 shrink-0">
            {meta.iconSrc
              ? <ProviderIcon src={meta.iconSrc} alt={meta.name} size={20} className="object-contain" />
              : <span className="material-symbols-outlined text-[16px]" style={{ color: meta.color || "var(--color-text-muted)" }}>{meta.fallbackIcon}</span>
            }
          </div>
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
            selectedCount > 0
              ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30"
              : "text-[var(--color-text-muted)] bg-[var(--color-surface-2)] border-[var(--color-border)]"
          }`}>
            {selectedCount}/{group.models.length}
          </span>
        </div>

        <div className="min-w-0">
          <div className="font-mono font-black text-xs text-[var(--color-text-main)] truncate tracking-wide">
            {meta.name}
          </div>
          <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
            {group.models.length} model{group.models.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    </button>
  );
}

function TestModal({ isOpen, onClose, models, labels = {}, testIds = {} }) {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const runTests = useCallback(async () => {
    if (!models.length) return;
    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setResults({});

    let ok = 0, fail = 0;
       for (const modelId of models) {
      if (abortRef.current) break;
      setResults(prev => ({ ...prev, [modelId]: "pending" }));
      const t0 = Date.now();
      try {
         const res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
           // The UI label/public alias is kept separate from the canonical
           // provider model sent to the test API.
           body: JSON.stringify({ model: testIds[modelId] || modelId }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json().catch(() => ({}));
        const good = res.ok && data.ok !== false;
        if (good) ok++; else fail++;
        setResults(prev => ({ ...prev, [modelId]: { ok: good, ms: data.latencyMs || Date.now() - t0 } }));
      } catch {
        fail++;
        setResults(prev => ({ ...prev, [modelId]: { ok: false, ms: Date.now() - t0 } }));
      }
      await new Promise(r => setTimeout(r, 300));
    }
    setRunning(false);
    setDone(true);
    if (!abortRef.current) {
      addNotification({
        type: fail === 0 ? "success" : ok === 0 ? "error" : "warning",
        title: tt().testDone,
        message: tt().summary(ok, fail, models.length),
        duration: 5000,
      });
    }
  }, [models, testIds, addNotification]);

  useEffect(() => {
    if (isOpen) runTests();
    return () => { abortRef.current = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = Object.values(results).filter(r => r && r !== "pending" && r.ok).length;
  const fail = Object.values(results).filter(r => r && r !== "pending" && !r.ok).length;
  const pending = Object.values(results).filter(r => r === "pending").length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Model Access Test" size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] shadow-[2px_2px_0_var(--color-border)]">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-[var(--color-text-muted)]">Testing {models.length} model{models.length !== 1 ? "s" : ""}…</p>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--color-border)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300" style={{ width: `${models.length ? ((ok + fail) / models.length) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs font-mono font-bold">
            {ok > 0 && <span className="text-[var(--color-success)]">âœ“ {ok}</span>}
            {fail > 0 && <span className="text-red-500">âœ— {fail}</span>}
            {pending > 0 && <span className="text-[var(--color-text-muted)] animate-pulse">… {pending}</span>}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto flex flex-col gap-1 pr-1">
           {models.map(id => {
             const r = results[id];
            return (
              <div key={id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                r === "pending" ? "border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse" :
                r?.ok ? "border-[var(--color-success)]/20 bg-[var(--color-success)]/5" :
                r ? "border-red-500/25 bg-red-500/5" :
                "border-[var(--color-border)] bg-[var(--color-surface)]"
              }`}>
                <span className={`size-1.5 rounded-full shrink-0 ${
                  r === "pending" ? "bg-[var(--color-text-muted)]" :
                  r?.ok ? "bg-[var(--color-success)]" :
                  r ? "bg-red-500" : "bg-[var(--color-border)]"
                }`} />
                 <span className="text-xs font-mono text-[var(--color-text-main)] flex-1 min-w-0 truncate">{labels[id] || id}</span>
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
  const [dynamicNames, setDynamicNames] = useState({});
  const [testResults, setTestResults] = useState({});
  const [activeProvider, setActiveProvider] = useState(null);
  const [modelQuery, setModelQuery] = useState("");
  const sliderRef = useRef(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, scrollLeft: 0 });
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    setAllModels([]);
    setProviderGroups([]);
    setSelectedModels(new Set(access.allow));
    setTestResults({});
    setActiveProvider(null);
    setModelQuery("");
  }, [apiKey.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedModels(new Set(access.allow));
  }, [access.allow.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadModels = useCallback(() => {
    setLoading(true);
    const cacheBust = `?activeOnly=true&_=${Date.now()}`;
    return Promise.all([
      fetch(`/api/models${cacheBust}`, { cache: "no-store" }).then(async (r) => (await r.json()).models || []),
      fetch(`/api/provider-nodes?_=${Date.now()}`, { cache: "no-store" }).then(async (r) => (await r.json()).nodes || []).catch(() => []),
    ])
      .then(([models, nodes]) => {
        const names = {};
        for (const n of nodes) {
          if (!n?.id) continue;
          const meta = { name: n.name, prefix: n.prefix };
          names[n.id] = meta;
          // Custom models may already expose providerAlias as the public
          // prefix instead of the provider-node storage id.
          if (n.prefix) names[n.prefix] = meta;
        }
        setDynamicNames(names);
        setAllModels(models);
        setProviderGroups(groupByProvider(models, names));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (access.restricted) loadModels();
  }, [apiKey.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Provider model edits can happen while this endpoint page remains mounted.
  // Refresh the catalogue so a changed custom ID is not shown with stale data.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => {
      if (access.restricted) loadModels();
    };
    window.addEventListener("customModelChanged", refresh);
    return () => window.removeEventListener("customModelChanged", refresh);
  }, [access.restricted, loadModels]);

  const handleToggleModel = useCallback((id, on, aliases = []) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      for (const alias of aliases) next.delete(alias);
      if (on) next.add(id); else next.delete(id);
      onChange({ restricted: true, allow: [...next] });
      return next;
    });
  }, [onChange]);

  const handleTestModel = useCallback(async (id, label, testId = id) => {
    if (testResults[id] === "pending") return;
    setTestResults(prev => ({ ...prev, [id]: "pending" }));
    const t0 = Date.now();
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `id` is the public/custom UI identifier. The test endpoint receives
        // the canonical provider/model ID so the provider resolver never sees
        // a display alias as a credential provider.
        body: JSON.stringify({ model: testId }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json().catch(() => ({}));
      const good = res.ok && data.ok !== false;
      const ms = data.latencyMs || Date.now() - t0;
      setTestResults(prev => ({ ...prev, [id]: { ok: good, ms } }));
      if (good) {
        addNotification({
          type: "success",
          title: tt().testOk,
          message: tt().responded(label || id, ms),
          duration: 4000,
        });
      } else {
        addNotification({
          type: "error",
          title: tt().testFail,
          message: `${label || id}: ${data.error || tt().noResponse}`,
          duration: 6000,
        });
      }
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, ms: Date.now() - t0 } }));
      addNotification({
        type: "error",
        title: tt().testFail,
        message: `${label || id}: ${e.message || tt().netError}`,
        duration: 6000,
      });
    }
  }, [testResults, addNotification]);

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
  const selectedDisplayLabels = useMemo(() => {
    const labels = {};
    for (const model of allModels) {
      for (const candidate of getModelIdCandidates(model, dynamicNames)) {
        if (selectedModels.has(candidate)) {
          labels[candidate] = model.displayId || getModelRequestId(model, dynamicNames);
        }
      }
    }
    return labels;
  }, [allModels, dynamicNames, selectedModels]);
  const selectedTestIds = useMemo(() => {
    const ids = {};
    for (const model of allModels) {
      const backendId = model.fullModel || getModelRequestId(model, dynamicNames);
      for (const candidate of getModelIdCandidates(model, dynamicNames)) {
        if (selectedModels.has(candidate)) ids[candidate] = backendId;
      }
    }
    return ids;
  }, [allModels, dynamicNames, selectedModels]);
  const activeGroup = providerGroups.find(g => g.provider === activeProvider) || null;
  const activeAllSelected = activeGroup
    ? activeGroup.models.every(m => getModelIdCandidates(m, dynamicNames).some(id => selectedModels.has(id)))
    : false;
  const modelQueryTrimmed = modelQuery.trim().toLowerCase();
  const visibleModels = !activeGroup
    ? []
    : !modelQueryTrimmed
      ? activeGroup.models
      : activeGroup.models.filter(m => {
          const ids = getModelIdCandidates(m, dynamicNames);
          return `${m.name || ""} ${m.model || ""} ${m.displayId || ""} ${ids.join(" ")}`.toLowerCase().includes(modelQueryTrimmed);
        });

  const toggleAllActive = () => {
    if (!activeGroup) return;
    setSelectedModels(prev => {
      const next = new Set(prev);
      for (const m of activeGroup.models) {
        const ids = getModelIdCandidates(m, dynamicNames);
        for (const id of ids) next.delete(id);
        if (!activeAllSelected) next.add(ids[0]);
      }
      onChange({ restricted: true, allow: [...next] });
      return next;
    });
  };

  const modelSliderRef = useRef(null);
  const modelIsDragging = useRef(false);
  const modelDragStart = useRef({ x: 0, scrollLeft: 0 });

  const onModelMouseDown = (e) => {
    modelIsDragging.current = true;
    modelDragStart.current = { x: e.pageX - modelSliderRef.current.offsetLeft, scrollLeft: modelSliderRef.current.scrollLeft };
  };
  const onModelMouseMove = (e) => {
    if (!modelIsDragging.current) return;
    e.preventDefault();
    const x = e.pageX - modelSliderRef.current.offsetLeft;
    modelSliderRef.current.scrollLeft = modelDragStart.current.scrollLeft - (x - modelDragStart.current.x);
  };
  const onModelMouseUp = () => { modelIsDragging.current = false; };

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
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] shadow-[2px_2px_0_var(--color-border)] text-[10px] font-mono font-bold text-[var(--color-primary)] hover:-translate-y-px active:translate-y-0 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>play_circle</span>
            Test {selectedList.length} model{selectedList.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {access.restricted && (
        <div className="mt-3 flex flex-col gap-3">
          {selectedList.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
              No models selected yet — this key cannot call anything.
            </p>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-3 text-xs text-[var(--color-text-muted)] font-mono animate-pulse">
              <span className="material-symbols-outlined text-[16px] animate-spin text-[var(--color-primary)]">progress_activity</span>
              Loading models…
            </div>
          )}

          {!loading && providerGroups.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  {providerGroups.length} provider · geser →
                </span>
                {activeGroup && (
                  <button
                    onClick={toggleAllActive}
                    className="font-mono text-[10px] font-bold text-[var(--color-primary)] hover:underline"
                  >
                    {activeAllSelected ? "Deselect all" : "Select all"} ({activeGroup.meta.name})
                  </button>
                )}
              </div>

              <div
                ref={sliderRef}
                className="flex gap-3 overflow-x-auto pb-3"
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
                    dynamicNames={dynamicNames}
                    active={activeProvider === group.provider}
                    onClick={() => { setModelQuery(""); setActiveProvider(prev => prev === group.provider ? null : group.provider); }}
                  />
                ))}
              </div>

              {activeGroup && (
                <div className="rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-surface)] shadow-[3px_4px_0px_var(--color-primary)] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-primary)]/10 border-b-2 border-[var(--color-primary)]/30">
                    <div className="flex items-center gap-2 min-w-0">
                      {activeGroup.meta.iconSrc
                        ? <ProviderIcon src={activeGroup.meta.iconSrc} alt={activeGroup.meta.name} size={16} className="object-contain shrink-0" />
                        : <span className="material-symbols-outlined text-[15px] text-[var(--color-primary)] shrink-0">{activeGroup.meta.fallbackIcon}</span>
                      }
                      <span className="font-mono text-[11px] font-black text-[var(--color-primary)] truncate">
                        {activeGroup.meta.name} · {activeGroup.models.length} model
                      </span>
                    </div>
                    <button
                      onClick={() => { setModelQuery(""); setActiveProvider(null); }}
                      className="material-symbols-outlined text-[16px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                    >
                      close
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--color-border)]/40 bg-[var(--color-surface-2)]">
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      scroll → · toggle to pick · flask icon to test
                    </span>
                  </div>

                  <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)]/40 bg-[var(--color-surface)]">
                    <div className="relative flex-1 min-w-0">
                      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-[var(--color-text-muted)] pointer-events-none">search</span>
                      <input
                        type="text"
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                        placeholder={translate("Search models...")}
                        className="w-full h-7 pl-7 pr-7 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[11px] font-mono text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                      />
                      {modelQuery && (
                        <button
                          type="button"
                          onClick={() => setModelQuery("")}
                          title={translate("Clear search")}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] leading-none text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                        >
                          close
                        </button>
                      )}
                    </div>
                    <span className="shrink-0 text-[9.5px] font-mono font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded px-1.5 py-0.5">
                      {visibleModels.length}/{activeGroup.models.length}
                    </span>
                  </div>

                  <div
                    ref={modelSliderRef}
                    className="flex gap-2.5 overflow-x-auto p-3"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-border) transparent", cursor: "grab" }}
                    onMouseDown={onModelMouseDown}
                    onMouseMove={onModelMouseMove}
                    onMouseUp={onModelMouseUp}
                    onMouseLeave={onModelMouseUp}
                  >
                    {visibleModels.length === 0 && (
                      <span className="p-2 text-[11px] font-mono text-[var(--color-text-muted)]">
                        {translate("No models match your filter.")}
                      </span>
                    )}
                    {visibleModels.map(m => {
                      const requestId = getModelRequestId(m, dynamicNames);
                      const id = requestId;
                      const displayId = m.displayId || requestId;
                      const on = getModelIdCandidates(m, dynamicNames).some(candidate => selectedModels.has(candidate));
                      const res = testResults[requestId];
                      const busy = res === "pending";
                      return (
                        <div
                          key={id}
                          className={`shrink-0 w-48 flex flex-col gap-2 rounded-xl border-2 p-2.5 transition-all ${
                            on
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-[2px_3px_0px_var(--color-primary)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] shadow-[2px_2px_0px_var(--color-border)]"
                          }`}
                        >
                          <button
                             onClick={() => handleToggleModel(requestId, !on, getModelIdCandidates(m, dynamicNames).filter(candidate => candidate !== requestId))}
                            className="flex items-center gap-2 cursor-pointer text-left"
                          >
                            <span
                              className="relative shrink-0 rounded-full border-2 border-[var(--color-border)] transition-all"
                              style={{ width: 30, height: 18, background: on ? "var(--color-primary)" : "var(--color-surface-3)" }}
                            >
                              <span className={`absolute top-0.5 size-3 rounded-full bg-white border-2 border-[var(--color-border)] shadow-sm transition-transform duration-200 ${on ? "translate-x-3" : "translate-x-0.5"}`} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-[11px] font-mono truncate ${on ? "text-[var(--color-text-main)] font-bold" : "text-[var(--color-text-muted)]"}`}>
                                {m.name || m.model}
                              </span>
                              <span className="block text-[9px] font-mono text-[var(--color-text-muted)] truncate">{displayId}</span>
                            </span>
                          </button>

                          <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--color-border)]/40">
                            {res && res !== "pending"
                              ? <TestBadge result={res} />
                              : res === "pending"
                                ? <span className="text-[10px] font-mono text-[var(--color-text-muted)] animate-pulse">testing…</span>
                                : <span className="text-[9px] font-mono text-[var(--color-text-muted)]">not tested yet</span>
                            }
                            <button
                               onClick={() => handleTestModel(requestId, m.name || m.model, m.fullModel || requestId)}
                              disabled={busy}
                              title="Test model"
                              className="group flex items-center justify-center size-7 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-primary)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 shadow-[2px_2px_0_var(--color-border)] hover:shadow-[3px_3px_0_var(--color-border)] transition-all"
                            >
                              {busy
                                ? <span className="material-symbols-outlined text-[14px] animate-spin text-white">progress_activity</span>
                                : <span className="material-symbols-outlined text-[14px] text-white">science</span>
                              }
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <TestModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        models={selectedList}
        labels={selectedDisplayLabels}
        testIds={selectedTestIds}
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
