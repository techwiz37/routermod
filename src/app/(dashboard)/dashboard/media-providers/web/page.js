"use client";

import { usePageReady } from "@/shared/components/PageReadyContext";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AntaresStat from "@/shared/components/AntaresStat";
import StarField from "@/shared/components/StarField";
import { MEDIA_PROVIDER_KINDS, getProvidersByKind } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";
import MediaProviderCard, { getEffectiveStatus } from "../_components/MediaProviderCard";
import ComboList from "../_components/ComboList";

const SECTIONS = [
  { kind: "webSearch", comboBase: "search-combo" },
  { kind: "webFetch", comboBase: "fetch-combo" },
];

function kindMeta(id) {
  return MEDIA_PROVIDER_KINDS.find((k) => k.id === id) ?? { id, label: id, icon: "public", endpoint: { method: "POST", path: "" } };
}

function kindNum(id) {
  const index = MEDIA_PROVIDER_KINDS.findIndex((k) => k.id === id);
  return String(index + 1).padStart(2, "0");
}

export default function WebProvidersPage() {
  const router = useRouter();
  const [connections, setConnections] = useState([]);
  const [combos, setCombos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  usePageReady(!loaded);

  useEffect(() => {
    const jobs = [
      fetch("/api/providers", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setConnections(d.connections || []))
        .catch(() => {}),
      fetch("/api/combos", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setCombos(d.combos || []))
        .catch(() => {}),
    ];
    Promise.allSettled(jobs).then(() => setLoaded(true));
  }, []);

  const groups = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        meta: kindMeta(section.kind),
        providers: getProvidersByKind(section.kind),
        combos: combos.filter((c) => c.kind === section.kind),
      })),
    [combos]
  );

  const providerIds = useMemo(
    () => new Set(groups.flatMap((g) => g.providers.map((p) => p.id))),
    [groups]
  );

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
  }, [connections, providerIds]);

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

  const handleCreateCombo = async (comboBase, kind) => {
    let name = comboBase;
    let i = 1;
    const existing = new Set(combos.map((c) => c.name));
    while (existing.has(name)) { name = `${comboBase}-${i++}`; }
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

  return (
    <div className="an-scope an-shell media-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="flex min-w-0 flex-col gap-2">
        <p className="an-eyebrow">
          <span className="an-num">{kindNum("webSearch")}–{kindNum("webFetch")}</span>
          <span className="an-rule" />
          <span>{translate("RouterMod · AI Gateway")}</span>
        </p>
        <h1 className="an-h1 text-[clamp(1.6rem,4.6vw,2.3rem)]">
          {translate("Web Fetch & Search")}
        </h1>
        <p className="an-hint max-w-[70ch]">
          {translate("Providers that let the assistant search the web or read a page. Open one to add an account, then call it through RouterMod.")}
        </p>
      </header>

      {/* ---- Summary tiles ---- */}
      <div className="an-grid media-stats gap-2.5 sm:gap-3">
        <AntaresStat
          label={translate("Providers")}
          icon="travel_explore"
          tone="default"
          value={providerIds.size}
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
          value="POST"
          foot="/v1/search · /v1/web/fetch"
        />
      </div>

      {/* ---- Sections ---- */}
      {groups.map((group) => (
        <section key={group.kind} className="an-panel overflow-hidden">
          <header className="an-panel-head an-panel-head-stack">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">{group.meta.icon}</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="an-panel-title">{translate(group.meta.label)}</h2>
              <p className="an-panel-sub">
                {group.providers.length} {translate("providers")} · {group.combos.length}{" "}
                {translate("Combos").toLowerCase()}
              </p>
            </div>
            <div className="an-panel-actions an-actions-wrap">
              <button
                type="button"
                className="an-btn an-ghost h-9 px-3 text-[11px] gap-1.5"
                onClick={() => handleCreateCombo(group.comboBase, group.kind)}
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                {translate("Create Combo")}
              </button>
            </div>
          </header>

          <div className="an-panel-pad">
            <ComboList combos={group.combos} bare />

            {group.providers.length === 0 ? (
              <div className="an-empty an-empty-row">
                <span className="material-symbols-outlined">extension</span>
                <p>{translate("No providers support this media kind yet.")}</p>
              </div>
            ) : (
              <div className="an-grid-providers">
                {group.providers.map((provider) => (
                  <MediaProviderCard
                    key={provider.id}
                    provider={{ ...provider, kindLabel: translate(group.meta.label) }}
                    kind={group.kind}
                    connections={connections}
                    onToggle={handleToggleProvider}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
