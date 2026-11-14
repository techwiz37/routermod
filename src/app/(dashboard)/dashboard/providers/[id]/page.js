"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePageReady } from "@/shared/components/PageReadyContext";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { Card, Button, Badge, Input, Modal, CardSkeleton, OAuthModal, KiroOAuthWrapper, CursorAuthModal, ZedAuthModal, XiaomiMimoAuthModal, IFlowCookieModal, GitLabAuthModal, Toggle, Select, EditConnectionModal, NoAuthProxyCard, ConfirmModal, PageLoader } from "@/shared/components";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS, getProviderAlias, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { translate } from "@/i18n/runtime";
import { fetchSuggestedModels } from "@/shared/utils/providerModelsFetcher";
import { applyQoderModelNames, getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import ModelRow from "./ModelRow";
import PassthroughModelsSection from "./PassthroughModelsSection";
import CompatibleModelsSection from "./CompatibleModelsSection";
import GlobalPrefixCard from "./GlobalPrefixCard";
import SystemPromptCard from "./SystemPromptCard";
import ConnectionRow from "./ConnectionRow";
import AddApiKeyModal from "./AddApiKeyModal";
import EditCompatibleNodeModal from "./EditCompatibleNodeModal";
import AddCustomModelModal from "./AddCustomModelModal";
import BulkImportCodexModal from "./BulkImportCodexModal";
import BulkImportGrokCliModal from "./BulkImportGrokCliModal";
import CustomConfigCard from "./CustomConfigCard";
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
  const router = useRouter();
  const providerId = params.id;
  const { getCaps } = useModelCaps();
  const [connections, setConnections] = useState([]);
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
  const [providerStrategy, setProviderStrategy] = useState(null);
  const [providerStickyLimit, setProviderStickyLimit] = useState("");
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
        if (row?.id && !disabledSet.has(row.id)) ids.add(row.id);
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
      if (row?.id && !disabledSet.has(row.id)) ids.add(row.id);
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

  const handleDeleteBuiltinModel = async (modelId) => {
    try {
      const params = new URLSearchParams({ providerAlias: providerStorageAlias, id: modelId, type: "llm", builtin: "true" });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete model");
      setDeletedModelIds((prev) => [...new Set([...prev, modelId])]);
      addNotification({ type: "success", title: translate("OK"), message: translate("Model deleted"), duration: 2000 });
    } catch (error) {
      addNotification({ type: "error", title: translate("Error"), message: error.message, duration: 5000 });
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
      const res = await fetch("/api/models/custom", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setCustomModels(data.models || []);
      }
    } catch (error) {
      console.log("Error fetching custom models:", error);
    }
  }, []);

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
      const [connectionsRes, nodesRes, proxyPoolsRes, settingsRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
        fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const connectionsData = await connectionsRes.json();
      const nodesData = await nodesRes.json();
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
      // Load per-provider strategy override
      const override = (settingsData.providerStrategies || {})[providerId] || {};
      setProviderStrategy(override.fallbackStrategy || null);
      setProviderStickyLimit(override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1");
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
            const retryRes = await fetch("/api/provider-nodes", { cache: "no-store" });
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

  const saveProviderStrategy = async (strategy, stickyLimit) => {
    try {
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      const current = settingsData.providerStrategies || {};

      // Build override: null strategy means remove override, use global
      const override = {};
      if (strategy) override.fallbackStrategy = strategy;
      if (strategy === "round-robin" && stickyLimit !== "") {
        override.stickyRoundRobinLimit = Number(stickyLimit) || 3;
      }

      const updated = { ...current };
      if (Object.keys(override).length === 0) {
        delete updated[providerId];
      } else {
        updated[providerId] = override;
      }

      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
    } catch (error) {
      console.log("Error saving provider strategy:", error);
    }
  };

  const handleRoundRobinToggle = (enabled) => {
    const strategy = enabled ? "round-robin" : null;
    const sticky = enabled ? (providerStickyLimit || "1") : providerStickyLimit;
    if (enabled && !providerStickyLimit) setProviderStickyLimit("1");
    setProviderStrategy(strategy);
    saveProviderStrategy(strategy, sticky);
  };

  const handleStickyLimitChange = (value) => {
    setProviderStickyLimit(value);
    saveProviderStrategy("round-robin", value);
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
    fetchDeletedModels();
    fetchModelNames();
  }, [fetchConnections, fetchAliases, fetchCustomModels, fetchDisabledModels, fetchDeletedModels, fetchModelNames]);

  useEffect(() => {
    if ((isOpenAICompatible || isAnthropicCompatible) && providerNode?.baseUrl) {
      setLoadingFavicon(true);
      setDetectedFavicon(null);
      fetch(`/api/providers/favicon?url=${encodeURIComponent(providerNode.baseUrl)}`)
        .then(res => res.json())
        .then(data => {
          if (data.faviconUrl) {
            setDetectedFavicon(data.faviconUrl);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingFavicon(false));
    }
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
  const handleAddCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias, caps, transport) => {
    try {
      const res = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias: providerAliasOverride, id: modelId, type, ...(caps ? { caps } : {}), ...(transport ? { transport } : {}) }),
      });
      if (res.ok) {
        addNotification({ type: "success", title: translate("OK"), message: translate("Model saved"), duration: 2000 });
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to add custom model"), duration: 5000 });
      }
    } catch (error) {
      console.log("Error adding custom model:", error);
    }
  };

  const handleDeleteCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias) => {
    try {
      const params = new URLSearchParams({ providerAlias: providerAliasOverride, id: modelId, type });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (res.ok) {
        // Remove it locally immediately so a successful delete cannot leave a
        // stale row visible until the next provider refresh.
        setCustomModels((prev) => prev.filter((model) => !(
          model.providerAlias === providerAliasOverride &&
          model.id === modelId &&
          (model.type || model.kind || "llm") === type
        )));
        setModelAliases((prev) => {
          const target = `${providerAliasOverride}/${modelId}`;
          const next = { ...prev };
          for (const [alias, fullModel] of Object.entries(next)) {
            if (fullModel === target) delete next[alias];
          }
          return next;
        });
        addNotification({ type: "success", title: translate("OK"), message: translate("Model deleted"), duration: 2000 });
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to delete model"), duration: 5000 });
      }
    } catch (error) {
      console.log("Error deleting custom model:", error);
      addNotification({ type: "error", title: translate("Error"), message: translate("Failed to delete model"), duration: 5000 });
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

  const handleEditCustomModel = async ({ modelId, name, caps }) => {
    const trimmed = (name || "").trim();
    const hasNameChange = trimmed && trimmed !== modelId;
    const hasCaps = caps !== undefined;
    if (!hasNameChange && !hasCaps) return;
    try {
      const res = await fetch("/api/models/custom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerAlias: providerStorageAlias,
          id: modelId,
          ...(hasNameChange ? { name: trimmed } : {}),
          ...(hasCaps ? { caps } : {}),
        }),
      });
      if (res.ok) {
        addNotification({ type: "success", title: translate("OK"), message: translate("Model saved"), duration: 2000 });
        await fetchCustomModels();
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
  const handleEditBuiltinModel = async ({ modelId, name, aliasKey, prefix, providerAlias }) => {
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
            body: JSON.stringify({ providerAlias: providerStorageAlias, id, type: "llm", name: model.name || id }),
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

        await handleAddCustomModel(cleanModelId, "llm", providerStorageAlias);
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
        await handleAddCustomModel(modelId, "llm", providerStorageAlias);
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
        await handleAddCustomModel(modelId, "llm", providerAlias);
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
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (res.ok) {
            setConnections(prev => prev.filter(c => c.id !== id));
          }
        } catch (error) {
          console.log("Error deleting connection:", error);
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
        let failed = 0;
        const idsToDelete = [...selectedConnectionIds];
        for (const id of idsToDelete) {
          try {
            const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
            if (!res.ok) failed += 1;
          } catch (error) {
            console.log("Error deleting connection:", error);
            failed += 1;
          }
        }
        setConnections(prev => prev.filter(c => !idsToDelete.includes(c.id)));
        setSelectedConnectionIds([]);
        if (failed > 0) alert(`Deleted ${idsToDelete.length - failed} connection(s), ${failed} failed.`);
      }
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

  const selectedConnections = connections.filter((conn) => selectedConnectionIds.includes(conn.id));
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
    setSelectedConnectionIds(connections.map((conn) => conn.id));
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

  const connectionsList = (
    <div className="flex min-w-0 flex-col divide-y divide-black/[0.03] dark:divide-white/[0.03] max-h-[500px] overflow-y-auto pr-1">
      {connections
        .map((conn, index) => (
          <div key={conn.id} className="flex min-w-0 items-stretch">
            <div className="flex shrink-0 items-center pl-1 sm:pl-2">
              <input
                type="checkbox"
                checked={isSelected(conn.id)}
                onChange={() => toggleSelectConnection(conn.id)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
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
        ))}
    </div>
  );

  const activePools = proxyPools.filter((p) => p.isActive === true);

  const bulkActionModal = (
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
  );

  const handleTestModel = async (modelId) => {
    if (testingModelIds.has(modelId)) return;
    setTestingModelIds((prev) => new Set(prev).add(modelId));
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerStorageAlias}/${modelId}` }),
      });
      const data = await res.json();
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
    if (!trimmedId) return;
    setSavingSystemPrompt(true);
    try {
      const updatedPrompts = { ...allSystemPrompts };
      const key = `${providerId}/${trimmedId}`;
      const value = (prompt || "").trim();
      if (value) updatedPrompts[key] = value;
      else delete updatedPrompts[key];
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerModelSystemPrompts: updatedPrompts }),
      });
      if (res.ok) {
        const patched = await res.json();
        setAllSystemPrompts(patched.providerModelSystemPrompts || updatedPrompts);
        const scoped = {};
        for (const [k, v] of Object.entries(updatedPrompts)) {
          if (k.startsWith(`${providerId}/`)) scoped[k.slice(providerId.length + 1)] = v;
        }
        setSystemPrompts(scoped);
        addNotification({ type: "success", title: translate("OK"), message: translate("System prompt saved"), duration: 2000 });
      } else {
        const resJson = await res.json().catch(() => ({}));
        addNotification({ type: "error", title: translate("Error"), message: resJson.error || translate("Failed to save system prompt"), duration: 5000 });
      }
    } catch (error) {
      console.log("Error saving system prompt:", error);
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
            onDeleteAllModels={() => handleDeleteAllModels(providerStorageAlias)}
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
          <CompatibleModelsSection
            providerStorageAlias={providerStorageAlias}
            providerDisplayAlias={providerDisplayAlias}
            modelAliases={modelAliases}
            modelNames={modelNames}
            customModels={customModels}
            copied={copied}
            onCopy={copy}
            onSetAlias={() => {}}
            onDeleteAlias={() => {}}
            onAddCustomModel={(modelId, caps) => handleAddCustomModel(modelId, "llm", providerStorageAlias, caps)}
            onDeleteCustomModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias)}
            onDeleteAllModels={() => handleDeleteAllModels(providerStorageAlias)}
            onEditCustomModel={handleEditCustomModel}
            onEditBuiltinModel={handleEditBuiltinModel}
            connections={connections}
            isAnthropic={isAnthropicCompatible}
            modelPrefix={prefixOverride || providerDisplayAlias}
            onAdd={(modelId, caps) => handleAddCustomModel(modelId, "llm", providerStorageAlias, caps)}
            onImport={() => handleImportModels(providerStorageAlias)}
            onImporting={importingModels}
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
              onEdit={handleEditCustomModel}
              providerAlias={providerDisplayAlias}
              prefix={prefixOverride || providerDisplayAlias}
              testStatus={modelTestResults[model.id]}
              onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
              isTesting={testingModelIds.has(model.id)}
              isCustom
              isFree={false}
              caps={model.caps || getCaps(`${providerId}/${model.id}`)}
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
              alias={existingAlias}
              copied={copied}
              onCopy={copy}
              onSetAlias={(alias) => handleSetAlias(model.id, alias, providerStorageAlias)}
              onDeleteAlias={() => handleDeleteBuiltinModel(model.id)}
              onEdit={(info) => handleEditBuiltinModel({ ...info, modelId: model.id, aliasKey: existingAlias, prefix: providerDisplayAlias, providerAlias: providerDisplayAlias })}
              providerAlias={providerDisplayAlias}
              prefix={prefixOverride || providerDisplayAlias}
              testStatus={modelTestResults[model.id]}
              onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
              isTesting={testingModelIds.has(model.id)}
              isCustom={true}
              isFree={model.isFree}
              caps={getCaps(`${providerId}/${model.id}`)}
              capsEditable={false}
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
                      await handleAddCustomModel(m.id, "llm", providerStorageAlias);
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

  if (loading) {
    return <PageLoader message={translate("Loading provider...")} />;
}

  if (!providerInfo) {
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
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:gap-8 sm:px-0">
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
              {connections.length} {connections.length === 1 ? translate("connection") : translate("connections")}
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

      {/* Connections */}
      {isFreeNoAuth ? (
        <NoAuthProxyCard providerId={providerId} />
      ) : (
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">{translate("Connections")}</h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              {connections.length > 0 && proxyPools.length > 0 && (
                <Button
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
                      size="sm"
                      variant="danger"
                      icon="delete"
                      onClick={handleBulkDelete}
                    >
                      {translate("Delete Selected")} ({selectedConnectionIds.length})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="sync"
                    onClick={handleRunOneByOneTest}
                    disabled={oneByOneRunning}
                  >
                    {oneByOneRunning ? translate("Testing Connection One-by-One...") : translate("Test Connection One-by-One")}
                  </Button>
                  {oneByOneRunning && (
                    <Button
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
              {/* Round Robin toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-muted font-medium">{translate("Round Robin")}</span>
                <Toggle
                  checked={providerStrategy === "round-robin"}
                  onChange={handleRoundRobinToggle}
                />
                {providerStrategy === "round-robin" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-muted">{translate("Sticky:")}</span>
                    <input
                      type="number"
                      min={1}
                      value={providerStickyLimit}
                      onChange={(e) => handleStickyLimitChange(e.target.value)}
                      placeholder="1"
                      className="w-14 px-2 py-1 text-xs border border-border rounded-md bg-background focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {connections.length === 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary shrink-0">
                  <span className="material-symbols-outlined text-[18px]">{isOAuth ? "lock" : "key"}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-muted">{translate("No connections yet")}</p>
                  {hasDualAuthModes && (
                    <p className="text-xs text-text-muted">
                      {translate("Choose {oauth} or {apiKey}.")
                        .replace("{oauth}", oauthConnectionLabel)
                        .replace("{apiKey}", apiKeyConnectionLabel)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {hasDualAuthModes ? (
                  <>
                    <Button size="sm" icon="lock" variant="secondary" onClick={triggerOAuthConnection}>
                      {oauthConnectionLabel}
                    </Button>
                    <Button size="sm" icon="key" onClick={triggerApiKeyConnection}>
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
                      <Button size="sm" icon="cookie" variant="secondary" onClick={() => setShowIFlowCookieModal(true)}>
                        Cookie
                      </Button>
                    )}
                    {providerId === "codex" && (
                      <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportCodex(true)}>
                        {translate("Bulk Add")}
                      </Button>
                    )}
                    {providerId === "grok-cli" && (
                      <Button size="sm" icon="playlist_add" variant="secondary" onClick={() => setShowBulkImportGrokCli(true)}>
                        {translate("Bulk Add")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      icon="add"
                      onClick={triggerAddConnection}
                    >
                      {isCompatible ? "Add API Key" : (providerId === "iflow" ? "OAuth" : "Add Connection")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {oneByOneSummary && (
                <div className="mb-4 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-text-muted dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span>{translate("Total")}: {oneByOneSummary.total}</span>
                    <span>{translate("Completed")}: {oneByOneSummary.completed}</span>
                    <span>{translate("Passed")}: {oneByOneSummary.passed}</span>
                    <span>{translate("Failed")}: {oneByOneSummary.failed}</span>
                    {oneByOneSummary.stopped && (
                      <span className="text-amber-600 dark:text-amber-400">{translate("Stopped")}</span>
                    )}
                    {oneByOneRunning && oneByOneCurrentConnectionId && (
                      <span>{translate("Running")}: {connections.find((conn) => conn.id === oneByOneCurrentConnectionId)?.name || oneByOneCurrentConnectionId}</span>
                    )}
                  </div>
                </div>
              )}
              {connections.length > 0 && (
                <div className="mb-3 flex items-center gap-2 border-b border-black/[0.03] pb-2 dark:border-white/[0.03]">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted hover:text-primary">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAllConnections}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    {translate("Select All")}
                  </label>
                </div>
              )}
              {connectionsList}
              {!isCompatible && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:flex">
                  {WEB_LOGIN_PROVIDERS.has(providerId) && (
                    <WebLoginButton providerId={providerId} onConnected={fetchConnections} />
                  )}
                  {MCODE_LEASE_PROVIDERS.has(providerId) && (
                    <MinimaxLeaseButton providerId={providerId} onConnected={fetchConnections} />
                  )}
                  {providerId === "iflow" && (
                    <Button
                      size="sm"
                      icon="cookie"
                      variant="secondary"
                      onClick={() => setShowIFlowCookieModal(true)}
                      title={translate("Add connection using browser cookie")}
                      className="w-full sm:w-auto"
                    >
                      Cookie
                    </Button>
                  )}
                  {providerId === "codex" && (
                    <Button
                      size="sm"
                      icon="playlist_add"
                      variant="secondary"
                      onClick={() => setShowBulkImportCodex(true)}
                      title={translate("Bulk import codex accounts from JSON")}
                      className="w-full sm:w-auto"
                    >
                      {translate("Bulk Add")}
                    </Button>
                  )}
                  {providerId === "grok-cli" && (
                    <Button
                      size="sm"
                      icon="playlist_add"
                      variant="secondary"
                      onClick={() => setShowBulkImportGrokCli(true)}
                      title={translate("Bulk import Grok CLI accounts from JSON")}
                      className="w-full sm:w-auto"
                    >
                      {translate("Bulk Add")}
                    </Button>
                  )}
                  {hasDualAuthModes ? (
                    <>
                      <Button
                        size="sm"
                        icon="lock"
                        variant="secondary"
                        onClick={triggerOAuthConnection}
                        className="w-full sm:w-auto"
                      >
                        {oauthConnectionLabel}
                      </Button>
                      <Button
                        size="sm"
                        icon="key"
                        onClick={triggerApiKeyConnection}
                        className="w-full sm:w-auto"
                      >
                        {apiKeyConnectionLabel}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      icon="add"
                      onClick={triggerAddConnection}
                      className="w-full sm:w-auto"
                    >
                      Add
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Per-provider user overrides (custom headers / connect timeout) */}
      <CustomConfigCard providerId={providerId} />

      {/* Models */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold shrink-0">
            {translate("Available Models")}
          </h2>
          {providerThinkingLevels && (
            <select
              value={thinkingMode}
              onChange={(e) => handleThinkingModeChange(e.target.value)}
              title={translate("Appends (level) suffix to copied model names")}
              className="an-select an-select--compact h-9 text-xs shrink-0"
            >
              {providerThinkingLevels.map((opt) => (
                <option key={opt} value={opt}>{`${translate("Thinking")}: ${translate(opt.charAt(0).toUpperCase() + opt.slice(1))}`}</option>
              ))}
            </select>
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
              <div className="flex gap-2">
                {disabledModelIds.length > 0 && (
                  <button
                    onClick={handleEnableAll}
                    title={translate("Enable All")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
                  >
                    <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                  </button>
                )}
                {activeIds.length > 0 && (
                  <button
                    onClick={() => handleDisableAll(activeIds)}
                    title={translate("Disable All")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:border-red-500 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <span className="material-symbols-outlined text-[18px]">block</span>
                  </button>
                )}
              </div>
            );
          })()}
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
      </Card>

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
    </div>
  );
}
