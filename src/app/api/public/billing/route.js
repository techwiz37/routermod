import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { getKeyLiveStats, getQuotaCycle } from "@/lib/db/repos/keyUsageRepo.js";
import { getPricingForModel } from "@/lib/db/repos/pricingRepo.js";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers.js";
import { getProviderNodes } from "@/lib/db/repos/nodesRepo.js";
import { maskApiKey } from "@/shared/utils/customApiKey.js";

import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

export const dynamic = "force-dynamic";

const COOKIE_NAME = KEY_SESSION_COOKIE;
const PERIODS = new Set(["24h", "7d", "30d", "all"]);
const PERIOD_MS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

async function activeKey(key) {
  if (!key || !(await validateApiKey(key))) return null;
  const record = await getApiKeyByKey(key);
  if (!record?.isActive) return null;
  const expiry = record.effectiveExpiresAt || record.expiresAt;
  if (expiry && Date.parse(expiry) <= Date.now()) return null;
  return record;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeRate(pricing) {
  if (!pricing || typeof pricing !== "object") return null;
  const rate = {};
  for (const field of ["input", "output", "cached"]) {
    const value = Number(pricing[field]);
    if (Number.isFinite(value) && value >= 0) rate[field] = value;
  }
  return Object.keys(rate).length ? rate : null;
}

function percentage(used, limit) {
  if (!(limit > 0)) return null;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

/**
 * Read-only billing view for an API-key session. All monetary figures are
 * estimates derived from recorded token usage and the configured rate card —
 * never an actual invoice. Limits are the key's own spend/token quotas.
 */
export async function GET(request) {
  try {
    const key = request.cookies.get(COOKIE_NAME)?.value;
    const record = await activeKey(key);
    if (!record) return json({ error: "Sesi key tidak valid. Masukkan API key kembali." }, 401);

    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "7d";
    if (!PERIODS.has(period)) return json({ error: "Periode tidak valid." }, 400);

    const since = period === "all"
      ? "1970-01-01T00:00:00.000Z"
      : new Date(Date.now() - PERIOD_MS[period]).toISOString();
    const dailySince = new Date(Date.now() - PERIOD_MS[period === "24h" ? "24h" : period === "7d" ? "7d" : "30d"]).toISOString();

    const db = await getAdapter();
    const [totalsRow, modelRows, providerRows, dailyRows] = await Promise.all([
      db.get(
        `SELECT COUNT(*) AS requests,
                COALESCE(SUM(promptTokens), 0) AS promptTokens,
                COALESCE(SUM(completionTokens), 0) AS completionTokens,
                COALESCE(SUM(cost), 0) AS cost,
                SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%error%'
                           OR UPPER(COALESCE(status, '')) LIKE 'FAILED%' THEN 1 ELSE 0 END) AS failedRequests
         FROM usageHistory WHERE apiKey = ? AND timestamp >= ?`,
        [key, since]
      ),
      db.all(
        `SELECT provider, model, COUNT(*) AS requests,
                COALESCE(SUM(promptTokens), 0) AS promptTokens,
                COALESCE(SUM(completionTokens), 0) AS completionTokens,
                COALESCE(SUM(cost), 0) AS cost
         FROM usageHistory WHERE apiKey = ? AND timestamp >= ?
         GROUP BY provider, model ORDER BY cost DESC, requests DESC LIMIT 100`,
        [key, since]
      ),
      db.all(
        `SELECT provider, COUNT(*) AS requests,
                COALESCE(SUM(promptTokens + completionTokens), 0) AS tokens,
                COALESCE(SUM(cost), 0) AS cost
         FROM usageHistory WHERE apiKey = ? AND timestamp >= ?
         GROUP BY provider ORDER BY cost DESC`,
        [key, since]
      ),
      db.all(
        `SELECT substr(timestamp, 1, 10) AS day,
                COUNT(*) AS requests, COALESCE(SUM(cost), 0) AS cost
         FROM usageHistory WHERE apiKey = ? AND timestamp >= ?
         GROUP BY day ORDER BY day ASC LIMIT 31`,
        [key, dailySince]
      ),
    ]);

    // Friendly provider names for the breakdown. Custom connections are
    // identified by their provider-node name when available.
    let nodeNames = new Map();
    try {
      const nodes = await getProviderNodes();
      nodeNames = new Map(
        (nodes || []).filter((node) => node?.id && node?.name).map((node) => [node.id, node.name])
      );
    } catch {}
    const providerName = (id) => {
      if (!id) return "Unknown";
      return nodeNames.get(id) || AI_PROVIDERS[id]?.name || getProviderByAlias(id)?.name || id;
    };

    const models = await Promise.all((modelRows || []).map(async (row) => ({
      provider: row.provider || "",
      providerName: providerName(row.provider),
      model: row.model || "",
      requests: numberOrZero(row.requests),
      promptTokens: numberOrZero(row.promptTokens),
      completionTokens: numberOrZero(row.completionTokens),
      tokens: numberOrZero(row.promptTokens) + numberOrZero(row.completionTokens),
      cost: numberOrZero(row.cost),
      rate: normalizeRate(await getPricingForModel(row.provider, row.model).catch(() => null)),
    })));

    const cycleWindow = record.tokenLimitWindow || "24h";
    const resetEnabled = record.tokenResetEnabled !== false;
    const cycleInfo = getQuotaCycle(cycleWindow, {
      cycleStart: record.tokenCycleStart || record.createdAt,
      resetEnabled,
    });
    const live = await getKeyLiveStats(key, {
      window: cycleWindow,
      cycleStart: record.tokenCycleStart || record.createdAt,
      resetEnabled,
    }).catch(() => null);

    const spendLimit = numberOrZero(record.spendLimit);
    const baseTokenLimit = numberOrZero(record.tokenLimit);
    const topupTokens = numberOrZero(record.topupTokens);
    const tokenLimit = numberOrZero(record.effectiveTokenLimit ?? record.tokenLimit);
    const cycleCost = numberOrZero(live?.cost);
    const cycleTokens = numberOrZero(live?.tokensUsed);
    const expiresAt = record.effectiveExpiresAt || record.expiresAt || null;

    const limits = {
      spendLimit,
      tokenLimit,
      baseTokenLimit,
      topupTokens,
      topupExpiresAt: record.topupExpiresAt || null,
      tokenLimitWindow: cycleWindow,
      tokenResetEnabled: resetEnabled,
      dailyLimit: numberOrZero(record.dailyLimit),
      minuteLimit: numberOrZero(record.minuteLimit),
      hourLimit: numberOrZero(record.hourLimit),
      monthLimit: numberOrZero(record.monthLimit),
      tokensPerMinuteLimit: numberOrZero(record.tokensPerMinuteLimit),
      maxConcurrentLimit: numberOrZero(record.maxConcurrentLimit),
    };

    const totals = {
      requests: numberOrZero(totalsRow?.requests),
      promptTokens: numberOrZero(totalsRow?.promptTokens),
      completionTokens: numberOrZero(totalsRow?.completionTokens),
      tokens: numberOrZero(totalsRow?.promptTokens) + numberOrZero(totalsRow?.completionTokens),
      cost: numberOrZero(totalsRow?.cost),
      failedRequests: numberOrZero(totalsRow?.failedRequests),
    };

    return json({
      key: {
        name: record.name || "",
        masked: maskApiKey(key),
        createdAt: record.createdAt || null,
        expiresAt,
      },
      period,
      generatedAt: new Date().toISOString(),
      totals,
      limits,
      cycle: {
        window: cycleWindow,
        requests: numberOrZero(live?.requests),
        tokensUsed: cycleTokens,
        tokensRemaining: tokenLimit > 0 ? Math.max(0, tokenLimit - cycleTokens) : null,
        cost: cycleCost,
        windowStart: cycleInfo.start || null,
        resetAt: cycleInfo.resetAt || null,
        expiresAt,
        resetEnabled,
        spendPercent: percentage(cycleCost, spendLimit),
        tokenPercent: percentage(cycleTokens, tokenLimit),
      },
      providers: (providerRows || []).map((row) => ({
        id: row.provider || "",
        name: providerName(row.provider),
        requests: numberOrZero(row.requests),
        tokens: numberOrZero(row.tokens),
        cost: numberOrZero(row.cost),
      })),
      models,
      daily: (dailyRows || []).map((row) => ({
        day: row.day,
        requests: numberOrZero(row.requests),
        cost: numberOrZero(row.cost),
      })),
    });
  } catch (error) {
    console.error("[Key billing] Fetch failed:", error);
    return json({ error: "Data billing tidak dapat dimuat. Coba muat ulang halaman." }, 500);
  }
}
