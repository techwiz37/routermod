"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { Toggle, Button } from "@/shared/components";
import AntaresModal from "@/shared/components/AntaresModal";
import AntaresCheckbox from "@/shared/components/AntaresCheckbox";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { cn } from "@/shared/utils/cn";
import { getProviderIconSrc, getCompatibleIconSrc, getDynamicProviderName } from "@/shared/utils/providerIcon";
import { getProviderByAlias } from "@/shared/constants/providers";
import { useNotificationStore } from "@/store/notificationStore";
import { getCurrentLocale, translateServerMessage, onLocaleChange } from "@/i18n/runtime";

const TOAST_TEXT = {
  id: {
    testDone: "Tes selesai",
    summary: (ok, fail, total) => `${ok} sukses · ${fail} gagal dari ${total} model`,
    testOk: "Tes sukses",
    testFail: "Tes gagal",
    responded: (label, ms) => `${label} merespon (${ms}ms)`,
    noResponse: "Model tidak merespon",
    netError: "Gagal terhubung ke server",
    modalTitle: "Uji akses model",
    testing: (n) => `Menguji ${n} model…`,
    testingShort: "Menguji...",
    failed: "gagal",
    models: "model",
    retest: "Tes ulang",
    done: "Selesai",
    stop: "Berhenti",
    restrictModels: "Batasin model",
    restrictHint: "Pilih model mana saja yang boleh dipakai key ini",
    testModels: (n) => `Tes ${n} model`,
    loadingModels: "Memuat daftar model…",
    selectAll: "Pilih semua",
    deselectAll: "Batalkan semua",
    providersCount: (n) => `${n} provider · pilih salah satu`,
    changeProvider: "Ganti provider",
    modelsCount: (n) => `${n} model tersedia`,
    scrollHint: "centang untuk pilih · ikon flask untuk tes",
    searchModels: "Cari model...",
    clearSearch: "Hapus pencarian",
    noMatch: "Tidak ada model yang cocok.",
    notTested: "belum ditest",
    testModel: "Tes model",
    loadFailed: "Gagal memuat daftar model/provider",
    loadEmpty: "Belum ada model/provider yang bisa dipilih",
    loadEmptyHint: "Pastikan ada provider/model aktif, lalu muat ulang daftar.",
    retry: "Coba lagi",
    reload: "Muat ulang",
    lockedKey: "Belum ada model dipilih — key ini menolak semua request.",
    unresolved: (n) => `${n} entri allow-list tidak cocok dengan model aktif, jadi tidak akan pernah dipakai.`,
    fixIds: "Rapikan ID",
    dropUnresolved: "Hapus yang tidak cocok",
  },
  en: {
    testDone: "Test complete",
    summary: (ok, fail, total) => `${ok} passed · ${fail} failed out of ${total} models`,
    testOk: "Test passed",
    testFail: "Test failed",
    responded: (label, ms) => `${label} responded (${ms}ms)`,
    noResponse: "Model did not respond",
    netError: "Network error",
    modalTitle: "Model access test",
    testing: (n) => `Testing ${n} model${n !== 1 ? "s" : ""}…`,
    testingShort: "Testing...",
    failed: "failed",
    models: "models",
    retest: "Retest",
    done: "Done",
    stop: "Stop",
    restrictModels: "Restrict models",
    restrictHint: "Choose exactly which models this key may use",
    testModels: (n) => `Test ${n} model${n !== 1 ? "s" : ""}`,
    loadingModels: "Loading models…",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    providersCount: (n) => `${n} providers · pick one`,
    changeProvider: "Change provider",
    modelsCount: (n) => `${n} models available`,
    scrollHint: "tick to select · flask icon to test",
    searchModels: "Search models...",
    clearSearch: "Clear search",
    noMatch: "No models match your filter.",
    notTested: "not tested yet",
    testModel: "Test model",
    loadFailed: "Failed to load models/providers",
    loadEmpty: "No selectable model/provider yet",
    loadEmptyHint: "Make sure a provider/model is active, then reload the list.",
    retry: "Try again",
    reload: "Reload",
    lockedKey: "No models selected yet — this key rejects every request.",
    unresolved: (n) => `${n} allow-list entr${n === 1 ? "y" : "ies"} do not match any active model, so they are never used.`,
    fixIds: "Normalize IDs",
    dropUnresolved: "Drop unmatched",
  },
};
const tt = () => TOAST_TEXT[getCurrentLocale()] || TOAST_TEXT.id;

function providerMeta(aliasOrId, dynamicNames = {}, providerFavicons = {}) {
  const p = getProviderByAlias(aliasOrId);
  const id = p?.id || aliasOrId;
  const dynamicName = getDynamicProviderName(id);
  const iconSrc = providerFavicons[id] || getCompatibleIconSrc(id) || getProviderIconSrc(id);
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

function groupByProvider(models, dynamicNames = {}, providerFavicons = {}) {
  const map = {};
  for (const m of models) {
    const p = m.provider || "unknown";
    if (!map[p]) map[p] = { provider: p, meta: providerMeta(p, dynamicNames, providerFavicons), models: [] };
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
  const customId = m.customId && m.provider ? `${m.provider}/${m.customId}` : null;
  return [...new Set([publicId, m.publicId, m.displayId, m.routedModel, internalId, customId].filter(Boolean))];
}

function TestBadge({ result }) {
  if (!result) return null;
  if (result === "pending")
    return <span className="text-[10px] font-mono text-[var(--t-muted)] animate-pulse">{tt().testingShort}</span>;
  if (result.ok)
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold text-[var(--t-ok)] bg-[var(--t-ok-soft)] border border-[var(--t-ok)]/30 rounded-full px-1.5 py-0.5">
        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>bolt</span>
        {result.ms < 1000 ? `${result.ms}ms` : `${(result.ms / 1000).toFixed(1)}s`}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold text-[var(--t-danger)] bg-[var(--t-danger-soft)] border border-[var(--t-danger)]/30 rounded-full px-1.5 py-0.5">
      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>error</span>
      {tt().failed}
    </span>
  );
}

function ProviderCard({ group, selectedModels, dynamicNames, active, onClick }) {
  const { meta } = group;
  const selectedCount = group.models.filter(m => getModelIdCandidates(m, dynamicNames).some(id => selectedModels.has(id))).length;
  const total = group.models.length;
  const allSelected = total > 0 && selectedCount === total;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={meta.name}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
        active
          ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)]"
          : "border-[var(--t-line)] bg-[var(--t-field)] hover:border-[var(--t-dim)] hover:bg-[var(--t-raised)]",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-[var(--t-line)] bg-[var(--t-card)] p-1">
        {meta.iconSrc
          ? <ProviderIcon src={meta.iconSrc} alt={meta.name} size={17} className="object-contain" />
          : <span className="material-symbols-outlined text-[15px]" style={{ color: meta.color || "var(--t-dim)" }}>{meta.fallbackIcon}</span>
        }
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[11.5px]", active ? "font-medium text-[var(--t-star-ink)]" : "text-[var(--t-ink)]")}>
        {meta.name} <span className="font-mono text-[10.5px] text-[var(--t-dim)]">({total})</span>
      </span>
      {allSelected && <span className="material-symbols-outlined shrink-0 text-[13px] text-[var(--t-ok)]">check_circle</span>}
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
        const good = res.ok && data.ok === true;
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
  const finished = ok + fail;
  const progress = models.length ? (finished / models.length) * 100 : 0;

  return (
    <AntaresModal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      hideScrollbar
      className="!max-h-[78dvh] sm:!max-h-[86dvh]"
      title={tt().modalTitle}
      subtitle={`${finished}/${models.length} ${tt().models}`}
      footer={
        <div className="flex w-full items-center gap-2">
          {running ? (
            <button
              onClick={() => { abortRef.current = true; setRunning(false); setDone(true); }}
              className="w-full h-9 rounded-[10px] border border-[var(--t-line)] bg-transparent text-xs font-medium text-[var(--t-muted)] hover:text-[var(--t-danger)] hover:border-[var(--t-danger)]/40 transition-colors"
            >
              {tt().stop}
            </button>
          ) : (
            <>
              <Button skin="antares" variant="ghost" onClick={runTests} fullWidth>{tt().retest}</Button>
              <Button skin="antares" onClick={onClose} fullWidth>{tt().done}</Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-[var(--t-line)] bg-[var(--t-field)] p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--t-muted)]">{tt().testing(models.length)}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--t-line-soft)]">
              <div className="h-full rounded-full bg-[var(--t-accent)] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 text-xs font-mono font-medium tabular-nums">
            {ok > 0 && <span className="text-[var(--t-ok)]">✓ {ok}</span>}
            {fail > 0 && <span className="text-[var(--t-danger)]">✗ {fail}</span>}
            {pending > 0 && <span className="text-[var(--t-muted)] animate-pulse">… {pending}</span>}
          </div>
        </div>

        <div className="scrollbar-none max-h-[42dvh] min-h-0 overflow-y-auto overscroll-contain rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)]">
          {models.map((id) => {
            const r = results[id];
            const tone = r === "pending"
              ? "border-[var(--t-line)] bg-[var(--t-raised)]"
              : r?.ok
                ? "border-[var(--t-ok)]/25 bg-[var(--t-ok-soft)]/20"
                : r
                  ? "border-[var(--t-danger)]/25 bg-[var(--t-danger-soft)]/20"
                  : "border-[var(--t-line-soft)] bg-transparent";
            const dot = r === "pending"
              ? "bg-[var(--t-muted)] animate-pulse"
              : r?.ok ? "bg-[var(--t-ok)]" : r ? "bg-[var(--t-danger)]" : "bg-[var(--t-line)]";
            return (
              <div key={id} className={`flex items-center gap-2.5 border-b border-[var(--t-line-soft)] px-3 py-2 last:border-0 ${tone}`}>
                <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--t-ink)]">{labels[id] || id}</span>
                <TestBadge result={r} />
              </div>
            );
          })}
        </div>
      </div>
    </AntaresModal>
  );
}

export default function KeyAccessControls({ apiKey, onChange, onRequestRestrict }) {
  const access = apiKey.access || { restricted: false, allow: [] };
  const [allModels, setAllModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedModels, setSelectedModels] = useState(() => new Set(access.allow));
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [providerGroups, setProviderGroups] = useState([]);
  const [dynamicNames, setDynamicNames] = useState({});
  const [providerFavicons, setProviderFavicons] = useState({});
  const [testResults, setTestResults] = useState({});
  const [activeProvider, setActiveProvider] = useState(null);
  const [modelQuery, setModelQuery] = useState("");
  const loadRequestRef = useRef(0);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [, setLocaleVersion] = useState(0);

  // Re-render when the active locale changes so every label follows the
  // language picked in the switcher.
  useEffect(() => onLocaleChange(() => setLocaleVersion((v) => v + 1)), []);

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

  const loadModels = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError("");

    // The picker must list every selectable model, so it reads the dashboard
    // catalogue. `/v1/models` is scoped to the key being edited and returns an
    // empty list for a restricted key with no allow-list yet, which would make
    // the slider look empty even though providers are active.
    const fetchCatalogue = async (activeOnly) => {
      const res = await fetch(`/api/models?${activeOnly ? "activeOnly=true&" : ""}_=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load models (${res.status})`);
      return data.models || [];
    };

    try {
      const [activeModels, nodes] = await Promise.all([
        fetchCatalogue(true),
        fetch(`/api/provider-nodes?_=${Date.now()}`, { cache: "no-store" })
          .then(async (r) => (await r.json().catch(() => ({}))).nodes || [])
          .catch(() => []),
      ]);

      let resolvedModels = activeModels;
      // If no active-provider models are returned, fall back to the full list so
      // the user can still configure restrictions instead of seeing an empty slider.
      if (!resolvedModels.length) {
        try {
          resolvedModels = await fetchCatalogue(false);
        } catch {
          resolvedModels = activeModels;
        }
      }

      const names = {};
      for (const n of nodes) {
        if (!n?.id) continue;
        const meta = { name: n.name, prefix: n.prefix };
        names[n.id] = meta;
        if (n.prefix) names[n.prefix] = meta;
      }
      setDynamicNames(names);

      const faviconResults = {};
      const customNodes = nodes.filter(
        (n) => (n.type === "openai-compatible" || n.type === "anthropic-compatible") && n.baseUrl
      );

      if (customNodes.length > 0) {
        await Promise.allSettled(
          customNodes.map(async (node) => {
            try {
              const res = await fetch(`/api/providers/favicon?url=${encodeURIComponent(node.baseUrl)}`);
              const data = await res.json();
              if (data.faviconUrl) {
                faviconResults[node.id] = data.faviconUrl;
                if (node.prefix) faviconResults[node.prefix] = data.faviconUrl;
              }
            } catch (e) {}
          })
        );
        setProviderFavicons(faviconResults);
      }

      if (requestId !== loadRequestRef.current) return;
      setAllModels(resolvedModels);
      setProviderGroups(groupByProvider(resolvedModels, names, faviconResults));
    } catch (e) {
      if (requestId !== loadRequestRef.current) return;
      setLoadError(e?.message || tt().loadFailed);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.restricted) loadModels();
  }, [apiKey.id, access.restricted, loadModels]);

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
      const good = res.ok && data.ok === true;
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
          message: `${label || id}: ${translateServerMessage(data.error) || tt().noResponse}`,
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
      onRequestRestrict();
    } else {
      onChange({ restricted: false, allow: [...selectedModels] });
    }
  };

  // Existing keys can contain legacy upstream IDs. Resolve those entries to
  // the public IDs returned by /v1/models before rendering the test modal.
  const selectedList = useMemo(() => {
    const publicIds = [];
    for (const selected of selectedModels) {
      const model = allModels.find((item) => getModelIdCandidates(item, dynamicNames).includes(selected));
      const publicId = model?.publicId || model?.id || selected;
      if (!publicIds.includes(publicId)) publicIds.push(publicId);
    }
    return publicIds;
  }, [allModels, dynamicNames, selectedModels]);
  const selectedDisplayLabels = useMemo(() => {
    const labels = {};
    for (const model of allModels) {
      // The model catalogue's public id is the value users must copy and
      // allow-list. Never prefer the upstream/canonical display name here.
      const publicId = model.publicId || model.id || getModelRequestId(model, dynamicNames);
      for (const candidate of getModelIdCandidates(model, dynamicNames)) {
        if (selectedModels.has(candidate) || selectedList.includes(publicId)) {
          labels[candidate] = publicId;
          labels[publicId] = publicId;
        }
      }
    }
    return labels;
  }, [allModels, dynamicNames, selectedModels, selectedList]);
  const selectedTestIds = useMemo(() => {
    const ids = {};
    for (const model of allModels) {
      // Test through the same public/custom ID exposed by /v1/models. The
      // internal fullModel points at the upstream provider path and bypasses
      // the custom model route shown to API clients.
      const backendId = getModelRequestId(model, dynamicNames);
      for (const candidate of getModelIdCandidates(model, dynamicNames)) {
        if (selectedModels.has(candidate) || selectedList.includes(backendId)) ids[candidate] = backendId;
        if (selectedList.includes(backendId)) ids[backendId] = backendId;
      }
    }
    return ids;
  }, [allModels, dynamicNames, selectedModels, selectedList]);
  const activeGroup = providerGroups.find(g => g.provider === activeProvider) || null;
  const unresolvedList = useMemo(() => {
    if (!allModels.length) return [];
    return selectedList.filter((id) => !allModels.some((m) => getModelIdCandidates(m, dynamicNames).includes(id)));
  }, [allModels, dynamicNames, selectedList]);
  const fixSelection = useCallback((dropOnly) => {
    if (!allModels.length) return;
    const next = new Set();
    for (const id of selectedModels) {
      const model = allModels.find((m) => getModelIdCandidates(m, dynamicNames).includes(id));
      if (model) next.add(getModelRequestId(model, dynamicNames));
      else if (!dropOnly) next.add(id);
    }
    setSelectedModels(next);
    onChange({ restricted: true, allow: [...next] });
  }, [allModels, dynamicNames, onChange, selectedModels]);
  // A background refresh must not blank the slider: keep the previously loaded
  // providers visible and only show the loading state on the first load.
  const showInitialLoading = loading && providerGroups.length === 0;
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

  return (
    <div className="mt-3" data-testid="key-access">
      {/* Setting row — one action per row on phones */}
      <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--t-line)] bg-[var(--t-field)] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Toggle
            size="sm"
            checked={access.restricted}
            label={tt().restrictModels}
            onChange={handleToggleRestrict}
          />
          <p className="an-meta mt-1 pl-11">{tt().restrictHint}</p>
        </div>
        {access.restricted && selectedList.length > 0 && (
          <button
            type="button"
            onClick={() => setTestModalOpen(true)}
            className="an-btn an-ghost h-9 w-full shrink-0 justify-start px-3 text-[11px] sm:w-auto"
          >
            <span className="material-symbols-outlined text-[15px] text-[var(--t-star-ink)]">play_circle</span>
            {tt().testModels(selectedList.length)}
          </button>
        )}
      </div>

      {access.restricted && (
        <div className="mt-3 flex flex-col gap-3">
          {selectedList.length === 0 && (
            <p className="flex items-center gap-2 rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11.5px] text-amber-600 dark:text-amber-400">
              <span className="material-symbols-outlined shrink-0 text-[15px]">warning</span>
              {tt().lockedKey}
            </p>
          )}

          {!showInitialLoading && unresolvedList.length > 0 && (
            <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/30 bg-amber-500/5 p-3 text-[11.5px] text-amber-700 dark:text-amber-300">
              <span className="material-symbols-outlined shrink-0 text-[16px]">link_off</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{tt().unresolved(unresolvedList.length)}</p>
                <p className="mt-1 break-all font-mono text-[10px] opacity-90">{unresolvedList.join(", ")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fixSelection(false)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[var(--t-star-ink)] hover:underline"
                  >
                    <span className="material-symbols-outlined text-[14px]">build</span>
                    {tt().fixIds}
                  </button>
                  <button
                    type="button"
                    onClick={() => fixSelection(true)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[var(--t-danger)] hover:underline"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                    {tt().dropUnresolved}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showInitialLoading && (
            <div className="an-meta flex items-center gap-2 py-3">
              <span className="material-symbols-outlined animate-spin text-[15px] text-[var(--t-star-ink)]">progress_activity</span>
              {tt().loadingModels}
            </div>
          )}

          {!showInitialLoading && loadError && providerGroups.length === 0 && (
            <div className="flex items-start gap-2 rounded-[10px] border border-[var(--t-danger)]/30 bg-[var(--t-danger-soft)] p-3 text-[11.5px] text-[var(--t-danger)]">
              <span className="material-symbols-outlined shrink-0 text-[16px]">error</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{tt().loadFailed}</p>
                <p className="mt-0.5 break-words opacity-90">{loadError}</p>
                <button
                  type="button"
                  onClick={loadModels}
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] font-medium hover:underline"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  {tt().retry}
                </button>
              </div>
            </div>
          )}

          {!showInitialLoading && !loadError && providerGroups.length === 0 && (
            <div className="flex items-start gap-2 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-card)] p-3 text-[11.5px] text-[var(--t-muted)]">
              <span className="material-symbols-outlined shrink-0 text-[16px]">info</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--t-ink)]">{tt().loadEmpty}</p>
                <p className="mt-0.5">{tt().loadEmptyHint}</p>
                <button
                  type="button"
                  onClick={loadModels}
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[var(--t-star-ink)] hover:underline"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  {tt().reload}
                </button>
              </div>
            </div>
          )}

          {!showInitialLoading && !loadError && providerGroups.length > 0 && (
            <div className="flex flex-col gap-3">
              {!activeGroup && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="an-meta">{tt().providersCount(providerGroups.length)}</span>
                    <button
                      type="button"
                      onClick={loadModels}
                      title={tt().reload}
                      aria-label={tt().reload}
                      className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--t-line)] text-[var(--t-dim)] transition-colors hover:border-[var(--t-dim)] hover:text-[var(--t-ink)]"
                    >
                      <span className="material-symbols-outlined text-[14px]">refresh</span>
                    </button>
                  </div>

                  <div className="scrollbar-none grid max-h-[112px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {providerGroups.map(group => (
                      <ProviderCard
                        key={group.provider}
                        group={group}
                        selectedModels={selectedModels}
                        dynamicNames={dynamicNames}
                        active={activeProvider === group.provider}
                        onClick={() => { setModelQuery(""); setActiveProvider(group.provider); }}
                      />
                    ))}
                  </div>
                </>
              )}

              {activeGroup && (
                <div className="an-panel">
                  <div className="an-panel-head an-panel-head-stack flex-wrap">
                    <span className="an-panel-ico" aria-hidden>
                      <span className="material-symbols-outlined">hub</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="an-panel-title truncate" title={activeGroup.meta.name}>{activeGroup.meta.name}</h4>
                      <p className="an-panel-sub">{tt().modelsCount(activeGroup.models.length)}</p>
                    </div>
                    <div className="an-panel-actions flex-wrap">
                      <button
                        type="button"
                        onClick={toggleAllActive}
                        className="an-btn an-ghost h-8 px-3 text-[11px]"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {activeAllSelected ? "deselect" : "select_all"}
                        </span>
                        {activeAllSelected ? tt().deselectAll : tt().selectAll}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModelQuery(""); setActiveProvider(null); }}
                        title={tt().changeProvider}
                        aria-label={tt().changeProvider}
                        className="grid size-8 place-items-center rounded-lg border border-[var(--t-line)] text-[var(--t-dim)] transition-colors hover:border-[var(--t-dim)] hover:text-[var(--t-ink)]"
                      >
                        <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-b border-[var(--t-line-soft)] bg-[var(--t-field)] px-3 py-2.5">
                    <div className="an-field relative min-w-0 flex-1">
                      <span className="fi" aria-hidden><span className="material-symbols-outlined">search</span></span>
                      <input
                        type="text"
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                        placeholder={tt().searchModels}
                        aria-label={tt().searchModels}
                        className="an-input !h-9 !py-0 text-[12px]"
                      />
                      {modelQuery && (
                        <button
                          type="button"
                          onClick={() => setModelQuery("")}
                          title={tt().clearSearch}
                          aria-label={tt().clearSearch}
                          className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[14px] leading-none text-[var(--t-dim)] hover:text-[var(--t-star-ink)]"
                        >
                          close
                        </button>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--t-line)] bg-[var(--t-card)] px-2 py-1 font-mono text-[10px] text-[var(--t-dim)]">
                      {visibleModels.length}/{activeGroup.models.length}
                    </span>
                  </div>

                  <div className="scrollbar-none grid max-h-[300px] grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {visibleModels.length === 0 && (
                      <div className="col-span-full flex items-center gap-2 py-4 text-[11.5px] text-[var(--t-muted)]">
                        <span className="material-symbols-outlined text-[15px]">search_off</span>
                        {tt().noMatch}
                      </div>
                    )}
                    {visibleModels.map((m, idx) => {
                      const requestId = getModelRequestId(m, dynamicNames);
                      const displayId = m.displayId || requestId;
                      const on = getModelIdCandidates(m, dynamicNames).some(candidate => selectedModels.has(candidate));
                      const res = testResults[requestId];
                      const busy = res === "pending";
                      return (
                        <div
                          key={`${m.provider}:${requestId}:${idx}`}
                          className={cn(
                            "flex min-w-0 items-center gap-2 rounded-[10px] border px-2 py-1.5 transition-colors",
                            on
                              ? "border-[var(--t-accent)]/40 bg-[var(--t-accent-soft)]"
                              : "border-[var(--t-line-soft)] bg-[var(--t-card)] hover:border-[var(--t-line)]",
                          )}
                        >
                          <AntaresCheckbox
                            compact
                            checked={on}
                            ariaLabel={displayId}
                            onChange={(e) => handleToggleModel(
                              requestId,
                              e.target.checked,
                              getModelIdCandidates(m, dynamicNames).filter(candidate => candidate !== requestId),
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium text-[var(--t-ink)]" title={m.name || m.model}>
                              {m.name || m.model}
                            </div>
                            <div className="truncate font-mono text-[10px] text-[var(--t-dim)]" title={displayId}>
                              {displayId}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {res && res !== "pending"
                              ? <TestBadge result={res} />
                              : busy
                                ? <span className="font-mono text-[9.5px] text-[var(--t-muted)] animate-pulse">{tt().testingShort}</span>
                                : <span className="hidden font-mono text-[9.5px] text-[var(--t-dim)] sm:inline">{tt().notTested}</span>
                            }
                            <button
                              type="button"
                              onClick={() => handleTestModel(requestId, requestId, requestId)}
                              disabled={busy}
                              title={tt().testModel}
                              aria-label={tt().testModel}
                              className="grid size-8 place-items-center rounded-[8px] border border-[var(--t-line)] bg-[var(--t-field)] text-[var(--t-dim)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-star-ink)] disabled:opacity-50"
                            >
                              <span className={cn("material-symbols-outlined text-[15px]", busy && "animate-spin")}>
                                {busy ? "progress_activity" : "science"}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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
