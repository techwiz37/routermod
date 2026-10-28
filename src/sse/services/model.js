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
    if (fullAliasTarget) {
      // `fullAliasTarget` is the canonical target, e.g. `agnes/agnes-2.5-flash`.
      // Parse that value directly: passing the alias KEY (`xro/...`) back into
      // getModelInfoCore would be treated as a provider and route to `xro`,
      // which has no credentials.
      const target = parseModelCore(fullAliasTarget);
      if (target?.provider && target?.model) {
        return { provider: target.provider, model: target.model };
      }
    }
    const providerNodes = await getProviderNodes();
    const settings = await getSettings();
    const prefixes = settings?.providerPrefixes || {};
    const publicPrefixToProvider = new Map();
    for (const [providerId, prefix] of Object.entries(prefixes)) {
      if (prefix) publicPrefixToProvider.set(String(prefix), providerId);
    }
    for (const node of providerNodes) {
      if (node?.id && node?.prefix) publicPrefixToProvider.set(String(node.prefix), node.id);
    }
    const custom = customModels.find((entry) => {
      if (!entry?.providerAlias || !entry?.id) return false;
      const node = providerNodes.find((candidate) => candidate.id === entry.providerAlias);
      const publicProvider = node?.prefix || entry.providerAlias;
      if (
        entry.providerAlias !== requestedProvider
        && entry.providerAlias !== parsed.provider
        && publicProvider !== requestedProvider
      ) return false;
      // Custom ids are the canonical request identifiers.  Keep the name
      // lookup as a backwards-compatible convenience for older clients.
      return entry.id === requestedModel || entry.name === requestedModel;
    });
    if (custom) return { provider: custom.providerAlias, model: custom.id };
    // Custom display names are accepted as identifiers too (for example
    // `xro/claude-sonnet-5.5` where `agnes/agnes-2.5-flash` is the real model).
    // Match the name against the provider that owns the requested public prefix.
    const requestedCanonicalProvider = publicPrefixToProvider.get(requestedProvider) || requestedProvider;
    const namedModel = Object.entries(modelNames).find(([key, name]) => {
      const slash = key.indexOf("/");
      if (slash <= 0 || name !== requestedModel) return false;
      const keyProvider = key.slice(0, slash);
      if (keyProvider === requestedProvider) return true;
      return (publicPrefixToProvider.get(keyProvider) || keyProvider) === requestedCanonicalProvider;
    });
    if (namedModel) {
      const slash = namedModel[0].indexOf("/");
      const keyProvider = namedModel[0].slice(0, slash);
      return {
        provider: publicPrefixToProvider.get(keyProvider) || keyProvider,
        model: namedModel[0].slice(slash + 1),
      };
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
