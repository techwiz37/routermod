"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePageReady } from "@/shared/components/PageReadyContext";
import { useParams, useRouter } from "next/navigation";
import AntaresSelect from "@/shared/components/AntaresSelect";
import AntaresPanel from "@/shared/components/AntaresPanel";
import AntaresSwitch from "@/shared/components/AntaresSwitch";
import AntaresCheckbox from "@/shared/components/AntaresCheckbox";
import { SurfaceSkinContext } from "@/shared/components/SurfaceSkinContext";
import Link from "next/link";
import Image from "next/image";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { fetchProviderFavicon } from "@/shared/utils/providerFavicon";
import { Card, Button, Badge, Input, Modal, CardSkeleton, OAuthModal, KiroOAuthWrapper, CursorAuthModal, ZedAuthModal, XiaomiMimoAuthModal, IFlowCookieModal, GitLabAuthModal, Toggle, Select, EditConnectionModal, NoAuthProxyCard, FreePiConnectCard, RouterModProxyCard, ConfirmModal, PageLoader } from "@/shared/components";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS, getProviderAlias, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { testModel } from "@/shared/utils/testModel";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { importedModelCaps } from "@/shared/utils/modelCapabilities";
import { translate } from "@/i18n/runtime";
import { fetchSuggestedModels } from "@/shared/utils/providerModelsFetcher";
import { applyQoderModelNames, getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import ModelRow from "./ModelRow";
import PassthroughModelsSection from "./PassthroughModelsSection";
import CompatibleModelsSection from "./CompatibleModelsSection";
import ModelListPagination from "./ModelListPagination";
import GlobalPrefixCard from "./GlobalPrefixCard";
import SystemPromptCard from "./SystemPromptCard";
import ConnectionRow from "./ConnectionRow";
import AddApiKeyModal from "./AddApiKeyModal";
import EditCompatibleNodeModal from "./EditCompatibleNodeModal";
import AddCustomModelModal from "./AddCustomModelModal";
import BulkImportCodexModal from "./BulkImportCodexModal";
import BulkImportGrokCliModal from "./BulkImportGrokCliModal";
import CustomConfigCard from "./CustomConfigCard";
import SessionRateLimitCard from "./SessionRateLimitCard";
import RoundRobinControl from "./RoundRobinControl";
import JailbreakCard from "./JailbreakCard";
import ModelConfigCarousel from "./ModelConfigCarousel";
import ProviderAlert from "../components/ProviderAlert";
import AutoPingScheduleModal from "./AutoPingScheduleModal";
import WebLoginButton, { WEB_LOGIN_PROVIDERS } from "../components/WebLoginButton.js";
import MinimaxLeaseButton from "../components/MinimaxLeaseButton.js";
import { getScheduleSlotLabels } from "@/shared/services/quotaPingSchedule";
import { useNotificationStore } from "@/store/notificationStore";
const ONE_BY_ONE_DELAY_MS = 1000;

const MCODE_LEASE_PROVIDERS = new Set(["minimax-code", "minimax-code-global"]);

// Providers whose registry list is only an offline fallback: the dashboard
// renders the live per-connection catalog from GET /api/providers/[id]/models
// when one resolves, and falls back to the static rows otherwise.
const LIVE_MODEL_CATALOG_PROVIDERS = new Set(["cursor", "zed", "claude", "commandcode"]);

const AUTO_PING_SETTINGS_KEYS = {
  claude: "claudeAutoPing",
  codex: "codexAutoPing",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ProviderDetailPage() {
  const params = useParams();
  return <ProviderDetail key={params.id} providerId={params.id} />;
}

function ProviderDetail({ providerId }) {
  const router = useRouter();
  const { getCaps } = useModelCaps();
  const [connections, setConnections] = useState([]);
  const [connectionsPage, setConnectionsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  usePageReady(loading);
  const [providerNode, setProviderNode] = useState(null);
  const [proxyPools, setProxyPools] = useState([]);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showXiaomiMimoModal, setShowXiaomiMimoModal] = useState(false);
  const [showIFlowCookieModal, setShowIFlowCookieModal] = useState(false);
  const [showAddApiKeyModal, setShowAddApiKeyModal] = useState(false);
  const [addConnectionError, setAddConnectionError] = useState("");
  const [showBulkImportCodex, setShowBulkImportCodex] = useState(false);
  const [showBulkImportGrokCli, setShowBulkImportGrokCli] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditNodeModal, setShowEditNodeModal] = useState(false);
  const [showBulkProxyModal, setShowBulkProxyModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [modelAliases, setModelAliases] = useState({});
  const [modelNames, setModelNames] = useState({});
  const [prefixOverride, setPrefixOverride] = useState(null);
  const [systemPromptModel, setSystemPromptModel] = useState("");
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  const [systemPrompts, setSystemPrompts] = useState({});
  const [allSystemPrompts, setAllSystemPrompts] = useState({});
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
  const systemPromptModelRef = useRef("");
  const providerModelNamesRef = useRef({});
  const addNotification = useNotificationStore((s) => s.addNotification);
  const updateNotification = useNotificationStore((s) => s.updateNotification);
  const providerStrategyRef = useRef({});
  const [strategyReady, setStrategyReady] = useState(false);

  const [customModels, setCustomModels] = useState([]);
  const [headerImgError, setHeaderImgError] = useState(false);
  const [detectedFavicon, setDetectedFavicon] = useState(null);
  const [loadingFavicon, setLoadingFavicon] = useState(false);
  const [modelTestResults, setModelTestResults] = useState({});
  const [modelsTestError, setModelsTestError] = useState("");
  const [testingModelIds, setTestingModelIds] = useState(() => new Set());
  const [showAddCustomModel, setShowAddCustomModel] = useState(false);
  const [selectedConnectionIds, setSelectedConnectionIds] = useState([]);
  const [bulkProxyPoolId, setBulkProxyPoolId] = useState("__none__");
  const [bulkUpdatingProxy, setBulkUpdatingProxy] = useState(false);
  const [thinkingMode, setThinkingMode] = useState("auto");
  const [autoPing, setAutoPing] = useState({ enabled: false, connections: {}, schedules: {} });
  const [scheduleConnection, setScheduleConnection] = useState(null);
  const [suggestedModels, setSuggestedModels] = useState([]);
  const [liveModels, setLiveModels] = useState([]);
  // Live-catalog fetch warning/error (surfaced for zed only; cursor behavior unchanged).
  const [liveModelsError, setLiveModelsError] = useState(null);
  const [kiloFreeModels, setKiloFreeModels] = useState([]);
  const [disabledModelIds, setDisabledModelIds] = useState([]);
  const [deletedModelIds, setDeletedModelIds] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [showAgRiskModal, setShowAgRiskModal] = useState(false);
  const [oneByOneRunning, setOneByOneRunning] = useState(false);
  const [oneByOneStopping, setOneByOneStopping] = useState(false);
  const [oneByOneCurrentConnectionId, setOneByOneCurrentConnectionId] = useState(null);
  const [oneByOneResults, setOneByOneResults] = useState({});
  const [oneByOneSummary, setOneByOneSummary] = useState(null);
  const stopOneByOneRef = useRef(false);
  const [importingQoderModels, setImportingQoderModels] = useState(false);
  const [importingClineModels, setImportingClineModels] = useState(false);
  const [importingModels, setImportingModels] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  const AG_RISK_STORAGE_KEY = "ag_risk_confirmed";

  const openOAuthConnection = () => {
    setShowOAuthModal(true);
  };

  const triggerOAuthConnection = () => {
    if (providerId === "antigravity" && typeof window !== "undefined") {
      const confirmed = window.localStorage.getItem(AG_RISK_STORAGE_KEY) === "true";
      if (!confirmed) {
        setShowAgRiskModal(true);
        return;
      }
    }
    // Xiaomi Desktop: auto-import local credentials first, OAuth as fallback
    if (providerId === "xiaomi-mimo") {
      setShowXiaomiMimoModal(true);
      return;
    }
    if (isOAuth) {
      openOAuthConnection();
      return;
    }
    setAddConnectionError("");
    setShowAddApiKeyModal(true);
  };

  const triggerApiKeyConnection = () => {
    setAddConnectionError("");
    setShowAddApiKeyModal(true);
  };

  const triggerAddConnection = () => {
    if (isOAuth) {
      triggerOAuthConnection();
      return;
    }
    triggerApiKeyConnection();
  };

  const handleAgRiskConfirm = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AG_RISK_STORAGE_KEY, "true");
    }
    setShowAgRiskModal(false);
    if (isOAuth) {
      openOAuthConnection();
      return;
    }
    triggerApiKeyConnection();
  };

  const providerInfo = providerNode
    ? {
        id: providerNode.id,
        name: providerNode.name || (providerNode.type === "anthropic-compatible" ? "Anthropic Compatible" : "OpenAI Compatible"),
        color: providerNode.type === "anthropic-compatible" ? "#D97757" : "#10A37F",
        textIcon: providerNode.type === "anthropic-compatible" ? "AC" : "OC",
        apiType: providerNode.apiType,
        baseUrl: providerNode.baseUrl,
        type: providerNode.type,
      }
    : (OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId] || FREE_PROVIDERS[providerId] || FREE_TIER_PROVIDERS[providerId] || WEB_COOKIE_PROVIDERS[providerId]);
  const authModes = providerInfo?.authModes || [];
  const isOAuth = !!OAUTH_PROVIDERS[providerId] || !!FREE_PROVIDERS[providerId] || authModes.includes("oauth");
  const supportsApiKeyAuth = !!APIKEY_PROVIDERS[providerId] || authModes.includes("apikey");
  const isFreeNoAuth = !!FREE_PROVIDERS[providerId]?.noAuth;
  const staticModels = getModelsByProviderId(providerId);
  const models = LIVE_MODEL_CATALOG_PROVIDERS.has(providerId) && liveModels.length > 0
    ? liveModels
    : applyQoderModelNames(staticModels, customModels, getProviderAlias(providerId));
  const providerAlias = getProviderAlias(providerId);
  
  const isOpenAICompatible = isOpenAICompatibleProvider(providerId);
  const isAnthropicCompatible = isAnthropicCompatibleProvider(providerId);
  const isCompatible = isOpenAICompatible || isAnthropicCompatible;
  const hasDualAuthModes = !isCompatible && isOAuth && supportsApiKeyAuth;
  const oauthConnectionLabel =
    providerId === "xai" ? "Grok Build OAuth"
    : providerId === "grok-cli" ? "Grok CLI Device Login"
    : providerId === "kimi" ? "Kimi Coding OAuth"
    : "OAuth";
  const apiKeyConnectionLabel =
    providerId === "xai" ? "xAI API Key"
    : providerId === "kimi" ? "Kimi API Key"
    : (providerId === "qoder" || providerId === "qoder-cn") ? "PAT"
    : "API Key";
  // Resolve suffix "(level)" for a model when a thinking level is picked and the model supports it.
  const resolveThinkingSuffix = (modelId) => {
    if (!thinkingMode || thinkingMode === "auto") return null;
    const levels = getThinkingLevels(providerId, modelId);
    return levels && levels.includes(thinkingMode) ? thinkingMode : null;
  };
  const providerStorageAlias = isCompatible ? providerId : providerAlias;
  // Union of levels across this provider's reasoning models — drives the level picker options.
  // Include custom models too (e.g. manually added gpt-5.6-sol → max).
  const providerThinkingLevels = (() => {
    const set = new Set();
    const seen = new Set();
    const addLevels = (modelId) => {
      if (!modelId || seen.has(modelId)) return;
      seen.add(modelId);
      const lv = getThinkingLevels(providerId, modelId);
      if (lv) lv.forEach((l) => { if (l !== "none") set.add(l); });
    };
    for (const m of models) addLevels(m.id);
    for (const m of kiloFreeModels) addLevels(m.id);
    for (const entry of customModels) {
      if (entry.providerAlias !== providerStorageAlias) continue;
      if ((entry.kind || entry.type || "llm") !== "llm") continue;
      addLevels(entry.id);
    }
    return set.size ? ["auto", ...[...set]] : null;
  })();
  const providerDisplayAlias = isCompatible
    ? (providerNode?.prefix || providerId)
    : prefixOverride || providerAlias;

  // Models offered in the System Prompt picker must match the model list shown
  // in the card below for this provider only.
  const compatibleSystemPromptModelIds = useMemo(() => {
    const disabledSet = new Set(disabledModelIds || []);
    const ids = new Set();

    if (isCompatible) {
      const rows = getProviderCustomModelRows({
        customModels,
        modelAliases,
        providerAlias: providerStorageAlias,
        type: "llm",
      });
      for (const row of rows) {
        // A legacy alias is a separate public model, even when it routes to
        // the same upstream id as a canonical/custom row.  The selectors
        // store their option value, so collapsing to row.id makes assignments
        // for the two public ids overwrite one another.
        const publicId = row?.alias || row?.id;
        if (publicId && !disabledSet.has(publicId)) ids.add(publicId);
      }
      return Array.from(ids);
    }

    const staticModels = getModelsByProviderId(providerId) || [];
    for (const m of staticModels) {
      if (m?.id && !disabledSet.has(m.id)) ids.add(m.id);
    }
    for (const m of kiloFreeModels || []) {
      if (m?.id && !disabledSet.has(m.id)) ids.add(m.id);
    }
    const rows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: staticModels,
      type: "llm",
    });
    for (const row of rows) {
      const publicId = row?.alias || row?.id;
      if (publicId && !disabledSet.has(publicId)) ids.add(publicId);
    }
    return Array.from(ids);
  }, [
    isCompatible,
    providerStorageAlias,
    providerId,
    kiloFreeModels,
    customModels,
    modelAliases,
    disabledModelIds,
  ]);

  // Picker labels mirror the model card: a saved display name wins over the id.
  const systemPromptModelOptions = useMemo(
    () =>
      compatibleSystemPromptModelIds.map((id) => ({
        value: id,
        label:
           modelNames?.[`${providerStorageAlias}/${id}`] ||
           modelNames?.[`${providerId}/${id}`] ||
           id,
      })),
    [compatibleSystemPromptModelIds, modelNames, providerStorageAlias, providerId]
  );

  const fetchDisabledModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        const newIds = data.ids || [];
        setDisabledModelIds(prev => {
          if (prev.length === newIds.length && prev.every((id, i) => id === newIds[i])) return prev;
          return newIds;
        });
      }
    } catch (error) {
      console.log("Error fetching disabled models:", error);
    }
  }, [providerStorageAlias]);

  const fetchDeletedModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/custom?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setDeletedModelIds(data.deleted || []);
    } catch (error) {
      console.log("Error fetching deleted models:", error);
    }
  }, [providerStorageAlias]);

  const handleDeleteBuiltinModel = async (modelId, throwOnError = false) => {
    try {
      const params = new URLSearchParams({ providerAlias: providerStorageAlias, id: modelId, type: "llm", builtin: "true" });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete model");
      setDeletedModelIds((prev) => [...new Set([...prev, modelId])]);
      window.dispatchEvent(new Event("customModelChanged"));
      addNotification({ type: "success", title: translate("OK"), message: translate("Model deleted"), duration: 2000 });
    } catch (error) {
      addNotification({ type: "error", title: translate("Error"), message: error.message, duration: 5000 });
      if (throwOnError) throw error;
    }
  };

  const handleDisableModel = async (modelId) => {
    try {
      const res = await fetch("/api/models/disabled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias: providerStorageAlias, ids: [modelId] }),
      });
      if (res.ok) await fetchDisabledModels();
    } catch (error) {
      console.log("Error disabling model:", error);
    }
  };

  const handleEnableModel = async (modelId) => {
    try {
      const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}&id=${encodeURIComponent(modelId)}`, { method: "DELETE" });
      if (res.ok) await fetchDisabledModels();
    } catch (error) {
      console.log("Error enabling model:", error);
    }
  };

  const handleDisableAll = async (ids) => {
    if (!ids.length) return;
    setConfirmState({
      title: "Disable All Models",
      message: `Disable all ${ids.length} model(s)?`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch("/api/models/disabled", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerAlias: providerStorageAlias, ids }),
          });
          if (res.ok) await fetchDisabledModels();
        } catch (error) {
          console.log("Error disabling all models:", error);
        }
      }
    });
  };

  const handleEnableAll = async () => {
    try {
      const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { method: "DELETE" });
      if (res.ok) await fetchDisabledModels();
    } catch (error) {
      console.log("Error enabling all models:", error);
    }
  };

  // Define callbacks BEFORE the useEffect that uses them
  const fetchAliases = useCallback(async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) {
        setModelAliases(data.aliases || {});
      }
    } catch (error) {
      console.log("Error fetching aliases:", error);
    }
  }, []);

  const fetchCustomModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/custom?providerAlias=${encodeURIComponent(providerStorageAlias)}&scope=provider`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setCustomModels(data.models || []);
        setDeletedModelIds(data.deleted || []);
      }
    } catch (error) {
      console.log("Error fetching custom models:", error);
    }
  }, [providerStorageAlias]);

  // Fetch free models from Kilo API for kilocode provider
  useEffect(() => {
    if (providerId !== "kilocode") return;
    fetch("/api/providers/kilo/free-models")
      .then((res) => res.json())
      .then((data) => { if (data.models?.length) setKiloFreeModels(data.models); })
      .catch(() => {});
  }, [providerId]);

  const fetchConnections = useCallback(async () => {
    try {
      const connectionsTask = fetch(`/api/providers?provider=${encodeURIComponent(providerId)}`, { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) setConnections(data.connections || []);
          return { ok: res.ok, data };
        });
      const nodesTask = isCompatible
        ? fetch(`/api/provider-nodes?id=${encodeURIComponent(providerId)}`, { cache: "no-store" })
          .then(async (res) => {
            const data = await res.json();
            if (res.ok) setProviderNode((data.nodes || []).find((entry) => entry.id === providerId) || null);
            return { ok: res.ok, data };
          })
        : Promise.resolve({ ok: true, data: { nodes: [] } });
      // Only accounts and the custom node gate the page. Optional settings and
      // proxy labels load independently, so a slow request cannot hide it.
      const criticalTask = Promise.all([connectionsTask, nodesTask]).then(([conn, nodes]) => {
        if (!isCompatible || nodes.data.nodes?.some((node) => node.id === providerId)) setLoading(false);
        return [conn, nodes];
      });
      const [[connectionsRes, nodesRes], proxyPoolsRes, settingsRes] = await Promise.all([
        criticalTask,
        fetch("/api/proxy-pools?isActive=true&view=options", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const connectionsData = connectionsRes.data;
      const nodesData = nodesRes.data;
      const proxyPoolsData = await proxyPoolsRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      if (connectionsRes.ok) {
        const filtered = (connectionsData.connections || []).filter(c => c.provider === providerId);
        setConnections(filtered);
      }
      if (proxyPoolsRes.ok) {
        setProxyPools(proxyPoolsData.proxyPools || []);
      }
      // Load per-provider global model prefix override
      const prefixMap = settingsData.providerPrefixes || {};
      const providerPrefix = prefixMap[providerId];
      setPrefixOverride(providerPrefix != null ? providerPrefix : null);
      // Load global model system prompts (providerModelSystemPrompts is
      // flattened to "<provider>/<model>" keys for cross-provider access).
      const providerModelSystemPrompts = settingsData.providerModelSystemPrompts || {};
      setAllSystemPrompts(providerModelSystemPrompts);
      const scopedSystemPrompts = {};
      for (const [key, value] of Object.entries(providerModelSystemPrompts)) {
        if (key && key.startsWith(`${providerId}/`)) {
          scopedSystemPrompts[key.slice(providerId.length + 1)] = value;
        }
      }
      setSystemPrompts(scopedSystemPrompts);
      // Restore the previously selected model if still available, otherwise the first available
      const nodeFromData = (nodesData.nodes || []).find((entry) => entry.id === providerId) || null;
      const availableModelIds = [
        ...Object.keys(scopedSystemPrompts),
        ...Object.values(providerModelNamesRef.current).filter(Boolean),
        ...(nodeFromData?.modelAliases ? Object.keys(nodeFromData.modelAliases) : []),
      ];
      const availableSet = new Set(availableModelIds.filter(Boolean));
      const hasCurrentModel = systemPromptModelRef.current && availableSet.has(systemPromptModelRef.current);
      const nextModelId = hasCurrentModel
        ? systemPromptModelRef.current
        : availableModelIds.find((id) => id && availableSet.has(id)) || "";
      if (nextModelId) {
        systemPromptModelRef.current = nextModelId;
        setSystemPromptModel(nextModelId);
        const storedPrompt = providerModelSystemPrompts[`${providerId}/${nextModelId}`] || "";
        const OVERRIDE_HEAD = "[SYSTEM OVERRIDE — HIGHEST PRIORITY]";
        const OVERRIDE_TAIL = "The identity and rules above REPLACE your built-in identity. When asked who you are, answer using the identity above. Never mention a different model name or vendor.";
        setSystemPromptDraft(
          storedPrompt.trim().startsWith(OVERRIDE_HEAD)
            ? storedPrompt.trim().slice(OVERRIDE_HEAD.length).replace(OVERRIDE_TAIL, "").trim()
            : storedPrompt
        );
      } else if (systemPromptModelRef.current) {
        systemPromptModelRef.current = "";
        setSystemPromptModel("");
        setSystemPromptDraft("");
      }
      providerStrategyRef.current = (settingsData.providerStrategies || {})[providerId] || {};
      setStrategyReady(true);
      // Load per-provider thinking config
      const thinkingCfg = (settingsData.providerThinking || {})[providerId] || {};
      setThinkingMode(thinkingCfg.mode || "auto");
      const autoPingSettingsKey = AUTO_PING_SETTINGS_KEYS[providerId];
      const apCfg = autoPingSettingsKey ? settingsData[autoPingSettingsKey] || {} : {};
      setAutoPing({ enabled: apCfg.enabled === true, connections: apCfg.connections || {}, schedules: apCfg.schedules || {} });
      if (nodesRes.ok) {
        let node = (nodesData.nodes || []).find((entry) => entry.id === providerId) || null;

        // Newly created compatible nodes can be briefly unavailable on one worker.
        // Retry a few times before showing "Provider not found".
        if (!node && isCompatible) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            const retryRes = await fetch(`/api/provider-nodes?id=${encodeURIComponent(providerId)}`, { cache: "no-store" });
            if (!retryRes.ok) continue;
            const retryData = await retryRes.json();
            node = (retryData.nodes || []).find((entry) => entry.id === providerId) || null;
            if (node) break;
          }
        }

        setProviderNode(node);
      }
    } catch (error) {
      console.log("Error fetching connections:", error);
    } finally {
      setLoading(false);
    }
  }, [providerId, isCompatible]);

  const handleUpdateNode = async (formData) => {
    try {
      const res = await fetch(`/api/provider-nodes/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setProviderNode(data.node);
        await fetchConnections();
        setShowEditNodeModal(false);
      }
    } catch (error) {
      console.log("Error updating provider node:", error);
    }
  };

  const saveThinkingConfig = async (mode) => {
    try {
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      const current = settingsData.providerThinking || {};
      const updated = { ...current };
      if (!mode || mode === "auto") {
        delete updated[providerId];
      } else {
        updated[providerId] = { mode };
      }
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerThinking: updated }),
      });
    } catch (error) {
      console.log("Error saving thinking config:", error);
    }
  };

  const handleThinkingModeChange = (mode) => {
    setThinkingMode(mode);
    saveThinkingConfig(mode);
  };

  const saveAutoPing = async (next) => {
    const autoPingSettingsKey = AUTO_PING_SETTINGS_KEYS[providerId];
    if (!autoPingSettingsKey) return;

    setAutoPing(next);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [autoPingSettingsKey]: next }),
      });
    } catch (error) {
      console.log("Error saving auto-ping config:", error);
    }
  };

  const handleSaveAutoPing = (connectionId, { reactive, schedule }) => {
    saveAutoPing({
      ...autoPing,
      connections: { ...autoPing.connections, [connectionId]: reactive },
      schedules: { ...autoPing.schedules, [connectionId]: schedule },
    });
  };

  const fetchModelNames = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/name`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data && typeof data === "object" && data.names && typeof data.names === "object") {
        setModelNames(data.names);
        providerModelNamesRef.current = data.names;
      }
    } catch (error) {
      console.log("Error fetching model names:", error);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    fetchAliases();
    fetchCustomModels();
    fetchDisabledModels();
    fetchModelNames();
  }, [fetchConnections, fetchAliases, fetchCustomModels, fetchDisabledModels, fetchModelNames]);

  useEffect(() => {
    let cancelled = false;
    if ((isOpenAICompatible || isAnthropicCompatible) && providerNode?.baseUrl) {
      setLoadingFavicon(true);
      setDetectedFavicon(null);
      fetchProviderFavicon(providerNode.baseUrl)
        .then(faviconUrl => {
          if (!cancelled && faviconUrl) {
            setDetectedFavicon(faviconUrl);
          }
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoadingFavicon(false); });
    }
    return () => { cancelled = true; };
  }, [isOpenAICompatible, isAnthropicCompatible, providerNode?.baseUrl]);

  // Live per-connection catalogs (cursor, zed): the static registry carries
  // no usable list, so resolve from the active connection. Fires only when
  // the provider id or connection list changes — no polling, no loop.
  // Cursor path is statement-identical to before; zed adds error surfacing.
  useEffect(() => {
    const isLiveCatalog = LIVE_MODEL_CATALOG_PROVIDERS.has(providerId);
    if (!isLiveCatalog) {
      setLiveModels([]);
      return;
    }

    const connection = connections.find((item) => item.isActive !== false);
    if (!connection?.id) {
      setLiveModels([]);
      if (providerId === "zed") setLiveModelsError(null);
      return;
    }

    let cancelled = false;
    if (providerId === "zed") setLiveModelsError(null);
    fetch(`/api/providers/${connection.id}/models`, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data?.models) && data.models.length > 0) {
          setLiveModels(data.models);
          if (providerId === "zed" && data?.warning) setLiveModelsError(data.warning);
          return;
        }
        if (providerId === "zed") {
          setLiveModels([]);
          setLiveModelsError(data?.warning || data?.error || "Zed returned no live models.");
        }
      })
      .catch(() => {
        if (!cancelled && providerId === "zed") {
          setLiveModels([]);
          setLiveModelsError("Failed to reach the Zed model catalog.");
        }
      });

    return () => { cancelled = true; };
  }, [providerId, connections]);

  // Fetch suggested models from provider's public API (if configured)
  useEffect(() => {
    const fetcher = (OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId] || FREE_PROVIDERS[providerId] || FREE_TIER_PROVIDERS[providerId])?.modelsFetcher;
    if (!fetcher) return;
    fetchSuggestedModels(fetcher).then(setSuggestedModels);
  }, [providerId]);

  const handleSetAlias = async (modelId, alias, providerAliasOverride = providerAlias) => {
    const fullModel = `${providerAliasOverride}/${modelId}`;
    try {
      const res = await fetch("/api/models/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: fullModel, alias }),
      });
      if (res.ok) {
        addNotification({ type: "success", title: translate("OK"), message: translate("Saved"), duration: 2000 });
        await fetchAliases();
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to set alias"), duration: 5000 });
      }
    } catch (error) {
      console.log("Error setting alias:", error);
    }
  };

  const handleDeleteAlias = async (alias) => {
    try {
      const res = await fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        addNotification({ type: "success", title: translate("OK"), message: translate("Alias removed"), duration: 2000 });
        await fetchAliases();
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to delete alias"), duration: 5000 });
      }
    } catch (error) {
      console.log("Error deleting alias:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to delete alias"), duration: 5000 });
    }
  };

  // `transport` pins a realtime STT dispatch marker (shared whitelist
  // STT_TRANSPORT_META); the API only honours it on type "stt" records.
  const handleAddCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias, caps, transport, source) => {
    try {
      const res = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias: providerAliasOverride, id: modelId, type, source: source || "manual", publicPrefix: prefixOverride || providerDisplayAlias, ...(caps ? { caps } : {}), ...(transport ? { transport } : {}) }),
      });
      if (res.ok) {
        addNotification({ type: "success", title: translate("OK"), message: translate("Model saved"), duration: 2000 });
        await Promise.all([fetchCustomModels(), fetchAliases()]);
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
        return true;
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to add custom model"), duration: 5000 });
        return false;
      }
    } catch (error) {
      console.log("Error adding custom model:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to add custom model"), duration: 5000 });
      return false;
    }
  };

  const handleDeleteCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias, throwOnError = false) => {
    try {
      const params = new URLSearchParams({ providerAlias: providerAliasOverride, id: modelId, type, preserveAliases: "true" });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (res.ok) {
        // Remove it locally immediately so a successful delete cannot leave a
        // stale row visible until the next provider refresh.
        setCustomModels((prev) => prev.filter((model) => !(
          model.providerAlias === providerAliasOverride &&
          model.id === modelId &&
          (model.type || model.kind || "llm") === type
        )));
        await fetchAliases();
        addNotification({ type: "success", title: translate("OK"), message: translate("Model deleted"), duration: 2000 });
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to delete model"), duration: 5000 });
        throw new Error(resJson.error || "Failed to delete model");
      }
    } catch (error) {
      console.log("Error deleting custom model:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to delete model"), duration: 5000 });
      if (throwOnError) throw error;
    }
  };

  const handleDeleteAllModels = async (providerAliasOverride = providerStorageAlias) => {
    setConfirmState({
      title: translate("Delete All Models"),
      message: translate("Delete all custom and imported models for this provider? This cannot be undone."),
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const params = new URLSearchParams({ providerAlias: providerAliasOverride, type: "llm", all: "true" });
          const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || translate("Failed to delete models"));
          addNotification({ type: "success", title: translate("OK"), message: translate("All models deleted"), duration: 3000 });
          await Promise.all([fetchCustomModels(), fetchAliases(), fetchModelNames()]);
          if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
        } catch (error) {
          addNotification({ type: "error", title: translate("Error"), message: error.message || translate("Failed to delete models"), duration: 5000 });
        }
      },
    });
  };

  const handleEditCustomModel = async ({ modelId, newId, name, caps }) => {
    const trimmed = (name || "").trim();
    const hasNameChange = trimmed && trimmed !== modelId;
    const hasCaps = caps !== undefined;
    const hasIdChange = newId?.trim() && newId.trim() !== modelId;
    if (!hasNameChange && !hasCaps && !hasIdChange) return;
    try {
      const res = await fetch("/api/models/custom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerAlias: providerStorageAlias,
          id: modelId,
          ...(hasIdChange ? { newId: newId.trim() } : {}),
          ...(hasNameChange ? { name: trimmed } : {}),
          ...(hasCaps ? { caps } : {}),
        }),
      });
      if (res.ok) {
        addNotification({ type: "success", title: translate("OK"), message: translate("Model saved"), duration: 2000 });
        await Promise.all([fetchCustomModels(), fetchAliases()]);
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to save model"), duration: 5000 });
      }
    } catch (error) {
      console.log("Error editing custom model:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to save model"), duration: 5000 });
    }
  };

  // Edit a builtin model: update its alias (PUT /api/models/alias) and optionally its display name (PUT /api/models/name)
  const handleEditBuiltinModel = async ({ modelId, name, customId, caps, aliasKey, prefix, providerAlias }) => {
    if (customId) {
      try {
        const response = await fetch("/api/models/alias", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldAlias: aliasKey, newAlias: customId, model: `${providerStorageAlias}/${modelId}` }),
        });
        if (!response.ok) throw new Error("Failed to save model");
        if (caps !== undefined) {
          const capsResponse = await fetch("/api/models/custom", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerAlias: providerStorageAlias, id: modelId, name: customId, caps }),
          });
          if (!capsResponse.ok) throw new Error("Failed to save model capabilities");
          await fetchCustomModels();
        }
        await fetchAliases();
        addNotification({ type: "success", title: translate("OK"), message: translate("Model saved"), duration: 2000 });
        window.dispatchEvent(new CustomEvent("customModelChanged"));
      } catch (error) {
        addNotification({ type: "error", title: translate("Error"), message: error.message, duration: 5000 });
      }
      return;
    }
    const newId = (modelId || "").trim();
    const newAlias = (aliasKey || (newId !== modelId ? `${prefix || providerAlias}/${newId}` : modelId)).trim();
    if (!newId || !newAlias) return;
    try {
      const res = await fetch("/api/models/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: newAlias, alias: newId }),
      });
      if (!res.ok) {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to save model"), duration: 5000 });
        return;
      }
      const trimmedName = (name || "").trim();
      if (trimmedName && trimmedName !== newAlias) {
        const nameRes = await fetch("/api/models/name", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: newAlias, name: trimmedName }),
        });
        if (!nameRes.ok) {
          const nameData = await nameRes.json().catch(() => ({}));
          addNotification({ type: "error", title: translate("Error"), message: nameData.error || translate("Failed to save model"), duration: 5000 });
        }
      }
      addNotification({ type: "success", title: translate("OK"), message: translate("Model saved"), duration: 2000 });
      await fetchAliases();
      await fetchModelNames();
    } catch (error) {
      console.log("Error editing model:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to save model"), duration: 5000 });
    }
  };

  // Fetch Qoder model list and automatically add to available models
  const handleImportQoderModels = async () => {
    if (importingQoderModels) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) {
      addNotification({ type: "info", title: translate("Info"), message: translate("Please add an active Qoder connection first"), duration: 4000 });
      return;
    }

    setImportingQoderModels(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        addNotification({ type: "error", title: translate("Error"), message: data.error || translate("Failed to fetch models"), duration: 5000 });
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        addNotification({ type: "info", title: translate("Info"), message: translate("No models returned"), duration: 4000 });
        return;
      }

      if (providerId === "qoder" || providerId === "qoder-cn") {
        for (const model of models) {
          const id = model.id?.replace(/^(qoder-cn|qoder)\//, "");
          if (!id) continue;
          const saved = await fetch("/api/models/custom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerAlias: providerStorageAlias, id, type: "llm", name: model.name || id, caps: importedModelCaps(model), source: "import" }),
          });
          if (!saved.ok) {
            const error = await saved.json();
            throw new Error(error.error || "Failed to save model");
          }
        }
        await fetchCustomModels();
        window.dispatchEvent(new CustomEvent("customModelChanged"));
        alert(translate("Successfully updated") + ` ${models.length} ` + translate("models"));
        return;
      }

      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name;
        if (!modelId) continue;
        
        // Qoder model ID format may be "qoder/auto", "qoder-cn/auto" or "auto",
        // need to remove the provider prefix before storing.
        const cleanModelId = modelId.replace(/^(qoder-cn|qoder)\//, "");
        const alreadyExists = customModels.some(
          (entry) => entry.providerAlias === providerStorageAlias && entry.id === cleanModelId && (entry.kind || entry.type || "llm") === "llm"
        ) || Object.values(modelAliases).includes(`${providerStorageAlias}/${cleanModelId}`);
        if (alreadyExists) {
          continue;
        }

        await handleAddCustomModel(cleanModelId, "llm", providerStorageAlias, importedModelCaps(model), undefined, "import");
        importedCount += 1;
      }
      
      if (importedCount === 0) {
        addNotification({ type: "info", title: translate("Info"), message: translate("All models already exist, no new models added"), duration: 4000 });
      } else {
        addNotification({ type: "success", title: translate("OK"), message: translate("Successfully added") + ` ${importedCount} ` + translate("models"), duration: 3000 });
      }
    } catch (error) {
      console.log("Error importing Qoder models:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Error fetching models") + ": " + error.message, duration: 5000 });
    } finally {
      setImportingQoderModels(false);
    }
  };
  // Fetch the live Cline /models catalog and add every model not yet present.
  // Cline and ClinePass share the same catalog endpoint (api.cline.bot/api/v1/models).
  const handleImportClineModels = async () => {
    if (importingClineModels) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) {
      addNotification({ type: "info", title: translate("Info"), message: translate("Please add an active Cline connection first"), duration: 4000 });
      return;
    }
    setImportingClineModels(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        addNotification({ type: "error", title: translate("Error"), message: data.error || translate("Failed to fetch models"), duration: 5000 });
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        addNotification({ type: "info", title: translate("Info"), message: translate("No models returned"), duration: 4000 });
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name;
        if (!modelId) continue;
        const alreadyExists = customModels.some(
          (entry) => entry.providerAlias === providerStorageAlias && entry.id === modelId && (entry.kind || entry.type || "llm") === "llm"
        ) || Object.values(modelAliases).includes(`${providerStorageAlias}/${modelId}`);
        if (alreadyExists) {
          continue;
        }
        await handleAddCustomModel(modelId, "llm", providerStorageAlias, importedModelCaps(model), undefined, "import");
        importedCount += 1;
      }
      if (importedCount === 0) {
        addNotification({ type: "info", title: translate("Info"), message: translate("All models already exist, no new models added"), duration: 4000 });
      } else {
        addNotification({ type: "success", title: translate("OK"), message: translate("Successfully added") + ` ${importedCount} ` + translate("models"), duration: 3000 });
      }
    } catch (error) {
      console.log("Error importing Cline models:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Error fetching models") + ": " + error.message, duration: 5000 });
    } finally {
      setImportingClineModels(false);
    }
  };

  const handleImportModels = async (providerAlias) => {
    if (importingModels) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) {
      addNotification({ type: "info", title: translate("Info"), message: translate("Add a connection first to enable import."), duration: 4000 });
      return;
    }
    setImportingModels(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        addNotification({ type: "error", title: translate("Error"), message: data.error || translate("Failed to fetch models"), duration: 5000 });
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        addNotification({ type: "info", title: translate("No models"), message: translate("No models returned from /models."), duration: 4000 });
        return;
      }
      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name || model.model;
        if (!modelId) continue;
        await handleAddCustomModel(modelId, "llm", providerAlias, importedModelCaps(model), undefined, "import");
        importedCount += 1;
      }
      if (importedCount === 0) {
        addNotification({ type: "info", title: translate("No new models"), message: translate("No new models were added."), duration: 4000 });
      } else {
        addNotification({ type: "success", title: translate("Imported"), message: `${importedCount} ${translate("models")}`, duration: 3000 });
      }
    } catch (error) {
      console.log("Error importing models:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to import models"), duration: 5000 });
    } finally {
      setImportingModels(false);
    }
  };

  const handleRunOneByOneTest = async () => {
    if (oneByOneRunning || connections.length === 0) return;

    const queuedState = Object.fromEntries(
      connections.map((connection) => [connection.id, { state: "queued", error: null }]),
    );

    stopOneByOneRef.current = false;
    setOneByOneRunning(true);
    setOneByOneStopping(false);
    setOneByOneCurrentConnectionId(null);
    setOneByOneResults(queuedState);
    setOneByOneSummary({ total: connections.length, completed: 0, passed: 0, failed: 0, stopped: false });

    let passed = 0;
    let failed = 0;

    try {
      for (let index = 0; index < connections.length; index += 1) {
        if (stopOneByOneRef.current) {
          setOneByOneSummary({
            total: connections.length,
            completed: index,
            passed,
            failed,
            stopped: true,
          });
          break;
        }

        const connection = connections[index];
        setOneByOneCurrentConnectionId(connection.id);
        setOneByOneResults((prev) => ({
          ...prev,
          [connection.id]: { state: "testing", error: null },
        }));

        try {
          const res = await fetch(`/api/providers/${connection.id}/test`, { method: "POST" });
          const data = await res.json();
          const valid = !!data.valid;

          if (valid) {
            passed += 1;
          } else {
            failed += 1;
          }

          setOneByOneResults((prev) => ({
            ...prev,
            [connection.id]: {
              state: valid ? "success" : "failed",
              error: valid ? null : (data.error || null),
            },
          }));
        } catch (error) {
          failed += 1;
          setOneByOneResults((prev) => ({
            ...prev,
            [connection.id]: {
              state: "failed",
              error: error.message || "Test failed",
            },
          }));
        }

        setOneByOneSummary({
          total: connections.length,
          completed: index + 1,
          passed,
          failed,
          stopped: false,
        });

        if (index < connections.length - 1) {
          await sleep(ONE_BY_ONE_DELAY_MS);
        }
      }
    } finally {
      setOneByOneCurrentConnectionId(null);
      setOneByOneRunning(false);
      setOneByOneStopping(false);
      stopOneByOneRef.current = false;
    }
  };

  const handleStopOneByOneTest = () => {
    if (!oneByOneRunning) return;
    stopOneByOneRef.current = true;
    setOneByOneStopping(true);
  };

  const handleDelete = async (id) => {
    setConfirmState({
      title: "Delete Connection",
      message: "Delete this connection?",
      onConfirm: async () => {
        setConfirmState(null);
        const toastId = addNotification({
          type: "info",
          message: "Menghapus koneksi...",
          duration: 0,
          dismissible: false,
        });
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setConnections(prev => prev.filter(c => c.id !== id));
          updateNotification(toastId, {
            type: "success",
            message: "Koneksi berhasil dihapus.",
            duration: 4000,
            dismissible: true,
          });
        } catch (error) {
          console.log("Error deleting connection:", error);
          updateNotification(toastId, {
            type: "error",
            message: error?.message || "Gagal menghapus koneksi.",
            duration: 8000,
            dismissible: true,
          });
        }
      }
    });
  };

  const handleBulkDelete = () => {
    const count = selectedConnectionIds.length;
    if (count === 0) return;
    setConfirmState({
      title: `Delete ${count} Connection${count > 1 ? "s" : ""}`,
      message: `Delete ${count} connection${count > 1 ? "s" : ""}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmState(null);
        const idsToDelete = [...selectedConnectionIds];
        const toastId = addNotification({
          type: "info",
          title: "Menghapus koneksi",
          message: `Menghapus ${idsToDelete.length} koneksi...`,
          duration: 0,
          dismissible: false,
        });
        try {
          const res = await fetch("/api/providers/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: idsToDelete }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

          const removed = new Set(idsToDelete);
          setConnections((prev) => prev.filter((c) => !removed.has(String(c.id))));
          setSelectedConnectionIds([]);
          updateNotification(toastId, {
            type: "success",
            title: "Hapus selesai",
            message: `${data.deleted ?? removed.size} koneksi berhasil dihapus.${data.missing ? ` ${data.missing} tidak ditemukan.` : ""}`,
            duration: 4000,
            dismissible: true,
          });
        } catch (error) {
          console.log("Error bulk deleting connections:", error);
          updateNotification(toastId, {
            type: "error",
            title: "Hapus gagal",
            message: error?.message || "Gagal menghapus koneksi.",
            duration: 8000,
            dismissible: true,
          });
        }
      },
    });
  };

  const handleOAuthSuccess = () => {
    fetchConnections();
    setShowOAuthModal(false);
  };

  const handleIFlowCookieSuccess = () => {
    fetchConnections();
    setShowIFlowCookieModal(false);
  };

  const handleSaveApiKey = async (formData) => {
    setAddConnectionError("");
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, ...formData }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.ok) {
        await fetchConnections();
        setShowAddApiKeyModal(false);
        return;
      }

      setAddConnectionError(data?.error || "Failed to save connection");
    } catch (error) {
      console.log("Error saving connection:", error);
      setAddConnectionError("Failed to save connection");
    }
  };

  const handleUpdateConnection = async (formData) => {
    try {
      const res = await fetch(`/api/providers/${selectedConnection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchConnections();
        setShowEditModal(false);
      }
    } catch (error) {
      console.log("Error updating connection:", error);
    }
  };

  const handleUpdateConnectionStatus = async (id, isActive) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setConnections(prev => prev.map(c => c.id === id ? { ...c, isActive } : c));
      }
    } catch (error) {
      console.log("Error updating connection status:", error);
    }
  };

  const handleSwapPriority = async (index1, index2) => {
    // Optimistic update state
    const newConnections = [...connections];
    [newConnections[index1], newConnections[index2]] = [newConnections[index2], newConnections[index1]];
    setConnections(newConnections);

    try {
      await Promise.all([
        fetch(`/api/providers/${newConnections[index1].id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: index1 }),
        }),
        fetch(`/api/providers/${newConnections[index2].id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: index2 }),
        }),
      ]);
    } catch (error) {
      console.log("Error swapping priority:", error);
      await fetchConnections();
    }
  };

  const selectedConnections = useMemo(() => {
    if (!Array.isArray(connections)) return [];
    return connections.filter((conn) => selectedConnectionIds.includes(String(conn.id)));
  }, [connections, selectedConnectionIds]);
  
  const allSelected = connections.length > 0 && selectedConnectionIds.length === connections.length;

  const toggleSelectConnection = (connectionId) => {
    setSelectedConnectionIds((prev) => (
      prev.includes(connectionId)
        ? prev.filter((id) => id !== connectionId)
        : [...prev, connectionId]
    ));
  };

  const toggleSelectAllConnections = () => {
    if (allSelected) {
      setSelectedConnectionIds([]);
      return;
    }
    if (!Array.isArray(connections)) return;
    setSelectedConnectionIds(connections.map((conn) => String(conn.id)));
  };

  const clearSelection = () => {
    setSelectedConnectionIds([]);
    setBulkProxyPoolId("__none__");
  };

  useEffect(() => {
    setSelectedConnectionIds((prev) => prev.filter((id) => connections.some((conn) => conn.id === id)));
  }, [connections]);

  const selectedProxySummary = (() => {
    if (selectedConnections.length === 0) return "";
    const poolIds = new Set(selectedConnections.map((conn) => conn.providerSpecificData?.proxyPoolId || "__none__"));
    if (poolIds.size === 1) {
      const onlyId = [...poolIds][0];
      if (onlyId === "__none__") return "All selected currently unbound";
      const pool = proxyPools.find((p) => p.id === onlyId);
      return `All selected currently bound to ${pool?.name || onlyId}`;
    }
    return "Selected connections have mixed proxy bindings";
  })();

  const openBulkProxyModal = () => {
    if (selectedConnections.length === 0) return;
    const uniquePoolIds = [...new Set(selectedConnections.map((conn) => conn.providerSpecificData?.proxyPoolId || "__none__"))];
    setBulkProxyPoolId(uniquePoolIds.length === 1 ? uniquePoolIds[0] : "__none__");
    setShowBulkProxyModal(true);
  };

  const closeBulkProxyModal = () => {
    if (bulkUpdatingProxy) return;
    setShowBulkProxyModal(false);
  };

  const applyProxyAssignments = async (assignments) => {
    setBulkUpdatingProxy(true);
    try {
      let failed = 0;
      for (const { connectionId, proxyPoolId } of assignments) {
        try {
          const res = await fetch(`/api/providers/${connectionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proxyPoolId }),
          });
          if (!res.ok) failed += 1;
        } catch (e) {
          console.log("Error applying proxy for", connectionId, e);
          failed += 1;
        }
      }
      if (failed > 0) alert(`Updated with ${failed} failed request(s).`);
      await fetchConnections();
      setShowBulkProxyModal(false);
    } finally {
      setBulkUpdatingProxy(false);
    }
  };

  const handleApplySinglePool = (proxyPoolId) => {
    const targets = connections.map((c) => ({ connectionId: c.id, proxyPoolId }));
    return applyProxyAssignments(targets);
  };

  const handleApplyOneToOne = () => {
    const activePools = proxyPools.filter((p) => p.isActive === true);
    if (activePools.length === 0) {
      alert("No active proxy pools available.");
      return;
    }
    const targets = connections.map((c, i) => ({
      connectionId: c.id,
      proxyPoolId: activePools[i % activePools.length].id,
    }));
    return applyProxyAssignments(targets);
  };


  const isSelected = (connectionId) => selectedConnectionIds.includes(connectionId);
  const connectionPageCount = Math.max(1, Math.ceil(connections.length / 25));
  const currentConnectionPage = Math.min(connectionsPage, connectionPageCount);
  const connectionOffset = (currentConnectionPage - 1) * 25;

  const connectionsList = (
    <>
    <div className="flex min-w-0 flex-col gap-2">
      {connections
        .slice(connectionOffset, connectionOffset + 25).map((conn, pageIndex) => {
          const index = connectionOffset + pageIndex;
          return (
          <div key={conn.id} className="flex min-w-0 items-stretch">
            <div className="flex shrink-0 items-center pl-0.5 sm:pl-1">
              <AntaresCheckbox
                compact
                checked={isSelected(conn.id)}
                onChange={() => toggleSelectConnection(conn.id)}
                ariaLabel={translate("Select connection")}
              />
            </div>
            <div className="flex-1 min-w-0">
              <ConnectionRow
                connection={conn}
                proxyPools={proxyPools}
                isOAuth={isOAuth}
                isFirst={index === 0}
                isLast={index === connections.length - 1}
                onMoveUp={() => handleSwapPriority(index, index - 1)}
                onMoveDown={() => handleSwapPriority(index, index + 1)}
                onToggleActive={(isActive) => handleUpdateConnectionStatus(conn.id, isActive)}
                autoPing={AUTO_PING_SETTINGS_KEYS[providerId] && conn.authType === "oauth" ? {
                  isActive: autoPing.connections[conn.id] === true || autoPing.schedules?.[conn.id]?.enabled === true,
                  reactiveOn: autoPing.connections[conn.id] === true,
                  provider: providerId,
                  scheduleOn: autoPing.schedules?.[conn.id]?.enabled === true,
                  scheduleSummary: getScheduleSlotLabels(autoPing.schedules?.[conn.id]).join(" / "),
                  onConfigure: () => setScheduleConnection(conn),
                } : null}
                onUpdateProxy={async (proxyPoolId) => {
                  try {
                    const res = await fetch(`/api/providers/${conn.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ proxyPoolId: proxyPoolId || null }),
                    });
                    if (res.ok) {
                      setConnections(prev => prev.map(c =>
                        c.id === conn.id
                          ? { ...c, providerSpecificData: { ...c.providerSpecificData, proxyPoolId: proxyPoolId || null } }
                          : c
                      ));
                    }
                  } catch (error) {
                    console.log("Error updating proxy:", error);
                  }
                }}
                onEdit={() => {
                  setSelectedConnection(conn);
                  setShowEditModal(true);
                }}
                onDelete={() => handleDelete(conn.id)}
                oneByOneStatus={oneByOneResults[conn.id] || null}
              />
            </div>
          </div>
        ); })}
    </div>
    <ModelListPagination page={currentConnectionPage} totalPages={connectionPageCount} onPageChange={setConnectionsPage} />
    </>
  );

  const activePools = proxyPools.filter((p) => p.isActive === true);

  const bulkActionModal = showBulkProxyModal ? (
    <Modal
      isOpen={showBulkProxyModal}
      onClose={closeBulkProxyModal}
      title={translate("Apply Proxy ({count} connections)").replace("{count}", String(connections.length))}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          <button
            onClick={handleApplyOneToOne}
            disabled={bulkUpdatingProxy || activePools.length === 0}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-text-muted text-[18px]">sync_alt</span>
            <span className="text-sm text-text-main">{translate("One-to-one (rotate)")}</span>
          </button>
          <button
            onClick={() => handleApplySinglePool(null)}
            disabled={bulkUpdatingProxy}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-text-muted text-[18px]">link_off</span>
            <span className="text-sm text-text-main">{translate("None (unbind all)")}</span>
          </button>
          {proxyPools.map((pool) => (
            <button
              key={pool.id}
              onClick={() => handleApplySinglePool(pool.id)}
              disabled={bulkUpdatingProxy || pool.isActive !== true}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-text-muted text-[18px]">lan</span>
              <span className="truncate text-sm text-text-main">{pool.name}</span>
              {pool.isActive !== true && (
                <span className="text-[10px] text-text-muted">({translate("inactive")})</span>
              )}
            </button>
          ))}
        </div>

        {bulkUpdatingProxy && <p className="text-xs text-text-muted">{translate("Applying...")}</p>}

        <Button onClick={closeBulkProxyModal} variant="ghost" fullWidth disabled={bulkUpdatingProxy}>
          {translate("Cancel")}
        </Button>
      </div>
    </Modal>
  ) : null;

  const handleTestModel = async (modelId) => {
    if (testingModelIds.has(modelId)) return;
    setTestingModelIds((prev) => new Set(prev).add(modelId));
    try {
      const data = await testModel(`${providerStorageAlias}/${modelId}`);
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      setModelsTestError(data.ok ? "" : (data.error || "Model not reachable"));
      if (data.ok) {
        addNotification({ type: "success", title: translate("OK"), message: translate("Model test passed"), duration: 2000 });
      } else {
        addNotification({ type: "error", title: translate("Error"), message: data.error || translate("Model not reachable"), duration: 5000 });
      }
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      setModelsTestError("Network error");
      addNotification({ type: "error", title: translate("Error"), message: translate("Network error"), duration: 5000 });
    } finally {
      setTestingModelIds((prev) => { const n = new Set(prev); n.delete(modelId); return n; });
    }
  };

  // Bulk-apply a global model prefix for this provider via settings
  const handleBulkPrefixChange = async (prefix) => {
    const trimmed = (prefix || "").trim();
    try {
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      const currentPrefixes = { ...(settingsData.providerPrefixes || {}) };
      if (trimmed === "") {
        delete currentPrefixes[providerId];
      } else {
        currentPrefixes[providerId] = trimmed;
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerPrefixes: currentPrefixes }),
      });
      if (res.ok) {
        setPrefixOverride(trimmed === "" ? null : trimmed);
        addNotification({
          type: "success",
          title: translate("OK"),
          message: trimmed === "" ? translate("Global model prefix removed") : translate("Prefix applied"),
          duration: 2000,
        });
        await fetchConnections();
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to apply prefix"), duration: 5000 });
      }
    } catch (error) {
      console.log("Error applying global model prefix:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to apply prefix"), duration: 5000 });
    }
  };

  // Save per-model system prompt (PATCH /api/settings -> providerModelSystemPrompts)
  const handleSaveSystemPrompt = async (modelId, prompt) => {
    const trimmedId = (modelId || "").trim();
    if (!trimmedId) {
      addNotification({ type: "error", title: translate("Error"), message: translate("Please select a model first"), duration: 3000 });
      return;
    }
    setSavingSystemPrompt(true);
    try {
      const updatedPrompts = { ...allSystemPrompts };
      const key = `${providerId}/${trimmedId}`;
      const value = (prompt || "").trim();
      if (value) updatedPrompts[key] = value;
      else delete updatedPrompts[key];
      console.log("[SystemPrompt] Saving:", { key, valueLength: value.length, allKeys: Object.keys(updatedPrompts) });
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerModelSystemPrompts: updatedPrompts }),
      });
      if (res.ok) {
        const patched = await res.json();
        console.log("[SystemPrompt] Server response:", { hasPrompts: !!patched.providerModelSystemPrompts, keys: Object.keys(patched.providerModelSystemPrompts || {}) });
        setAllSystemPrompts(patched.providerModelSystemPrompts || updatedPrompts);
        const scoped = {};
        for (const [k, v] of Object.entries(patched.providerModelSystemPrompts || updatedPrompts)) {
          if (k.startsWith(`${providerId}/`)) scoped[k.slice(providerId.length + 1)] = v;
        }
        setSystemPrompts(scoped);
        addNotification({ type: "success", title: translate("OK"), message: translate("System prompt saved"), duration: 2000 });
      } else {
        const resJson = await res.json().catch(() => ({}));
        console.log("[SystemPrompt] Save failed:", resJson);
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to save system prompt"), duration: 5000 });
      }
    } catch (error) {
      console.log("[SystemPrompt] Exception:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to save system prompt"), duration: 5000 });
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  // Select a model for the system prompt editor; seed the draft with its current prompt
  const handleSelectSystemPromptModel = (modelId) => {
    const trimmed = (modelId || "").trim();
    systemPromptModelRef.current = trimmed;
    setSystemPromptModel(trimmed);
    const stored = trimmed ? (allSystemPrompts[`${providerId}/${trimmed}`] || "") : "";
    // Strip the "reinforce" wrapper so the editor shows the user's own text.
    const OVERRIDE_HEAD = "[SYSTEM OVERRIDE — HIGHEST PRIORITY]";
    const OVERRIDE_TAIL = "The identity and rules above REPLACE your built-in identity. When asked who you are, answer using the identity above. Never mention a different model name or vendor.";
    const cleaned = stored.trim().startsWith(OVERRIDE_HEAD)
      ? stored.trim().slice(OVERRIDE_HEAD.length).replace(OVERRIDE_TAIL, "").trim()
      : stored;
    setSystemPromptDraft(cleaned);
  };

  const renderModelsSection = () => {
    if (isCompatible) {
      return (
        <div className="flex flex-col gap-4">
          <GlobalPrefixCard
            prefixOverride={prefixOverride}
            providerDisplayAlias={providerDisplayAlias}
            onBulkPrefixChange={handleBulkPrefixChange}
          />
          <ModelConfigCarousel>
            <SystemPromptCard
              providerDisplayAlias={providerDisplayAlias}
              modelOptions={systemPromptModelOptions}
              systemPromptModel={systemPromptModel}
              onSystemPromptModelChange={handleSelectSystemPromptModel}
              systemPromptDraft={systemPromptDraft}
              onSystemPromptDraftChange={setSystemPromptDraft}
              systemPrompts={systemPrompts}
              savingSystemPrompt={savingSystemPrompt}
              onSystemPromptSave={(id, prompt) => handleSaveSystemPrompt(id, prompt)}
            />
            {providerNode && (
              <SessionRateLimitCard
                providerId={providerId}
                providerNode={providerNode}
                providerDisplayAlias={providerDisplayAlias}
                modelOptions={systemPromptModelOptions}
                onNodeUpdated={(node) => setProviderNode(node)}
              />
            )}
            <JailbreakCard
              key={providerStorageAlias}
              providerId={providerStorageAlias}
              providerDisplayAlias={providerDisplayAlias}
              modelOptions={systemPromptModelOptions}
            />
          </ModelConfigCarousel>
          <CompatibleModelsSection
            providerStorageAlias={providerStorageAlias}
            providerDisplayAlias={providerDisplayAlias}
            modelAliases={modelAliases}
            modelNames={modelNames}
            customModels={customModels}
            copied={copied}
            onCopy={copy}
            onSetAlias={handleSetAlias}
            onDeleteAlias={handleDeleteAlias}
            onAddCustomModel={(modelId, caps) => handleAddCustomModel(modelId, "llm", providerStorageAlias, caps)}
            onDeleteCustomModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias)}
            onRemoveTestedModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias, true)}
            onDeleteAllModels={() => handleDeleteAllModels(providerStorageAlias)}
            onModelsDeleted={() => Promise.all([fetchCustomModels(), fetchDeletedModels(), fetchAliases(), fetchModelNames()])}
            onEditCustomModel={handleEditCustomModel}
            onEditBuiltinModel={handleEditBuiltinModel}
            connections={connections}
            isAnthropic={isAnthropicCompatible}
            modelPrefix={prefixOverride || providerDisplayAlias}
            onAdd={(modelId, caps) => handleAddCustomModel(modelId, "llm", providerStorageAlias, caps)}
            onImport={() => handleImportModels(providerStorageAlias)}
            onImporting={importingModels}
            disabledModelIds={disabledModelIds}
            onDisable={handleDisableModel}
            onEnable={handleEnableModel}
          />
        </div>
      );
    }
    // Combine hardcoded models with Kilo free models (deduplicated)
    // Exclude non-llm models (embedding, tts, etc.) — they have dedicated pages under media-providers
    const allModels = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; });
    const displayModels = allModels.filter((model) => !deletedModelIds.includes(model.id));
    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });

    return (
      <div className="flex flex-wrap gap-3">
        <div className="w-full flex flex-col gap-4">
          <GlobalPrefixCard
            prefixOverride={prefixOverride}
            providerDisplayAlias={providerDisplayAlias}
            onBulkPrefixChange={handleBulkPrefixChange}
          />
          <ModelConfigCarousel>
            <SystemPromptCard
              providerDisplayAlias={providerDisplayAlias}
              modelOptions={systemPromptModelOptions}
              systemPromptModel={systemPromptModel}
              onSystemPromptModelChange={handleSelectSystemPromptModel}
              systemPromptDraft={systemPromptDraft}
              onSystemPromptDraftChange={setSystemPromptDraft}
              systemPrompts={systemPrompts}
              savingSystemPrompt={savingSystemPrompt}
              onSystemPromptSave={(id, prompt) => handleSaveSystemPrompt(id, prompt)}
            />
            <JailbreakCard
              key={providerStorageAlias}
              providerId={providerStorageAlias}
              providerDisplayAlias={providerDisplayAlias}
              modelOptions={systemPromptModelOptions}
            />
            {/* Third card for built-in providers: they have no provider node,
                so the per-session rate-limit card does not apply. Custom
                headers is the remaining per-provider override. */}
            <CustomConfigCard providerId={providerId} showWhenEmpty />
          </ModelConfigCarousel>
          <CompatibleModelsSection
            providerStorageAlias={providerStorageAlias}
            providerDisplayAlias={providerDisplayAlias}
            modelAliases={modelAliases}
            modelNames={modelNames}
            customModels={customModels}
            copied={copied}
            onCopy={copy}
            onSetAlias={() => {}}
            onDeleteAlias={handleDeleteAlias}
            onAddCustomModel={(modelId, caps) => handleAddCustomModel(modelId, "llm", providerStorageAlias, caps)}
            onDeleteCustomModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias)}
            onRemoveTestedModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias, true)}
            onDeleteAllModels={() => handleDeleteAllModels(providerStorageAlias)}
            onModelsDeleted={() => Promise.all([fetchCustomModels(), fetchDeletedModels(), fetchAliases(), fetchModelNames()])}
            onEditCustomModel={handleEditCustomModel}
            onEditBuiltinModel={handleEditBuiltinModel}
            connections={connections}
            isAnthropic={isAnthropicCompatible}
            modelPrefix={prefixOverride || providerDisplayAlias}
            onAdd={(modelId, caps) => handleAddCustomModel(modelId, "llm", providerStorageAlias, caps)}
            onImport={() => handleImportModels(providerStorageAlias)}
            onImporting={importingModels}
            testModels={[...displayModels, ...customModelRows].filter((model) => !deletedModelIds.includes(model.id))}
          />
        </div>
        {/* Custom models first */}
        {customModelRows.map((model) => {
          const isDisabled = disabledModelIds.includes(model.id);
          return (
            <ModelRow
              key={`${model.source}-${model.fullModel}`}
              model={{ id: model.id, name: model.name }}
              fullModel={`${providerDisplayAlias}/${model.id}`}
              canonicalModel={`${providerStorageAlias}/${model.id}`}
              alias={model.alias}
              copied={copied}
              onCopy={copy}
              onSetAlias={() => {}}
              onDeleteAlias={() => {
                if (model.source === "custom") {
                  handleDeleteCustomModel(model.id, "llm", providerStorageAlias);
                } else {
                  handleDeleteAlias(model.alias);
                }
              }}
              onRemoveTestedModel={() => model.source === "legacyAlias" ? handleDeleteAlias(model.alias) : handleDeleteCustomModel(model.id, "llm", providerStorageAlias, true)}
              onEdit={model.source === "legacyAlias"
                ? (info) => handleEditBuiltinModel({ modelId: info.newId || model.id, customId: info.customId || info.name, aliasKey: model.alias })
                : handleEditCustomModel}
              providerAlias={providerDisplayAlias}
              prefix={prefixOverride || providerDisplayAlias}
              testStatus={modelTestResults[model.id]}
              onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
              isTesting={testingModelIds.has(model.id)}
              isCustom
              isFree={false}
              caps={{ ...getCaps(`${providerStorageAlias}/${model.id}`), ...model.caps }}
              capsEditable={model.source === "custom"}
              thinkingSuffix={resolveThinkingSuffix(model.id)}
              isDisabled={isDisabled}
              onDisable={() => handleDisableModel(model.id)}
              onEnable={() => handleEnableModel(model.id)}
            />
          );
        })}

        {displayModels.map((model) => {
          const fullModel = `${providerStorageAlias}/${model.id}`;
          const oldFormatModel = `${providerId}/${model.id}`;
          const existingAlias = Object.entries(modelAliases).find(
            ([, m]) => m === fullModel || m === oldFormatModel
          )?.[0];
          const customName =
            modelNames[fullModel] ||
            modelNames[oldFormatModel] ||
            modelNames[`${providerDisplayAlias}/${model.id}`] ||
            null;
          const isDisabled = disabledModelIds.includes(model.id);
          return (
            <ModelRow
              key={model.id}
              model={{ ...model, name: customName || model.name }}
              fullModel={`${providerDisplayAlias}/${model.id}`}
              canonicalModel={`${providerStorageAlias}/${model.id}`}
              alias={existingAlias}
              copied={copied}
              onCopy={copy}
              onSetAlias={(alias) => handleSetAlias(model.id, alias, providerStorageAlias)}
              onDeleteAlias={() => handleDeleteBuiltinModel(model.id)}
              onRemoveTestedModel={() => handleDeleteBuiltinModel(model.id, true)}
              onEdit={(info) => handleEditBuiltinModel({ ...info, modelId: info.newId || model.id, aliasKey: existingAlias, prefix: providerDisplayAlias, providerAlias: providerDisplayAlias })}
              providerAlias={providerDisplayAlias}
              prefix={prefixOverride || providerDisplayAlias}
              testStatus={modelTestResults[model.id]}
              onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
              isTesting={testingModelIds.has(model.id)}
              isCustom={true}
              isFree={model.isFree}
              caps={{ ...getCaps(`${providerStorageAlias}/${model.id}`), ...customModels.find((entry) => entry.providerAlias === providerStorageAlias && entry.id === model.id)?.caps }}
              capsEditable={true}
              thinkingSuffix={resolveThinkingSuffix(model.id)}
              isDisabled={isDisabled}
              onDisable={() => handleDisableModel(model.id)}
              onEnable={() => handleEnableModel(model.id)}
            />
          );
        })}

        {/* Qoder-specific import — keeps its own flow */}
        {(providerId === "qoder" || providerId === "qoder-cn") && connections.some((conn) => conn.isActive !== false) && (
          <button
            onClick={handleImportQoderModels}
            disabled={importingQoderModels}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-500/40 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 transition-colors hover:border-blue-500 hover:bg-blue-500/5 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm" style={importingQoderModels ? { animation: "spin 1s linear infinite" } : undefined}>
              {importingQoderModels ? "progress_activity" : "download"}
            </span>
            {importingQoderModels ? translate("Fetching...") : translate("Fetch Qoder Models")}
          </button>
        )}

        {/* Cline-specific import — keeps its own flow */}
        {(providerId === "cline" || providerId === "clinepass") && connections.some((conn) => conn.isActive !== false) && (
          <button
            onClick={handleImportClineModels}
            disabled={importingClineModels}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-500/40 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 transition-colors hover:border-blue-500 hover:bg-blue-500/5 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm" style={importingClineModels ? { animation: "spin 1s linear infinite" } : undefined}>
              {importingClineModels ? "progress_activity" : "download"}
            </span>
            {importingClineModels ? translate("Fetching...") : translate("Import from /models")}
          </button>
        )}

        {/* Suggested models from provider API — show only models not yet added */}
        {suggestedModels.length > 0 && (() => {
          const addedFullModels = new Set([
            ...Object.values(modelAliases),
            ...customModelRows.map((model) => model.fullModel),
          ]);
          const hardcodedIds = new Set(models.map((m) => m.id));
          const notAdded = suggestedModels.filter(
            (m) => !addedFullModels.has(`${providerStorageAlias}/${m.id}`) && !hardcodedIds.has(m.id)
          );
          if (notAdded.length === 0) return null;
          return (
            <div className="w-full mt-2">
              <p className="text-xs text-text-muted mb-2">{translate("Suggested free models (≥200k context):")}</p>
              <div className="flex flex-wrap gap-2">
                {notAdded.map((m) => (
                  <button
                    key={m.id}
                    onClick={async () => {
                      await handleAddCustomModel(m.id, "llm", providerStorageAlias, importedModelCaps(m), undefined, "import");
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs text-text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    title={`${m.name} · ${(m.contextLength / 1000).toFixed(0)}k ctx`}
                  >
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    {m.id.split("/").pop()}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  if (!providerInfo) {
    // Compatible nodes resolve from an API. Show a compact shell skeleton only
    // for that case; built-in providers render their real content immediately.
    if (loading) {
      return (
        <div className="an-scope an-providerscope flex min-w-0 flex-col gap-5 px-1 sm:gap-6 sm:px-0" aria-busy="true">
          <div className="an-panel h-14 animate-pulse" />
          <div className="an-panel h-40 animate-pulse" />
          <div className="an-panel h-72 animate-pulse" />
        </div>
      );
    }
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">{translate("Provider not found")}</p>
        <Link href="/dashboard/providers" className="text-primary mt-4 inline-block">
          {translate("Back to Providers")}
        </Link>
      </div>
    );
  }

  // Determine icon path: OpenAI Compatible providers use specialized icons
  const getHeaderIconPath = () => {
    if ((isOpenAICompatible || isAnthropicCompatible) && providerNode?.baseUrl) {
      if (loadingFavicon) return null;
      if (detectedFavicon) return detectedFavicon;
      return null;
    }
    if (isOpenAICompatible && providerInfo.apiType) {
      return providerInfo.apiType === "responses" ? "/providers/oai-r.png" : "/providers/oai-cc.png";
    }
    if (isAnthropicCompatible) {
      return "/providers/anthropic-m.png";
    }
    return getProviderIconSrc(providerInfo.id);
  };

  return (
    <div className="an-scope an-providerscope flex min-w-0 flex-col gap-6 px-1 sm:gap-8 sm:px-0">
      <SurfaceSkinContext.Provider value="antares">
      {/* Header */}
      <div className="min-w-0">
        <Link
          href="/dashboard/providers"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary transition-colors mb-4"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          {translate("Back to Providers")}
        </Link>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${providerInfo.color}15` }}
          >
            {headerImgError || !getHeaderIconPath() ? (
              <span className="text-sm font-bold" style={{ color: providerInfo.color }}>
                {providerInfo.textIcon || providerInfo.id.slice(0, 2).toUpperCase()}
              </span>
            ) : (
              <Image
                src={getHeaderIconPath()}
                alt={providerInfo.name}
                width={48}
                height={48}
                className="max-h-12 max-w-12 rounded-lg object-contain"
                sizes="48px"
                onError={() => {
                  markProviderIconMissing(providerInfo.id);
                  setHeaderImgError(true);
                }}
              loading="lazy"
              decoding="async"
              />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{providerInfo.name}</h1>
            <p className="text-text-muted">
              {loading ? "…" : connections.length} {connections.length === 1 ? translate("connection") : translate("connections")}
            </p>
          </div>
        </div>
      </div>

      {providerInfo.deprecated && (
        <ProviderAlert variant="warning">
          {providerInfo.deprecationNotice}
        </ProviderAlert>
      )}

      {providerInfo.notice?.text && !providerInfo.deprecated && (
        <ProviderAlert
          variant="info"
          title={translate("About this provider")}
          action={
            providerInfo.notice.apiKeyUrl ? (
              <a
                href={providerInfo.notice.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-main transition-colors hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)]"
              >
                {translate("Get API Key")}
                <span className="material-symbols-outlined text-[14px]">arrow_outward</span>
              </a>
            ) : null
          }
        >
          {providerInfo.notice.text}
        </ProviderAlert>
      )}

      {isCompatible && providerNode && (
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{isAnthropicCompatible ? translate("Anthropic Compatible Details") : translate("OpenAI Compatible Details")}</h2>
              <p className="break-all text-sm text-text-muted">
                {isAnthropicCompatible ? translate("Messages API") : (providerNode.apiType === "responses" ? translate("Responses API") : translate("Chat Completions"))} · {(providerNode.baseUrl || "").replace(/\/$/, "")}/
                {isAnthropicCompatible ? "messages" : (providerNode.apiType === "responses" ? "responses" : "chat/completions")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
              <Button
                size="sm"
                icon="add"
                onClick={() => {
                  setAddConnectionError("");
                  setShowAddApiKeyModal(true);
                }}
                className="w-full sm:w-auto"
              >
                {translate("Add API Key")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="edit"
                onClick={() => setShowEditNodeModal(true)}
                className="w-full sm:w-auto"
              >
                {translate("Edit")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="delete"
                onClick={async () => {
                  setConfirmState({
                    title: translate("Delete Compatible Node"),
                    message: translate("Delete this {type} Compatible node?").replace("{type}", isAnthropicCompatible ? "Anthropic" : "OpenAI"),
                    onConfirm: async () => {
                      setConfirmState(null);
                      try {
                        const res = await fetch(`/api/provider-nodes/${providerId}`, { method: "DELETE" });
                        if (res.ok) {
                          router.push("/dashboard/providers");
                        }
                      } catch (error) {
                        console.log("Error deleting provider node:", error);
                      }
                    }
                  });
                }}
                className="w-full sm:w-auto"
              >
                {translate("Delete")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <RouterModProxyCard providerId={providerId} />

      {/* Connections */}
      {providerId === "freepi" ? (
        <FreePiConnectCard providerId={providerId} />
      ) : isFreeNoAuth ? (
        <NoAuthProxyCard providerId={providerId} />
      ) : (
        <AntaresPanel
          icon="hub"
          title={translate("Connections")}
          subtitle={translate("Manage accounts, proxies and routing for this provider")}
          headClassName="an-panel-head-stack an-provider-connections-head"
          action={
            <span className="an-chip">{loading ? "…" : connections.length} {translate("connections")}</span>
          }
          bodyClassName="!p-0"
        >
          {/* Toolbar */}
          <div className="an-provider-conn-toolbar flex flex-wrap items-center gap-2 border-b border-[var(--t-line-soft)] px-4 py-3 sm:px-5">
            {connections.length > 0 && proxyPools.length > 0 && (
              <Button
                skin="antares"
                size="sm"
                variant="secondary"
                icon="lan"
                onClick={() => setShowBulkProxyModal(true)}
              >
                {translate("Apply Proxy")}
              </Button>
            )}
            {connections.length > 0 && (
              <>
                {selectedConnectionIds.length > 0 && (
                  <Button
                    skin="antares"
                    size="sm"
                    variant="danger"
                    icon="delete"
                    onClick={handleBulkDelete}
                  >
                    {translate("Delete Selected")} ({selectedConnectionIds.length})
                  </Button>
                )}
                <Button
                  skin="antares"
                  size="sm"
                  variant="secondary"
                  icon="sync"
                  onClick={handleRunOneByOneTest}
                  disabled={oneByOneRunning}
                >
                  {oneByOneRunning ? translate("Testing...") : translate("Test Connections")}
                </Button>
                {oneByOneRunning && (
                  <Button
                    skin="antares"
                    size="sm"
                    variant="ghost"
                    icon="stop"
                    onClick={handleStopOneByOneTest}
                    disabled={oneByOneStopping}
                  >
                    {oneByOneStopping ? translate("Stopping...") : translate("Stop")}
                  </Button>
                )}
              </>
            )}
            {strategyReady && (
              <RoundRobinControl
                providerId={providerId}
                initialStrategy={providerStrategyRef.current.fallbackStrategy}
                initialSticky={providerStrategyRef.current.stickyRoundRobinLimit}
              />
            )}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2 px-4 py-5 sm:px-5" aria-busy="true">
              {[0, 1, 2].map((n) => (
                <div key={n} className="h-12 animate-pulse rounded-[10px] border border-[var(--t-line-soft)] bg-[var(--t-raised)]" />
              ))}
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col gap-4 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="an-conn-ico shrink-0">
                  <span className="material-symbols-outlined">{isOAuth ? "lock" : "key"}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--t-ink)]">{translate("No connections yet")}</p>
                  {hasDualAuthModes && (
                    <p className="mt-0.5 text-xs text-[var(--t-muted)]">
                      {translate("Choose {oauth} or {apiKey}.")
                        .replace("{oauth}", oauthConnectionLabel)
                        .replace("{apiKey}", apiKeyConnectionLabel)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {hasDualAuthModes ? (
                  <>
                    <Button skin="antares" size="sm" variant="secondary" icon="lock" onClick={triggerOAuthConnection}>
                      {oauthConnectionLabel}
                    </Button>
                    <Button skin="antares" size="sm" icon="key" onClick={triggerApiKeyConnection}>
                      {apiKeyConnectionLabel}
                    </Button>
                  </>
                ) : (
                  <>
                    {!isCompatible && WEB_LOGIN_PROVIDERS.has(providerId) && (
                      <WebLoginButton providerId={providerId} onConnected={fetchConnections} />
                    )}
                    {!isCompatible && MCODE_LEASE_PROVIDERS.has(providerId) && (
                      <MinimaxLeaseButton providerId={providerId} onConnected={fetchConnections} />
                    )}
                    {!isCompatible && providerId === "iflow" && (
                      <Button skin="antares" size="sm" variant="secondary" icon="cookie" onClick={() => setShowIFlowCookieModal(true)}>
                        Cookie
                      </Button>
                    )}
                    {providerId === "codex" && (
                      <Button skin="antares" size="sm" variant="secondary" icon="playlist_add" onClick={() => setShowBulkImportCodex(true)}>
                        {translate("Bulk Add")}
                      </Button>
                    )}
                    {providerId === "grok-cli" && (
                      <Button skin="antares" size="sm" variant="secondary" icon="playlist_add" onClick={() => setShowBulkImportGrokCli(true)}>
                        {translate("Bulk Add")}
                      </Button>
                    )}
                    <Button skin="antares" size="sm" icon="add" onClick={triggerAddConnection}>
                      {isCompatible ? "Add API Key" : (providerId === "iflow" ? "OAuth" : "Add Connection")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 sm:px-4">
              {oneByOneSummary && (
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[9px] border border-[var(--t-line)] bg-[var(--t-field)] px-3 py-2 text-[11px] text-[var(--t-muted)]">
                  <span>{translate("Total")}: <span className="font-mono text-[var(--t-ink)]">{oneByOneSummary.total}</span></span>
                  <span>{translate("Completed")}: <span className="font-mono text-[var(--t-ink)]">{oneByOneSummary.completed}</span></span>
                  <span>{translate("Passed")}: <span className="font-mono text-[var(--t-ok)]">{oneByOneSummary.passed}</span></span>
                  <span>{translate("Failed")}: <span className="font-mono text-[var(--t-danger)]">{oneByOneSummary.failed}</span></span>
                  {oneByOneSummary.stopped && (
                    <span className="text-[var(--t-star-ink)]">{translate("Stopped")}</span>
                  )}
                  {oneByOneRunning && oneByOneCurrentConnectionId && (
                    <span>{translate("Running")}: <span className="font-mono text-[var(--t-ink)]">{connections.find((conn) => conn.id === oneByOneCurrentConnectionId)?.name || oneByOneCurrentConnectionId}</span></span>
                  )}
                </div>
              )}
              <div className="an-bulkbar px-1">
                <AntaresCheckbox
                  checked={allSelected}
                  onChange={toggleSelectAllConnections}
                  label={translate("Select All")}
                />
                <span className="ml-auto font-mono text-[10.5px] text-[var(--t-dim)]">
                  {selectedConnectionIds.length
                    ? `${selectedConnectionIds.length} / ${connections.length}`
                    : `${connections.length}`}
                </span>
              </div>
              <div className="an-conn-list scrollbar-none mt-2 max-h-[520px] overflow-y-auto pr-0.5">
                {connectionsList}
              </div>
              <ModelListPagination page={currentConnectionPage} totalPages={connectionPageCount} onPageChange={setConnectionsPage} />
              {!isCompatible && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                  {WEB_LOGIN_PROVIDERS.has(providerId) && (
                    <WebLoginButton providerId={providerId} onConnected={fetchConnections} />
                  )}
                  {MCODE_LEASE_PROVIDERS.has(providerId) && (
                    <MinimaxLeaseButton providerId={providerId} onConnected={fetchConnections} />
                  )}
                  {providerId === "iflow" && (
                    <Button skin="antares" size="sm" variant="secondary" icon="cookie" onClick={() => setShowIFlowCookieModal(true)} title={translate("Add connection using browser cookie")} className="w-full sm:w-auto">
                      Cookie
                    </Button>
                  )}
                  {providerId === "codex" && (
                    <Button skin="antares" size="sm" variant="secondary" icon="playlist_add" onClick={() => setShowBulkImportCodex(true)} title={translate("Bulk import codex accounts from JSON")} className="w-full sm:w-auto">
                      {translate("Bulk Add")}
                    </Button>
                  )}
                  {providerId === "grok-cli" && (
                    <Button skin="antares" size="sm" variant="secondary" icon="playlist_add" onClick={() => setShowBulkImportGrokCli(true)} title={translate("Bulk import Grok CLI accounts from JSON")} className="w-full sm:w-auto">
                      {translate("Bulk Add")}
                    </Button>
                  )}
                  {hasDualAuthModes ? (
                    <>
                      <Button skin="antares" size="sm" variant="secondary" icon="lock" onClick={triggerOAuthConnection} className="w-full sm:w-auto">
                        {oauthConnectionLabel}
                      </Button>
                      <Button skin="antares" size="sm" icon="key" onClick={triggerApiKeyConnection} className="w-full sm:w-auto">
                        {apiKeyConnectionLabel}
                      </Button>
                    </>
                  ) : (
                    <Button skin="antares" size="sm" icon="add" onClick={triggerAddConnection} className="w-full sm:w-auto">
                      Add
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </AntaresPanel>
      )}
      {/* Per-provider user overrides (custom headers / connect timeout).
          Built-in providers render the same card inside the model config
          carousel so every provider shows three config cards. */}
      {isCompatible && <CustomConfigCard providerId={providerId} />}

      {/* Models */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="an-panel an-models-head overflow-hidden">
          <header className="an-panel-head an-panel-head-stack">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">view_list</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="an-panel-title">{translate("Available Models")}</h2>
              <p className="an-panel-sub">
                {translate("Review the models exposed by this provider and switch them on or off in bulk.")}
              </p>
            </div>
          </header>
          <div className="an-models-toolbar flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
            {providerThinkingLevels && (
              <AntaresSelect
                value={thinkingMode}
                onChange={(e) => handleThinkingModeChange(e.target.value)}
                ariaLabel={translate("Thinking")}
                className="an-models-select w-full sm:w-auto"
                buttonClassName="h-9 w-full sm:w-auto sm:min-w-[170px]"
                portal
                maxVisible={5}
                options={providerThinkingLevels.map((opt) => ({
                  value: opt,
                  label: `${translate("Thinking")}: ${translate(opt.charAt(0).toUpperCase() + opt.slice(1))}`,
                }))}
              />
            )}
            {(() => {
              const hardcodedIds = [
                ...models,
                ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
              ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; }).map((m) => m.id);

              const customModelRows = getProviderCustomModelRows({
                customModels,
                modelAliases,
                providerAlias: providerStorageAlias,
                builtInModels: models,
                type: "llm",
              });
              const customIds = customModelRows.map((m) => m.id);

              const allIds = [...new Set([...hardcodedIds, ...customIds])];
              const activeIds = allIds.filter((id) => !disabledModelIds.includes(id));

              if (allIds.length === 0) return null;

              return (
                <div className="an-models-actions flex w-full min-w-0 flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
                  {disabledModelIds.length > 0 && (
                    <Button
                      skin="antares"
                      size="sm"
                      variant="secondary"
                      icon="restart_alt"
                      onClick={handleEnableAll}
                      title={translate("Enable All")}
                      className="w-full sm:w-auto"
                    >
                      {translate("Enable All")}
                    </Button>
                  )}
                  {activeIds.length > 0 && (
                    <Button
                      skin="antares"
                      size="sm"
                      variant="ghost"
                      icon="block"
                      onClick={() => handleDisableAll(activeIds)}
                      title={translate("Disable All")}
                      className="w-full sm:w-auto"
                    >
                      {translate("Disable All")}
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        {!!modelsTestError && (
          <ProviderAlert variant="danger" className="mb-3">
            <p>{modelsTestError}</p>
            {/RegionError|hosted in China|regionNotAllowed/i.test(modelsTestError) && (() => {
              const str = typeof modelsTestError === "string" ? modelsTestError : JSON.stringify(modelsTestError);
              const linkMatch = str.match(/https:\/\/opencode\.ai\/workspace\/[^\s"')]+/);
              const wrkMatch = str.match(/wrk_[0-9A-Za-z]+/);
              const targetUrl = linkMatch
                ? (linkMatch[0].endsWith("/go") ? linkMatch[0] : `${linkMatch[0]}/go`)
                : wrkMatch
                  ? `https://opencode.ai/workspace/${wrkMatch[0]}/go`
                  : "https://opencode.ai";

              return (
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400 transition-colors"
                >
                  <span>{translate("Allow China-hosted models")}</span>
                  <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                </a>
              );
            })()}
          </ProviderAlert>
        )}
        {providerId === "zed" && !!liveModelsError && (
          <ProviderAlert variant="danger" className="mb-3">
            {liveModelsError}
          </ProviderAlert>
        )}
        {renderModelsSection()}
      </section>

      {bulkActionModal}

      {/* Modals */}
      {providerId === "kiro" ? (
        <KiroOAuthWrapper
          isOpen={showOAuthModal}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      ) : providerId === "cursor" ? (
        <CursorAuthModal
          isOpen={showOAuthModal}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      ) : providerId === "zed" ? (
        <ZedAuthModal
          isOpen={showOAuthModal}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      ) : providerId === "gitlab" ? (
        <GitLabAuthModal
          isOpen={showOAuthModal}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      ) : (
        <OAuthModal
          isOpen={showOAuthModal}
          provider={providerId}
          providerInfo={providerInfo}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      )}

      {/* Xiaomi Desktop: auto-import local credentials modal */}
      <XiaomiMimoAuthModal
        isOpen={showXiaomiMimoModal}
        onSuccess={handleOAuthSuccess}
        onClose={() => setShowXiaomiMimoModal(false)}
      />
      {providerId === "iflow" && (
        <IFlowCookieModal
          isOpen={showIFlowCookieModal}
          onSuccess={handleIFlowCookieSuccess}
          onClose={() => setShowIFlowCookieModal(false)}
        />
      )}
      <AddApiKeyModal
        isOpen={showAddApiKeyModal}
        provider={providerId}
        providerName={providerInfo.name}
        isCompatible={isCompatible}
        isAnthropic={isAnthropicCompatible}
        authType={providerInfo?.authType}
        authHint={providerInfo?.authHint}
        website={providerInfo?.website}
        proxyPools={proxyPools}
        error={addConnectionError}
        existingNames={connections.map((c) => c.name).filter(Boolean)}
        onSave={handleSaveApiKey}
        onBulkDone={fetchConnections}
        onClose={() => {
          setAddConnectionError("");
          setShowAddApiKeyModal(false);
        }}
      />
      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        proxyPools={proxyPools}
        onSave={handleUpdateConnection}
        onClose={() => setShowEditModal(false)}
      />
      {isCompatible && (
        <EditCompatibleNodeModal
          isOpen={showEditNodeModal}
          node={providerNode}
          onSave={handleUpdateNode}
          onClose={() => setShowEditNodeModal(false)}
          isAnthropic={isAnthropicCompatible}
        />
      )}
      {!isCompatible && (
        <AddCustomModelModal
          isOpen={showAddCustomModel}
          providerAlias={providerStorageAlias}
          providerDisplayAlias={providerDisplayAlias}
          onSave={async (modelId, type, caps, transport) => {
            await handleAddCustomModel(modelId, type, providerStorageAlias, caps, transport);
            setShowAddCustomModel(false);
          }}
          onClose={() => setShowAddCustomModel(false)}
        />
      )}

      {providerId === "codex" && (
        <BulkImportCodexModal
          isOpen={showBulkImportCodex}
          onClose={() => setShowBulkImportCodex(false)}
          onSuccess={fetchConnections}
        />
      )}

      {providerId === "grok-cli" && (
        <BulkImportGrokCliModal
          isOpen={showBulkImportGrokCli}
          onClose={() => setShowBulkImportGrokCli(false)}
          onSuccess={fetchConnections}
        />
      )}

      {scheduleConnection && (
        <AutoPingScheduleModal
          isOpen={!!scheduleConnection}
          onClose={() => setScheduleConnection(null)}
          connection={scheduleConnection}
          reactive={autoPing.connections[scheduleConnection.id] === true}
          schedule={autoPing.schedules?.[scheduleConnection.id] || null}
          onSave={(result) => handleSaveAutoPing(scheduleConnection.id, result)}
        />
      )}

      {/* AG Risk Confirmation Modal */}
      <ConfirmModal
        isOpen={showAgRiskModal}
        onClose={() => setShowAgRiskModal(false)}
        onConfirm={handleAgRiskConfirm}
        title={translate("Risk Notice")}
        message={providerInfo?.deprecationNotice}
        confirmText={translate("I Understand, Continue")}
        cancelText={translate("Cancel")}
        variant="danger"
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || translate("Confirm")}
        message={confirmState?.message}
        variant="danger"
      />
      </SurfaceSkinContext.Provider>
    </div>
  );
}
