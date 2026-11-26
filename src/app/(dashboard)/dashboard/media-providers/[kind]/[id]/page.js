"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AddCustomEmbeddingModal, NoAuthProxyCard, ProviderInfoCard, PageLoader } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import StarField from "@/shared/components/StarField";
import ProviderAlert from "@/app/(dashboard)/dashboard/providers/components/ProviderAlert";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import { translate } from "@/i18n/runtime";
import ConnectionsCard from "@/app/(dashboard)/dashboard/providers/components/ConnectionsCard";
import ModelsCard from "@/app/(dashboard)/dashboard/providers/components/ModelsCard";
import { KIND_EXAMPLE_CONFIG } from "./components/exampleShared";
import { EmbeddingExampleCard } from "./components/EmbeddingExampleCard";
import { TtsExampleCard } from "./components/TtsExampleCard";
import { GenericExampleCard } from "./components/GenericExampleCard";
import { SttExampleCard } from "./components/SttExampleCard";

export default function MediaProviderDetailPage() {
  const { kind, id } = useParams();
  const router = useRouter();
  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const isCustom = isCustomEmbeddingProvider(id) && kind === "embedding";

  const handleDeleteCustom = async () => {
    if (!confirm("Delete this Custom Embedding node?")) return;
    try {
      const res = await fetch(`/api/provider-nodes/${id}`, { method: "DELETE" });
      if (res.ok) router.push(`/dashboard/media-providers/${kind}`);
    } catch (error) {
      console.log("Error deleting custom embedding node:", error);
    }
  };

  const [customNode, setCustomNode] = useState(null);
  const [customLoading, setCustomLoading] = useState(isCustom);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (!isCustom) return;
    let cancelled = false;
    fetch("/api/provider-nodes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCustomNode((d.nodes || []).find((n) => n.id === id) || null);
        setCustomLoading(false);
      })
      .catch(() => { if (!cancelled) setCustomLoading(false); });
    return () => { cancelled = true; };
  }, [id, isCustom]);

  if (!kindConfig) return notFound();

  const builtInProvider = AI_PROVIDERS[id];

  const provider = isCustom
    ? (customNode ? { id, name: customNode.name || "Custom Embedding", color: "#6366F1", textIcon: "CE" } : null)
    : builtInProvider;

  if (!isCustom && !builtInProvider) return notFound();
  if (isCustom && !customLoading && !customNode) return notFound();
  if (isCustom && customLoading) {
    return <PageLoader message="Loading provider..." />;
  }

  const kinds = isCustom ? ["embedding"] : (provider.serviceKinds ?? ["llm"]);
  if (!isCustom && !kinds.includes(kind)) return notFound();

  const kindIndex = MEDIA_PROVIDER_KINDS.findIndex((k) => k.id === kind);
  const eyebrowNum = String(kindIndex + 1).padStart(2, "0");
  const heroKinds = kinds.filter(
    (k) => k === kind || MEDIA_PROVIDER_KINDS.some((m) => m.id === k)
  );
  const apiKeyUrl = !isCustom ? provider.notice?.apiKeyUrl : null;

  return (
    <div className="an-scope an-shell an-providerscope media-page flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="an-shell-bg" aria-hidden>
        <StarField />
      </div>

      {/* ---- Hero ---- */}
      <header className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <p className="an-eyebrow min-w-0">
            <span className="an-num">{eyebrowNum}</span>
            <span className="an-rule" />
            <span className="truncate">{translate(kindConfig.label)}</span>
          </p>
          <Link
            href={`/dashboard/media-providers/${kind}`}
            className="an-btn an-ghost ml-auto h-8 shrink-0 gap-1 px-2.5 text-[11px]"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            {translate("Back")}
          </Link>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <span
            className="an-provider-hero-ico"
            style={{ borderColor: `${provider.color}40`, background: `${provider.color}12` }}
            aria-hidden
          >
            <ProviderIcon
              src={`/providers/${provider.id}.png`}
              alt={provider.name}
              size={40}
              className="object-contain"
              fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="an-h1 break-words text-[clamp(1.7rem,4.6vw,2.4rem)]">
              {provider.name}
            </h1>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
              {isCustom && (
                <span className="an-chip accent max-w-full truncate">
                  {translate("Custom")} · <code>{customNode?.prefix}</code>
                </span>
              )}
              {heroKinds.map((k) => (
                <span key={k} className={`an-chip ${k === kind ? "accent" : ""}`}>
                  {translate(MEDIA_PROVIDER_KINDS.find((m) => m.id === k)?.label || k)}
                </span>
              ))}
              {apiKeyUrl && (
                <a
                  href={apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="an-chip ok"
                >
                  <span className="material-symbols-outlined">open_in_new</span>
                  {translate("Get API Key")}
                </a>
              )}
            </div>
          </div>

          {isCustom && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button
                type="button"
                className="an-btn an-ghost h-9 gap-1.5 px-3 text-[11px]"
                onClick={() => setShowEditModal(true)}
              >
                <span className="material-symbols-outlined">edit</span>
                {translate("Edit")}
              </button>
              <button
                type="button"
                className="an-btn an-ghost h-9 gap-1.5 px-3 text-[11px] !text-[var(--t-danger)] hover:!border-[var(--t-danger)]"
                onClick={handleDeleteCustom}
              >
                <span className="material-symbols-outlined">delete</span>
                {translate("Delete")}
              </button>
            </div>
          )}
        </div>

        <p className="an-hint max-w-[70ch]">
          {isCustom
            ? translate("Any OpenAI-compatible embedding endpoint can sit behind this node. Add credentials, then call it through RouterMod.")
            : translate("Add an account or endpoint for this provider, then call it through RouterMod.")}
        </p>
      </header>

      {/* ---- Notices ---- */}
      {!isCustom && provider.kindNotice?.[kind] && (
        <ProviderAlert variant="warning" title={translate("Notice")}>
          {provider.kindNotice[kind]}
        </ProviderAlert>
      )}

      {!isCustom && provider.notice?.text && !provider.deprecated && (
        <ProviderAlert
          variant="info"
          title={translate("Notice")}
          action={
            apiKeyUrl ? (
              <a
                href={apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="an-btn an-ghost h-8 gap-1 px-2.5 text-[11px]"
              >
                <span className="material-symbols-outlined">open_in_new</span>
                {translate("Get API Key")}
              </a>
            ) : null
          }
        >
          {provider.notice.text}
        </ProviderAlert>
      )}

      {/* Connections */}
      {!isCustom && provider.noAuth ? (
        <NoAuthProxyCard providerId={id} />
      ) : (
        <ConnectionsCard providerId={id} isOAuth={false} />
      )}

      {/* Models - hidden for tts/webSearch/webFetch (provider IS the model); custom uses prefix as alias */}
      {kind !== "tts" && kind !== "webSearch" && kind !== "webFetch" && (
        <ModelsCard
          providerId={id}
          kindFilter={kind}
          providerAliasOverride={isCustom ? customNode?.prefix : undefined}
        />
      )}

      {/* Provider Info — config-driven, supports searchConfig, fetchConfig, ttsConfig, embeddingConfig, systemoneConfig, searchViaChat */}
      {!isCustom && (provider.searchConfig || provider.fetchConfig || provider.ttsConfig || provider.sttConfig || provider.embeddingConfig || provider.systemoneConfig || provider.searchViaChat) && (
        <ProviderInfoCard
          config={
            kind === "webFetch" ? provider.fetchConfig
              : kind === "tts" ? provider.ttsConfig
              : kind === "stt" ? provider.sttConfig
              : kind === "embedding" ? provider.embeddingConfig
              : kind === "systemone" ? provider.systemoneConfig
              : provider.searchConfig || { mode: "chat-completions", defaultModel: provider.searchViaChat?.defaultModel, pricingUrl: provider.searchViaChat?.pricingUrl, freeTier: provider.searchViaChat?.freeTier }
          }
          provider={provider}
          title={`${translate(kindConfig.label)} ${translate("Config")}`}
        />
      )}

      {/* Example — per kind */}
      {kind === "embedding" && (
        <EmbeddingExampleCard providerId={id} customAlias={customNode?.prefix} />
      )}
      {kind === "tts" && <TtsExampleCard providerId={id} />}
      {kind === "stt" && !isCustom && <SttExampleCard providerId={id} />}
      {!isCustom && KIND_EXAMPLE_CONFIG[kind] && <GenericExampleCard providerId={id} kind={kind} />}

      {isCustom && (
        <AddCustomEmbeddingModal
          isOpen={showEditModal}
          node={customNode}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setCustomNode(updated);
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}
