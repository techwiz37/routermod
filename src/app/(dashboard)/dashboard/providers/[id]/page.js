"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getProviderIconSrc, getCompatibleIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { Card, Button, Badge, Input, Modal, CardSkeleton, OAuthModal, KiroOAuthWrapper, CursorAuthModal, ZedAuthModal, XiaomiMimoAuthModal, IFlowCookieModal, GitLabAuthModal, Toggle, Select, EditConnectionModal, NoAuthProxyCard, ConfirmModal } from "@/shared/components";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS, getProviderAlias, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { getThinkingLevels } from "open-sse/providers/thinkingLevels.js";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { translate } from "@/i18n/runtime";
import { fetchSuggestedModels } from "@/shared/utils/providerModelsFetcher";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import ModelRow from "./ModelRow";
import ModelListPagination from "./ModelListPagination";
import AutoDetectHelp from "./AutoDetectHelp";
import PassthroughModelsSection from "./PassthroughModelsSection";
import CompatibleModelsSection from "./CompatibleModelsSection";
import ConnectionRow from "./ConnectionRow";
import AddApiKeyModal from "./AddApiKeyModal";
import EditCompatibleNodeModal from "./EditCompatibleNodeModal";
import AddCustomModelModal from "./AddCustomModelModal";
import BulkImportCodexModal from "./BulkImportCodexModal";
import BulkImportGrokCliModal from "./BulkImportGrokCliModal";
import BulkImportAntigravityModal from "./BulkImportAntigravityModal";
import CustomConfigCard from "./CustomConfigCard";
import AutoPingScheduleModal from "./AutoPingScheduleModal";
import { getScheduleSlotLabels } from "@/shared/services/quotaPingSchedule";
import { useNotificationStore } from "@/store/notificationStore";
import AntaresNotice from "@/shared/components/AntaresNotice";

const ONE_BY_ONE_DELAY_MS = 1000;
const MODELS_PER_PAGE = 5;

// Connection considered invalid/dead: has a persisted error reason and a
// non-serving status ("unavailable" = kicked by 401/403 traffic, "error" =
// permanent refresh rejection or failed manual test).
const isInvalidConnection = (c) => !!c.lastError && (c.testStatus === "unavailable" || c.testStatus === "error");

const AUTO_PING_SETTINGS_KEYS = {
  claude: "claudeAutoPing",
  codex: "codexAutoPing",
};

// How many connection rows stay visible before the list starts scrolling.
const CONNECTION_ROWS_VISIBLE = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ProviderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const providerId = params.id;
  const { getCaps } = useModelCaps();
  const [connections, setConnections] = useState([]);
  // Connections list shows 5 rows at a time and scrolls vertically.
  const connListRef = useRef(null);
  const [connListMaxH, setConnListMaxH] = useState(0);
  const [loading, setLoading] = useState(true);
  const [providerNode, setProviderNode] = useState(null);
  const [prefixOverride, setPrefixOverride] = useState(null);
  const [proxyPools, setProxyPools] = useState([]);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showXiaomiMimoModal, setShowXiaomiMimoModal] = useState(false);
  const [showIFlowCookieModal, setShowIFlowCookieModal] = useState(false);
  const [showAddApiKeyModal, setShowAddApiKeyModal] = useState(false);
  const [addConnectionError, setAddConnectionError] = useState("");
  const [showBulkImportCodex, setShowBulkImportCodex] = useState(false);
  const [showBulkImportGrokCli, setShowBulkImportGrokCli] = useState(false);
  const [showBulkImportAntigravity, setShowBulkImportAntigravity] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEditNodeModal, setShowEditNodeModal] = useState(false);
  const [showBulkProxyModal, setShowBulkProxyModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [modelAliases, setModelAliases] = useState({});
  const [modelNames, setModelNames] = useState({});
  const [customModels, setCustomModels] = useState([]);
  const [detectingModels, setDetectingModels] = useState(false);
  const [modelsPage, setModelsPage] = useState(1);
  const [showDetectHelp, setShowDetectHelp] = useState(false);
  const [headerImgError, setHeaderImgError] = useState(false);
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
  const [liveModelsError, setLiveModelsError] = useState(null);
  const [kiloFreeModels, setKiloFreeModels] = useState([]);
  const [disabledModelIds, setDisabledModelIds] = useState([]);
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
  const [testAllRunning, setTestAllRunning] = useState(false);
  const [testAllStopping, setTestAllStopping] = useState(false);
  const stopTestAllRef = useRef(false);
  const [healthSummary, setHealthSummary] = useState(null); // { unavailable: N, total: N }
  const [deletingInvalid, setDeletingInvalid] = useState(false);
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);
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


  const isOpenAICompatible = isOpenAICompatibleProvider(providerId);
  const isAnthropicCompatible = isAnthropicCompatibleProvider(providerId);
  const isCompatible = isOpenAICompatible || isAnthropicCompatible;
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
    : (isOpenAICompatible || isAnthropicCompatible)
      ? {
          id: providerId,
          name: isAnthropicCompatible ? "Anthropic Compatible" : "OpenAI Compatible",
          color: isAnthropicCompatible ? "#D97757" : "#10A37F",
          textIcon: isAnthropicCompatible ? "AC" : "OC",
          apiType: isOpenAICompatible ? "chat" : undefined,
          authModes: ["apikey"],
        }
      : (OAUTH_PROVIDERS[providerId] || APIKEY_PROVIDERS[providerId] || FREE_PROVIDERS[providerId] || FREE_TIER_PROVIDERS[providerId] || WEB_COOKIE_PROVIDERS[providerId]);
  const authModes = providerInfo?.authModes || [];
  const isOAuth = !!OAUTH_PROVIDERS[providerId] || !!FREE_PROVIDERS[providerId] || authModes.includes("oauth");
  const supportsApiKeyAuth = !!APIKEY_PROVIDERS[providerId] || authModes.includes("apikey");
  const isFreeNoAuth = !!FREE_PROVIDERS[providerId]?.noAuth;
  const staticModels = getModelsByProviderId(providerId);
  const models = (providerId === "cursor" || providerId === "zed") && liveModels.length > 0
    ? liveModels
    : staticModels;
  const providerAlias = getProviderAlias(providerId);

  const providerStorageAlias = isCompatible ? providerId : providerAlias;
  const providerNameForDisplay = providerNode?.name || (isAnthropicCompatible ? "Anthropic Compatible" : "OpenAI Compatible");
  const providerDisplayAlias = isCompatible
    ? (providerNode?.prefix || (providerNode?.name ? providerNode.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : providerId))
    : (prefixOverride || providerAlias);
  const modelPrefix = providerDisplayAlias;

  const [prefixDraft, setPrefixDraft] = useState(modelPrefix || "");
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [systemPromptModel, setSystemPromptModel] = useState("");
  const [systemPromptDraft, setSystemPromptDraft] = useState("");
  const [systemPrompts, setSystemPrompts] = useState({});
  const [allSystemPrompts, setAllSystemPrompts] = useState({});
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);

  useEffect(() => {
    setPrefixDraft(modelPrefix || "");
  }, [modelPrefix]);

  useEffect(() => {
    const prompt = systemPrompts[systemPromptModel] || "";
    setSystemPromptDraft(prompt);
  }, [systemPromptModel, systemPrompts]);

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
  const resolveThinkingSuffix = (modelId) => {
    if (!thinkingMode || thinkingMode === "auto") return null;
    const levels = getThinkingLevels(providerId, modelId);
    return levels && levels.includes(thinkingMode) ? thinkingMode : null;
  };
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
  const fetchDisabledModels = useCallback(async () => {
    try {
      const res = await fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setDisabledModelIds(data.ids || []);
    } catch (error) {
      console.log("Error fetching disabled models:", error);
    }
  }, [providerStorageAlias]);

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

  // Remove every model of this provider: custom models are deleted for good,
  // built-in models are hidden through the disabled-models list.
  const handleDeleteAllModels = async () => {
    const customRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });
    const builtInIds = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ]
      .filter((m) => {
        const k = getModelKind(m);
        return !k || k === "llm";
      })
      .filter((m) => !disabledModelIds.includes(m.id))
      .map((m) => m.id);
    const customIds = customRows.map((m) => m.id);
    const total = customIds.length + builtInIds.length;
    if (!total) return;

    setConfirmState({
      title: translate("Delete All Models"),
      message: `${translate("Delete all models from")} ${providerInfo.name}? ${translate(
        "Built-in models will be hidden and custom models removed permanently."
      )}`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          for (const id of customIds) {
            const params = new URLSearchParams({
              providerAlias: providerStorageAlias,
              id,
              type: "llm",
            });
            await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
          }
          if (builtInIds.length) {
            await fetch("/api/models/disabled", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                providerAlias: providerStorageAlias,
                ids: builtInIds,
              }),
            });
          }
          await fetchCustomModels();
          await fetchDisabledModels();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("customModelChanged"));
          }
        } catch (error) {
          console.log("Error deleting all models:", error);
        }
      },
    });
  };

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

  const fetchModelNames = useCallback(async () => {
    try {
      const res = await fetch("/api/models/name");
      const data = await res.json();
      if (res.ok) setModelNames(data.names || {});
    } catch (error) {
      console.log("Error fetching model names:", error);
    }
  }, []);

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
      setPrefixOverride(settingsData.providerPrefixes?.[providerId] || null);
      const storedPrompts = settingsData.providerModelSystemPrompts?.[providerStorageAlias] || {};
      setAllSystemPrompts(settingsData.providerModelSystemPrompts || {});
      setSystemPrompts(storedPrompts);
      setSystemPromptModel((current) => current || Object.keys(storedPrompts)[0] || "");
      if (connectionsRes.ok) {
        const filtered = (connectionsData.connections || []).filter(c => c.provider === providerId);
        setConnections(filtered);
      }
      if (proxyPoolsRes.ok) {
        setProxyPools(proxyPoolsData.proxyPools || []);
      }
      const override = (settingsData.providerStrategies || {})[providerId] || {};
      setProviderStrategy(override.fallbackStrategy || null);
      setProviderStickyLimit(override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1");
      const thinkingCfg = (settingsData.providerThinking || {})[providerId] || {};
      setThinkingMode(thinkingCfg.mode || "auto");
      const autoPingSettingsKey = AUTO_PING_SETTINGS_KEYS[providerId];
      const apCfg = autoPingSettingsKey ? settingsData[autoPingSettingsKey] || {} : {};
      setAutoPing({ enabled: apCfg.enabled === true, connections: apCfg.connections || {}, schedules: apCfg.schedules || {} });
      if (nodesRes.ok) {
        let node = (nodesData.nodes || []).find((entry) => entry.id === providerId) || null;

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
  }, [providerId, isCompatible, providerStorageAlias]);

  const fetchHealthSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/providers/health-check?provider=${providerId}`, { cache: "no-store" });
      if (res.ok) setHealthSummary(await res.json());
    } catch {}
  }, [providerId]);

  const handleDeleteInvalid = () => {
    const invalids = connections.filter(isInvalidConnection);
    if (!invalids.length) return;
    setConfirmState({
      title: `${translate("Delete")} ${invalids.length} ${translate(invalids.length > 1 ? "Invalid Connections" : "Invalid Connection")}`,
      message: `${translate("Delete")} ${invalids.length} ${translate(invalids.length > 1 ? "connections" : "connection")} ${translate("with errors? This cannot be undone.")}`,
      onConfirm: async () => {
        setConfirmState(null);
        setDeletingInvalid(true);
        try {
          for (const conn of invalids) {
            try {
              await fetch(`/api/providers/${conn.id}`, { method: "DELETE" });
            } catch {}
          }
          await fetchConnections();
          await fetchHealthSummary();
        } finally {
          setDeletingInvalid(false);
        }
      }
    });
  };

  const handleUpdateNode = async (formData) => {
    try {
      const res = await fetch(`/api/provider-nodes/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        const updatedNode = data.node || { ...providerNode, ...formData, id: providerId };
        setProviderNode(updatedNode);
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

  useEffect(() => {
    fetchConnections();
    fetchHealthSummary();
    fetchAliases();
    fetchCustomModels();
    fetchModelNames();
    fetchDisabledModels();
    const onProvidersChanged = () => { fetchConnections(); };
    const handleStorage = (e) => {
      if (e.key === "routermod:providers-changed") { fetchConnections(); }
    };
    window.addEventListener("routermod:providers-changed", onProvidersChanged);
    window.addEventListener("storage", handleStorage);
    const refreshInterval = setInterval(() => {
      fetchConnections();
      fetchHealthSummary();
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener("routermod:providers-changed", onProvidersChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, [fetchConnections, fetchHealthSummary, fetchAliases, fetchCustomModels, fetchModelNames, fetchDisabledModels]);

  useEffect(() => {
    const isLiveCatalog = providerId === "cursor" || providerId === "zed";
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
        await fetchAliases();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to set alias");
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
        await fetchAliases();
      }
    } catch (error) {
      console.log("Error deleting alias:", error);
    }
  };

  const handleAddCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias, caps, transport) => {
    try {
      const res = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias: providerAliasOverride, id: modelId, type, ...(caps ? { caps } : {}), ...(transport ? { transport } : {}) }),
      });
      if (res.ok) {
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add custom model");
      }
    } catch (error) {
      console.log("Error adding custom model:", error);
    }
  };

  // Tokens that mark a catalog entry as non-chat (embeddings, TTS, image...)
  // so auto-detect never pollutes the chat model list with them.
  const NON_CHAT_MODEL_TOKENS = new Set([
    "embed", "embedding", "embeddings", "moderation", "whisper", "tts", "stt", "asr",
    "speech", "audio", "transcribe", "transcription", "dall-e", "dalle", "gpt-image",
    "image", "imagen",
  ]);

  const isChatModelId = (modelId) => {
    const id = String(modelId || "").trim().toLowerCase();
    if (!id) return false;
    const tokens = id.split(/[^a-z0-9]+/).filter(Boolean);
    return !tokens.some((token) => NON_CHAT_MODEL_TOKENS.has(token));
  };

  useEffect(() => { setModelsPage(1); }, [providerId]);

  // Detects every model this provider exposes and registers the missing ones in
  // one bulk request — no more adding models one by one.
  const handleAutoDetectModels = async ({ auto = false } = {}) => {
    if (detectingModels) return;
    setDetectingModels(true);
    try {
      const res = await fetch("/api/providers/autodetect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Auto-detect failed");

      const knownIds = new Set(
        getProviderCustomModelRows({
          customModels,
          modelAliases,
          providerAlias: providerStorageAlias,
          builtInModels: models,
          type: "llm",
        }).map((row) => row.id)
      );

      const stripPrefixes = [`${providerId}/`, `${providerAlias}/`];
      const detected = [];
      const seen = new Set();

      for (const entry of Array.isArray(data.models) ? data.models : []) {
        const rawId = typeof entry === "string" ? entry : (entry?.id || entry?.name || entry?.model);
        let modelId = typeof rawId === "string" ? rawId.trim() : "";
        if (modelId.startsWith("models/")) modelId = modelId.slice(7);
        for (const prefix of stripPrefixes) {
          if (prefix && modelId.startsWith(prefix)) modelId = modelId.slice(prefix.length);
        }
        const disabledModel = disabledModelIds.some((disabledId) => (
          disabledId === modelId
          || disabledId === `${providerStorageAlias}/${modelId}`
          || disabledId === `${providerAlias}/${modelId}`
          || disabledId === `${providerId}/${modelId}`
        ));
        if (!modelId || seen.has(modelId) || (knownIds.has(modelId) && !disabledModel)) continue;
        if (!isChatModelId(modelId)) continue;
        seen.add(modelId);

        const rawName = typeof entry === "object" && entry
          ? (entry.display_name || entry.displayName || entry.title || entry.name)
          : "";
        const displayName = typeof rawName === "string"
          ? rawName.trim().replace(/^models\//, "")
          : "";
        // free === true|false when the endpoint exposes pricing, null otherwise.
        detected.push({
          id: modelId,
          ...(displayName && displayName !== modelId ? { name: displayName } : {}),
        });
      }

      const picked = detected;

      if (picked.length === 0) {
        if (!auto) {
          addNotification({
            type: "info",
            title: translate("Auto-detect"),
            message: translate("No new models detected"),
            duration: 5000,
          });
        }
        return;
      }

      const disabledDetectedIds = picked
        .filter((entry) => disabledModelIds.some((disabledId) => (
          disabledId === entry.id
          || disabledId === `${providerStorageAlias}/${entry.id}`
          || disabledId === `${providerAlias}/${entry.id}`
          || disabledId === `${providerId}/${entry.id}`
        )))
        .map((entry) => entry.id);
      if (disabledDetectedIds.length > 0) {
        await Promise.all(disabledDetectedIds.map((modelId) => fetch(
          `/api/models/disabled?providerAlias=${encodeURIComponent(providerStorageAlias)}&id=${encodeURIComponent(modelId)}`,
          { method: "DELETE" },
        )));
        await fetchDisabledModels();
      }

      const bulkRes = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias: providerStorageAlias, models: picked }),
      });
      const bulkData = await bulkRes.json().catch(() => null);
      if (!bulkRes.ok) throw new Error(bulkData?.error || "Failed to add detected models");

      await fetchCustomModels();
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));

      const added = bulkData?.added ?? picked.length;
      addNotification({
        type: "success",
        title: translate("Models detected"),
        message: `${translate("Successfully added")} ${added} ${translate("models")}`,
        duration: 5000,
      });
    } catch (error) {
      console.log("Error auto-detecting models:", error);
      addNotification({
        type: auto ? "info" : "error",
        title: translate(auto ? "Auto-detect" : "Auto-detect failed"),
        message: error?.message || "Failed to detect models",
        duration: 7000,
      });
    } finally {
      setDetectingModels(false);
    }
  };

  const handleBulkPrefixChange = async (newPrefix) => {
    if (!newPrefix.trim()) return;
    const currentPrefix = providerNode?.prefix || providerDisplayAlias;
    if (currentPrefix === newPrefix.trim()) return;
    try {
      const res = await fetch("/api/models/bulk-prefix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias: providerStorageAlias, oldPrefix: currentPrefix, newPrefix: newPrefix.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        await Promise.all([fetchAliases(), fetchCustomModels(), fetchModelNames()]);
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
        if (isCompatible) {
          try {
            const nodeRes = await fetch(`/api/provider-nodes/${providerId}`, { cache: "no-store" });
            if (nodeRes.ok) {
              const nodeData = await nodeRes.json();
              if (nodeData.node) {
                setProviderNode(nodeData.node);
              } else if (providerNode) {
                setProviderNode((prev) => ({ ...prev, prefix: newPrefix.trim() }));
              }
            } else if (providerNode) {
              setProviderNode((prev) => ({ ...prev, prefix: newPrefix.trim() }));
            }
          } catch {
            if (providerNode) {
              setProviderNode((prev) => ({ ...prev, prefix: newPrefix.trim() }));
            }
          }
        } else {
          setPrefixOverride(newPrefix.trim() === providerAlias ? null : newPrefix.trim());
        }
        addNotification({
          type: "success",
          title: translate("Prefix updated"),
          message: data.total > 0
            ? translate("Prefix updated count").replace("{updated}", data.updated).replace("{total}", data.total)
            : translate("Prefix saved"),
          duration: 4000,
        });
      } else {
        const data = await res.json();
        addNotification({
          type: "error",
          title: translate("Failed to update prefix"),
          message: data.error || translate("Unknown error"),
          duration: 6000,
        });
      }
    } catch (error) {
      console.log("Error updating prefix:", error);
      addNotification({
        type: "error",
        title: translate("Failed to update prefix"),
        message: error?.message || translate("Unknown error"),
        duration: 6000,
      });
    }
  };

  const handleSaveSystemPrompt = async () => {
    const newPrompt = systemPromptDraft.trim() || null;
    if (!systemPromptModel) return;
    const nextPrompts = { ...systemPrompts };
    if (newPrompt) nextPrompts[systemPromptModel] = newPrompt;
    else delete nextPrompts[systemPromptModel];
    setSavingSystemPrompt(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerModelSystemPrompts: { ...allSystemPrompts, [providerStorageAlias]: nextPrompts },
        }),
      });
      if (res.ok) {
        setSystemPrompts(nextPrompts);
        addNotification({
          type: "success",
          title: translate("System prompt saved"),
          message: translate("The system prompt was saved successfully."),
          duration: 4000,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        addNotification({
          type: "error",
          title: translate("Failed to save system prompt"),
          message: data.error || translate("Unknown error"),
          duration: 6000,
        });
      }
    } catch (error) {
      console.log("Error saving system prompt:", error);
      addNotification({
        type: "error",
        title: translate("Failed to save system prompt"),
        message: error?.message || translate("Unknown error"),
        duration: 6000,
      });
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  // Auto-detect disabled — only runs when user clicks the button
  // const autoDetectAttemptRef = useRef(null);
  // useEffect(() => {
  //   if (loading || !providerInfo) return;
  //   const hasConnection = connections.length > 0;
  //   const hasBaseUrl = !!providerNode?.baseUrl;
  //   if (!hasConnection && !hasBaseUrl) return;
  //
  //   const existingRows = getProviderCustomModelRows({
  //     customModels,
  //     modelAliases,
  //     providerAlias: providerStorageAlias,
  //     builtInModels: models,
  //     type: "llm",
  //   });
  //   if (existingRows.length > 0 || models.length > 0) return;
  //
  //   const attemptKey = `${providerId}:${connections.length}:${hasBaseUrl}`;
  //   if (autoDetectAttemptRef.current === attemptKey) return;
  //   autoDetectAttemptRef.current = attemptKey;
  //
  //   handleAutoDetectModels({ auto: true });
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [loading, providerInfo, connections, providerNode, customModels, modelAliases, models, providerId, providerStorageAlias]);

  const handleEditCustomModel = async (modelId, { modelId: newId, name }, type = "llm", providerAliasOverride = providerStorageAlias) => {
    try {
      const body = { providerAlias: providerAliasOverride, id: modelId, type };
      if (newId && newId !== modelId) body.newId = newId;
      if (name) body.name = name;
      const res = await fetch("/api/models/custom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      }
    } catch (error) {
      console.log("Error editing custom model:", error);
    }
  };

  const handleEditBuiltinModel = async (modelId, { aliasKey, name }, providerAliasOverride = providerStorageAlias) => {
    const fullModel = `${providerAliasOverride}/${modelId}`;
    const oldAlias = Object.entries(modelAliases).find(([, m]) => m === fullModel)?.[0];
    const newAlias = aliasKey || modelId;
    try {
      await Promise.all([
        fetch("/api/models/alias", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldAlias, newAlias, model: fullModel }),
        }),
        name?.trim()
          ? fetch("/api/models/name", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ providerAlias: providerAliasOverride, modelId, name: name.trim() }),
            })
          : Promise.resolve(),
      ]);
      await Promise.all([fetchAliases(), fetchModelNames()]);
    } catch (error) {
      console.log("Error editing builtin model:", error);
    }
  };

  const handleDeleteCustomModel = async (modelId, type = "llm", providerAliasOverride = providerStorageAlias) => {
    try {
      const params = new URLSearchParams({ providerAlias: providerAliasOverride, id: modelId, type });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (res.ok) {
        await fetchCustomModels();
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
      }
    } catch (error) {
      console.log("Error deleting custom model:", error);
    }
  };

  const handleImportQoderModels = async () => {
    if (importingQoderModels) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) {
      alert(translate("Please add an active Qoder connection first"));
      return;
    }

    setImportingQoderModels(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || translate("Failed to fetch models"));
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        alert(translate("No models returned"));
        return;
      }

      let importedCount = 0;
      for (const model of models) {
        const modelId = model.id || model.name;
        if (!modelId) continue;
        
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
        alert(translate("All models already exist, no new models added"));
      } else {
        alert(translate("Successfully added") + ` ${importedCount} ` + translate("models"));
      }
    } catch (error) {
      console.log("Error importing Qoder models:", error);
      alert(translate("Error fetching models") + ": " + error.message);
    } finally {
      setImportingQoderModels(false);
    }
  };
  const handleImportClineModels = async () => {
    if (importingClineModels) return;
    const activeConnection = connections.find((conn) => conn.isActive !== false);
    if (!activeConnection) {
      alert(translate("Please add an active Cline connection first"));
      return;
    }
    setImportingClineModels(true);
    try {
      const res = await fetch(`/api/providers/${activeConnection.id}/models`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || translate("Failed to fetch models"));
        return;
      }
      const models = data.models || [];
      if (models.length === 0) {
        alert(translate("No models returned"));
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
        alert(translate("All models already exist, no new models added"));
      } else {
        alert(translate("Successfully added") + ` ${importedCount} ` + translate("models"));
      }
    } catch (error) {
      console.log("Error importing Cline models:", error);
      alert(translate("Error fetching models") + ": " + error.message);
    } finally {
      setImportingClineModels(false);
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
      title: translate("Delete Connection"),
      message: translate("Delete this connection?"),
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (res.ok) {
            setConnections(prev => prev.filter(c => c.id !== id));
            window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
            try {
              localStorage.setItem("routermod:providers-changed", String(Date.now()));
            } catch {}
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
      title: `${translate("Delete")} ${count} ${translate(count > 1 ? "Connections" : "Connection")}`,
      message: `${translate("Delete")} ${count} ${translate(count > 1 ? "connections" : "connection")}? ${translate("This cannot be undone.")}`,
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
        window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
        try {
          localStorage.setItem("routermod:providers-changed", String(Date.now()));
        } catch {}
        if (failed > 0) alert(`${translate("Deleted")} ${idsToDelete.length - failed} ${translate("connection(s)")}, ${failed} ${translate("failed")}.`);
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
        window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
        try {
          localStorage.setItem("routermod:providers-changed", String(Date.now()));
        } catch {}
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
        window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
        try {
          localStorage.setItem("routermod:providers-changed", String(Date.now()));
        } catch {}
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
        window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
        try {
          localStorage.setItem("routermod:providers-changed", String(Date.now()));
        } catch {}
      }
    } catch (error) {
      console.log("Error updating connection status:", error);
    }
  };

  const handleBulkStatusUpdate = async (isActive) => {
    if (bulkStatusUpdating || connections.length === 0) return;
    setBulkStatusUpdating(true);
    setConnections((prev) => prev.map((connection) => ({ ...connection, isActive })));
    try {
      const results = await Promise.all(
        connections.map(async (connection) => {
          const response = await fetch(`/api/providers/${connection.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive }),
          });
          return response.ok;
        })
      );
      if (results.some((ok) => !ok)) await fetchConnections();
      window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
    } catch {
      await fetchConnections();
    } finally {
      setBulkStatusUpdating(false);
    }
  };

  const handleSwapPriority = async (index1, index2) => {
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
      if (failed > 0) alert(`${translate("Updated with")} ${failed} ${translate("failed request(s)")}.`);
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
      alert(translate("No active proxy pools available."));
      return;
    }
    const targets = connections.map((c, i) => ({
      connectionId: c.id,
      proxyPoolId: activePools[i % activePools.length].id,
    }));
    return applyProxyAssignments(targets);
  };


  const isSelected = (connectionId) => selectedConnectionIds.includes(connectionId);

  // Keep the connections list at exactly 5 visible rows — taller lists scroll
  // inside the panel instead of pushing the rest of the page down.
  useEffect(() => {
    const el = connListRef.current;
    if (!el) return;

    const measure = () => {
      const kids = Array.from(el.children);
      if (kids.length <= CONNECTION_ROWS_VISIBLE) {
        setConnListMaxH((prev) => (prev === 0 ? prev : 0));
        return;
      }
      const gap = parseFloat(getComputedStyle(el).rowGap || "0") || 0;
      let h = 0;
      for (let i = 0; i < CONNECTION_ROWS_VISIBLE; i++) {
        h += kids[i].getBoundingClientRect().height;
        if (i > 0) h += gap;
      }
      const next = Math.round(h);
      setConnListMaxH((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children)
      .slice(0, CONNECTION_ROWS_VISIBLE)
      .forEach((child) => ro.observe(child));
    return () => ro.disconnect();
  }, [connections.length, loading, providerId]);

  const connectionsList = (
    <div
      ref={connListRef}
      className="an-conn-list overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar"
      style={connListMaxH ? { maxHeight: `${connListMaxH}px` } : undefined}
    >
      {connections
        .map((conn, index) => (
          <div key={conn.id} className="flex min-w-0 items-stretch gap-2">
            <div className="flex shrink-0 items-center pl-1">
              <input
                type="checkbox"
                checked={isSelected(conn.id)}
                onChange={() => toggleSelectConnection(conn.id)}
                aria-label={`Select ${conn.name || conn.email || conn.id}`}
                className="h-4 w-4 rounded accent-[var(--t-accent)] cursor-pointer"
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
       title={`${translate("Apply Proxy")} (${connections.length} ${translate("connections")})`}
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
                <span className="text-[10px] text-text-muted">(inactive)</span>
              )}
            </button>
          ))}
        </div>

         {bulkUpdatingProxy && <p className="text-xs text-text-muted">{translate("Applying...")}</p>}

        <Button skin="antares" onClick={closeBulkProxyModal} variant="ghost" fullWidth disabled={bulkUpdatingProxy}>
           {translate("Cancel")}
        </Button>
      </div>
    </Modal>
  );

  const handleTestModel = async (modelId, silent = false) => {
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
      if (data.ok) {
        setModelsTestError("");
        if (!silent) addNotification({
          type: "success",
          title: "Test Sukses",
          message: `${modelId} berhasil merespon (${data.latencyMs || data.latency || 0}ms)`,
          duration: 4000,
        });
      } else {
        const errMsg = data.error || "Model tidak merespon";
        setModelsTestError(errMsg);
        if (!silent) addNotification({
          type: "error",
          title: "Test Gagal",
          message: `${modelId}: ${errMsg}`,
          duration: 6000,
        });
      }
    } catch (err) {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      setModelsTestError("Network error");
      if (!silent) addNotification({
        type: "error",
        title: "Test Gagal",
        message: `${modelId}: Network error`,
        duration: 6000,
      });
    } finally {
      setTestingModelIds((prev) => { const n = new Set(prev); n.delete(modelId); return n; });
    }
  };

  const handleTestAllModels = async () => {
    if (testAllRunning) {
      stopTestAllRef.current = true;
      setTestAllStopping(true);
      return;
    }

    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });
    const builtInIds = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ]
      .filter((m) => { const k = getModelKind(m); return !k || k === "llm"; })
      .filter((m) => !disabledModelIds.includes(m.id))
      .map((m) => m.id);

    const customIds = customModelRows.map((m) => m.id);
    const customIdSet = new Set(customIds);
    const allModelIds = [...customIds, ...builtInIds.filter((id) => !customIdSet.has(id))];

    if (!allModelIds.length) return;

    stopTestAllRef.current = false;
    setTestAllRunning(true);
    setTestAllStopping(false);
    setModelTestResults({});

    try {
    for (const modelId of allModelIds) {
      if (stopTestAllRef.current) break;
      await handleTestModel(modelId, true); // silent=true: no toast per model
    }

    const results = await new Promise((resolve) => {
      setModelTestResults((prev) => { resolve(prev); return prev; });
    });
    const pass = Object.values(results).filter((v) => v === "ok").length;
    const fail = Object.values(results).filter((v) => v === "error").length;
    addNotification({
      type: pass > 0 && fail === 0 ? "success" : fail > 0 && pass === 0 ? "error" : "info",
      title: translate("Test Selesai"),
      message: `${pass} model OK · ${fail} model gagal · dari ${allModelIds.length} total`,
      duration: 8000,
    });
    } finally {
    setTestAllRunning(false);
    setTestAllStopping(false);
    stopTestAllRef.current = false;
    }
  };

  const renderModelsSection = () => {
    if (isCompatible) {
      return (
        <CompatibleModelsSection
          providerStorageAlias={providerStorageAlias}
          providerDisplayAlias={providerDisplayAlias}
          modelAliases={modelAliases}
          customModels={customModels}
          copied={copied}
          onCopy={copy}
          onSetAlias={handleSetAlias}
          onDeleteAlias={handleDeleteAlias}
          onEditAlias={(modelId, vals) => handleEditBuiltinModel(modelId, vals, providerStorageAlias)}
          onEditCustomModel={(modelId, vals) => handleEditCustomModel(modelId, vals, "llm", providerStorageAlias)}
          onAddCustomModel={(modelId) => handleAddCustomModel(modelId, "llm", providerStorageAlias)}
          onDeleteCustomModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias)}
          connections={connections}
          isAnthropic={isAnthropicCompatible}
          modelPrefix={providerDisplayAlias}
          onBulkPrefixChange={handleBulkPrefixChange}
          onTestAllModels={handleTestAllModels}
           onDeleteAllModels={handleDeleteAllModels}
           testAllRunning={testAllRunning}
           testAllStopping={testAllStopping}
           systemPromptModel={systemPromptModel}
           setSystemPromptModel={setSystemPromptModel}
           systemPromptDraft={systemPromptDraft}
           setSystemPromptDraft={setSystemPromptDraft}
           systemPrompts={systemPrompts}
           savingSystemPrompt={savingSystemPrompt}
           onSaveSystemPrompt={handleSaveSystemPrompt}
         />
      );
    }
    const allModels = [
      ...models,
      ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
    ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; });
    const disabledSet = new Set(disabledModelIds);
    const displayModels = allModels.filter((m) => !disabledSet.has(m.id));
    const disabledDisplayModels = allModels.filter((m) => disabledSet.has(m.id));
    const customModelRows = getProviderCustomModelRows({
      customModels,
      modelAliases,
      providerAlias: providerStorageAlias,
      builtInModels: models,
      type: "llm",
    });

    const listItems = [
      ...customModelRows.map((m) => ({ kind: "custom", model: m })),
      ...displayModels.map((m) => ({ kind: "builtin", model: m })),
    ];
    const totalPages = Math.max(1, Math.ceil(listItems.length / MODELS_PER_PAGE));
    const safePage = Math.min(modelsPage, totalPages);
    const pagedList = listItems.slice((safePage - 1) * MODELS_PER_PAGE, safePage * MODELS_PER_PAGE);

    return (
      <>
      {handleBulkPrefixChange && (
        <div className="an-panel an-scope mb-3">
          <div className="an-panel-pad">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-base text-primary">tag</span>
             <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{translate("Global Model Prefix")}</span>
          </div>
          <p className="text-[11px] text-text-muted mb-3">
             {translate("Sets the display prefix for all models in this provider. Models will appear as")}{" "}
            <code className="font-mono text-primary">{prefixDraft ? prefixDraft + "/" : ""}&lt;model-id&gt;</code>.
          </p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={prefixDraft}
              onChange={(e) => setPrefixDraft(e.target.value)}
              placeholder={providerDisplayAlias}
              className="flex-1 rounded border border-border bg-bg px-2.5 py-1.5 font-mono text-xs text-text-main outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/30"
               title={translate("Set prefix for all models in this provider")}
            />
            <button
              onClick={async () => {
                if (!prefixDraft.trim() || savingPrefix) return;
                setSavingPrefix(true);
                await handleBulkPrefixChange(prefixDraft.trim());
                setSavingPrefix(false);
              }}
              disabled={!prefixDraft.trim() || prefixDraft.trim() === modelPrefix || savingPrefix}
              className="shrink-0 rounded border-2 border-primary bg-primary px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary-hover transition-colors shadow-[1.5px_1.5px_0px_var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
               {savingPrefix ? translate("Saving...") : translate("Apply")}
            </button>
          </div>
          {modelPrefix && prefixDraft !== modelPrefix && (
            <p className="mt-2 text-[10px] text-warning">
               {translate("Unsaved change — current prefix is")} <code className="font-mono">{modelPrefix}</code>
            </p>
          )}
          </div>
        </div>
      )}
      <div className="an-panel an-scope mb-3">
        <div className="an-panel-pad">
        <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
          <span className="an-panel-ico" aria-hidden>
            <span className="material-symbols-outlined text-base">text_fields</span>
          </span>
            <div className="min-w-0">
               <span className="an-panel-title block">{translate("System Prompt")}</span>
               <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">{translate("Special instructions for the selected model")}</span>
            </div>
          </div>
           <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{translate("MODEL-SPECIFIC")}</span>
        </div>
         <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor="system-prompt-model">{translate("Target model")}</label>
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-primary"><span className="material-symbols-outlined text-[18px]">smart_toy</span></span>
          <select id="system-prompt-model" value={systemPromptModel} onChange={(e) => setSystemPromptModel(e.target.value)} className="an-select system-prompt-select h-11 w-full font-mono text-xs">
             <option value="">{translate("Choose a model to configure")}</option>
            {[...new Set([...models.map((model) => model.id), ...kiloFreeModels.map((model) => model.id), ...customModels.filter((model) => (model.type || model.kind || "llm") === "llm" && model.providerAlias === providerStorageAlias).map((model) => model.id)].filter(Boolean))].map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
          </select>
        </div>
        <label className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted" htmlFor="system-prompt-textarea">
           <span>{translate("System instructions")}</span>
          <span className="font-normal normal-case tracking-normal text-text-muted/60">{systemPromptDraft.length}/4000</span>
        </label>
         <textarea id="system-prompt-textarea" maxLength={4000} value={systemPromptDraft} onChange={(e) => setSystemPromptDraft(e.target.value)} placeholder={translate("Example: You are model XX from Techwiz. Explain answers clearly and accurately.")} rows={5} className="an-input system-prompt-textarea min-h-[132px] w-full resize-y !rounded-xl !border-border/80 !bg-bg text-sm leading-6 placeholder:text-text-muted/45 focus:!border-primary/70" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={handleSaveSystemPrompt}
            disabled={!systemPromptModel || savingSystemPrompt}
            className="an-btn an-primary h-9 rounded-[10px] px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined text-[16px]">{savingSystemPrompt ? "progress_activity" : "save"}</span>
             {savingSystemPrompt ? translate("Saving...") : translate("Save prompt")}
          </button>
          {systemPromptModel && systemPrompts[systemPromptModel] !== systemPromptDraft.trim() && (
             <p className="text-[10px] text-warning">{translate("Unsaved system prompt changes")}</p>
          )}
        </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {/* Custom models first */}
        {pagedList.filter((item) => item.kind === "custom").map(({ model }) => (
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
            onEdit={(vals) => handleEditCustomModel(model.id, vals, "llm", providerStorageAlias)}
            providerAlias={providerDisplayAlias}
            testStatus={modelTestResults[model.id]}
            onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
            isTesting={testingModelIds.has(model.id)}
            isCustom
            isFree={typeof model.isFree === "boolean" ? model.isFree : undefined}
            caps={getCaps(`${providerId}/${model.id}`)}
            thinkingSuffix={resolveThinkingSuffix(model.id)}
            prefix={providerDisplayAlias}
          />
        ))}

        {pagedList.filter((item) => item.kind === "builtin").map(({ model }) => {
          const fullModel = `${providerStorageAlias}/${model.id}`;
          const oldFormatModel = `${providerId}/${model.id}`;
          const existingAlias = Object.entries(modelAliases).find(
            ([, m]) => m === fullModel || m === oldFormatModel
          )?.[0];
          return (
            <ModelRow
              key={model.id}
              model={{ ...model, name: modelNames[`${providerStorageAlias}/${model.id}`] || model.name }}
              fullModel={`${providerDisplayAlias}/${model.id}`}
              alias={existingAlias}
              copied={copied}
              onCopy={copy}
              onSetAlias={(alias) => handleSetAlias(model.id, alias, providerStorageAlias)}
              onDeleteAlias={() => handleDeleteAlias(existingAlias)}
              onEdit={(vals) => handleEditBuiltinModel(model.id, vals, providerStorageAlias)}
              providerAlias={providerDisplayAlias}
              testStatus={modelTestResults[model.id]}
              onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
              isTesting={testingModelIds.has(model.id)}
              isFree={model.isFree}
              onDisable={() => handleDisableModel(model.id)}
              caps={getCaps(`${providerId}/${model.id}`)}
              thinkingSuffix={resolveThinkingSuffix(model.id)}
              prefix={providerDisplayAlias}
            />
          );
        })}

        {/* Add model button — inline, same style as model chips */}
        <button
          onClick={() => setShowAddCustomModel(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-3 py-2 text-xs text-primary transition-colors hover:border-primary hover:bg-primary/5 sm:w-auto"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Add Model
        </button>

        {/* Import Qoder models button — only show for qoder/qoder-cn provider */}
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

        {/* Import Cline /models catalog button — only show for cline and clinepass providers */}
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
              <p className="text-xs text-text-muted mb-2">Suggested free models (≥200k context):</p>
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

        {/* Disabled models — restorable */}
        {disabledDisplayModels.length > 0 && (
          <div className="w-full mt-2">
            <p className="text-xs text-text-muted mb-2">Disabled models ({disabledDisplayModels.length}):</p>
            <div className="flex flex-wrap gap-2">
              {disabledDisplayModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleEnableModel(m.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-black/10 dark:border-white/10 text-xs text-text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  title="Restore model"
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                  {m.id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ModelListPagination
        page={safePage}
        totalPages={totalPages}
        onPageChange={setModelsPage}
        className="mt-1"
      />
      </>
    );
  };

  if (!providerInfo) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Provider not found</p>
        <Link href="/dashboard/providers" className="text-primary mt-4 inline-block">
          Back to Providers
        </Link>
      </div>
    );
  }

  const getHeaderIconPath = () => {
    if (isOpenAICompatible || isAnthropicCompatible) {
      return getCompatibleIconSrc(providerInfo.id);
    }
    return getProviderIconSrc(providerInfo.id);
  };

  return (
    <div className="an-scope flex min-w-0 flex-col gap-5">
      {/* Header */}
      <section className="an-panel">
        <div className="an-pdetail-head">
          <Link href="/dashboard/providers" className="an-back">
            <span className="material-symbols-outlined">arrow_back</span>
            <span>{translate("Back to Providers")}</span>
          </Link>

          <div className="an-pdetail-id">
            <span
              className="an-pdetail-ico"
              style={{ backgroundColor: `${providerInfo.color}1f` }}
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
                  className="max-h-11 max-w-11 object-contain"
                  sizes="48px"
                  onError={() => {
                    markProviderIconMissing(providerInfo.id);
                    setHeaderImgError(true);
                  }}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </span>

            <div className="min-w-0">
              <h1 className="an-pdetail-name truncate">{providerInfo.name}</h1>
              <div className="an-pdetail-sub">
                <span className="an-chip">
                  <span>{connections.length}</span>{" "}
                  <span>
                    {translate(connections.length === 1 ? "connection" : "connections")}
                  </span>
                </span>
                {providerInfo.website && (
                  <span className="truncate">
                    {String(providerInfo.website).replace(/^https?:\/\//, "")}
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>
      </section>

      {providerInfo.deprecated && (
        <AntaresNotice variant="warn" icon="warning">
          <p>{providerInfo.deprecationNotice}</p>
        </AntaresNotice>
      )}

      {providerInfo.notice?.text && !providerInfo.deprecated && (
        <AntaresNotice
          variant="info"
          icon="info"
           actionBelow
           action={
             (providerInfo.notice.apiKeyUrl || providerInfo.notice.signupUrl || providerInfo.website) ? (
               <a
                 href={providerInfo.notice.apiKeyUrl || providerInfo.notice.signupUrl || providerInfo.website}
                target="_blank"
                rel="noopener noreferrer"
                className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                 {providerInfo.notice.apiKeyUrl ? translate("Get API Key") : translate("Sign up / Learn more")}
              </a>
            ) : null
          }
        >
          <p>{providerInfo.notice.text}</p>
        </AntaresNotice>
      )}

      {isCompatible && providerNode && (
        <section className="an-panel">
          <div className="an-panel-pad">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="an-sec-title">{providerNameForDisplay}</h2>
              <p className="break-all text-sm text-text-muted">
                {isAnthropicCompatible ? "Messages API" : (providerNode.apiType === "responses" ? "Responses API" : "Chat Completions")} · {(providerNode.baseUrl || "").replace(/\/$/, "")}/
                {isAnthropicCompatible ? "messages" : (providerNode.apiType === "responses" ? "responses" : "chat/completions")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
              <Button skin="antares"
                size="sm"
                icon="add"
                onClick={() => {
                  setAddConnectionError("");
                  setShowAddApiKeyModal(true);
                }}
                className="w-full sm:w-auto"
              >
                Add API Key
              </Button>
              <Button skin="antares"
                size="sm"
                variant="secondary"
                icon="edit"
                onClick={() => setShowEditNodeModal(true)}
                className="w-full sm:w-auto"
              >
                Edit
              </Button>
              <Button skin="antares"
                size="sm"
                variant="secondary"
                icon="delete"
                onClick={async () => {
                  setConfirmState({
                    title: "Delete Compatible Node",
                    message: `Delete this ${providerNameForDisplay} node?`,
                    onConfirm: async () => {
                      setConfirmState(null);
                      try {
                        const res = await fetch(`/api/provider-nodes/${providerId}`, { method: "DELETE" });
                        if (res.ok) {
                          window.dispatchEvent(new CustomEvent("routermod:providers-changed"));
                          try {
                            localStorage.setItem("routermod:providers-changed", String(Date.now()));
                          } catch {}
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
                Delete
              </Button>
            </div>
          </div>
          {providerNode.systemPrompt && (
            <div className="mt-4 p-3 rounded-md bg-[var(--t-surface-raised)] border border-[var(--t-border)]">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[16px] text-text-muted">terminal</span>
                <span className="text-sm font-medium text-text-primary">{translate("System Prompt")}</span>
              </div>
              <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{providerNode.systemPrompt}</p>
            </div>
          )}
          </div>
        </section>
      )}

      {/* Connections */}
      {isFreeNoAuth ? (
        <NoAuthProxyCard providerId={providerId} />
      ) : (
        <section className="an-panel">
          <header className="an-panel-head an-panel-head-stack an-provider-connections-head">
            <span className="an-panel-ico" aria-hidden>
              <span className="material-symbols-outlined">link</span>
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="an-panel-title">{translate("Connections")}</h2>
              <p className="an-panel-sub">
                <span>{connections.length}</span>{" "}
                <span>{translate(connections.length === 1 ? "account" : "accounts")}</span>
              </p>
            </div>
            <div className="an-panel-actions">
              {healthSummary && healthSummary.unavailable > 0 && (
                <span className="an-chip danger">
                  <span className="size-1.5 rounded-full bg-[var(--t-danger)] shrink-0" />
                  <span>{healthSummary.unavailable}</span>{" "}
                  <span>{translate("invalid")}</span>
                </span>
              )}
              {connections.length > 0 && proxyPools.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkProxyModal(true)}
                  className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">lan</span>
                  {translate("Apply Proxy")}
                </button>
              )}
              {connections.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate(true)}
                    disabled={bulkStatusUpdating}
                    className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">power</span>
                    {translate("Enable all sessions")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate(false)}
                    disabled={bulkStatusUpdating}
                    className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[14px]">power_off</span>
                    {translate("Disable all sessions")}
                  </button>
                </>
              )}
              {selectedConnectionIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="an-btn h-8 px-3 text-[11px] gap-1.5 border border-[rgba(232,0,31,0.32)] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                  {translate("Delete Selected")}
                  <span>({selectedConnectionIds.length})</span>
                </button>
              )}
              {connections.some(isInvalidConnection) && (
                <button
                  type="button"
                  onClick={handleDeleteInvalid}
                  disabled={deletingInvalid}
                  className="an-btn h-8 px-3 text-[11px] gap-1.5 border border-[rgba(232,0,31,0.32)] bg-[var(--t-accent-soft)] text-[var(--t-star-ink)] disabled:opacity-50 shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                  {translate("Remove invalid")}
                  <span>({connections.filter(isInvalidConnection).length})</span>
                </button>
              )}
              {connections.length > 0 && !oneByOneRunning && (
                <button
                  type="button"
                  onClick={handleRunOneByOneTest}
                  className="an-btn an-primary h-8 px-3 text-[11px] gap-1.5 shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">sync</span>
                  {translate("Test all")}
                </button>
              )}
              {oneByOneRunning && (
                <button
                  type="button"
                  onClick={handleStopOneByOneTest}
                  disabled={oneByOneStopping}
                  className="an-btn an-ghost h-8 px-3 text-[11px] gap-1.5 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">stop</span>
                  {oneByOneStopping ? translate("Stopping...") : translate("Stop")}
                </button>
              )}
            </div>
          </header>

          <div className="an-panel-pad">
            {/* Round robin strategy */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="an-check">
                <span>{translate("Round Robin")}</span>
                <input
                  type="checkbox"
                  checked={providerStrategy === "round-robin"}
                  onChange={handleRoundRobinToggle}
                />
              </label>
              {providerStrategy === "round-robin" && (
                <label className="an-check gap-2">
                  <span>{translate("Sticky")}</span>
                  <input
                    type="number"
                    min={1}
                    value={providerStickyLimit}
                    onChange={(e) => handleStickyLimitChange(e.target.value)}
                    placeholder="1"
                    className="an-input !w-16 !h-8 !py-0 !pl-3 !pr-2 !text-[12px] !font-mono"
                  />
                </label>
              )}
            </div>

            {connections.length === 0 ? (
              <div className="an-empty">
                <span className="material-symbols-outlined">
                  {isOAuth ? "lock" : "key"}
                </span>
                <p>{translate("No connections yet")}</p>
                {hasDualAuthModes && (
                  <p className="text-[12px]">
                    {translate("Pick how you want to connect")} {oauthConnectionLabel}{" "}
                    {translate("or")} {apiKeyConnectionLabel}.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {hasDualAuthModes ? (
                    <>
                      <button
                        type="button"
                        onClick={triggerOAuthConnection}
                        className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">lock</span>
                        {oauthConnectionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={triggerApiKeyConnection}
                        className="an-btn an-primary h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">key</span>
                        {apiKeyConnectionLabel}
                      </button>
                    </>
                  ) : (
                    <>
                      {!isCompatible && providerId === "iflow" && (
                        <button
                          type="button"
                          onClick={() => setShowIFlowCookieModal(true)}
                          className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">cookie</span>
                          {translate("Cookie")}
                        </button>
                      )}
                      {providerId === "codex" && (
                        <button
                          type="button"
                          onClick={() => setShowBulkImportCodex(true)}
                          className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                          {translate("Bulk Add")}
                        </button>
                      )}
                      {providerId === "grok-cli" && (
                        <button
                          type="button"
                          onClick={() => setShowBulkImportGrokCli(true)}
                          className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                          {translate("Bulk Add")}
                        </button>
                      )}
                      {providerId === "antigravity" && (
                        <button
                          type="button"
                          onClick={() => setShowBulkImportAntigravity(true)}
                          className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                          {translate("Bulk Add")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={triggerAddConnection}
                        className="an-btn an-primary h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        {isCompatible
                          ? translate("Add API Key")
                          : providerId === "iflow"
                            ? translate("OAuth")
                            : translate("Add Connection")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {oneByOneSummary && (
                  <div className="an-bulkbar mb-3 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-raised)] px-3 py-2">
                    <span className="an-chip">{translate("Total")}: {oneByOneSummary.total}</span>
                    <span className="an-chip ok">{translate("Passed")}: {oneByOneSummary.passed}</span>
                    <span className="an-chip danger">{translate("Failed")}: {oneByOneSummary.failed}</span>
                    {oneByOneSummary.stopped && (
                      <span className="an-chip accent">{translate("Stopped")}</span>
                    )}
                    {oneByOneRunning && oneByOneCurrentConnectionId && (
                      <span className="an-chip accent">
                        {translate("Testing")}: {" "}
                        {
                          connections.find((conn) => conn.id === oneByOneCurrentConnectionId)?.name || oneByOneCurrentConnectionId
                        }
                      </span>
                    )}
                  </div>
                )}

                <div className="an-bulkbar">
                  <label className="an-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAllConnections}
                    />
                    <span>{translate("Select all")}</span>
                  </label>
                </div>

                {connectionsList}

                {!isCompatible && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {providerId === "iflow" && (
                      <button
                        type="button"
                        onClick={() => setShowIFlowCookieModal(true)}
                        title={translate("Add connection using browser cookie")}
                        className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">cookie</span>
                        {translate("Cookie")}
                      </button>
                    )}
                    {providerId === "codex" && (
                      <button
                        type="button"
                        onClick={() => setShowBulkImportCodex(true)}
                        title={translate("Bulk import codex accounts from JSON")}
                        className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                        {translate("Bulk Add")}
                      </button>
                    )}
                    {providerId === "grok-cli" && (
                      <button
                        type="button"
                        onClick={() => setShowBulkImportGrokCli(true)}
                        title={translate("Bulk import Grok CLI accounts from JSON")}
                        className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                        {translate("Bulk Add")}
                      </button>
                    )}
                    {providerId === "antigravity" && (
                      <button
                        type="button"
                        onClick={() => setShowBulkImportAntigravity(true)}
                        title={translate("Bulk Add")}
                        className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                        {translate("Bulk Add")}
                      </button>
                    )}
                    {hasDualAuthModes ? (
                      <>
                        <button
                          type="button"
                          onClick={triggerOAuthConnection}
                          className="an-btn an-ghost h-9 px-4 text-[11px] gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">lock</span>
                          {oauthConnectionLabel}
                        </button>
                        <button
                          type="button"
                          onClick={triggerApiKeyConnection}
                          className="an-btn an-primary h-9 px-4 text-[11px] gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">key</span>
                          {apiKeyConnectionLabel}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={triggerAddConnection}
                        className="an-btn an-primary h-9 px-4 text-[11px] gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        {translate("Add Connection")}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Per-provider user overrides (custom headers / connect timeout) */}
      <CustomConfigCard providerId={providerId} />

      {/* Models */}
        <section className="an-panel">
          <div className="an-panel-pad">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="an-sec-title shrink-0">
              {"Available Models"}
            </h2>
            {providerThinkingLevels && (
              <select
                value={thinkingMode}
                onChange={(e) => handleThinkingModeChange(e.target.value)}
                title="Appends (level) suffix to copied model names"
                className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
              >
                {providerThinkingLevels.map((opt) => (
                  <option key={opt} value={opt}>{`Thinking: ${opt.charAt(0).toUpperCase() + opt.slice(1)}`}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDetectHelp((v) => !v)}
              title={translate("How auto-detect works")}
              aria-label={translate("How auto-detect works")}
              aria-pressed={showDetectHelp}
              className={`an-conn-btn !w-7 !h-7 !rounded-[8px] ${
                showDetectHelp
                  ? "!bg-[var(--t-accent-soft)] !text-[var(--t-star-ink)]"
                  : "!text-[var(--t-muted)]"
              }`}
            >
              <span className="material-symbols-outlined !text-[15px]">help</span>
            </button>
            <Button skin="antares"
              size="sm"
              variant="secondary"
              icon="radar"
              loading={detectingModels}
              onClick={() => handleAutoDetectModels()}
              title="Fetch every model this provider exposes and add the missing ones"
            >
              {translate("Deteksi Model Otomatis")}
            </Button>
            {(() => {
              const customRows = getProviderCustomModelRows({
                customModels, modelAliases, providerAlias: providerStorageAlias, builtInModels: models, type: "llm",
              });
              const builtInIds = [
                ...models,
                ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
              ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; })
                .filter((m) => !disabledModelIds.includes(m.id))
                .map((m) => m.id);
              const customIdSet = new Set(customRows.map((m) => m.id));
              const activeIds = [...customRows.map((m) => m.id), ...builtInIds.filter((id) => !customIdSet.has(id))];
              return (
                <>
                  {activeIds.length > 0 && (
                    <Button skin="antares"
                      size="sm"
                      variant={testAllRunning ? "danger" : "secondary"}
                      icon={testAllRunning ? (testAllStopping ? "progress_activity" : "stop") : "science"}
                      onClick={handleTestAllModels}
                      disabled={testAllStopping}
                    >
                      {testAllRunning ? (testAllStopping ? translate("Stop Testing...") : translate("Stop Test")) : `${translate("Test Semua")} (${activeIds.length})`}
                    </Button>
                  )}
                  <Button skin="antares" size="sm" variant="danger" icon="delete_sweep" onClick={handleDeleteAllModels}>
                    {translate("Delete All Models")}
                  </Button>
                </>
              );
            })()}
          </div>
        </div>
        {showDetectHelp && <AutoDetectHelp onClose={() => setShowDetectHelp(false)} />}
        {!!modelsTestError && /RegionError|hosted in China|regionNotAllowed/i.test(modelsTestError) && (() => {
              const str = typeof modelsTestError === "string" ? modelsTestError : JSON.stringify(modelsTestError);
              const linkMatch = str.match(/https:\/\/opencode\.ai\/workspace\/[^\s"')]+/);
              const wrkMatch = str.match(/wrk_[0-9A-Za-z]+/);
              const targetUrl = linkMatch
                ? (linkMatch[0].endsWith("/go") ? linkMatch[0] : `${linkMatch[0]}/go`)
                : wrkMatch
                  ? `https://opencode.ai/workspace/${wrkMatch[0]}/go`
                  : "https://opencode.ai";

              return (
                <div className="mb-3">
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400 transition-colors"
                  >
                    <span>Allow China-hosted models</span>
                    <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                  </a>
                </div>
              );
            })()}
        {providerId === "zed" && !!liveModelsError && (
          <p className="text-xs text-red-500 mb-3 break-words">{liveModelsError}</p>
        )}
        {renderModelsSection()}
          </div>
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
          onSave={async (modelId, caps, transport) => {
            await handleAddCustomModel(modelId, caps?.stt ? "stt" : "llm", providerStorageAlias, caps, transport);
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

      {providerId === "antigravity" && (
        <>
          <BulkImportAntigravityModal
            isOpen={showBulkImportAntigravity}
            onClose={() => setShowBulkImportAntigravity(false)}
          />
        </>
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
        title="Risk Notice"
        message={providerInfo?.deprecationNotice}
        confirmText="I Understand, Continue"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}
