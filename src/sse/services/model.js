import { getModelAliases, getCustomModels, getModelNames, getComboByName, getProviderNodes, getSettings } from "@/lib/localDb";
import { parseModel as parseModelCore, resolveModelAliasFromMap, getModelInfoCore } from "open-sse/services/model.js";
import REGISTRY from "open-sse/providers/registry/index.js";

const LOCAL_PROVIDER_ALIASES = {
  xmtp: "xiaomi-tokenplan",
  "xiaomi-tokenplan": "xiaomi-tokenplan",
};

const RESERVED_PROVIDER_PREFIXES = new Set(Object.keys(LOCAL_PROVIDER_ALIASES));
for (const entry of REGISTRY) {
  RESERVED_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) RESERVED_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) RESERVED_PROVIDER_PREFIXES.add(alias);
}

export function parseModel(modelStr) {
  const parsed = parseModelCore(modelStr);
  if (parsed?.providerAlias && LOCAL_PROVIDER_ALIASES[parsed.providerAlias]) {
    return { ...parsed, provider: LOCAL_PROVIDER_ALIASES[parsed.providerAlias] };
  }
  return parsed;
}

export async function resolveModelAlias(alias) {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

export async function getModelInfo(modelStr) {
  const parsed = parseModel(modelStr);

  try {
    const aliases = await getModelAliases();
    const customModels = await getCustomModels();
    const modelNames = await getModelNames();
    const requestedProvider = parsed.providerAlias || "";
    const requestedModel = String(parsed.model || "");
    const aliasedTarget = aliases[requestedModel];
    if (parsed.isAlias && aliasedTarget) {
      return getModelInfoCore(requestedModel, aliases);
    }
    const fullAliasTarget = Object.values(aliases).find((value) =>
      value === `${requestedProvider}/${requestedModel}`
    );
    if (fullAliasTarget) return getModelInfoCore(Object.keys(aliases).find((key) => aliases[key] === fullAliasTarget), aliases);
    const custom = customModels.find((entry) => {
      if (!entry?.providerAlias || !entry?.id) return false;
      if (entry.providerAlias !== requestedProvider && entry.providerAlias !== parsed.provider) return false;
      return entry.name === requestedModel;
    });
    if (custom) return { provider: custom.providerAlias, model: custom.id };
    const namedModel = Object.entries(modelNames).find(([key, name]) => {
      const slash = key.indexOf("/");
      return slash > 0 && key.slice(0, slash) === requestedProvider && name === requestedModel;
    });
    if (namedModel) {
      return { provider: requestedProvider, model: namedModel[0].slice(requestedProvider.length + 1) };
    }
  } catch (e) {
    console.log("getModelInfo: failed to resolve custom model name:", e);
  }

  if (!parsed.isAlias) {
    try {
      const settings = await getSettings();
      const prefixes = settings.providerPrefixes || {};
      const overriddenProvider = Object.keys(prefixes).find(
        (k) => prefixes[k] === parsed.providerAlias,
      );
      if (overriddenProvider) {
        return { provider: overriddenProvider, model: parsed.model };
      }
    } catch (e) {
      console.log("getModelInfo: failed to read provider prefixes:", e);
    }
    if (!RESERVED_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
      const matchedOpenAI = openaiNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedOpenAI) {
        return { provider: matchedOpenAI.id, model: parsed.model };
      }

      const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
      const matchedAnthropic = anthropicNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedAnthropic) {
        return { provider: matchedAnthropic.id, model: parsed.model };
      }

      const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
      const matchedEmbedding = embeddingNodes.find((node) => node.prefix === parsed.providerAlias);
      if (matchedEmbedding) {
        return { provider: matchedEmbedding.id, model: parsed.model };
      }
    }
    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  const combo = await getComboByName(parsed.model);
  if (combo) {
    return { provider: null, model: parsed.model };
  }

  return getModelInfoCore(modelStr, getModelAliases);
}

export async function getComboModels(modelStr) {
  if (modelStr.includes("/")) return null;

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}
