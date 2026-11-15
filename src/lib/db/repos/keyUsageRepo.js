import { getAdapter } from "../driver.js";
import { tokenWindowMs } from "@/shared/constants/keyQuota.js";

if (!global._keyInFlight) global._keyInFlight = {};
const inFlight = global._keyInFlight;

export function trackKeyInFlight(key, delta) {
  if (!key || typeof key !== "string") return;
  const next = Math.max(0, (inFlight[key] || 0) + delta);
  if (next) inFlight[key] = next;
  else delete inFlight[key];
}

export function getKeyInFlight(key) {
  return key ? inFlight[key] || 0 : 0;
}

/**
 * Calculate the start and end of the current quota cycle.
 * Uses fixed cycles that reset at predictable times:
 * - 1m: resets every minute (e.g., 14:00:00, 14:01:00, 14:02:00) - for testing
 * - 1h: resets every hour (e.g., 14:00, 15:00, 16:00)
 * - 24h: resets at midnight UTC every day
 * - 7d: resets at midnight UTC every Monday
 * - 30d: resets at midnight UTC on the 1st of each month
 * 
 * @param {string} window - Window type (1m, 1h, 24h, 7d, 30d)
 * @returns {{ start: string, end: string, resetAt: string }} ISO timestamps
 */
function getQuotaCycle(window) {
  const now = Date.now();
  const windowMs = tokenWindowMs(window);
  
  let cycleStart, cycleEnd;
  
  if (window === "1m") {
    // Reset every minute (for testing) - e.g., 14:23:00, 14:24:00, 14:25:00
    const nowDate = new Date(now);
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate(),
      nowDate.getUTCHours(),
      nowDate.getUTCMinutes(),
      0, 0
    ));
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  } else if (window === "24h") {
    // Reset at midnight UTC
    const nowDate = new Date(now);
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate(),
      0, 0, 0, 0
    ));
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  } else if (window === "7d") {
    // Reset at midnight UTC every Monday
    const nowDate = new Date(now);
    const dayOfWeek = nowDate.getUTCDay(); // 0=Sunday, 1=Monday, ...
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since last Monday
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate() - daysToMonday,
      0, 0, 0, 0
    ));
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  } else if (window === "30d") {
    // Reset at midnight UTC on the 1st of each month
    const nowDate = new Date(now);
    cycleStart = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      1,
      0, 0, 0, 0
    ));
    cycleEnd = new Date(Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth() + 1,
      1,
      0, 0, 0, 0
    ));
  } else {
    // 1h or any other: simple modulo-based cycle
    cycleStart = new Date(Math.floor(now / windowMs) * windowMs);
    cycleEnd = new Date(cycleStart.getTime() + windowMs);
  }
  
  return {
    start: cycleStart.toISOString(),
    end: cycleEnd.toISOString(),
    resetAt: cycleEnd.toISOString()
  };
}

function emptyStats(key) {
  return {
    requestsPerMinute: 0,
    inFlight: getKeyInFlight(key),
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    tokensUsed: 0,
    cost: 0,
    lastUsedAt: null,
    windowStart: null,
    resetAt: null,
  };
}

function mapStats(row, minute, key, window, cycle) {
  const promptTokens = Number(row?.promptTokens) || 0;
  const completionTokens = Number(row?.completionTokens) || 0;

  return {
    requestsPerMinute: Number(minute?.requests) || 0,
    inFlight: getKeyInFlight(key),
    requests: Number(row?.requests) || 0,
    promptTokens,
    completionTokens,
    tokensUsed: promptTokens + completionTokens,
    cost: Number(row?.cost) || 0,
    lastUsedAt: row?.lastUsedAt || null,
    windowStart: cycle.start,
    resetAt: cycle.resetAt,
  };
}

export async function getKeyLiveStats(key, { window = "24h" } = {}) {
  if (!key || typeof key !== "string") return emptyStats(key);

  const db = await getAdapter();
  const cycle = getQuotaCycle(window);

  const row = db.get(
    `SELECT COUNT(*) AS requests,
            COALESCE(SUM(promptTokens),0) AS promptTokens,
            COALESCE(SUM(completionTokens),0) AS completionTokens,
            COALESCE(SUM(cost),0) AS cost,
            MIN(timestamp) AS windowStart,
            MAX(timestamp) AS lastUsedAt
     FROM usageHistory
     WHERE apiKey = ? AND timestamp >= ?`,
    [key, cycle.start]
  );

  const minute = db.get(
    `SELECT COUNT(*) AS requests
     FROM usageHistory
     WHERE apiKey = ? AND timestamp >= ?`,
    [key, new Date(Date.now() - 60000).toISOString()]
  );

  return mapStats(row, minute, key, window, cycle);
}

export async function getKeysLiveStats(keys, { window = "24h" } = {}) {
  const list = Array.isArray(keys) ? keys.filter((key) => key?.key) : [];
  const entries = await Promise.all(
    list.map(async (key) => [
      key.id,
      await getKeyLiveStats(key.key, { window: key.tokenLimitWindow || window }),
    ])
  );
  return Object.fromEntries(entries);
}

export function sumTokens(row) {
  return (Number(row?.promptTokens) || 0) + (Number(row?.completionTokens) || 0);
}