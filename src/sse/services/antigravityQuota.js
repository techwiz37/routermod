
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getAntigravityUsage } from "open-sse/services/usage/google.js";
import * as log from "../utils/logger.js";

const quotaCache = new Map();
const lastRefreshAt = new Map();
const inflightRefresh = new Map();

const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s between refreshes per connection

export function getAntigravityModelFamily(model) {
  if (!model || typeof model !== "string") return null;
  const clean = (model.includes("/") ? model.slice(model.indexOf("/") + 1) : model).toLowerCase();
  if (clean.startsWith("claude-") || clean.startsWith("gpt-") || clean === "claude") {
    return "claude_gpt";
  }
  if ((clean.startsWith("gemini-") && clean.includes("argon")) || clean === "gemini_argon") {
    return "gemini_argon";
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
  const hasExactModelQuota = Object.hasOwn(quotas, cleanModel);

  if (hasExactModelQuota) candidates.push(quotas[cleanModel]);

  // A model's own bucket is authoritative. Cross-model compatibility aliases
  // are only safe when the quota API did not return a bucket for this model;
  // provider-reported shared family/session buckets still apply to each model.
  if (!hasExactModelQuota) {
    if (cleanModel === "gemini-4-argon" && quotas["gemini-4-argon-high"]) {
      candidates.push(quotas["gemini-4-argon-high"]);
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

    if (cleanModel.startsWith("gemini-3.8-flash") || cleanModel.startsWith("gemini-3.7-flash") || cleanModel.startsWith("gemini-3.6-flash")) {
      if (quotas["gemini-3.8-flash-tiered"]) candidates.push(quotas["gemini-3.8-flash-tiered"]);
    }
    if (cleanModel.startsWith("claude-sonnet")) {
      if (quotas["claude-sonnet-4-6"]) candidates.push(quotas["claude-sonnet-4-6"]);
    }
    if (cleanModel.startsWith("claude-opus")) {
      if (quotas["claude-opus-4-6-thinking"]) candidates.push(quotas["claude-opus-4-6-thinking"]);
    }
    if (cleanModel.startsWith("gemini-3.1-pro") || cleanModel === "gemini-pro-agent") {
      if (quotas["gemini-3-flash-agent"]) candidates.push(quotas["gemini-3-flash-agent"]);
    }
  }

  if (family === "claude_gpt") {
    if (quotas.claude_gpt_session) candidates.push(quotas.claude_gpt_session);
    if (quotas.claude_gpt_weekly) candidates.push(quotas.claude_gpt_weekly);
  } else if (family === "gemini_argon") {
    if (quotas.gemini_argon_session) candidates.push(quotas.gemini_argon_session);
    if (quotas.gemini_argon_weekly) candidates.push(quotas.gemini_argon_weekly);
    // On Ultra plans where Argon shares the main Gemini bucket (no separate argon summary),
    // fall back to the shared Gemini summary buckets.
    if (!quotas.gemini_argon_session && !quotas.gemini_argon_weekly) {
      if (quotas.gemini_session) candidates.push(quotas.gemini_session);
      if (quotas.gemini_weekly) candidates.push(quotas.gemini_weekly);
    }
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

export function getAntigravityQuotaCache() {
  return quotaCache;
}

export async function refreshAntigravityQuota(connectionId, accessToken, providerSpecificData, { force = false } = {}) {
  const now = Date.now();
  const inflight = inflightRefresh.get(connectionId);
  if (inflight) return inflight;

  const lastRefresh = lastRefreshAt.get(connectionId) || 0;
  if (!force && now - lastRefresh < MIN_REFRESH_INTERVAL_MS) {
    log.debug("AG_QUOTA", `${connectionId.slice(0, 8)} | skip refresh (${Math.round((now - lastRefresh) / 1000)}s ago)`);
    return quotaCache.get(connectionId) || null;
  }

  if (force) quotaCache.delete(connectionId);
  lastRefreshAt.set(connectionId, now);
  const promise = _doRefresh(connectionId, accessToken, providerSpecificData);
  inflightRefresh.set(connectionId, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(connectionId);
  }
}

async function _doRefresh(connectionId, accessToken, providerSpecificData) {
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

    quotaCache.set(connectionId, usage.quotas);

    return usage.quotas;
  } catch (e) {
    log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | refresh failed: ${e.message}`);
    return null;
  }
}

export async function handleAntigravityQuotaError(connectionId, status, model, accessToken, providerSpecificData, upstreamQuotaExhausted = false, upstreamResetsAtMs = null) {
  if (!upstreamQuotaExhausted || (status !== 429 && status !== 409)) return null;

  log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | confirmed RESOURCE_EXHAUSTED for ${model}; checking current quota`);
  // Quota-related fallback must be based on a fresh upstream quota read, not a
  // cached response or repeated generic 429s. An unavailable quota endpoint is
  // inconclusive, never proof that the model is exhausted.
  const quotas = await refreshAntigravityQuota(connectionId, accessToken, providerSpecificData, { force: true });
  const quota = getAntigravityModelQuota(quotas, model);

  if (!quota || quota.remainingPercentage !== 0) {
    log.info("AG_QUOTA", `${connectionId.slice(0, 8)} | no confirmed exhausted quota for ${model}; not quota-blocking account`);
    return null;
  }

  const quotaResetMs = quota.resetAt ? new Date(quota.resetAt).getTime() : null;
  const resetMs = Number.isFinite(quotaResetMs) && quotaResetMs > Date.now()
    ? quotaResetMs
    : Number.isFinite(upstreamResetsAtMs) && upstreamResetsAtMs > Date.now() ? upstreamResetsAtMs : null;
  if (!resetMs) return null;

  const resetAt = new Date(resetMs).toISOString();
  if (resetMs <= Date.now()) return null;

  const cached = quotaCache.get(connectionId) || {};
  cached[model] = {
    ...(quota || {}),
    remainingPercentage: 0,
    resetAt,
  };
  quotaCache.set(connectionId, cached);
  log.warn("AG_QUOTA", `${connectionId.slice(0, 8)} | confirmed quota exhausted for ${model}; account fallback until ${resetAt}`);
  return resetMs;
}
