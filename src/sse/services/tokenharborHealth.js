// Proactive health checker for Token Harbor accounts.
//
// Why this exists: the reactive cooldown (markAccountUnavailable) only fires
// AFTER a user request already got a 429/402 from upstream. Token Harbor is a
// prepaid-wallet aggregator, so an exhausted balance / rate limit surfaces on
// the chat endpoint, not on /v1/models (which only proves the key is alive).
// This loop probes every active tokenharbor account with a 1-token request to a
// free model every 40s; when an account comes back limited/exhausted/dead it is
// locked via modelLock___all — the same field getProviderCredentials already
// skips — so routing never selects it again until it recovers.
//
// Lock ownership: the checker stamps `healthLockUntil` alongside the lock it
// writes and only clears a lock whose expiry still matches that stamp, so a
// lock written later by real traffic (markAccountUnavailable) is never clobbered.
//
// Pattern mirrors quotaAutoPing.js (deps-injected, interval + unref, single
// global guard).

import "open-sse/index.js";

import { getSettings, getProviderConnections, updateProviderConnection } from "@/lib/localDb";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import { PROVIDERS } from "open-sse/config/providers.js";
import { buildModelLockUpdate, getModelLockKey } from "open-sse/services/accountFallback.js";
import { TOKENHARBOR_HEALTH_CONFIG } from "@/shared/constants/config";

const C = TOKENHARBOR_HEALTH_CONFIG;

// Fields stamped by this checker (not cleared by traffic-driven updates).
const HEALTH_LOCK_UNTIL_FIELD = "healthLockUntil";
const HEALTH_CHECKED_AT_FIELD = "healthCheckedAt";
const HEALTH_LOCK_PREFIX = "HEALTH_";

const g = (global.__tokenharborHealth ??= {
  interval: null,
  initialTimeout: null,
  running: false,
  lastProbeAt: new Map(), // connectionId -> epoch ms of last probe
});

function ts() {
  return new Date().toISOString();
}

function lowerText(text) {
  return typeof text === "string" ? text.toLowerCase() : "";
}

function isLimitWording(text) {
  const lower = lowerText(text);
  return C.limitKeywords.some((k) => lower.includes(k));
}

function buildProxyOptions(cfg) {
  return {
    connectionProxyEnabled: cfg.connectionProxyEnabled === true,
    connectionProxyUrl: cfg.connectionProxyUrl || "",
    connectionNoProxy: cfg.connectionNoProxy || "",
    vercelRelayUrl: cfg.vercelRelayUrl || "",
    strictProxy: false,
  };
}

function getChatUrl() {
  return PROVIDERS[C.provider]?.baseUrl || "https://tokenharbor.ai/v1/chat/completions";
}

// Read the account-level lock (modelLock___all) expiry, if any.
function getAccountLockUntil(conn) {
  const key = getModelLockKey(null); // modelLock___all
  const val = conn?.[key];
  if (!val) return null;
  const ms = new Date(val).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isLockedNow(conn, nowMs) {
  if (conn?.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > nowMs) return true;
  const lockUntil = getAccountLockUntil(conn);
  return lockUntil !== null && lockUntil > nowMs;
}

// True only when the account-level lock currently active was written by US
// (expiry still matches the stamp we saved).
function weHoldAccountLock(conn, nowMs) {
  const stamp = conn?.[HEALTH_LOCK_UNTIL_FIELD];
  if (!stamp) return false;
  const lockUntil = getAccountLockUntil(conn);
  if (lockUntil === null || lockUntil <= nowMs) return false;
  return lockUntil === new Date(stamp).getTime();
}

async function sendPing(connection, proxyOptions) {
  const url = getChatUrl();
  const res = await proxyAwareFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${connection.apiKey}`,
    },
    body: JSON.stringify({
      model: C.pingModel,
      max_tokens: C.pingMaxTokens,
      stream: false,
      messages: [{ role: "user", content: C.pingText }],
    }),
    signal: AbortSignal.timeout(C.requestTimeoutMs),
  }, proxyOptions);

  let text = "";
  try {
    text = await res.text();
  } catch {
    /* ignore body read errors */
  }
  return { status: res.status, ok: res.ok, text };
}

// Classify a probe result into an actionable kind.
function classify({ status, ok, text }) {
  if (ok) return { kind: "ok" };
  if (status === 401) return { kind: "dead", reason: `401 invalid key` };
  if (status === 402 || status === 429 || isLimitWording(text)) {
    return { kind: "limited", reason: `[${status}] ${text.slice(0, 180)}` };
  }
  // A 400 naming the model means our probe model is unavailable on this
  // account right now — not an account problem. Fall back to key validation.
  if (status === 400 && lowerText(text).includes("model")) {
    return { kind: "probe-model-missing" };
  }
  // 403/5xx/network: ambiguous (could be our own network). Do NOT lock — real
  // traffic still triggers the reactive cooldown if it is genuinely broken.
  return { kind: "unknown", reason: `[${status || "net"}] ${text.slice(0, 120)}` };
}

async function lockAccount(connection, { status, reason, cooldownMs, tag }, nowIso) {
  const lockUpdate = buildModelLockUpdate(null, cooldownMs); // modelLock___all
  const expiry = lockUpdate[getModelLockKey(null)];
  await updateProviderConnection(connection.id, {
    ...lockUpdate,
    [HEALTH_LOCK_UNTIL_FIELD]: expiry,
    [HEALTH_CHECKED_AT_FIELD]: nowIso,
    testStatus: tag === "dead" ? "failed" : "unavailable",
    errorCode: status ?? null,
    lastError: `${HEALTH_LOCK_PREFIX}${tag.toUpperCase()}: ${reason}`,
    lastErrorAt: nowIso,
  });
}

async function clearHealthLock(connection, nowIso) {
  const patch = {
    [getModelLockKey(null)]: null,
    [HEALTH_LOCK_UNTIL_FIELD]: null,
    [HEALTH_CHECKED_AT_FIELD]: nowIso,
    testStatus: "active",
    lastError: null,
    errorCode: null,
    lastErrorAt: null,
  };
  await updateProviderConnection(connection.id, patch);
}

async function probeConnection(connection, nowMs) {
  const proxyCfg = await resolveConnectionProxyConfig(connection.providerSpecificData || {});
  const proxyOptions = buildProxyOptions(proxyCfg);

  let result;
  try {
    result = classify(await sendPing(connection, proxyOptions));
  } catch (err) {
    result = { kind: "unknown", reason: err?.message || String(err) };
  }

  const nowIso = ts();

  if (result.kind === "probe-model-missing") {
    // Can't verify billing this tick; do not change account state.
    g.lastProbeAt.set(connection.id, nowMs);
    return { id: connection.id, outcome: "probe-skip" };
  }

  if (result.kind === "ok") {
    g.lastProbeAt.set(connection.id, nowMs);
    if (weHoldAccountLock(connection, nowMs)) {
      await clearHealthLock(connection, nowIso);
      console.log(`[TokenHarborHealth] ✓ ${connection.name || connection.id} recovered — account lock cleared`);
      return { id: connection.id, outcome: "recovered" };
    }
    // Healthy: only stamp periodically so we don't churn the DB every tick.
    const lastChecked = new Date(connection[HEALTH_CHECKED_AT_FIELD]).getTime();
    if (!Number.isFinite(lastChecked) || nowMs - lastChecked >= C.healthyRecheckMs) {
      await updateProviderConnection(connection.id, { [HEALTH_CHECKED_AT_FIELD]: nowIso });
    }
    return { id: connection.id, outcome: "healthy" };
  }

  if (result.kind === "limited") {
    g.lastProbeAt.set(connection.id, nowMs);
    await lockAccount(connection, {
      status: result.reason?.match(/^\[(\d+)\]/)?.[1] || null,
      reason: result.reason,
      cooldownMs: C.limitCooldownMs,
      tag: "limited",
    }, nowIso);
    console.warn(`[TokenHarborHealth] ✗ ${connection.name || connection.id} LIMITED — locked ${Math.round(C.limitCooldownMs / 1000)}s (${result.reason})`);
    return { id: connection.id, outcome: "limited" };
  }

  if (result.kind === "dead") {
    g.lastProbeAt.set(connection.id, nowMs);
    await lockAccount(connection, {
      status: 401,
      reason: result.reason,
      cooldownMs: C.deadCooldownMs,
      tag: "dead",
    }, nowIso);
    console.warn(`[TokenHarborHealth] ✗ ${connection.name || connection.id} DEAD KEY — locked ${Math.round(C.deadCooldownMs / 1000)}s`);
    return { id: connection.id, outcome: "dead" };
  }

  // unknown (network/5xx/ambiguous 403): leave state alone, retry next tick.
  g.lastProbeAt.set(connection.id, nowMs);
  console.warn(`[TokenHarborHealth] ? ${connection.name || connection.id} unknown: ${result.reason}`);
  return { id: connection.id, outcome: "unknown" };
}

export async function runTokenharborHealthTick(deps = {}, state = g) {
  if (state.running) return { skipped: true, reason: "Already running" };
  state.running = true;
  try {
    const settings = await getSettings();
    if (settings?.[C.settingsKey] === false) return { skipped: true, reason: "Disabled in settings" };

    const connections = await getProviderConnections({ provider: C.provider, isActive: true });
    if (!connections.length) return { checked: 0 };

    const nowMs = Date.now();

    // Decide which accounts to probe this tick. Locked accounts are throttled
    // (they were just probed recently) but still re-probed so a topped-up
    // wallet is picked up without waiting for the cooldown to lapse.
    const targets = connections.filter((conn) => {
      const last = state.lastProbeAt.get(conn.id) || 0;
      if (!last) return true; // never probed
      const locked = isLockedNow(conn, nowMs);
      const minGap = locked ? C.lockedRecheckMs : C.healthyRecheckMs;
      return nowMs - last >= minGap;
    });

    if (!targets.length) return { checked: 0 };

    let limited = 0, dead = 0, recovered = 0, healthy = 0;
    for (let i = 0; i < targets.length; i += C.maxConcurrent) {
      const batch = targets.slice(i, i + C.maxConcurrent);
      const results = await Promise.all(batch.map((conn) => probeConnection(conn, nowMs)));
      for (const r of results) {
        if (r.outcome === "limited") limited++;
        else if (r.outcome === "dead") dead++;
        else if (r.outcome === "recovered") recovered++;
        else if (r.outcome === "healthy") healthy++;
      }
    }

    if (limited || dead || recovered) {
      console.log(`[TokenHarborHealth] tick: ${targets.length} probed | healthy=${healthy} limited=${limited} dead=${dead} recovered=${recovered}`);
    }
    return { checked: targets.length, healthy, limited, dead, recovered };
  } catch (err) {
    console.warn("[TokenHarborHealth] tick error:", err?.message);
    return { error: err?.message };
  } finally {
    state.running = false;
  }
}

export function startTokenharborHealth() {
  if (g.interval) return false;
  if (typeof window !== "undefined") return false;
  const phase = process.env.NEXT_PHASE || "";
  if (["phase-production-build", "phase-export", "phase-static"].includes(phase)) return false;
  if (process.env.NEXT_RUNTIME === "edge") return false;
  if (process.env.DISABLE_TOKENHARBOR_HEALTH === "1") return false;

  const safeTick = () => runTokenharborHealthTick().catch((err) => {
    console.warn("[TokenHarborHealth] unhandled tick error:", err?.message);
  });

  g.initialTimeout = setTimeout(safeTick, C.initialDelayMs);
  if (g.initialTimeout.unref) g.initialTimeout.unref();

  g.interval = setInterval(safeTick, C.tickIntervalMs);
  if (g.interval.unref) g.interval.unref();

  console.log(`[TokenHarborHealth] scheduler started (interval: ${C.tickIntervalMs / 1000}s, model: ${C.pingModel})`);
  return true;
}

export function stopTokenharborHealth() {
  if (g.initialTimeout) { clearTimeout(g.initialTimeout); g.initialTimeout = null; }
  if (g.interval) { clearInterval(g.interval); g.interval = null; }
  g.lastProbeAt.clear();
}
