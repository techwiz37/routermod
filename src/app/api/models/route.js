import { NextResponse } from "next/server";
import { getModelAliases, setModelAlias, getCustomModels } from "@/models";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { getProviderConnections } from "@/lib/db/repos/connectionsRepo";
import { getProviderNodes } from "@/lib/db/repos/nodesRepo";
import { getSettings, getModelNames } from "@/lib/localDb";
import { AI_MODELS } from "@/shared/constants/config";
import { getLiveOpenCodeFreeModels } from "@/lib/network/opencodeCatalog";
import { getProviderAlias, ALIAS_TO_ID, FREE_PROVIDERS } from "@/shared/constants/providers";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const providerFilter = searchParams.get("provider") || null;

    const modelAliases = await getModelAliases();
    const modelNames = await getModelNames();
    const settings = await getSettings();
    const prefixOverrides = settings?.providerPrefixes || {};
    const disabled = await getDisabledModels();
    const storedCustomModels = await getCustomModels();
    const capsByFull = new Map(storedCustomModels.map((model) => [`${model.providerAlias}/${model.id}`, model.caps]));
    const providerNodes = await getProviderNodes();
    const nodePrefixById = new Map(
      providerNodes
        .filter((node) => node?.id && node?.prefix)
        .map((node) => [node.id, String(node.prefix).trim()]),
    );

    // modelAliases maps a public alias (key) to a canonical target (value).
    // Build the reverse map so the dashboard can show exactly the identifier a
    // client must send, e.g. `xro/agnes-2.5-flash` instead of the internal
    // provider alias `agnes/agnes-2.5-flash`.
    const aliasByTarget = new Map();
    for (const [alias, target] of Object.entries(modelAliases || {})) {
      if (typeof target !== "string" || !target || typeof alias !== "string") continue;
      if (!aliasByTarget.has(target)) aliasByTarget.set(target, alias);
    }

    const publicPrefixFor = (providerId) => {
      const raw = String(providerId || "");
      // Static OpenCode Free entries are stored under the short alias `oc`,
      // while the user's custom prefix is saved under the canonical id
      // `opencode`. Check both so a custom prefix is actually reflected.
      const id = ALIAS_TO_ID[raw] || raw;
      const nodePrefix = nodePrefixById.get(id) || nodePrefixById.get(raw);
      if (nodePrefix) return nodePrefix;
      const override = prefixOverrides?.[raw] || prefixOverrides?.[id];
      if (override && String(override).trim()) return String(override).trim();
      return getProviderAlias(id) || id;
    };

    const publicModelIdFor = (providerId, modelId) => {
      const prefix = publicPrefixFor(providerId);
      const targets = [
        `${providerId}/${modelId}`,
        `${getProviderAlias(providerId) || providerId}/${modelId}`,
      ];
      for (const target of targets) {
        const aliasKey = aliasByTarget.get(target);
        // Only reuse an alias whose namespace matches the provider's current
        // prefix. Other aliases may intentionally point at this model from a
        // different namespace and must not rename the provider's own entry.
        if (aliasKey && aliasKey.startsWith(`${prefix}/`)) return aliasKey;
      }
      return `${prefix}/${modelId}`;
    };

    let activeAliasSet = null;
    if (activeOnly) {
      const conns = await getProviderConnections({ isActive: true });
      const now = Date.now();
      activeAliasSet = new Set();
      for (const c of conns) {
        // Mirror dashboard effectiveStatus:
        // "unavailable" + active future modelLock  → still in cooldown     → skip
        // "unavailable" + no future modelLock       → cooldown expired, treat as active → include
        // "error"                                   → permanent failure     → skip
        if (c.testStatus === "error") continue;
        if (c.testStatus === "unavailable") {
          const hasFutureLock = Object.entries(c).some(([k, v]) =>
            k.startsWith("modelLock_") && v && new Date(v).getTime() > now
          );
          if (hasFutureLock) continue; // still in rate-limit cooldown → exclude
          // expired cooldown → include (same as dashboard "active")
        }
        activeAliasSet.add(c.provider);
        const alias = getProviderAlias(c.provider);
        if (alias) activeAliasSet.add(alias);
      }
      // No-auth free providers (OpenCode Free) have no connection rows, so the
      // loop above would hide them. They are always active and must stay
      // selectable in the API-key "Restrict models" picker.
      for (const [id, provider] of Object.entries(FREE_PROVIDERS || {})) {
        if (!provider?.noAuth) continue;
        activeAliasSet.add(id);
        const alias = provider.alias || getProviderAlias(id);
        if (alias) activeAliasSet.add(alias);
      }
    }

    // OpenCode Free follows the live CLI catalogue: models added/removed
    // upstream appear/disappear here too. Cached in-process for 10 minutes.
    let catalogModels = AI_MODELS;
    if (!activeAliasSet || activeAliasSet.has("oc") || activeAliasSet.has("opencode")) {
      const live = await getLiveOpenCodeFreeModels();
      if (live?.length) {
        const liveIds = new Set(live.map((m) => m.id));
        catalogModels = catalogModels.filter((m) => m.provider !== "oc" || liveIds.has(m.model));
        const existing = new Set(AI_MODELS.filter((m) => m.provider === "oc").map((m) => m.model));
        const extra = live
          .filter((m) => !existing.has(m.id))
          .map((m) => ({ provider: "oc", model: m.id, name: m.name }));
        catalogModels = [...catalogModels, ...extra];
      }
    }

    const models = catalogModels
      .filter((m) => {
        if (activeAliasSet && !activeAliasSet.has(m.provider)) return false;
        if (providerFilter && m.provider !== providerFilter && getProviderAlias(m.provider) !== providerFilter) return false;
        const alias = getProviderAlias(m.provider) || m.provider;
        const list = disabled[alias] || disabled[m.provider] || [];
        return !list.includes(m.model);
      })
      .map((m) => {
        const providerId = m.provider;
        const providerAlias = getProviderAlias(providerId) || providerId;
        const fullModel = `${providerAlias}/${m.model}`;
        const publicId = publicModelIdFor(providerId, m.model);
        const providerPrefix = publicPrefixFor(providerId);
        const customName = modelNames[`${providerId}/${m.model}`] || modelNames[fullModel] || null;
        const c = getCapabilitiesForModel(ALIAS_TO_ID[providerId] || providerId, m.model);
        const capsOverride = capsByFull.get(fullModel) || capsByFull.get(`${providerId}/${m.model}`);
        return {
          ...m,
          provider: providerId,
          providerPrefix,
          model: m.model,
          name: customName || m.name,
          // Display label shown in the dashboard. Uses the user's custom model
          // name (e.g. `xro/claude-sonnet-5.5`) while `publicId`/`fullModel`
          // remain the canonical, routable identifiers.
          displayId: `${providerPrefix}/${customName || m.model}`,
          publicId,
          fullModel,
          routedModel: publicId,
          alias: modelAliases[fullModel] || m.model,
          caps: {
            vision: c.vision,
            search: c.search,
            reasoning: c.reasoning,
            contextWindow: c.contextWindow,
            maxOutput: c.maxOutput,
            ...capsOverride,
          },
        };
      });

    const seenFull = new Set(models.map((m) => m.fullModel));
    const seenPublic = new Set(models.map((m) => m.publicId));
    const customModels = storedCustomModels.filter((m) => {
      if (!m?.id || (m.kind || m.type || "llm") !== "llm") return false;
      if (activeAliasSet && !activeAliasSet.has(m.providerAlias)) return false;
      if (seenFull.has(`${m.providerAlias}/${m.id}`)) return false;
      return !seenPublic.has(publicModelIdFor(m.providerAlias, m.id));
    });
    for (const m of customModels) {
      // `id` is the canonical custom model identifier from customModels DB.
      // `name` is display-only. `provider` stays the internal provider/node id
      // for grouping, while `publicId` is the routable identifier clients use.
      const providerPrefix = publicPrefixFor(m.providerAlias);
      const fullModel = `${m.providerAlias}/${m.id}`;
      // For registered custom models, `name` is the public/custom model ID
      // shown to clients. `id` remains the upstream routing target.
      const customPublicId = `${providerPrefix}/${m.name || m.id}`;
      const publicId = customPublicId;
      const providerId = ALIAS_TO_ID[m.providerAlias] || m.providerAlias;
      const customName = modelNames[fullModel] || null;
      const c = getCapabilitiesForModel(providerId, m.id);
      models.push({
        provider: m.providerAlias,
        providerPrefix,
        model: m.id,
        name: customName || m.name || m.id,
        displayId: customPublicId,
        fullModel,
        routedModel: publicId,
        publicId,
        customId: m.id,
        isCustom: true,
        alias: modelAliases[fullModel] || m.id,
        caps: {
          vision: c.vision,
          search: c.search,
          reasoning: c.reasoning,
          contextWindow: c.contextWindow,
          maxOutput: c.maxOutput,
          ...(m.caps || {}),
        },
      });
    }

    // `/v1/models` deliberately keeps every public alias of one upstream
    // target as a separate selectable model id. Mirror that contract here:
    // `bc/gpt-6.1-sol` and `dps/deepseek-v4-pro` may both point at the same
    // original `gpt-6.1-sol`, but both must appear in the picker (and in the
    // API-key allow-list), not just the first alias for that target.
    const targetToModel = new Map();
    for (const m of models) {
      const providerAlias = getProviderAlias(m.provider) || m.provider;
      const targets = [m.fullModel, `${m.provider}/${m.model}`, `${providerAlias}/${m.model}`];
      for (const target of targets) {
        if (!targetToModel.has(target)) targetToModel.set(target, m);
      }
    }
    const knownPublicIds = new Set(models.map((m) => m.publicId));
    for (const [alias, target] of Object.entries(modelAliases || {})) {
      if (typeof target !== "string" || !target || knownPublicIds.has(alias)) continue;
      const base = targetToModel.get(target);
      if (!base) continue;
      knownPublicIds.add(alias);
      models.push({
        ...base,
        publicId: alias,
        displayId: alias,
        routedModel: alias,
        name: modelNames[alias] || alias,
        alias,
        isAlias: true,
        customId: base.customId || base.model,
      });
    }

    return NextResponse.json(
      { models },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    console.log("Error fetching models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    const modelAliases = await getModelAliases();

    const existingModel = Object.entries(modelAliases).find(
      ([key, val]) => val === alias && key !== model
    );

    if (existingModel) {
      return NextResponse.json({ error: "Alias already in use" }, { status: 400 });
    }

    await setModelAlias(model, alias);

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}
