"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CardSkeleton } from "@/shared/components";
import { SurfaceSkinContext } from "@/shared/components/SurfaceSkinContext";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import {
  ClaudeToolCard, CodexToolCard, DroidToolCard, OpenClawToolCard,
  HermesToolCard, DefaultToolCard, OpenCodeToolCard, CoworkToolCard,
  ClineToolCard, KiloToolCard, DeepSeekTuiToolCard,
  JcodeToolCard, GrokBuildToolCard, GenericCliToolCard,
} from "../components";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

export default function ToolDetailClient({ toolId, machineId }) {
  const tool = CLI_TOOLS[toolId];
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modelMappings, setModelMappings] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tailscaleEnabled, setTailscaleEnabled] = useState(false);
  const [tailscaleUrl, setTailscaleUrl] = useState("");
  const [apiKeys, setApiKeys] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [provRes, settingsRes, tunnelRes, keysRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/settings"),
          fetch("/api/tunnel/status"),
          fetch("/api/keys"),
        ]);
        if (!mounted) return;
        if (provRes.ok) {
          const data = await provRes.json();
          setConnections(data.connections || []);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setCloudEnabled(data.cloudEnabled || false);
        }
        if (tunnelRes.ok) {
          const data = await tunnelRes.json();
          setTunnelEnabled(!!(data.tunnel?.enabled || data.tunnel?.settingsEnabled));
          setTunnelPublicUrl(data.tunnel?.publicUrl || "");
          setTailscaleEnabled(!!(data.tailscale?.enabled || data.tailscale?.settingsEnabled));
          setTailscaleUrl(data.tailscale?.tunnelUrl || "");
        }
        if (keysRes.ok) {
          const data = await keysRes.json();
          setApiKeys(data.keys || []);
        }
      } catch (error) {
        console.log("Error loading tool data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const getAllAvailableModels = () => {
    const activeProviders = getActiveProviders();
    const models = [];
    const seenModels = new Set();
    activeProviders.forEach(conn => {
      const alias = PROVIDER_ID_TO_ALIAS[conn.provider] || conn.provider;
      const providerModels = getModelsByProviderId(conn.provider);
      providerModels.forEach(m => {
        const modelValue = `${alias}/${m.id}`;
        if (!seenModels.has(modelValue)) {
          seenModels.add(modelValue);
          models.push({ value: modelValue, label: `${alias}/${m.id}`, provider: conn.provider, alias, connectionName: conn.name, modelId: m.id });
        }
      });

      if (providerModels.length === 0) {
        const prefix = conn.providerSpecificData?.prefix || alias;
        const fallbackModels = [];
        if (conn.defaultModel) fallbackModels.push({ id: conn.defaultModel, name: conn.defaultModel });
        (conn.providerSpecificData?.customModels || []).forEach(m => {
          if (m?.id && !fallbackModels.some(f => f.id === m.id)) fallbackModels.push({ id: m.id, name: m.name || m.id });
        });
        if (fallbackModels.length === 0 && conn.testStatus === "active") {
          fallbackModels.push({ id: "model-id", name: `${prefix}/model-id` });
        }
        fallbackModels.forEach(m => {
          const modelValue = `${prefix}/${m.id}`;
          if (!seenModels.has(modelValue)) {
            seenModels.add(modelValue);
            models.push({ value: modelValue, label: `${prefix}/${m.id}`, provider: conn.provider, alias: prefix, connectionName: conn.name, modelId: m.id });
          }
        });
      }
    });
    return models;
  };

  const handleModelMappingChange = useCallback((tId, alias, target) => {
    setModelMappings(prev => {
      if (prev[tId]?.[alias] === target) return prev;
      return { ...prev, [tId]: { ...prev[tId], [alias]: target } };
    });
  }, []);

  const getBaseUrl = () => {
    if (tunnelEnabled && tunnelPublicUrl) return tunnelPublicUrl;
    if (cloudEnabled && CLOUD_URL) return CLOUD_URL;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:20128";
  };

  const renderToolCard = () => {
    const availableModels = getAllAvailableModels();
    const hasActiveProviders = availableModels.length > 0;
    const commonProps = {
      tool,
      isExpanded: true,
      onToggle: () => {},
      baseUrl: getBaseUrl(),
      apiKeys,
      tunnelEnabled,
      tunnelPublicUrl,
      tailscaleEnabled,
      tailscaleUrl,
    };

    switch (toolId) {
      case "claude":
        return <ClaudeToolCard {...commonProps} activeProviders={getActiveProviders()} modelMappings={modelMappings[toolId] || {}} onModelMappingChange={(a, t) => handleModelMappingChange(toolId, a, t)} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} />;
      case "codex":
        return <CodexToolCard {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} />;
      case "opencode":
        return <OpenCodeToolCard {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} />;
      case "cowork":
        return <CoworkToolCard {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} cloudUrl={CLOUD_URL} tunnelEnabled={tunnelEnabled} tunnelPublicUrl={tunnelPublicUrl} tailscaleEnabled={tailscaleEnabled} tailscaleUrl={tailscaleUrl} />;
      case "droid":
        return <DroidToolCard {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} />;
      case "openclaw":
        return <OpenClawToolCard {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} />;
      case "hermes":
        return <HermesToolCard {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} />;
      case "cline":
        return <ClineToolCard {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} />;
      case "kilo":
        return <KiloToolCard {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} />;
      case "deepseek-tui":
        return <DeepSeekTuiToolCard {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} />;
      case "jcode":
        return <JcodeToolCard {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} />;
      case "grok-build":
        return <GrokBuildToolCard {...commonProps} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} />;
      case "pi":
      case "omp":
      case "crush":
      case "forge":
      case "smelt":
      case "codewhale":
        return <GenericCliToolCard {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} />;
      default:
        return <DefaultToolCard toolId={toolId} {...commonProps} activeProviders={getActiveProviders()} cloudEnabled={cloudEnabled} tunnelEnabled={tunnelEnabled} />;
    }
  };

  if (!tool) {
    return (
      <div className="an-scope an-toolscope flex min-w-0 flex-col gap-4">
        <Link href="/dashboard/cli-tools" className="an-back">
          <span className="material-symbols-outlined">arrow_back</span>
          <span>Back to Tool CLI</span>
        </Link>
        <div className="an-panel">
          <div className="an-panel-pad">
            <p className="text-[13px] text-[var(--t-muted)]">Tool not found or disabled.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="an-scope an-toolscope flex min-w-0 flex-col gap-4">
      <Link href="/dashboard/cli-tools" className="an-back w-fit">
        <span className="material-symbols-outlined">arrow_back</span>
        <span>Back to Tool CLI</span>
      </Link>

      <section className="an-panel">
        <header className="an-panel-head">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined">terminal</span>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="an-panel-title truncate">{tool.name}</h1>
            <p className="an-panel-sub">{tool.description}</p>
          </div>
          {tool.docsUrl && (
            <div className="an-panel-actions">
              <a
                href={tool.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                Docs
              </a>
            </div>
          )}
        </header>
      </section>

      <SurfaceSkinContext.Provider value="antares">
        {loading ? <CardSkeleton /> : renderToolCard()}
      </SurfaceSkinContext.Provider>
    </div>
  );
}
