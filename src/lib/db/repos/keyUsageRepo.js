import { getAdapter } from "../driver.js";
import { tokenWindowMs } from "@/shared/constants/keyQuota.js";

// In-flight request counters per API key. Kept on `global` so every route
// module in the same server process shares one view (Next.js can load a
// module more than once across route bundles).
if (!global._keyInFlight) global._keyInFlight = {};

const inFlight = global._keyInFlight;

export function trackKeyInFlight(apiKey, delta) {
  if (!apiKey || typeof apiKey !== "string") return;
  const next = Math.max(0, (inFlight[apiKey] || 0) + delta);
  if (next === 0) delete inFlight[apiKey];
  else inFlight[apiKey] = next;
}

export function getKeyInFlight(apiKey) {
  if (!apiKey) return 0;
  return inFlight[apiKey] || 0;
}

function sumTokens(row) {
  return (Number(row?.promptTokens) || 0) + (Number(row?.completionTokens) || 0);
}

/**
 * Live counters for one API key, read straight from usageHistory so the
 * numbers survive a restart and match the usage page.
 */
export async function getKeyLiveStats(apiKey, { window = "24h" } = {}) {
  const empty = {
    requestsPerMinute: 0,
    inFlight: getKeyInFlight(apiKey),
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    tokensUsed: 0,
    cost: 0,
    lastUsedAt: null,
  };
  if (!apiKey || typeof apiKey !== "string") return empty;

  const db = await getAdapter();
  const since = new Date(Date.now() - tokenWindowMs(window)).toISOString();
  const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

  const windowRow = db.get(
    `SELECT COUNT(*) AS requests,
            COALESCE(SUM(promptTokens), 0) AS promptTokens,
            COALESCE(SUM(completionTokens), 0) AS completionTokens,
            COALESCE(SUM(cost), 0) AS cost,
            MAX(timestamp) AS lastUsedAt
       FROM usageHistory
      WHERE apiKey = ? AND timestamp >= ?`,
    [apiKey, since]
  );

  const minuteRow = db.get(
    `SELECT COUNT(*) AS requests FROM usageHistory WHERE apiKey = ? AND timestamp >= ?`,
    [apiKey, minuteAgo]
  );

  const promptTokens = Number(windowRow?.promptTokens) || 0;
  const completionTokens = Number(windowRow?.completionTokens) || 0;

  return {
    requestsPerMinute: Number(minuteRow?.requests) || 0,
    inFlight: getKeyInFlight(apiKey),
    requests: Number(windowRow?.requests) || 0,
    promptTokens,
    completionTokens,
    tokensUsed: promptTokens + completionTokens,
    cost: Number(windowRow?.cost) || 0,
    lastUsedAt: windowRow?.lastUsedAt || null,
  };
}

/**
 * Live counters for every key at once. One grouped query keeps the endpoint
 * page cheap even with many keys.
 */
export async function getKeysLiveStats(keys, { window = "24h" } = {}) {
  const list = Array.isArray(keys) ? keys.filter((k) => k?.key) : [];
  const out = {};
  for (const k of list) {
    out[k.id] = {
      requestsPerMinute: 0,
      inFlight: getKeyInFlight(k.key),
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      tokensUsed: 0,
      cost: 0,
      lastUsedAt: null,
    };
  }
  if (list.length === 0) return out;

  const db = await getAdapter();
  const since = new Date(Date.now() - tokenWindowMs(window)).toISOString();
  const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

  const rows = db.all(
    `SELECT apiKey,
            COUNT(*) AS requests,
            COALESCE(SUM(promptTokens), 0) AS promptTokens,
            COALESCE(SUM(completionTokens), 0) AS completionTokens,
            COALESCE(SUM(cost), 0) AS cost,
            MAX(timestamp) AS lastUsedAt
       FROM usageHistory
      WHERE timestamp >= ?
      GROUP BY apiKey`,
    [since]
  );
  const minuteRows = db.all(
    `SELECT apiKey, COUNT(*) AS requests
       FROM usageHistory
      WHERE timestamp >= ?
      GROUP BY apiKey`,
    [minuteAgo]
  );

  const byKey = new Map(rows.map((r) => [r.apiKey, r]));
  const byKeyMinute = new Map(minuteRows.map((r) => [r.apiKey, r]));

  for (const k of list) {
    const row = byKey.get(k.key);
    const minuteRow = byKeyMinute.get(k.key);
    const promptTokens = Number(row?.promptTokens) || 0;
    const completionTokens = Number(row?.completionTokens) || 0;
    out[k.id] = {
      requestsPerMinute: Number(minuteRow?.requests) || 0,
      inFlight: getKeyInFlight(k.key),
      requests: Number(row?.requests) || 0,
      promptTokens,
      completionTokens,
      tokensUsed: promptTokens + completionTokens,
      cost: Number(row?.cost) || 0,
      lastUsedAt: row?.lastUsedAt || null,
    };
  }
  return out;
}

export { sumTokens };
