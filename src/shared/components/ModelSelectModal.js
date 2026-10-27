"use client";

import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";
import ProviderIcon from "./ProviderIcon";
import CapacityBadges from "./CapacityBadges";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, AI_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias } from "@/shared/constants/providers";
import { parseSearchQuery, matchesSearch } from "@/shared/utils/modelSearchFilter";
import { getDeactivatedProviderIds } from "@/shared/utils/connectionStatus";

const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter(id => FREE_PROVIDERS[id].noAuth);

const LIVE_CATALOG_PROVIDERS = ["cursor", "cline", "clinepass", "zed"];

function useLiveProviderModels(isOpen, connectionIds, label) {
  const [models, setModels] = useState([]);
  const idsKey = (connectionIds ?? []).join("|");

  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    if (!isOpen || ids.length === 0) {
      setModels([]);
      return undefined;
    }

    let cancelled = false;
    Promise.all(ids.map(async (connectionId) => {
      const response = await fetch(`/api/providers/${connectionId}/models`, { cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.models) ? data.models : [];
    }))
      .then((modelLists) => {
        if (cancelled) return;
        const seen = new Set();
        setModels(modelLists.flat().filter((model) => {
          if (!model?.id || seen.has(model.id)) return false;
          seen.add(model.id);
          return true;
        }));
      })
      .catch((error) => {
        console.warn(`Unable to load ${label} models for selector:`, error);
        if (!cancelled) setModels([]);
      });

    return () => { cancelled = true; };
  }, [isOpen, idsKey, label]);

  return models;
}

export default function ModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  onDeselect,
  onSelectBatch,
  onDeselectBatch,
  selectedModel,
  activeProviders = [],
  title = "Select Model",
  size = "lg",
  modelAliases = {},
  kindFilter = null,
  capFilter = null,
  addedModelValues = [],
  closeOnSelect = true,
  allowProviderWildcard = false,
}) {
  // Live-fetched connections on modal open, fallback to activeProviders prop
  const [fetchedConnections, setFetchedConnections] = useState(null);

  const fetchConnections = async () => {
    try {
      const providersRes = await fetch("/api/providers");
      if (!providersRes.ok) throw new Error(`Failed to fetch providers: ${providersRes.status}`);
      const providersData = await providersRes.json();
      setFetchedConnections(providersData.connections || []);
    } catch (error) {
      console.error("Error fetching providers in ModelSelectModal:", error);
      setFetchedConnections([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchConnections();
  }, [isOpen]);

  const effectiveConnections = useMemo(() => {
    return fetchedConnections !== null ? fetchedConnections : (activeProviders || []);
  }, [fetchedConnections, activeProviders]);

  const filteredActiveProviders = useMemo(() => {
    const activeOnly = effectiveConnections.filter(
      (p) => p && p.isActive !== false && p.testStatus !== "failed"
    );
    if (!kindFilter) return activeOnly;
    return activeOnly.filter((p) => {
      const info = AI_PROVIDERS[p.provider];
      const kinds = info?.serviceKinds || ["llm"];
      return kinds.includes(kindFilter);
    });
  }, [effectiveConnections, kindFilter]);

  // Providers that have connections configured, but ALL of them are deactivated
  const deactivatedProviderIds = useMemo(() => {
    return getDeactivatedProviderIds(effectiveConnections);
  }, [effectiveConnections]);

  const { getCaps } = useModelCaps();
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [disabledModels, setDisabledModels] = useState({});
  const liveConnectionIdsByProvider = useMemo(() => {
    const map = Object.fromEntries(LIVE_CATALOG_PROVIDERS.map((id) => [id, []]));
    for (const p of filteredActiveProviders) {
      if (p?.id && Object.prototype.hasOwnProperty.call(map, p.provider)) map[p.provider].push(p.id);
    }
    return map;
  }, [filteredActiveProviders]);
  const cursorConnectionIds = liveConnectionIdsByProvider.cursor;
  const clineConnectionIds = liveConnectionIdsByProvider.cline;
  const clinepassConnectionIds = liveConnectionIdsByProvider.clinepass;
  const zedConnectionIds = liveConnectionIdsByProvider.zed;

  const cursorModels = useLiveProviderModels(isOpen, cursorConnectionIds, "Cursor");
  const clineModels = useLiveProviderModels(isOpen, clineConnectionIds, "Cline");
  const clinepassModels = useLiveProviderModels(isOpen, clinepassConnectionIds, "ClinePass");
  const zedModels = useLiveProviderModels(isOpen, zedConnectionIds, "Zed");

  const fetchCombos = async () => {
    try {
      const res = await fetch("/api/combos");
      if (!res.ok) throw new Error(`Failed to fetch combos: ${res.status}`);
      const data = await res.json();
      setCombos(data.combos || []);
    } catch (error) {
      console.error("Error fetching combos:", error);
      setCombos([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCombos();
  }, [isOpen]);

  const fetchProviderNodes = async () => {
    try {
      const res = await fetch("/api/provider-nodes");
      if (!res.ok) throw new Error(`Failed to fetch provider nodes: ${res.status}`);
      const data = await res.json();
      setProviderNodes(data.nodes || []);
    } catch (error) {
      console.error("Error fetching provider nodes:", error);
      setProviderNodes([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchProviderNodes();
  }, [isOpen]);

  const fetchCustomModels = async () => {
    try {
      const res = await fetch("/api/models/custom");
      if (!res.ok) throw new Error(`Failed to fetch custom models: ${res.status}`);
      const data = await res.json();
      setCustomModels(data.models || []);
    } catch (error) {
      console.error("Error fetching custom models:", error);
      setCustomModels([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCustomModels();
  }, [isOpen]);

  const fetchDisabledModels = async () => {
    try {
      const res = await fetch("/api/models/disabled");
      if (!res.ok) throw new Error(`Failed to fetch disabled models: ${res.status}`);
      const data = await res.json();
      setDisabledModels(data.disabled || {});
    } catch (error) {
      console.error("Error fetching disabled models:", error);
      setDisabledModels({});
    }
  };

  useEffect(() => {
    if (isOpen) fetchDisabledModels();
  }, [isOpen]);

  const allProviders = useMemo(() => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...APIKEY_PROVIDERS }), []);

  const groupedModels = useMemo(() => {
    const groups = {};

    const PROVIDER_AS_MODEL_KINDS = new Set(["webSearch", "webFetch"]);
    const TYPED_KINDS = new Set(["image", "tts", "stt", "embedding", "imageToText", "systemone"]);
    const ALLOW_PROVIDER_FALLBACK_KINDS = new Set(["tts", "image", "webFetch"]);

    const filterByKind = (models) => {
      if (!kindFilter) return models.filter((m) => m.isPlaceholder || m.isCustom || !getModelKind(m) || getModelKind(m) === "llm");
      if (!TYPED_KINDS.has(kindFilter)) return models;
      return models.filter((m) => m.isPlaceholder || getModelKind(m) === kindFilter);
    };

    const activeConnectionIds = filteredActiveProviders.map(p => p.provider);

    const noAuthIds = (kindFilter
      ? NO_AUTH_PROVIDER_IDS.filter((id) => (AI_PROVIDERS[id]?.serviceKinds || ["llm"]).includes(kindFilter))
      : NO_AUTH_PROVIDER_IDS).filter((id) => !deactivatedProviderIds.has(id));

    const existingNodeIds = new Set((providerNodes || []).map((n) => n?.id).filter(Boolean));
    const compatibleNodeIds = kindFilter
      ? []
      : customModels
          .map((m) => m.providerAlias)
          .filter((alias) =>
            (isOpenAICompatibleProvider(alias) || isAnthropicCompatibleProvider(alias)) &&
            existingNodeIds.has(alias) &&
            !deactivatedProviderIds.has(alias)
          );

    const providerIdsToShow = new Set([
      ...activeConnectionIds,  // Only connected providers
      ...noAuthIds,            // No-auth providers (kind-filtered)
      ...compatibleNodeIds,    // Compatible nodes with user-added models
    ].filter((id) => !deactivatedProviderIds.has(id)));

    const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
      const indexA = PROVIDER_ORDER.indexOf(a);
      const indexB = PROVIDER_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    sortedProviderIds.forEach((providerId) => {
      const alias = getProviderAlias(providerId);
      const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
      const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

      if (kindFilter && PROVIDER_AS_MODEL_KINDS.has(kindFilter)) {
        groups[providerId] = {
          name: providerInfo.name,
          alias,
          color: providerInfo.color,
          models: [{ id: providerId, name: providerInfo.name, value: providerId }],
        };
        return;
      }

      if (providerInfo.passthroughModels) {
        const aliasModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${alias}/`, ""),
            name: aliasName,
            value: fullModel,
          }));
        const customRegisteredModels = customModels
          .filter((m) => m.providerAlias === alias)
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${alias}/${m.id}`,
            kind: getModelKind(m),
            isCustom: true,
          }));

        let combined = aliasModels;
        if (kindFilter && TYPED_KINDS.has(kindFilter)) {
          const registeredTyped = customRegisteredModels.filter((m) => getModelKind(m) === kindFilter);
          combined = [
            ...registeredTyped,
            ...getModelsByProviderId(providerId)
            .filter((m) => getModelKind(m) === kindFilter)
            .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }))
            .filter((m) => !registeredTyped.some((registered) => registered.value === m.value)),
          ];
          if (combined.length === 0 && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
            const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
            if (supports) combined = [{ id: providerId, name: providerInfo.name, value: alias }];
          }
        } else {
          const registeredLlms = customRegisteredModels.filter((m) => !getModelKind(m) || getModelKind(m) === "llm");
          const seen = new Set([...aliasModels, ...registeredLlms].map((m) => m.value));
          const hardcoded = getModelsByProviderId(providerId)
            .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")
            .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }))
            .filter((m) => !seen.has(m.value));
          combined = [...registeredLlms, ...aliasModels.filter((m) => !registeredLlms.some((registered) => registered.value === m.value)), ...hardcoded];
        }

        if (combined.length > 0) {
          const matchedNode = providerNodes.find(node => node.id === providerId);
          const displayName = matchedNode?.name || providerInfo.name;

          groups[providerId] = {
            name: displayName,
            alias: alias,
            color: providerInfo.color,
            models: combined,
          };
        }
      } else if (isCustomProvider) {
        if (kindFilter && TYPED_KINDS.has(kindFilter)) return;
        const connection = filteredActiveProviders.find(p => p.provider === providerId) || effectiveConnections.find(p => p.provider === providerId);
        const matchedNode = providerNodes.find(node => node.id === providerId);
        const displayName = matchedNode?.name || connection?.name || providerInfo.name;
        const nodePrefix = connection?.providerSpecificData?.prefix || matchedNode?.prefix || providerId;

        const nodeModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${providerId}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${providerId}/`, ""),
            name: aliasName,
            value: `${nodePrefix}/${fullModel.replace(`${providerId}/`, "")}`,
          }));

        const registeredCustom = customModels
          .filter((m) => m.providerAlias === providerId)
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${nodePrefix}/${m.id}`,
            isCustom: true,
          }));
        const seen = new Set(nodeModels.map((m) => m.value));
        const mergedModels = [...nodeModels, ...registeredCustom.filter((m) => !seen.has(m.value))];

        const modelsToShow = mergedModels.length > 0 ? mergedModels : [{
          id: `__placeholder__${providerId}`,
          name: `${nodePrefix}/model-id`,
          value: `${nodePrefix}/model-id`,
          isPlaceholder: true,
        }];

        groups[providerId] = {
          name: displayName,
          alias: nodePrefix,
          color: providerInfo.color,
          models: modelsToShow,
          isCustom: true,
          hasModels: mergedModels.length > 0,
        };
      } else {
        const liveModels = providerId === "cursor" ? cursorModels : providerId === "cline" ? clineModels : providerId === "clinepass" ? clinepassModels : providerId === "zed" ? zedModels : [];
        const hardcodedModels = liveModels.length > 0
          ? liveModels
          : getModelsByProviderId(providerId);
        const hardcodedIds = new Set(hardcodedModels.map((m) => m.id));

        const hasHardcoded = hardcodedModels.length > 0;
        const customAliasModels = Object.entries(modelAliases)
          .filter(([aliasName, fullModel]) =>
            fullModel.startsWith(`${alias}/`) &&
            (hasHardcoded ? aliasName === fullModel.replace(`${alias}/`, "") : true) &&
            !hardcodedIds.has(fullModel.replace(`${alias}/`, ""))
          )
          .map(([aliasName, fullModel]) => {
            const modelId = fullModel.replace(`${alias}/`, "");
            return { id: modelId, name: aliasName, value: fullModel, isCustom: true };
          });

        const customAliasIds = new Set(customAliasModels.map((m) => m.id));
        const customRegisteredModels = customModels
          .filter((m) => m.providerAlias === alias && !hardcodedIds.has(m.id) && !customAliasIds.has(m.id))
          .map((m) => ({ id: m.id, name: m.name || m.id, value: `${alias}/${m.id}`, isCustom: true }));

        const merged = [
          ...hardcodedModels.map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m), deprecated: !!m.deprecated, deprecationDate: m.deprecationDate })),
          ...customAliasModels,
          ...customRegisteredModels,
        ];
        const seen = new Set();
        let allModels = filterByKind(merged.filter((m) => {
          if (seen.has(m.value)) return false;
          seen.add(m.value);
          return true;
        }));

        if (allModels.length === 0 && kindFilter && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
          const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
          if (supports) {
            allModels = [{ id: providerId, name: providerInfo.name, value: alias }];
          }
        }

        if (allModels.length > 0) {
          groups[providerId] = {
            name: providerInfo.name,
            alias: alias,
            color: providerInfo.color,
            models: allModels,
          };
        }
      }
    });

    Object.entries(groups).forEach(([providerId, group]) => {
      const aliasKey = getProviderAlias(providerId);
      const disabledIds = new Set([
        ...(disabledModels[aliasKey] || []),
        ...(disabledModels[providerId] || []),
      ]);
      if (disabledIds.size === 0) return;
      group.models = group.models.filter((m) => !disabledIds.has(m.id));
      if (group.models.length === 0) delete groups[providerId];
    });

    return groups;
  }, [filteredActiveProviders, modelAliases, allProviders, providerNodes, customModels, disabledModels, kindFilter, effectiveConnections, deactivatedProviderIds, cursorModels, clineModels, clinepassModels, zedModels]);

  // Parse search query into structured query (regex, positive tokens, negative tokens)
  const parsedQuery = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  const filteredCombos = useMemo(() => {
    if (kindFilter || capFilter) return [];
    if (parsedQuery.isEmpty) return combos;
    return combos.filter(c => matchesSearch(c.name, parsedQuery));
  }, [combos, parsedQuery, kindFilter, capFilter]);

  const sortModels = (models) => {
    const added = models.filter(m => addedModelValues.includes(m.value)).sort((a, b) => a.name.localeCompare(b.name));
    const rest = models.filter(m => !addedModelValues.includes(m.value)).sort((a, b) => a.name.localeCompare(b.name));
    return [...added, ...rest];
  };

  const filteredGroups = useMemo(() => {
    const filtered = {};
    Object.entries(groupedModels).forEach(([providerId, group]) => {
      let models = group.models;
      if (capFilter) {
        models = models.filter((m) => getCaps(m.value)?.[capFilter] === true);
        if (models.length === 0) return;
      }
      if (!parsedQuery.isEmpty) {
        const providerNameMatches = matchesSearch(group.name, parsedQuery);
        const aliasMatches = allowProviderWildcard && (
          (group.alias && matchesSearch(group.alias, parsedQuery)) ||
          (providerId && matchesSearch(providerId, parsedQuery)) ||
          matchesSearch(`${group.alias}/*`, parsedQuery)
        );

        models = models.filter((m) => {
          if (matchesSearch(m, parsedQuery)) return true;
          // If provider or alias matches, but model doesn't violate negative exclusion terms
          if (providerNameMatches || aliasMatches) {
            if (parsedQuery.negativeTerms.length > 0) {
              return matchesSearch(m, { ...parsedQuery, positiveTerms: [] });
            }
            return true;
          }
          return false;
        });

        if (models.length === 0) return;
      }
      filtered[providerId] = {
        ...group,
        models: sortModels(models),
      };
    });

    return filtered;
  }, [groupedModels, parsedQuery, addedModelValues, allowProviderWildcard]);

  // Visible models available for batch actions (excluding placeholders)
  const visibleModels = useMemo(() => {
    const list = [];
    Object.values(filteredGroups).forEach((group) => {
      group.models.forEach((m) => {
        if (!m.isPlaceholder) {
          list.push(m);
        }
      });
    });
    return list;
  }, [filteredGroups]);

  const visibleUnadded = useMemo(() => {
    return visibleModels.filter((m) => !addedModelValues.includes(m.value));
  }, [visibleModels, addedModelValues]);

  const visibleAdded = useMemo(() => {
    return visibleModels.filter((m) => addedModelValues.includes(m.value));
  }, [visibleModels, addedModelValues]);

  const handleSelectAllVisible = () => {
    if (visibleUnadded.length === 0) return;
    if (onSelectBatch) {
      onSelectBatch(visibleUnadded);
    } else {
      visibleUnadded.forEach((model) => onSelect(model));
    }
  };

  const handleDeselectAllVisible = () => {
    if (visibleAdded.length === 0) return;
    if (onDeselectBatch) {
      onDeselectBatch(visibleAdded);
    } else if (onDeselect) {
      visibleAdded.forEach((model) => onDeselect(model));
    }
  };

  const handleSelect = (model) => {
    const value = model?.value || model?.name || model;
    const isAdded = addedModelValues.includes(value);

    if (isAdded && onDeselect) {
      onDeselect(model);
    } else {
      onSelect(model);
    }

    if (closeOnSelect) {
      onClose();
      setSearchQuery("");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setSearchQuery("");
      }}
      title={title}
      size={size}
      className="p-4!"
      footer={null}
    >
      {/* Info bar */}
      <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-primary/8 border border-primary/20 rounded-lg text-xs text-text-muted">
        <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: "14px" }}>info</span>
        <span>
          {allowProviderWildcard
            ? "Click to add/remove a model, or click a provider name for wildcard (e.g. provider/*). Search supports exclusions (e.g. claude -haiku) and RegEx (/pattern/)."
            : "Click to add, click again to remove. Search supports exclusions (e.g. claude -haiku) and RegEx (/pattern/)."}
        </span>
      </div>

      {/* Search & batch actions */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
            search
          </span>
          <input
            type="text"
            placeholder={
              allowProviderWildcard
                ? "Search models (e.g. claude -haiku, oc/*, /regex/)..."
                : "Search models (e.g. claude -haiku, !embed, /regex/)..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-20 py-1.5 bg-surface border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {parsedQuery.isRegex && (
              <span className="text-[10px] px-1 py-0.2 rounded bg-primary/10 text-primary font-mono font-medium">
                regex
              </span>
            )}
            {parsedQuery.negativeTerms.length > 0 && !parsedQuery.isRegex && (
              <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-mono font-medium">
                !exclude
              </span>
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-text-muted hover:text-text-main cursor-pointer p-0.5 rounded"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">close</span>
              </button>
            )}
          </div>
        </div>

        {!closeOnSelect && visibleModels.length > 0 && (
          <div className="flex items-center justify-between px-1 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span>{visibleModels.length} models</span>
              {addedModelValues.length > 0 && (
                <span className="text-primary font-medium">({addedModelValues.length} selected)</span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {visibleUnadded.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  title="Select all filtered models"
                >
                  Select All ({visibleUnadded.length})
                </button>
              )}
              {visibleAdded.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAllVisible}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-border/40 text-text-muted hover:text-text-main hover:bg-border/60 transition-colors cursor-pointer"
                  title="Deselect all filtered models"
                >
                  Deselect All ({visibleAdded.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Models grouped by provider - compact */}
      <div className="max-h-[400px] overflow-y-auto space-y-3">
        {/* Combos section - always first */}
        {filteredCombos.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-0.5">
              <span className="material-symbols-outlined text-primary text-[14px]">layers</span>
              <span className="text-xs font-medium text-primary">Combos</span>
              <span className="text-[10px] text-text-muted">({filteredCombos.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredCombos.map((combo) => {
                const isSelected = selectedModel === combo.name;
                return (
                  <button
                    key={combo.id}
                    onClick={() => handleSelect({ id: combo.name, name: combo.name, value: combo.name })}
                    className={`
                      px-2 py-1 rounded-xl text-xs font-medium transition-all border hover:cursor-pointer flex items-center gap-1
                      ${isSelected
                        ? "bg-primary text-white border-primary"
                        : addedModelValues.includes(combo.name)
                          ? "bg-primary border-primary text-white hover:bg-primary-hover"
                          : "bg-surface border-border text-text-main hover:border-primary/50 hover:bg-primary/5"
                      }
                    `}
                  >
                    {addedModelValues.includes(combo.name) && (
                      <span className="material-symbols-outlined leading-none" style={{ fontSize: "10px" }}>check</span>
                    )}
                    {combo.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Provider models */}
        {Object.entries(filteredGroups).map(([providerId, group]) => {
          const wildcardValue = `${group.alias || providerId}/*`;
          const isWildcardAdded = allowProviderWildcard && addedModelValues.includes(wildcardValue);

          return (
            <div key={providerId}>
              {/* Provider header */}
              <div className="flex items-center gap-1.5 mb-1.5 sticky top-0 bg-surface py-0.5 z-10">
                <ProviderIcon
                  src={`/providers/${providerId}.png`}
                  alt={group.name}
                  size={14}
                  fallbackText={(group.name || providerId).slice(0, 2).toUpperCase()}
                  fallbackColor={group.color}
                />
                {allowProviderWildcard ? (
                  <button
                    type="button"
                    onClick={() => handleSelect({ value: wildcardValue, name: wildcardValue })}
                    title={isWildcardAdded ? `Click to remove wildcard ${wildcardValue}` : `Click to allow all models from ${group.name} (${wildcardValue})`}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${
                      isWildcardAdded
                        ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-[1.5px_1.5px_0px_var(--color-border)]"
                        : "text-primary border-transparent hover:bg-primary/10 hover:border-primary/20"
                    }`}
                  >
                    {isWildcardAdded && (
                      <span className="material-symbols-outlined leading-none text-[12px]">check</span>
                    )}
                    <span>{group.name}</span>
                    <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${isWildcardAdded ? "bg-white/20 text-white" : "text-text-muted bg-surface-2 border border-border"}`}>
                      {wildcardValue}
                    </span>
                  </button>
                ) : (
                  <span className="text-xs font-medium text-primary">
                    {group.name}
                  </span>
                )}
                <span className="text-[10px] text-text-muted">
                  ({group.models.length})
                </span>
              </div>

            <div className="flex flex-wrap gap-1.5">
              {group.models.map((model) => {
                const isSelected = selectedModel === model.value;
                const isPlaceholder = model.isPlaceholder;
                const isDeprecated = !!model.deprecated;
                return (
                  <button
                    key={model.value}
                    onClick={() => handleSelect(model)}
                    title={
                      isPlaceholder ? "Select to pre-fill, then edit model ID in the input"
                      : isDeprecated ? `Retiring ${model.deprecationDate || "soon"} — migrate to a newer model`
                      : undefined
                    }
                    className={`
                      px-2 py-1 rounded-xl text-xs font-medium transition-all border hover:cursor-pointer
                      ${isPlaceholder
                        ? "border-dashed border-border text-text-muted hover:border-primary/50 hover:text-primary bg-surface italic"
                        : isSelected
                          ? "bg-primary text-white border-primary"
                          : addedModelValues.includes(model.value)
                            ? "bg-primary border-primary text-white hover:bg-primary-hover"
                            : isDeprecated
                              ? "bg-surface border-amber-400/60 text-text-muted hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                              : "bg-surface border-border text-text-main hover:border-primary/50 hover:bg-primary/5"
                      }
                    `}
                  >
                    <span className="flex items-center gap-1">
                      {addedModelValues.includes(model.value) && !isPlaceholder && (
                        <span className="material-symbols-outlined leading-none" style={{ fontSize: "10px" }}>check</span>
                      )}
                      {isPlaceholder ? (
                        <>
                          <span className="material-symbols-outlined text-[11px]">edit</span>
                          <span className="font-mono">{model.name}</span>
                        </>
                      ) : model.isCustom ? (
                        <>
                          <span className="font-mono">{model.name}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 font-bold border border-amber-500/30">
                            custom
                          </span>
                          <CapacityBadges caps={getCaps(model.value)} />
                        </>
                      ) : isDeprecated ? (
                        <>
                          <span className="font-mono">{model.name}</span>
                          <span className="text-[9px] px-1 rounded bg-amber-400/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-400/40">
                            retiring
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-mono">{model.name}</span>
                          <CapacityBadges caps={getCaps(model.value)} />
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
          );
        })}

        {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 && (
          <div className="text-center py-4 text-text-muted">
            <span className="material-symbols-outlined text-2xl mb-1 block">
              search_off
            </span>
            <p className="text-xs">No models found</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

ModelSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onDeselect: PropTypes.func,
  onSelectBatch: PropTypes.func,
  onDeselectBatch: PropTypes.func,
  selectedModel: PropTypes.string,
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    })
  ),
  title: PropTypes.string,
  size: PropTypes.string,
  modelAliases: PropTypes.object,
  kindFilter: PropTypes.string,
  addedModelValues: PropTypes.arrayOf(PropTypes.string),
  closeOnSelect: PropTypes.bool,
  allowProviderWildcard: PropTypes.bool,
};
