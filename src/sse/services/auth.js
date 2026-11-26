import {
  getProviderConnections,
  validateApiKey,
  updateProviderConnection,
  deleteProviderConnectionById,
  getSettings,
  getProxyPools,
  getProviderNodeById,
} from "@/lib/localDb";
import { resolveConnectionProxyConfig, pickProxyPoolId } from "@/lib/network/connectionProxy";
import { formatRetryAfter, checkFallbackError, isModelLockActive, buildModelLockUpdate, getEarliestModelLockUntil } from "open-sse/services/accountFallback.js";
import {
  MAX_RATE_LIMIT_COOLDOWN_MS,
  PERMANENT_AUTH_STATUS,
  DEACTIVATE_KEYWORDS,
  PERMANENT_COOLDOWN_MS,
  KIRO_LIMIT_REACTIVATION_MS,
  KIRO_LIMIT_REACTIVATION_FIELD,
} from "open-sse/config/errorConfig.js";
import {
  resolveProviderId,
  getProviderAlias,
  FREE_PROVIDERS,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  isCustomEmbeddingProvider,
} from "@/shared/constants/providers.js";
import { getAntigravityQuotaCache, getAntigravityModelQuota } from "./antigravityQuota.js";
import { REFRESH_REJECTED_PREFIX } from "./tokenRefresh.js";
import * as log from "../utils/logger.js";
import { isKiroSuspension } from "open-sse/shared/kiroSuspension.js";
import { getKiroRefreshRejection } from "open-sse/shared/kiroRefreshState.js";
import { runKiroSuspensionHook } from "@/lib/kiroSuspensionHook";

let selectionMutex = Promise.resolve();

function getModelSystemPrompt(settings, provider, model, requestedModel) {
  const promptSettings = settings?.providerModelSystemPrompts || {};
  const providerId = resolveProviderId(provider);
  const providerKeys = [
    provider,
    providerId,
    getProviderAlias(providerId),
  ].filter(Boolean);

  // Storage is flattened as "<provider>/<model>". Look those up first.
  const candidates = [requestedModel, model]
    .filter(Boolean)
    .flatMap((value) => [String(value), String(value).split("/").pop()]);
  const uniqueCandidates = [...new Set(candidates)];
  for (const pKey of providerKeys) {
    for (const mKey of uniqueCandidates) {
      const prompt = promptSettings[`${pKey}/${mKey}`];
      if (typeof prompt === "string" && prompt.trim()) return prompt.trim();
    }
  }

  // Legacy/nested shape fallback: promptSettings[provider] is a map.
  const nestedMaps = providerKeys
    .map((key) => promptSettings[key])
    .filter((value) => value && typeof value === "object" && !Array.isArray(value));
  for (const providerPromptMap of nestedMaps) {
    const prompt = uniqueCandidates.map((key) => providerPromptMap?.[key]).find(Boolean);
    if (typeof prompt === "string" && prompt.trim()) return prompt.trim();
  }

  // Last resort: any flattened entry whose key ends with one of the model candidates.
  const suffixMatches = Object.entries(promptSettings)
    .filter(([key, value]) => {
      if (typeof value !== "string" || !value.trim()) return false;
      const modelPart = String(key).split("/").pop();
      return uniqueCandidates.includes(modelPart);
    })
    .map(([, value]) => value.trim());
  // Only accept an unambiguous single match.
  if (suffixMatches.length === 1) return suffixMatches[0];

  return null;
}

const GITHUB_MONTHLY_USAGE_LIMIT = "you've reached your additional usage limit for your plan";

function githubMonthlyResetMs(status, errorText, provider) {
  if (resolveProviderId(provider) !== "github" || Number(status) !== 402) return null;
  if (!String(errorText || "").toLowerCase().includes(GITHUB_MONTHLY_USAGE_LIMIT)) return null;
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

// Kiro 402 (credits/billing) and account-wide 429 (quota/rate limit) take the
// credential out of rotation for 24 hours. The background connection health
// tick sees `reactivateAt` and switches it back on automatically; the Kiro
// suspension hook registers a replacement in the meantime. The lockfile inside
// runKiroSuspensionHook prevents duplicate krg batches when many accounts hit
// the limit in one window.
function kiroLimitResetMs(status, errorText, provider) {
  if (resolveProviderId(provider) !== "kiro") return null;
  // Suspension is permanent: delete the account instead of parking it.
  if (isKiroSuspension(errorText)) return null;
  const code = Number(status);
  if (code !== 402 && code !== 429) return null;
  // Per-model concurrency ("switch model") is not a wallet limit.
  if (MODEL_SCOPED_SHEDDING_WORDING.test(String(errorText || ""))) return null;
  return Date.now() + KIRO_LIMIT_REACTIVATION_MS;
}

// Deactivate-until epoch for provider responses that announce a platform ban.
// Only unambiguous "this account cannot be used again" wording qualifies —
// quota/rate-limit/plan errors stay as cooldowns so they rejoin rotation later.
function permanentBanResetMs(status, errorText) {
  const code = Number(status);
  if (code !== 401 && code !== 403) return null;
  const lower = String(errorText || "").toLowerCase();
  if (!DEACTIVATE_KEYWORDS.some((k) => lower.includes(k))) return null;
  return Date.now() + PERMANENT_COOLDOWN_MS;
}

// Wording that means only the *current model* is unavailable (concurrency
// shedding / "switch model"), so an account-wide status such as 429 must not
// park the whole credential while other models on it still work.
const MODEL_SCOPED_SHEDDING_WORDING = /concurrency capacity|switch model|model .*not (available|supported|found)/i;

const ACCOUNT_SCOPED_STATUSES = new Set([PERMANENT_AUTH_STATUS, 402, 403, 429]);

function isAccountScopedStatus(status) {
  return ACCOUNT_SCOPED_STATUSES.has(Number(status));
}

const LIMIT_WORDING = [
  "quota",
  "rate limit",
  "too many requests",
  "usage limit",
  "allowance",
  "insufficient balance",
  "out of credits",
  "credit balance",
  "exceeded your",
];

// Wording that means the *account* is limited (balance/quota/usage window), as
// opposed to one model being busy. A generic "rate limit" on a concurrency
// message belongs to the model, not the wallet, so it is deliberately absent.
const ACCOUNT_WIDE_LIMIT_WORDING = new RegExp(
  [
    "insufficient balance",
    "insufficient_quota",
    "out of credits",
    "credit balance",
    "usage limit",
    "free allowance",
    "quota exceeded",
    "exceeded your current quota",
    "billing",
  ].join("|"),
  "i",
);

export async function getProviderCredentials(provider, excludeConnectionIds = null, model = null, options = {}) {
  const excludeSet = excludeConnectionIds instanceof Set
    ? excludeConnectionIds
    : (excludeConnectionIds ? new Set([excludeConnectionIds]) : new Set());
  const preferredConnectionId = options?.preferredConnectionId || null;
  const requestedModel = options?.requestedModel || model;
  const currentMutex = selectionMutex;
  let resolveMutex;
  selectionMutex = new Promise(resolve => { resolveMutex = resolve; });

  try {
    await currentMutex;

    const providerId = resolveProviderId(provider);

    if (FREE_PROVIDERS[providerId]?.noAuth) {
      const settings = await getSettings();
      const override = (settings.providerStrategies || {})[providerId] || {};
      const strategy = override.rotateStrategy || "none";
      let pickedId = override.proxyPoolId || null;
      if (strategy !== "none") {
        const allPools = await getProxyPools({ isActive: true });
        const usablePools = allPools.filter((p) => p.proxyUrl && p.isActive !== false);
        const selected = usablePools.find((p) => p.id === pickedId);
        // Keep rotation scoped to the operator-selected pool. Rotating over
        // every active pool pulls in unrelated/dead proxies that require auth.
        const candidates = selected?.exitIp
          ? usablePools.filter((p) => p.id === pickedId || p.exitIp === selected.exitIp)
          : selected ? [selected] : usablePools;
        pickedId = pickProxyPoolId(candidates, strategy, providerId);
      }
      const resolvedProxy = await resolveConnectionProxyConfig({ proxyPoolId: pickedId || "" });
      return {
        id: "noauth",
        connectionName: "Public",
        isActive: true,
        accessToken: "public",
        providerSpecificData: {
          connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
          connectionProxyUrl: resolvedProxy.connectionProxyUrl,
          connectionNoProxy: resolvedProxy.connectionNoProxy,
          connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
          vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
          strictProxy: resolvedProxy.strictProxy === true,
        },
      };
    }

    const connections = await getProviderConnections({ provider: providerId, isActive: true });
    log.debug("AUTH", `${provider} | total connections: ${connections.length}, excludeIds: ${excludeSet.size > 0 ? [...excludeSet].join(",") : "none"}, model: ${model || "any"}`);

    if (connections.length === 0) {
      log.warn("AUTH", `No credentials for ${provider}`);
      return null;
    }

    const isAntigravity = providerId === "antigravity";
    const antigravityQuotaCache = isAntigravity && model ? getAntigravityQuotaCache() : null;

    const availableConnections = connections.filter(c => {
      if (excludeSet.has(c.id)) return false;
      if (isModelLockActive(c, model)) return false;
      const enabled = c.providerSpecificData?.enabledModels;
      if (providerId === "codex" && Array.isArray(enabled) && enabled.length && requestedModel && !enabled.includes(requestedModel)) return false;
      if (isAntigravity && model && antigravityQuotaCache) {
        const connQuotas = antigravityQuotaCache.get(c.id);
        const quota = getAntigravityModelQuota(connQuotas, model) || connQuotas?.[model];
        if (quota && quota.remainingPercentage <= 0 && quota.resetAt && new Date(quota.resetAt).getTime() > Date.now()) {
          const account = c.id?.slice(0, 8) || "unknown";
          log.info("AG_QUOTA", `${account} | CACHE_BLOCK ${model} — skip upstream until ${quota.resetAt}`);
          return false;
        }
      }
      return true;
    });

    log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);
    connections.forEach(c => {
      const excluded = excludeSet.has(c.id);
      const locked = isModelLockActive(c, model);
      if (excluded || locked) {
        const lockUntil = getEarliestModelLockUntil(c);
        log.debug("AUTH", `  → ${c.id?.slice(0, 8)} | ${excluded ? "excluded" : ""} ${locked ? `modelLocked(${model}) until ${lockUntil}` : ""}`);
      }
    });

    if (availableConnections.length === 0) {
      const lockedConns = connections.filter(c => isModelLockActive(c, model));
      const expiries = lockedConns.map(c => getEarliestModelLockUntil(c)).filter(Boolean);
      if (isAntigravity && model && antigravityQuotaCache) {
        connections.forEach((c) => {
          const connQuotas = antigravityQuotaCache.get(c.id);
          const quota = getAntigravityModelQuota(connQuotas, model) || connQuotas?.[model];
          const resetAt = quota?.resetAt;
          if (resetAt && new Date(resetAt).getTime() > Date.now()) expiries.push(resetAt);
        });
      }
      const earliest = expiries.sort()[0] || null;
      if (earliest) {
        const earliestConn = lockedConns[0];
        log.warn("AUTH", `${provider} | all ${connections.length} accounts locked for ${model || "all"} (${formatRetryAfter(earliest)}) | lastError=${earliestConn?.lastError?.slice(0, 50)}`);
        return {
          allRateLimited: true,
          retryAfter: earliest,
          retryAfterHuman: formatRetryAfter(earliest),
          lastError: earliestConn?.lastError || null,
          lastErrorCode: earliestConn?.errorCode || null
        };
      }
      log.warn("AUTH", `${provider} | all ${connections.length} accounts unavailable`);
      return null;
    }

    const settings = await getSettings();
    const providerOverride = (settings.providerStrategies || {})[providerId] || {};
    const strategy = providerOverride.fallbackStrategy || settings.fallbackStrategy || "fill-first";

    // A Kiro account whose refresh grant was rejected cannot sign in again
    // until the user reauthorizes it. Do not let it win selection ahead of a
    // freshly added, working account. Keep rejected accounts as a last resort
    // so the caller can still surface the real rejection when they are all bad.
    let selectionPool = availableConnections;
    if (providerId === "kiro") {
      const usable = availableConnections.filter((c) => !getKiroRefreshRejection(c));
      if (usable.length) selectionPool = usable;
    }

    let connection;
    if (preferredConnectionId) {
      connection = selectionPool.find((c) => c.id === preferredConnectionId);
      if (connection) {
        log.info("AUTH", `${provider} | pinned to ${connection.id?.slice(0, 8)} (${connection.name || connection.email || "unnamed"})`);
      }
    }
    if (connection) {
    } else if (strategy === "round-robin") {
      const stickyLimit = providerOverride.stickyRoundRobinLimit || settings.stickyRoundRobinLimit || 3;

      const byRecency = [...selectionPool].sort((a, b) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
      });

      const current = byRecency[0];
      const currentCount = current?.consecutiveUseCount || 0;

      if (current && current.lastUsedAt && currentCount < stickyLimit) {
        connection = current;
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: (connection.consecutiveUseCount || 0) + 1
        });
      } else {
        const sortedByOldest = [...selectionPool].sort((a, b) => {
          if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
          if (!a.lastUsedAt) return -1;
          if (!b.lastUsedAt) return 1;
          return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
        });

        connection = sortedByOldest[0];

        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: 1
        });
      }
    } else {
      connection = selectionPool[0];
    }

    const resolvedProxy = await resolveConnectionProxyConfig(connection.providerSpecificData || {}, providerId);

    const node = isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider) || isCustomEmbeddingProvider(provider)
      ? await getProviderNodeById(provider).catch(() => null)
      : null;
    const nodeSystemPrompt = node?.systemPrompt || null;
    return {
      authType: connection.authType,
      apiKey: connection.apiKey,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      idToken: connection.idToken,
      expiresAt: connection.expiresAt,
      expiresIn: connection.expiresIn,
      lastRefreshAt: connection.lastRefreshAt,
      projectId: connection.projectId,
      connectionName: connection.displayName || connection.name || connection.email || connection.id,
      copilotToken: connection.providerSpecificData?.copilotToken,
      providerSpecificData: {
        ...(connection.providerSpecificData || {}),
        // Model prompts are applied by the central injection pipeline. Keep
        // only connection/node prompts here to avoid applying a model prompt
        // twice when the legacy providerModelSystemPrompts setting is used.
        systemPrompt: connection.providerSpecificData?.systemPrompt || nodeSystemPrompt,
        modelRateLimits: node?.modelRateLimits || connection.providerSpecificData?.modelRateLimits || null,
        connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
        connectionProxyUrl: resolvedProxy.connectionProxyUrl,
        connectionNoProxy: resolvedProxy.connectionNoProxy,
        connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
        vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
        strictProxy: resolvedProxy.strictProxy === true,
      },
      connectionId: connection.id,
      testStatus: connection.testStatus,
      lastError: connection.lastError,
      _connection: connection
    };
  } finally {
    if (resolveMutex) resolveMutex();
  }
}

export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null, resetsAtMs = null) {
  if (!connectionId || connectionId === "noauth") return { shouldFallback: false, cooldownMs: 0 };
  if (resolveProviderId(provider) === "kiro" && isKiroSuspension(errorText)) {
    const deleted = await deleteProviderConnectionById(connectionId);
    const account = deleted?.displayName || deleted?.name || deleted?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `${account} permanently deleted (Kiro user suspended) [${status}]`);
    runKiroSuspensionHook(connectionId);
    return { shouldFallback: true, cooldownMs: 0 };
  }
  const connections = await getProviderConnections({ provider });
  const conn = connections.find(c => c.id === connectionId);
  const backoffLevel = conn?.backoffLevel || 0;

  const githubResetAtMs = githubMonthlyResetMs(status, errorText, provider);
  const kiroResetAtMs = kiroLimitResetMs(status, errorText, provider);

  let shouldFallback, cooldownMs, newBackoffLevel;
  if (kiroResetAtMs) {
    // Kiro quota exhausted: disable the account now, re-enable in 24h from the
    // background health tick, and register a replacement in the meantime.
    shouldFallback = true;
    cooldownMs = kiroResetAtMs - Date.now();
    newBackoffLevel = 0;
    const account = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `${account} Kiro quota exhausted (${status}) — off until ${new Date(kiroResetAtMs).toISOString()}`);
    runKiroSuspensionHook(connectionId);
  } else if (githubResetAtMs) {
    shouldFallback = true;
    cooldownMs = githubResetAtMs - Date.now();
    newBackoffLevel = 0;
  } else if (resetsAtMs && resetsAtMs > Date.now()) {
    shouldFallback = true;
    // Always honor the exact reset time from upstream provider up to the hard cap
    cooldownMs = Math.min(resetsAtMs - Date.now(), MAX_RATE_LIMIT_COOLDOWN_MS);
    newBackoffLevel = 0;
  } else {
    ({ shouldFallback, cooldownMs, newBackoffLevel } = checkFallbackError(status, errorText, backoffLevel, resolveProviderId(provider)));
  }
  if (!shouldFallback) return { shouldFallback: false, cooldownMs: 0 };

  const reason = typeof errorText === "string" ? errorText.slice(0, 200) : "Provider error";
  // Account-level limits (429/402/401/403 + quota/balance wording) mean the
  // whole credential is out for the window, so the lock goes on `___all` and
  // the next request skips this account entirely instead of re-trying it for
  // every other model. Model-scoped failures (404, 400) keep a per-model lock.
  const accountScoped = permanentBanResetMs(status, errorText) ? true
    : isAccountScopedStatus(status) || ACCOUNT_WIDE_LIMIT_WORDING.test(String(errorText || ""));
  // Capacity shedding is per model, not per wallet: account-wide statuses only
  // widen the lock when the provider did not name the model itself.
  const modelScopedShedding = MODEL_SCOPED_SHEDDING_WORDING.test(String(errorText || ""));
  const lockUpdate = buildModelLockUpdate(githubResetAtMs || kiroResetAtMs || (accountScoped && !modelScopedShedding) ? null : model, cooldownMs);

  // Platform-account bans (e.g. "your account was rejected / banned") are not
  // time-boxed: retrying the account cannot succeed without a new credential.
  // For Kiro provider specifically, permanently delete suspended accounts instead
  // of just deactivating them.
  const deactivateAtMs = permanentBanResetMs(status, errorText);
  const shouldDelete = deactivateAtMs && resolveProviderId(provider) === "kiro";

  if (shouldDelete) {
    const deleted = await deleteProviderConnectionById(connectionId);
    const connName = deleted?.displayName || deleted?.name || deleted?.email || connectionId.slice(0, 8);
    log.warn("AUTH", `${connName} PERMANENTLY DELETED (Kiro suspended) [${status}]: ${reason}`);
    console.error(`🗑️  DELETED: ${provider} [${status}]: ${reason}`);
    runKiroSuspensionHook(connectionId);
    return { shouldFallback: true, cooldownMs: 0 };
  }

  const patch = {
    ...lockUpdate,
    testStatus: "unavailable",
    lastError: reason,
    errorCode: status,
    lastErrorAt: new Date().toISOString(),
    backoffLevel: newBackoffLevel ?? backoffLevel,
  };
  if (deactivateAtMs) {
    patch.isActive = false;
    patch.rateLimitedUntil = new Date(deactivateAtMs).toISOString();
    patch.deactivatedReason = reason;
  }
  if (kiroResetAtMs) {
    // Off now, back on in 24h: the scheduler keys off this stamp and the
    // activation patch clears rateLimitedUntil / model locks / error badges.
    patch.isActive = false;
    patch.rateLimitedUntil = new Date(kiroResetAtMs).toISOString();
    patch[KIRO_LIMIT_REACTIVATION_FIELD] = new Date(kiroResetAtMs).toISOString();
    patch.deactivatedReason = reason;
  }

  // Keep a permanent refresh-rejection reason (e.g. invalid_grant / account
  // deleted) instead of overwriting it with a generic "[401]: HTTP 401" from
  // this request — the refresh reason explains WHY the 401 keeps happening.
  const keepRefreshReason =
    (Number(status) === 401 || Number(status) === 403) &&
    typeof conn?.lastError === "string" &&
    conn.lastError.startsWith(REFRESH_REJECTED_PREFIX);
  if (keepRefreshReason) patch.lastError = conn.lastError;

  await updateProviderConnection(connectionId, patch);

  const lockKey = Object.keys(lockUpdate)[0];
  const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
  log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${status}]${deactivateAtMs ? " | DEACTIVATED (banned)" : ""}${kiroResetAtMs ? " | OFF (Kiro limit, auto-on in 24h)" : ""}`);

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${status}]: ${reason}`);
  }

  return { shouldFallback: true, cooldownMs };
}

export async function clearAccountError(connectionId, currentConnection, model = null) {
  if (!connectionId || connectionId === "noauth") return;
  const conn = currentConnection._connection || currentConnection;
  // A connection deactivated by markAccountUnavailable (banned/revoked account)
  // is out of rotation; a stray success must not silently reactivate it.
  if (conn?.isActive === false) return;
  const now = Date.now();
  const allLockKeys = Object.keys(conn).filter(k => k.startsWith("modelLock_"));

  // The request succeeded, so the credentials are proven good: drop the
  // health-state badge even when the locks that caused it already expired.
  const previousTestStatus = conn.testStatus;

  if (!conn.testStatus && !conn.lastError && allLockKeys.length === 0) return;

  const keysToClear = allLockKeys.filter(k => {
    if (model && k === `modelLock_${model}`) return true; // succeeded model
    if (model && k === "modelLock___all") return true;    // account-level lock
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() <= now;   // expired
  });

  const remainingActiveLocks = allLockKeys.filter(k => {
    if (keysToClear.includes(k)) return false;
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() > now;
  });

  const clearObj = Object.fromEntries(keysToClear.map(k => [k, null]));

  if (remainingActiveLocks.length === 0 && previousTestStatus && previousTestStatus !== "active") {
    Object.assign(clearObj, {
      testStatus: "active",
      lastError: null,
      errorCode: null,
      lastErrorAt: null,
      backoffLevel: 0
    });
  }

  if (Object.keys(clearObj).length === 0) return;

  await updateProviderConnection(connectionId, clearObj);
}

export function extractApiKey(request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

export async function isValidApiKey(apiKey) {
  if (!apiKey) return false;
  return await validateApiKey(apiKey);
}
