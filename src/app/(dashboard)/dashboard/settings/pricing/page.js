"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { translate, getCurrentLocale } from "@/i18n/runtime";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresButton from "@/shared/components/AntaresButton";
import AntaresSelect from "@/shared/components/AntaresSelect";
import { useNotificationStore } from "@/store/notificationStore";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const FIELDS = [
  { key: "input", label: "Input" },
  { key: "output", label: "Output" },
  { key: "cached", label: "Cached" },
  { key: "reasoning", label: "Reasoning" },
  { key: "cache_creation", label: "Cache write" },
];

const PAGE_SIZE = 15;

function fmt(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(getCurrentLocale(), { maximumFractionDigits: 4 })}`;
}

function providerAlias(id) {
  const parts = String(id || "").split("/");
  return parts.length > 1 ? parts[0] : id;
}

function modelName(id) {
  const parts = String(id || "").split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : id;
}

export default function PricingSettingsPage() {
  const notify = useNotificationStore((s) => s.addNotification);
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [pricing, setPricing] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, price] = await Promise.all([
        fetch("/api/public/models", { cache: "no-store" }).then((r) => r.ok ? r.json() : { models: [], providers: [] }),
        fetch("/api/pricing", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}),
      ]);
      setModels(Array.isArray(cat.models) ? cat.models : []);
      setProviders(Array.isArray(cat.providers) ? cat.providers : []);
      setPricing(price || {});
    } catch (e) {
      notify({ type: "error", title: translate("Error"), message: e.message || "Failed to load pricing" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const canonicalProvider = (value) => {
    const key = String(value || "").trim();
    const match = providers.find((p) => p.id === key || p.alias === key || p.name === key);
    return match ? (match.alias || match.id) : key;
  };

  // Build one editable row per model. A model may be present in the catalogue
  // but have no pricing at all — those rows are still editable ("Add price").
  const rows = useMemo(() => {
    const out = [];
    const seen = new Set();

    // Catalogue alias is the canonical namespace. Pricing overrides may be
    // stored under either the provider id ("antigravity") or its alias ("ag"),
    // so normalise both to one key or the same model appears twice and a
    // provider filter ends up showing another provider's rows.
    const canonical = (value) => {
      const key = String(value || "").trim();
      if (!key) return key;
      const match = providers.find((p) => p.id === key || p.alias === key || p.name === key);
      return match ? (match.alias || match.id) : key;
    };
    const nameOf = (aliasValue) => {
      const match = providers.find((p) => p.id === aliasValue || p.alias === aliasValue || p.name === aliasValue);
      return match?.name || aliasValue;
    };

    for (const m of models) {
      if (!m?.id) continue;
      const alias = canonical(providerAlias(m.id));
      const raw = modelName(m.id);
      const key = `${alias}::${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stored = pricing?.[alias]?.[raw]
        || pricing?.[m.provider?.id]?.[raw]
        || pricing?.[providerAlias(m.id)]?.[raw]
        || m.pricing
        || {};
      out.push({
        key, alias, raw,
        fullId: `${alias}/${raw}`,
        providerName: nameOf(alias) || m.provider?.name || alias,
        pricing: { ...stored },
        isCustom: !!(pricing?.[alias]?.[raw] || pricing?.[m.provider?.id]?.[raw]),
      });
    }

    // Include priced models that are not currently in the public catalogue.
    for (const [rawAlias, entries] of Object.entries(pricing || {})) {
      const alias = canonical(rawAlias);
      for (const [raw, p] of Object.entries(entries || {})) {
        const key = `${alias}::${raw}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key, alias, raw, fullId: `${alias}/${raw}`,
          providerName: nameOf(alias) || rawAlias,
          pricing: { ...p }, isCustom: true,
        });
      }
    }
    return out.sort((a, b) => a.fullId.localeCompare(b.fullId));
  }, [models, providers, pricing]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (providerFilter) {
        const selected = canonicalProvider(providerFilter);
        if (r.alias !== selected && r.providerName !== providerFilter && r.providerName !== selected) return false;
      }
      if (q && !`${r.fullId} ${r.providerName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, providerFilter, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const getDraft = (row) => drafts[row.key] || row.pricing || {};
  const setField = (row, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [row.key]: { ...getDraft(row), [field]: value === "" ? "" : Number(value) },
    }));
  };

  const saveRow = async (row) => {
    const draft = getDraft(row);
    const payload = {};
    for (const f of FIELDS) {
      const v = draft[f.key];
      if (v === "" || v === null || v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        notify({ type: "error", title: translate("Error"), message: `${f.label} must be a non-negative number` });
        return;
      }
      payload[f.key] = n;
    }
    setSavingKey(row.key);
    try {
      const res = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [row.alias]: { [row.raw]: payload } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPricing(data);
      setDrafts((prev) => { const next = { ...prev }; delete next[row.key]; return next; });
      notify({ type: "success", title: translate("Saved"), message: `${row.fullId} pricing updated` });
    } catch (e) {
      notify({ type: "error", title: translate("Error"), message: e.message || "Failed to save" });
    } finally {
      setSavingKey("");
    }
  };

  const resetRow = async (row) => {
    setSavingKey(row.key);
    try {
      const res = await fetch(`/api/pricing?provider=${encodeURIComponent(row.alias)}&model=${encodeURIComponent(row.raw)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPricing(data);
      setDrafts((prev) => { const next = { ...prev }; delete next[row.key]; return next; });
      notify({ type: "success", title: translate("Reset"), message: `${row.fullId} restored to default` });
    } catch (e) {
      notify({ type: "error", title: translate("Error"), message: e.message || "Failed to reset" });
    } finally {
      setSavingKey("");
    }
  };

  const resetAll = async () => {
    if (!window.confirm(translate("Reset all custom pricing to defaults?"))) return;
    setLoading(true);
    try {
      const res = await fetch("/api/pricing", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPricing(data);
      setDrafts({});
      notify({ type: "success", title: translate("Reset"), message: translate("All custom pricing removed") });
    } catch (e) {
      notify({ type: "error", title: translate("Error"), message: e.message || "Failed to reset" });
    } finally {
      setLoading(false);
    }
  };

  // Dropdown must show human-readable provider names, not internal aliases.
  const aliasNames = useMemo(() => {
    const map = {};
    for (const row of rows) {
      if (!map[row.alias] || row.providerName === row.alias) map[row.alias] = row.providerName;
    }
    for (const p of providers) {
      const id = p?.id;
      const alias = p?.alias || id;
      if (id && p?.name) map[id] = p.name;
      if (alias && p?.name) map[alias] = p.name;
    }
    // Fallback for pricing-only providers that have no catalogue entry
    // (e.g. a custom override saved before the provider was removed).
    for (const [id, info] of Object.entries(AI_PROVIDERS || {})) {
      if (info?.name && (!map[id] || map[id] === id)) map[id] = info.name;
      if (info?.alias && (!map[info.alias] || map[info.alias] === info.alias)) {
        map[info.alias] = info.name;
      }
    }
    return map;
  }, [rows, providers]);

  const providerOptions = [
    { value: "", label: translate("All providers") },
    ...Array.from(new Set(rows.map((r) => r.alias)))
      .map((a) => ({ value: a, label: aliasNames[a] && aliasNames[a] !== a ? aliasNames[a] : a }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  return (
    <div className="an-scope an-shell pricing-page flex w-full min-w-0 flex-col gap-4 sm:gap-5">
      <div className="an-shell-bg" aria-hidden />
      <header className="flex min-w-0 flex-col gap-1.5">
        <p className="an-eyebrow"><span className="an-num">06</span><span className="an-rule" /><span>{translate("RouterMod · AI Gateway")}</span></p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">{translate("Price Settings")}</h1>
        <p className="an-hint max-w-[70ch]">
          {translate("Set custom input, output and cached token prices per model. Prices are in USD per 1M tokens. Models without a default price can be added here too.")}
        </p>
      </header>

      <AntaresPanel
        icon="payments"
        title={translate("Model Pricing")}
        subtitle={translate("{count} models available").replace("{count}", String(rows.length))}
        action={<AntaresButton type="button" size="sm" variant="ghost" icon="restart_alt" onClick={resetAll}>{translate("Reset all")}</AntaresButton>}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-56">
            <AntaresSelect value={providerFilter} onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }} options={providerOptions} ariaLabel={translate("Provider")} />
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={translate("Search model…")}
            className="h-9 w-full rounded-[9px] border border-[var(--t-line)] bg-[var(--t-field)] px-3 text-xs text-[var(--t-ink)] outline-none placeholder:text-[var(--t-dim)]"
          />
        </div>

        {loading ? (
          <p className="mt-6 text-xs text-[var(--t-muted)]">{translate("Loading pricing…")}</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-xs text-[var(--t-muted)]">{translate("No models match the filter")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {visible.map((row) => {
              const draft = getDraft(row);
              const hasAny = FIELDS.some((f) => draft[f.key] !== "" && draft[f.key] !== undefined && draft[f.key] !== null);
              const dirty = FIELDS.some((f) => String(draft[f.key] ?? "") !== String(row.pricing?.[f.key] ?? ""));
              return (
                <div key={row.key} className="rounded-[11px] border border-[var(--t-line-soft)] bg-[var(--t-field)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12px] font-medium text-[var(--t-ink)]" title={row.fullId}>{row.fullId}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--t-dim)]">{row.providerName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!hasAny && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-500">{translate("No price")}</span>}
                      {row.isCustom && <span className="rounded-full border border-[var(--t-accent)]/30 bg-[var(--t-accent-soft)] px-2 py-0.5 text-[10px] text-[var(--t-star-ink)]">{translate("Custom")}</span>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {FIELDS.map((f) => (
                      <label key={f.key} className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-[var(--t-dim)]">{translate(f.label)}</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={draft[f.key] ?? ""}
                          onChange={(e) => setField(row, f.key, e.target.value)}
                          placeholder="0"
                          className="h-8 w-full rounded-[8px] border border-[var(--t-line)] bg-[var(--t-raised)] px-2 font-mono text-[11px] text-[var(--t-ink)] outline-none"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-[var(--t-muted)]">
                      {FIELDS.map((f) => `${f.label} ${fmt(draft[f.key])}`).join(" · ")}
                    </span>
                    <div className="flex shrink-0 gap-2">
                      {row.isCustom && (
                        <AntaresButton type="button" size="sm" variant="ghost" icon="restart_alt" disabled={savingKey === row.key} onClick={() => resetRow(row)}>{translate("Reset")}</AntaresButton>
                      )}
                      <AntaresButton type="button" size="sm" icon="save" disabled={!dirty || savingKey === row.key} onClick={() => saveRow(row)}>{savingKey === row.key ? translate("Saving…") : translate("Save")}</AntaresButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <AntaresButton type="button" size="sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{translate("Previous")}</AntaresButton>
            <span className="font-mono text-[11px] text-[var(--t-muted)]">{currentPage} / {pages}</span>
            <AntaresButton type="button" size="sm" variant="ghost" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{translate("Next")}</AntaresButton>
          </div>
        )}
      </AntaresPanel>
    </div>
  );
}
