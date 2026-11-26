import { getProviderConnections, getSettings } from "@/lib/localDb";
import { getProviderNodes } from "@/lib/db/repos/nodesRepo.js";
import { getAdapter } from "@/lib/db/driver.js";
import { getPricing } from "@/lib/db/repos/pricingRepo.js";
import { getModelTestResults } from "@/lib/db/repos/modelTestRepo.js";
import { AI_PROVIDERS, getProviderAlias } from "@/shared/constants/providers";
import { PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { getPricingForModel as resolvePricing } from "open-sse/providers/pricing.js";
import { buildModelsList } from "@/app/api/v1/models/route";

export const dynamic = "force-dynamic";

const TELEMETRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DETAIL_SAMPLE_LIMIT = 2000;
const KIND_CAPABILITIES = {
  image: { imageOutput: true },
  imageToText: { vision: true },
  tts: { audioOutput: true },
  stt: { audioInput: true },
  embedding: { tools: false },
};

function modelParts(modelId) {
  const value = String(modelId || "");
  const slash = value.indexOf("/");
  return slash > 0
    ? { alias: value.slice(0, slash), model: value.slice(slash + 1) }
    : { alias: "", model: value };
}

function emptyTelemetry() {
  return {
    total: 0,
    success: 0,
    durationTotal: 0,
    durationSamples: 0,
    durationOutput: 0,
    detailDuration: 0,
    detailSamples: 0,
    detailOutput: 0,
  };
}
function telemetryEntry(map, provider, model) {
  if (!provider || !model) return null;
  const key = `${provider}|${model}`;
  if (!map.has(key)) map.set(key, emptyTelemetry());
  return map.get(key);
}

async function loadTelemetry() {
  const map = new Map();
  try {
    const db = await getAdapter();
    const since = new Date(Date.now() - TELEMETRY_WINDOW_MS).toISOString();

    const usageRows = db.all(
      `SELECT provider, model,
        COUNT(*) AS total,
        SUM(CASE WHEN status NOT LIKE 'FAILED%' THEN 1 ELSE 0 END) AS success
       FROM usageHistory
       WHERE timestamp >= ? AND status <> 'PENDING'
       GROUP BY provider, model`,
      [since],
    );
    for (const row of usageRows || []) {
      const entry = telemetryEntry(map, row.provider, row.model);
      if (!entry) continue;
      entry.total += Number(row.total) || 0;
      entry.success += Number(row.success) || 0;
      const raw = modelParts(row.model).model;
      if (raw !== row.model) {
        const rawEntry = telemetryEntry(map, row.provider, raw);
        if (rawEntry) {
          rawEntry.total += Number(row.total) || 0;
          rawEntry.success += Number(row.success) || 0;
        }
      }
    }

    // The logger writes a PENDING row when a chat request starts and a terminal
    // row with token usage when it finishes. Their timestamp delta is the real
    // request duration, which lets us report latency and throughput for models
    // that have served traffic even though the legacy `duration` column is 0.
    const lifecycleRows = db.all(
      `SELECT id, timestamp, provider, model, status, completionTokens
       FROM usageHistory
       WHERE timestamp >= ? AND (status = 'PENDING' OR completionTokens > 0)
       ORDER BY id ASC`,
      [since],
    );
    const pendingStart = new Map();
    for (const row of lifecycleRows || []) {
      const requestId = Number.isFinite(Number(row.id)) ? Number(row.id) : row.id;
      const key = `${row.provider}|${row.model}|${requestId}`;
      if (row.status === "PENDING") {
        pendingStart.set(key, row.timestamp);
        continue;
      }
      const startedAt = pendingStart.get(key);
      if (!startedAt) continue;
      pendingStart.delete(key);
      const duration = Date.parse(row.timestamp) - Date.parse(startedAt);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 10 * 60 * 1000) continue;
      const output = Number(row.completionTokens) || 0;
      const entry = telemetryEntry(map, row.provider, row.model);
      if (!entry) continue;
      entry.durationTotal += duration;
      entry.durationSamples += 1;
      entry.durationOutput += output;
      const raw = modelParts(row.model).model;
      if (raw !== row.model) {
        const rawEntry = telemetryEntry(map, row.provider, raw);
        if (rawEntry) {
          rawEntry.durationTotal += duration;
          rawEntry.durationSamples += 1;
          rawEntry.durationOutput += output;
        }
      }
    }

    const detailRows = db.all(
      `SELECT provider, model, data FROM requestDetails
       WHERE timestamp >= ? AND status <> 'error'
       ORDER BY timestamp DESC LIMIT ?`,
      [since, DETAIL_SAMPLE_LIMIT],
    );
    for (const row of detailRows || []) {
      let data = {};
      try {
        data = typeof row.data === "string" ? JSON.parse(row.data) : row.data || {};
      } catch {
        continue;
      }
      const total = Number(data?.latency?.total);
      const output = Number(data?.tokens?.completion_tokens ?? data?.tokens?.output_tokens) || 0;
      if (!Number.isFinite(total) || total <= 0) continue;
      const entry = telemetryEntry(map, row.provider, row.model);
      if (!entry) continue;
      entry.detailDuration += total;
      entry.detailSamples += 1;
      entry.detailOutput += output;
      const raw = modelParts(row.model).model;
      if (raw !== row.model) {
        const rawEntry = telemetryEntry(map, row.provider, raw);
        if (rawEntry) {
          rawEntry.detailDuration += total;
          rawEntry.detailSamples += 1;
          rawEntry.detailOutput += output;
        }
      }
    }
  } catch (error) {
    console.error("Could not load public model telemetry:", error);
  }
  return map;
}

function telemetryFor(map, model) {
  const alias = modelParts(model.id).alias;
  const raw = modelParts(model.id).model;
  const keys = [
    `${model.provider.id}|${model.id}`,
    `${model.provider.id}|${raw}`,
    alias ? `${alias}|${model.id}` : null,
    alias ? `${alias}|${raw}` : null,
  ].filter(Boolean);
  for (const key of keys) {
    const entry = map.get(key);
    if (entry) return entry;
  }
  return null;
}

function normalizePricing(pricing) {
  if (!pricing || typeof pricing !== "object") return null;
  const fields = ["input", "output", "cached"];
  const normalized = {};
  for (const field of fields) {
    const value = pricing[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      normalized[field] = value;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export async function GET() {
  try {
    const [connections, settings, nodes, telemetry, pricingTable, testResults] = await Promise.all([
      getProviderConnections({ isActive: true }),
      getSettings(),
      getProviderNodes(),
      loadTelemetry(),
      getPricing().catch(() => ({})),
      getModelTestResults().catch(() => ({})),
    ]);
    const providerPrefixes = settings?.providerPrefixes || {};
    const nodePrefixes = new Map(
      nodes.filter((node) => node?.id && node?.prefix)
        .map((node) => [node.id, String(node.prefix).trim()]),
    );
    const nodeNames = new Map(
      nodes.filter((node) => node?.id && node?.name)
        .map((node) => [node.id, String(node.name).trim()]),
    );
    const activeProviders = new Map();
    const activeAliases = new Set();
    const providerByAlias = new Map();

    for (const connection of connections) {
      const providerId = connection?.provider;
      if (!providerId) continue;

      const staticAlias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
      const alias = String(connection.providerSpecificData?.customAlias
        || nodePrefixes.get(providerId)
        || connection.providerSpecificData?.prefix
        || providerPrefixes[providerId]
        || getProviderAlias(providerId)
        || staticAlias).trim();
      const provider = AI_PROVIDERS[providerId];
      if (!activeProviders.has(providerId)) {
        activeProviders.set(providerId, {
          id: providerId,
          name: nodeNames.get(providerId) || provider?.name || alias,
          alias,
        });
      }
      activeAliases.add(alias);
      providerByAlias.set(alias, providerId);
    }

    // No-auth free providers (opencode/solana/freepi) have no DB connection row.
    // They are always available, so expose them in the public model catalogue.
    for (const [providerId, provider] of Object.entries(AI_PROVIDERS || {})) {
      if (!provider?.noAuth || activeProviders.has(providerId)) continue;
      const alias = String(providerPrefixes[providerId]
        || getProviderAlias(providerId)
        || PROVIDER_ID_TO_ALIAS[providerId]
        || providerId).trim();
      activeProviders.set(providerId, { id: providerId, name: provider.name || alias, alias });
      activeAliases.add(alias);
      providerByAlias.set(alias, providerId);
    }

    const models = await buildModelsList(
      ["llm", "image", "embedding", "tts", "stt", "video", "imageToText", "music", "webSearch", "webFetch"],
      { skipDynamicFetch: true, onlyActiveConnections: true, includeKind: true },
    );

    const testsByKey = {};
    for (const result of Object.values(testResults || {})) {
      if (!result?.model || !Number.isFinite(result.latencyMs)) continue;
      const parts = modelParts(result.model);
      const provider = parts.alias;
      if (!provider) continue;
      const existing = testsByKey[`${provider}|${parts.model}`];
      if (!existing || String(result.testedAt || "") > String(existing.testedAt || "")) {
        testsByKey[`${provider}|${parts.model}`] = result;
      }
    }

    const data = models
      .filter((model) => {
        if (!activeAliases.has(model.owned_by) || model.owned_by === "combo") return false;
        return providerByAlias.has(model.owned_by);
      })
      .map((model) => {
        const provider = activeProviders.get(providerByAlias.get(model.owned_by));
        if (!provider) return null;
        const alias = modelParts(model.id).alias;
        const raw = modelParts(model.id).model;
        const pricing = normalizePricing(
          pricingTable?.[alias]?.[raw]
          || pricingTable?.[provider.id]?.[raw]
          || resolvePricing(alias, raw)
          || resolvePricing(provider.id, raw),
        );
        const entry = telemetryFor(telemetry, { ...model, provider });
        const test = testsByKey[`${provider.id}|${raw}`] || testsByKey[`${alias}|${raw}`] || null;
        const kind = model.kind || "llm";
        const resolvedCaps = { ...(KIND_CAPABILITIES[kind] || {}), ...(model.capabilities || {}) };

        const total = entry?.total || 0;
        const successRate = total > 0
          ? Math.round(((entry.success / total) * 100) * 10) / 10
          : null;

        let latencyMs = null;
        let tps = null;
        let samples = 0;
        if (entry?.detailDuration > 0) {
          latencyMs = Math.round(entry.detailDuration / entry.detailSamples);
          tps = entry.detailDuration > 0
            ? Math.round((entry.detailOutput / (entry.detailDuration / 1000)) * 10) / 10
            : null;
          samples = entry.detailSamples;
        } else if (entry?.durationSamples > 0 && entry.durationTotal > 0) {
          latencyMs = Math.round(entry.durationTotal / entry.durationSamples);
          tps = Math.round((entry.durationOutput / (entry.durationTotal / 1000)) * 10) / 10;
          samples = entry.durationSamples;
        } else if (test && Number.isFinite(test.latencyMs)) {
          latencyMs = Math.round(test.latencyMs);
          samples = 1;
          if (Number.isFinite(test.tps) && test.tps > 0) tps = Math.round(test.tps * 10) / 10;
        }

        return {
          id: model.id,
          name: model.name || model.id,
          ...(typeof model.description === "string" && model.description.trim()
            ? { description: model.description.trim() }
            : {}),
          provider,
          kind,
          capabilities: Object.fromEntries([
            "vision", "reasoning", "tools", "imageOutput", "pdf",
            "audioInput", "videoInput", "audioOutput", "search",
          ].map((key) => [key, resolvedCaps?.[key] === true])),
          ...(Number.isFinite(model.context_length) ? { contextWindow: model.context_length } : {}),
          ...(Number.isFinite(model.max_completion_tokens) ? { maxOutput: model.max_completion_tokens } : {}),
          ...(pricing ? { pricing } : {}),
        ...(total > 0 || latencyMs != null
            ? {
                stats: {
                  ...(total > 0 ? { requests: total, successRate } : {}),
                  ...(total > 0 ? { successes: entry?.success || 0 } : {}),
                  ...(latencyMs != null ? { latencyMs } : {}),
                  ...(tps != null ? { tps } : {}),
                  ...(samples > 0 ? { samples } : {}),
                  ...(test?.testedAt ? { lastTestedAt: test.testedAt } : {}),
                },
              }
            : {}),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.provider.name.localeCompare(b.provider.name) || a.name.localeCompare(b.name));

    return Response.json(
      {
        models: data,
        providers: [...activeProviders.values()]
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
    );
  } catch (error) {
    console.error("Could not load public model catalogue:", error);
    return Response.json({ error: "catalogue_unavailable" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
