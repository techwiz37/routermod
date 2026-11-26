"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import { usePageReady } from "@/shared/components/PageReadyContext";
import { useEffect, useMemo, useState } from "react";
import { AddCustomEmbeddingModal } from "@/shared/components";
import AntaresStat from "@/shared/components/AntaresStat";
import StarField from "@/shared/components/StarField";
import { MEDIA_PROVIDER_KINDS, getProvidersByKind } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";
import MediaProviderCard, { getEffectiveStatus } from "../_components/MediaProviderCard";
import ComboList from "../_components/ComboList";

const COMBO_KINDS = new Set([]);
const COMBO_BASE_NAMES = { image: "image-combo", tts: "tts-combo" };

export default function MediaProviderKindPage() {
  const { kind } = useParams();
  const router = useRouter();
  const [connections, setConnections] = useState([]);
  const [customNodes, setCustomNodes] = useState([]);
  const [combos, setCombos] = useState([]);
  const [showAddCustomEmbedding, setShowAddCustomEmbedding] = useState(false);
  const [loaded, setLoaded] = useState(false);
  usePageReady(!loaded);

  useEffect(() => {
    if (kind === "webSearch" || kind === "webFetch") {
      router.replace("/dashboard/media-providers/web");
    }
  }, [kind, router]);

  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const isEmbedding = kind === "embedding";
  const supportsCombo = COMBO_KINDS.has(kind);

  useEffect(() => {
    if (!kindConfig) return;
    const jobs = [
      fetch("/api/providers", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setConnections(d.connections || []))
        .catch(() => {}),
    ];
    if (isEmbedding) {
      jobs.push(
        fetch("/api/provider-nodes", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => setCustomNodes((d.nodes || []).filter((n) => n.type === "custom-embedding")))
          .catch(() => {})
      );
    }
    if (supportsCombo) {
      jobs.push(
        fetch("/api/combos", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => setCombos(d.combos || []))
          .catch(() => {})
      );
    }
    Promise.allSettled(jobs).then(() => setLoaded(true));
  }, [isEmbedding, supportsCombo, kindConfig]);

  if (!kindConfig) return notFound();

  const providers = getProvidersByKind(kind);
  const kindCombos = combos.filter((c) => c.kind === kind);

  const customProviders = customNodes.map((n) => ({
    id: n.id,
    name: n.name || "Custom Embedding",
    color: "#6366F1",
    textIcon: "CE",
  }));

  const allProviders = [...providers, ...customProviders];
  const providerIds = new Set(allProviders.map((p) => p.id));

  const kindIndex = MEDIA_PROVIDER_KINDS.findIndex((k) => k.id === kind);
  const eyebrowNum = String(kindIndex + 1).padStart(2, "0");

  const summary = useMemo(() => {
    const relevant = connections.filter((c) => providerIds.has(c.provider));
    let active = 0;
    let error = 0;
    for (const c of relevant) {
      const status = getEffectiveStatus(c);
      if (status === "active" || status === "success") active += 1;
      else if (status === "error" || status === "expired" || status === "unavailable") error += 1;
    }
    return { total: relevant.length, active, error };
  }, [connections, allProviders]);

  const handleToggleProvider = async (providerId, newActive) => {
    const providerConns = connections.filter((c) => c.provider === providerId);
    setConnections((prev) =>
      prev.map((c) => (c.provider === providerId ? { ...c, isActive: newActive } : c))
    );
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        })
      )
    );
  };

  const handleCreateCombo = async () => {
    const base = COMBO_BASE_NAMES[kind] || `${kind}-combo`;
    let name = base;
    let i = 1;
    const existing = new Set(combos.map((c) => c.name));
    while (existing.has(name)) { name = `${base}-${i++}`; }
    const res = await fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, models: [], kind }),
    });
    if (res.ok) {
      const created = await res.json();
      router.push(`/dashboard/media-providers/combo/${created.id}`);
    } else {
      const err = await res.json();
      alert(err.error || "Failed to create combo");
    }
  };

  const actions = (isEmbedding || supportsCombo) ? (
    <div className="an-panel-actions">
      {supportsCombo && (
        <button
          type="button"
          className="an-btn an-ghost h-9 px-3 text-[11px] gap-1.5"
          onClick={handleCreateCombo}
        >
          <span className="material-symbols-outlined text-[15px]">add</span>
          {translate("Create Combo")}
        </button>
      )}
      {isEmbedding && (
        <button
          type="button"
          className="an-btn an-primary h-9 px-3 text-[11px] gap-1.5"
          onClick={() => setShowAddCustomEmbedding(true)}
        >
          <span className="material-symbols-outlined text-[15px]">add</span>
          {translate("Add Custom Embedding")}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="an-scope an-shell media-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="flex min-w-0 flex-col gap-2">
        <p className="an-eyebrow">
          <span className="an-num">{eyebrowNum}</span>
          <span className="an-rule" />
          <span>{translate("RouterMod · AI Gateway")}</span>
        </p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
          {translate(kindConfig.label)}
        </h1>
        <p className="an-hint max-w-[70ch]">
          {translate("Providers that can serve this media request. Open one to add an account or endpoint, then call it through RouterMod.")}
        </p>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid media-stats gap-2.5 sm:gap-3">
        <AntaresStat
          label={translate("Providers")}
          icon={kindConfig.icon}
          tone="default"
          value={allProviders.length}
          foot={translate("available for this kind")}
        />
        <AntaresStat
          label={translate("Active Accounts")}
          icon="check_circle"
          tone="ok"
          value={summary.active}
          unit={`/ ${summary.total}`}
          foot={translate("registered accounts")}
        />
        <AntaresStat
          label={translate("Errors")}
          icon="warning"
          tone="danger"
          value={summary.error}
          foot={translate("accounts need a look")}
        />
        <AntaresStat
          label={translate("Endpoint")}
          icon="api"
          tone="violet"
          value={kindConfig.endpoint.method}
          foot={kindConfig.endpoint.path}
        />
      </div>

      {supportsCombo && kindCombos.length > 0 && (
        <ComboList combos={kindCombos} />
      )}

      {/* ---- Provider list ---- */}
      <section className="an-panel overflow-hidden">
        <header className="an-panel-head an-panel-head-stack">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">{kindConfig.icon}</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="an-panel-title">{translate(kindConfig.label)}</h2>
            <p className="an-panel-sub">
              {allProviders.length} {translate("providers")} · {customProviders.length}{" "}
              {translate("custom endpoints")}
            </p>
          </div>
          {actions}
        </header>

        <div className="an-panel-pad">
          {allProviders.length === 0 ? (
            <div className="an-empty an-empty-row">
              <span className="material-symbols-outlined">extension</span>
              <p>{translate("No providers support this media kind yet.")}</p>
            </div>
          ) : (
            <div className="an-grid-providers">
              {providers.map((provider) => (
                <MediaProviderCard
                  key={provider.id}
                  provider={{ ...provider, kindLabel: translate(kindConfig.label) }}
                  kind={kind}
                  connections={connections}
                  onToggle={handleToggleProvider}
                />
              ))}
              {customProviders.map((provider) => (
                <MediaProviderCard
                  key={provider.id}
                  provider={{ ...provider, kindLabel: translate(kindConfig.label) }}
                  kind={kind}
                  connections={connections}
                  isCustom
                  onToggle={handleToggleProvider}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {isEmbedding && (
        <AddCustomEmbeddingModal
          isOpen={showAddCustomEmbedding}
          onClose={() => setShowAddCustomEmbedding(false)}
          onCreated={(node) => {
            setCustomNodes((prev) => [...prev, node]);
            setShowAddCustomEmbedding(false);
          }}
        />
      )}
    </div>
  );
}
