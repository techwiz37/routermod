import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { GET as listModels } from "@/app/api/v1/models/route";
import { GET as listPublicModels } from "@/app/api/public/models/route";
import { UPDATER_CONFIG } from "@/shared/constants/config";

import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store, private" };
const COOKIE_NAME = KEY_SESSION_COOKIE;
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 16;
// Friendly names for model namespaces that are not part of the provider
// catalogue (e.g. the realtime OpenCode Free catalogue uses the `rmod` prefix).
const PREFIX_NAMES = {
  rmod: "OpenCode Free",
  oc: "OpenCode Free",
};

function json(body, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function activeKey(key) {
  if (!key || !(await validateApiKey(key))) return null;
  const record = await getApiKeyByKey(key);
  if (!record?.isActive) return null;
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return null;
  return record;
}

/**
 * Probes every model available to this API-key session with a tiny prompt and
 * returns only the ones that actually produced a response. Called on each
 * visit/reload of the Live Models page; nothing is cached.
 */
export async function GET(request) {
  const key = request.cookies.get(COOKIE_NAME)?.value;
  const record = await activeKey(key);
  if (!record) return json({ error: "Invalid or expired key session." }, 401);

  let ids = [];
  const modelMeta = new Map();
  try {
    const headers = new Headers(request.headers);
    headers.delete("x-9r-cli-token");
    headers.set("Authorization", `Bearer ${key}`);
    const res = await listModels(new Request(new URL("/api/v1/models", request.url), { headers, signal: request.signal }));
    if (!res.ok) return json({ error: "Could not load the model catalogue." }, res.status === 403 ? 403 : 502);
    const data = await res.json();
    for (const model of data.data || []) {
      if (typeof model?.id !== "string" || !model.id) continue;
      modelMeta.set(model.id, { name: model.name || model.id, ownedBy: model.owned_by || "" });
    }
    ids = [...modelMeta.keys()].sort();
  } catch {
    return json({ error: "Could not load the model catalogue." }, 500);
  }

  // Resolve readable provider names (and a provider id for filtering) from the
  // same catalogue the public models page uses. The raw prefix (ag, che, ...)
  // is only a fallback when a model is not present in that catalogue.
  let providers = [];
  const providerByModelId = new Map();
  try {
    const res = await listPublicModels();
    if (res.ok) {
      const catalogue = await res.json();
      for (const model of catalogue.models || []) {
        if (!model?.id) continue;
        providerByModelId.set(model.id, model.provider || null);
      }
      const seen = new Map();
      for (const model of catalogue.models || []) {
        const provider = model.provider;
        if (provider?.id && !seen.has(provider.id)) seen.set(provider.id, provider);
      }
      providers = [...seen.values()];
    }
  } catch {
    // Provider metadata is optional — probing still works without it.
  }

  const startedAt = new Date().toISOString();
  const results = await mapLimit(ids, CONCURRENCY, async (id) => {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: id,
          messages: [{ role: "user", content: "Reply with OK." }],
          max_tokens: 32,
          temperature: 0,
          stream: false,
        }),
        signal: AbortSignal.any([controller.signal, request.signal].filter(Boolean)),
      });
      const raw = await res.text();
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch {}
      const content = parsed?.choices?.[0]?.message?.content ?? parsed?.choices?.[0]?.text ?? parsed?.response;
      const ok = res.ok && (typeof content === "string" ? content.trim().length > 0 : parsed?.choices?.length > 0);
      return {
        id,
        ok,
        latencyMs: Date.now() - start,
        status: res.status,
        error: ok ? null : (parsed?.error?.message || parsed?.error || `HTTP ${res.status}`),
      };
    } catch (error) {
      const aborted = error?.name === "AbortError";
      return { id, ok: false, latencyMs: Date.now() - start, status: 0, error: aborted ? "Timeout" : (error?.message || "Request failed") };
    } finally {
      clearTimeout(timer);
    }
  });

  const live = results
    .filter((result) => result.ok)
    .map(({ id, latencyMs, status }) => {
      const meta = modelMeta.get(id) || {};
      const provider = providerByModelId.get(id) || null;
      const prefix = id.includes("/") ? id.slice(0, id.indexOf("/")) : "";
      return {
        id,
        name: meta.name || id,
        provider: provider
          ? { id: provider.id, name: provider.name, alias: provider.alias }
          : { id: prefix, name: PREFIX_NAMES[prefix] || prefix || "Gateway", alias: prefix },
        latencyMs,
        status,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const errors = results
    .filter((result) => !result.ok)
    .slice(0, 8)
    .map(({ id, error, status }) => ({ id, error, status }));

  // Only expose providers that actually have a live model for the filter.
  // Build from the live rows so fallback namespaces (e.g. OpenCode Free)
  // are included too, preferring catalogue metadata when available.
  const catalogById = new Map(providers.map((provider) => [provider.id, provider]));
  const liveProviders = [...new Set(live.map((row) => row.provider.id))]
    .map((id) => catalogById.get(id) || live.find((row) => row.provider.id === id)?.provider)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({
    key: { name: record.name },
    checkedAt: startedAt,
    total: ids.length,
    live,
    providers: liveProviders,
    failed: results.length - live.length,
    errors,
  });
}
