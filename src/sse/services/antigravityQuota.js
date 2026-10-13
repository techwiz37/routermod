
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getAntigravityUsage } from "open-sse/services/usage/google.js";
import * as log from "../utils/logger.js";

const quotaCache = new Map();
const lastRefreshAt = new Map();
const inflightRefresh = new Map();

const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s between refreshes per connection

const STRIKE_WINDOW_MS = 60_000; // strikes older than this reset the count
const STRIKE_THRESHOLD = 3;
const STRIKE_BLOCK_MS = 15 * 60_000;
const strikeCounts = new Map(); // "connectionId|model" → { count, windowStart (anchored at first strike) }
const strikeBlocks = new Map(); // "connectionId|model" → blockedUntil ms

function applyActiveStrikeBlocks(connectionId, quotas) {
  const now = Date.now();
  for (const [key, until] of strikeBlocks) {
    if (!key.startsWith(`${connectionId}|`)) continue;
    if (until <= now) {
      strikeBlocks.delete(key);
      continue;
    }
    quotas[key.slice(connectionId.length + 1)] = {
      remainingPercentage: 0,
      resetAt: new Date(until).toISOString(),
    };
  }
  return quotas;
}

export function getAntigravityModelFamily(model) {
  if (!model || typeof model !== "string") return null;
  const clean = (model.includes("/") ? model.slice(model.indexOf("/") + 1) : model).toLowerCase();
  if (clean.startsWith("claude-") || clean.startsWith("gpt-") || clean === "claude") {
    return "claude_gpt";
  }
  if ((clean.startsWith("gemini-") && !clean.includes("image")) || clean === "gemini") {
    return "gemini";
  }
  return null;
}

export function getAntigravityModelQuota(quotas, model) {
  if (!quotas || typeof quotas !== "object" || !model) return null;

  const cleanModel = typeof model === "string"
    ? (model.includes("/") ? model.slice(model.indexOf("/") + 1) : model).replace(/\([^()]+\)\s*$/, "").trim()
    : "";

  const family = getAntigravityModelFamily(cleanModel);
  const candidates = [];

  if (quotas[cleanModel]) {
    candidates.push(quotas[cleanModel]);
  }

  if (cleanModel === "claude-sonnet-5-5" && quotas["claude-sonnet-5-5-high"]) {
    candidates.push(quotas["claude-sonnet-5-5-high"]);
  }
  if (cleanModel === "claude-opus-5-5" && quotas["claude-opus-5-5-high"]) {
    candidates.push(quotas["claude-opus-5-5-high"]);
  }
  if (cleanModel === "gemini-3.8-flash" && quotas["gemini-3.8-flash-medium"]) {
    candidates.push(quotas["gemini-3.8-flash-medium"]);
  }
  if (cleanModel === "gemini-3.7-flash" && quotas["gemini-3.7-flash-medium"]) {
    candidates.push(quotas["gemini-3.7-flash-medium"]);
  }
  if (cleanModel === "gemini-3.6-flash" && quotas["gemini-3.6-flash-medium"]) {
    candidates.push(quotas["gemini-3.6-flash-medium"]);
  }

  if (family === "claude_gpt") {
    if (quotas.claude_gpt_session) candidates.push(quotas.claude_gpt_session);
    if (quotas.claude_gpt_weekly) candidates.push(quotas.claude_gpt_weekly);
  } else if (family === "gemini") {
    if (quotas.gemini_session) candidates.push(quotas.gemini_session);
    if (quotas.gemini_weekly) candidates.push(quotas.gemini_weekly);
  }

  if (candidates.length === 0) return null;

  const now = Date.now();
  const exhausted = [];

  for (const c of candidates) {
    if (c && typeof c === "object" && typeof c.remainingPercentage === "number" && c.remainingPercentage <= 0) {
      if (c.resetAt) {
        const resetMs = new Date(c.resetAt).getTime();
        if (resetMs > now) {
          exhausted.push({ ...c, resetMs });
        }
      } else {
        exhausted.push({ ...c, resetMs: 0 });
      }
    }
  }

  if (exhausted.length > 0) {
    exhausted.sort((a, b) => b.resetMs - a.resetMs);
    const primary = exhausted[0];
    return {
      used: primary.used ?? 1000,
      total: primary.total ?? 1000,
      remainingPercentage: 0,
      resetAt: primary.resetAt,
      displayName: primary.displayName || cleanModel,
    };
  }

  const valid = candidates.filter(c => c && typeof c.remainingPercentage === "number");
  if (valid.length === 0) return null;
  valid.sort((a, b) => a.remainingPercentage - b.remainingPercentage);
  return valid[0];
}

export function clearAntigravityStrikes(connectionId, model) {
  const key = `${connectionId}|${model}`;
  strikeCounts.delete(key);
  const until = strikeBlocks.get(key);
  if (until === undefined) return;
  strikeBlocks.delete(key);
  const cached = quotaCache.get(connectionId);
  const iso = new Date(until).toISOString();
  if (cached?.[model]?.resetAt === iso) {
    delete cached[model];
  }
  const family = getAntigravityModelFamily(model);
  if (family === "claude_gpt" && cached?.claude_gpt_session?.resetAt === iso) {
    delete cached.claude_gpt_session;
  } else if (family === "gemini" && cached?.gemini_session?.resetAt === iso) {
    delete cached.gemini_session;
  }
  quotaCache.set(connectionId, cached);
}

export function getAntigravityQuotaCache() {
  return quotaCache;
}

export async function refreshAntigravityQuota(connectionId, accessToken, providerSpecificData) {
  const now = Date.now();
  const inflight = inflightRefresh.get(connectionId);
  if (inflight) return inflight;

  const lastRefresh = lastRefreshAt.get(connectionId) || 0;
  if (now - lastRefresh < MIN_REFRESH_INTERVAL_MS) {
    log.debug("AG_QUOTA", `${connectionId.slice(0, 8)} | skip refresh (${Math.round((now - lastRefresh) / 1000)}s ago)`);
    return quotaCache.get(connectionId) || null;
  }

  lastRefreshAt.set(connectionId, now);
  const promise = _doRefresh(connectionId, accessToken, providerSpecificData, now);
  inflightRefresh.set(connectionId, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(connectionId);
  }
}

async function _doRefresh(connectionId, accessToken, providerSpecificData, now) {
  try {
    const proxyCfg = await resolveConnectionProxyConfig(providerSpecificData || {});
    const proxyOptions = {
      connectionProxyEnabled: proxyCfg.connectionProxyEnabled === true,
      connectionProxyUrl: proxyCfg.connectionProxyUrl || "",
      connectionNoProxy: proxyCfg.connectionNoProxy || "",
      vercelRelayUrl: proxyCfg.vercelRelayUrl || "",
      strictProxy: proxyCfg.strictProxy === true,
    };

    const usage = await getAntigravityUsage(accessToken, providerSpecificData, proxyOptions);
    if (!usage?.quotas || usage.message) return null;

    quotaCache.set(connectionId, applyActiveStrikeBlocks(connectionId, usage.quotas));

    return usage.quotas;
  } catch (e) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | refresh failed: ${e.message}`);
    return null;
  }
}

export async function handleAntigravityQuotaError(connectionId, status, model, accessToken, providerSpecificData) {
  log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | ${status} on ${model} — refreshing quota`);

  const quotas = await refreshAntigravityQuota(connectionId, accessToken, providerSpecificData);
  const quota = getAntigravityModelQuota(quotas, model);

  if (!quota || quota.remainingPercentage > 0) {
    const key = `${connectionId}|${model}`;
    const now = Date.now();
    const strike = strikeCounts.get(key);
    const windowStart = strike && now - strike.windowStart <= STRIKE_WINDOW_MS ? strike.windowStart : now;
    const count = strike && windowStart === strike.windowStart ? strike.count + 1 : 1;
    strikeCounts.set(key, { count, windowStart });
    if (count >= STRIKE_THRESHOLD) {
      strikeCounts.delete(key);
      const blockedUntil = now + STRIKE_BLOCK_MS;
      const reading = quota ? `${Math.round(quota.remainingPercentage)}%` : "unknown";
      log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | STRIKE_${status} ${model} — ${count}x 429 (quota ${reading}); CACHE_BLOCK 15m`);
      const cached = quotaCache.get(connectionId) || {};
      cached[model] = { remainingPercentage: 0, resetAt: new Date(blockedUntil).toISOString() };
      quotaCache.set(connectionId, cached);
      strikeBlocks.set(key, blockedUntil);
      return blockedUntil;
    }
    return null;
  }

  strikeCounts.delete(`${connectionId}|${model}`);
  if (!quota.resetAt) return null;

  const resetMs = new Date(quota.resetAt).getTime();
  if (resetMs <= Date.now()) return null;

  const cached = quotaCache.get(connectionId) || {};
  cached[model] = { remainingPercentage: 0, resetAt: quota.resetAt };
  quotaCache.set(connectionId, cached);

  log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — quota exhausted; CACHE_BLOCK until ${quota.resetAt}`);
  return resetMs;
}
