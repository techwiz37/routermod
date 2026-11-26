import { NextResponse } from "next/server";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { getAdapter } from "@/lib/db/driver";
import { getQuotaCycle } from "@/lib/db/repos/keyUsageRepo.js";

import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

export const dynamic = "force-dynamic";

const COOKIE_NAME = KEY_SESSION_COOKIE;

async function activeKey(key) {
  if (!key || !(await validateApiKey(key))) return null;
  const record = await getApiKeyByKey(key);
  if (!record?.isActive) return null;
  const expiry = record.effectiveExpiresAt || record.expiresAt;
  if (expiry && Date.parse(expiry) <= Date.now()) return null;
  return record;
}

export async function GET(request) {
  try {
    const key = request.cookies.get(COOKIE_NAME)?.value;
    const keyData = await activeKey(key);
    if (!keyData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getAdapter();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const minuteAgo = new Date(now.getTime() - 60 * 1000);

    const window = keyData.tokenLimitWindow || "24h";
    // Same cycle calculation as enforcement and billing, including the case
    // where the key owner disabled token resets entirely.
    const cycle = getQuotaCycle(window, {
      cycleStart: keyData.tokenCycleStart || keyData.createdAt,
      resetEnabled: keyData.tokenResetEnabled !== false,
    });
    const cycleStart = new Date(cycle.start);

    // Token usage in cycle
    const tokenRow = db.get(
      `SELECT SUM(promptTokens + completionTokens) AS totalTokens
       FROM usageHistory
       WHERE apiKey = ? AND timestamp >= ? AND status <> 'PENDING'`,
      [key, cycleStart.toISOString()]
    );
    const tokensUsed = Number(tokenRow?.totalTokens) || 0;

    // Spend in cycle
    const spendRow = db.get(
      `SELECT SUM(cost) AS totalCost
       FROM usageHistory
       WHERE apiKey = ? AND timestamp >= ? AND status <> 'PENDING'`,
      [key, cycleStart.toISOString()]
    );
    const spend = Number(spendRow?.totalCost) || 0;

    // Daily requests
    const dailyRow = db.get(
      `SELECT COUNT(*) AS count
       FROM usageHistory
       WHERE apiKey = ? AND timestamp >= ? AND status <> 'PENDING'`,
      [key, dayAgo.toISOString()]
    );
    const dailyRequests = Number(dailyRow?.count) || 0;

    // Hourly requests
    const hourRow = db.get(
      `SELECT COUNT(*) AS count
       FROM usageHistory
       WHERE apiKey = ? AND timestamp >= ? AND status <> 'PENDING'`,
      [key, hourAgo.toISOString()]
    );
    const hourRequests = Number(hourRow?.count) || 0;

    // Per-minute requests
    const minuteRow = db.get(
      `SELECT COUNT(*) AS count
       FROM usageHistory
       WHERE apiKey = ? AND timestamp >= ? AND status <> 'PENDING'`,
      [key, minuteAgo.toISOString()]
    );
    const minuteRequests = Number(minuteRow?.count) || 0;

    // Concurrent (approximate from PENDING rows)
    const concurrentRow = db.get(
      `SELECT COUNT(*) AS count
       FROM usageHistory
       WHERE apiKey = ? AND status = 'PENDING'`,
      [key]
    );
    const concurrentRequests = Number(concurrentRow?.count) || 0;

    return NextResponse.json({
      key: {
        id: keyData.id,
        name: keyData.name,
      },
      limits: {
        tokenLimit: keyData.effectiveTokenLimit ?? keyData.tokenLimit,
        baseTokenLimit: keyData.tokenLimit,
        topupTokens: keyData.topupTokens || 0,
        topupExpiresAt: keyData.topupExpiresAt || null,
        spendLimit: keyData.spendLimit,
        dailyLimit: keyData.dailyLimit,
        hourLimit: keyData.hourLimit,
        minuteLimit: keyData.minuteLimit,
        maxConcurrentLimit: keyData.maxConcurrentLimit,
      },
      usage: {
        tokensUsed,
        spend,
        dailyRequests,
        hourRequests,
        minuteRequests,
        concurrentRequests,
      },
      cycle: {
        window,
        resetAt: cycle.resetAt,
      },
    });
  } catch (error) {
    console.error("Check limit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
