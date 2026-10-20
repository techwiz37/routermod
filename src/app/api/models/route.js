import { NextResponse } from "next/server";
import { getModelAliases, setModelAlias, getCustomModels } from "@/models";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { getProviderConnections } from "@/lib/db/repos/connectionsRepo";
import { AI_MODELS } from "@/shared/constants/config";
import { getProviderAlias, ALIAS_TO_ID } from "@/shared/constants/providers";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const providerFilter = searchParams.get("provider") || null;

    const modelAliases = await getModelAliases();
    const disabled = await getDisabledModels();

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
    }

    const models = AI_MODELS
      .filter((m) => {
        if (activeAliasSet && !activeAliasSet.has(m.provider)) return false;
        if (providerFilter && m.provider !== providerFilter && getProviderAlias(m.provider) !== providerFilter) return false;
        const alias = getProviderAlias(m.provider) || m.provider;
        const list = disabled[alias] || disabled[m.provider] || [];
        return !list.includes(m.model);
      })
      .map((m) => {
        const fullModel = `${m.provider}/${m.model}`;
        const providerAlias = getProviderAlias(m.provider) || m.provider;
        const routedModel = `${providerAlias}/${m.model}`;
        const c = getCapabilitiesForModel(m.provider, m.model);
        return {
          ...m,
          fullModel,
          routedModel,
          alias: modelAliases[fullModel] || m.model,
          caps: {
            vision: c.vision,
            search: c.search,
            reasoning: c.reasoning,
            contextWindow: c.contextWindow,
            maxOutput: c.maxOutput,
          },
        };
      });

    const seenFull = new Set(models.map((m) => m.fullModel));
    const seenRouted = new Set(models.map((m) => m.routedModel));
    const customModels = (await getCustomModels()).filter((m) => {
      if (!m?.id || (m.kind || m.type || "llm") !== "llm") return false;
      if (activeAliasSet && !activeAliasSet.has(m.providerAlias)) return false;
      if (seenRouted.has(`${m.providerAlias}/${m.id}`)) return false;
      return !seenFull.has(`${m.providerAlias}/${m.id}`);
    });
    for (const m of customModels) {
      const fullModel = `${m.providerAlias}/${m.id}`;
      const providerId = ALIAS_TO_ID[m.providerAlias] || m.providerAlias;
      const c = getCapabilitiesForModel(providerId, m.id);
      models.push({
        provider: m.providerAlias,
        model: m.id,
        name: m.name || m.id,
        fullModel,
        routedModel: fullModel,
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

    return NextResponse.json({ models });
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
