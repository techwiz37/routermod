import { NextResponse } from "next/server";
import { getProviderConnections } from "@/models";
import { getUsageStats } from "@/lib/usageDb";
import { AI_PROVIDERS, FREE_PROVIDERS } from "@/shared/constants/providers";
import { startBackgroundConnectionHealth, runDeadAccountsCheck } from "@/sse/services/backgroundConnectionHealth";

const FREE_PROVIDER_IDS = new Set(Object.keys(FREE_PROVIDERS));

export const dynamic = "force-dynamic";

function classifyConnection(conn) {
  if (conn.isActive === false) {
    return { status: "dead", reason: "Dinonaktifkan", isLimited: false, isDead: true };
  }

  const testStatus = conn.testStatus;
  const lastError = (conn.lastError || "").toLowerCase();
  const errorCode = String(conn.errorCode || "");
  const now = Date.now();

  // Check rateLimitedUntil
  const hasActiveRateLimit = conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > now;

  // Check active model locks
  let earliestModelLock = null;
  for (const [k, v] of Object.entries(conn)) {
    if (k.startsWith("modelLock_") && v) {
      const lockTime = new Date(v).getTime();
      if (lockTime > now) {
        if (!earliestModelLock || lockTime < new Date(earliestModelLock).getTime()) {
          earliestModelLock = v;
        }
      }
    }
  }

  const isLimitError =
    lastError.includes("quota") ||
    lastError.includes("rate") ||
    lastError.includes("429") ||
    lastError.includes("limit") ||
    lastError.includes("allowance") ||
    lastError.includes("402") ||
    lastError.includes("balance") ||
    lastError.includes("capacity") ||
    lastError.includes("exhausted") ||
    lastError.includes("too many requests") ||
    errorCode === "429" || errorCode === "402";

  // unavailable + no lastError → recently cleared limit, treat as active
  // unavailable + limit keywords → still limited
  const isUnavailableLimit =
    testStatus === "unavailable" && (isLimitError || errorCode === "429" || errorCode === "402");

  if (hasActiveRateLimit || !!earliestModelLock || isLimitError || isUnavailableLimit || testStatus === "limited" || testStatus === "rate_limited") {
    let limitType = "Rate Limit (429)";
    if (errorCode === "402" || lastError.includes("balance") || lastError.includes("402")) {
      limitType = "Saldo Habis (402)";
    } else if (lastError.includes("allowance")) {
      limitType = "Kuota Periode Habis";
    } else if (lastError.includes("quota")) {
      limitType = "Quota Exceeded";
    } else if (!!earliestModelLock && !isLimitError) {
      limitType = "Model Cooldown";
    }

    return {
      status: "limited",
      limitType,
      resetAt: conn.rateLimitedUntil || earliestModelLock || null,
      reason: conn.lastError || "Akun terkena limit",
      isLimited: true,
      isDead: false,
    };
  }

  if (testStatus === "failed" || testStatus === "error" || testStatus === "unavailable") {
    return {
      status: "dead",
      reason: conn.lastError || "Koneksi gagal",
      isLimited: false,
      isDead: true,
    };
  }

  return { status: "active", reason: null, isLimited: false, isDead: false };
}

export async function GET(request) {
  try {
    try {
      startBackgroundConnectionHealth();
    } catch {}

    const { searchParams } = new URL(request.url);
    const isLiveCheck = searchParams.get("check") === "1" || searchParams.get("live") === "1";
    if (isLiveCheck) {
      // Run test on ALL active connections to detect fresh 429/402 errors
      try {
        const { testSingleConnection } = await import("@/app/api/providers/[id]/test/testUtils.js");
        const { getProviderConnections: getAllConns } = await import("@/models");
        const allConns = await getAllConns().catch(() => []);
        const activeConns = allConns.filter(c => c.isActive !== false);
        // Test in batches of 5 concurrently, max 30 total to avoid timeout
        const toTest = activeConns.slice(0, 30);
        for (let i = 0; i < toTest.length; i += 5) {
          await Promise.all(
            toTest.slice(i, i + 5).map(c =>
              testSingleConnection(c.id).catch(() => null)
            )
          );
        }
      } catch {}
    }

    const [connections, usageStats] = await Promise.all([
      getProviderConnections().catch(() => []),
      getUsageStats("all").catch(() => ({ byProvider: {} })),
    ]);

    const byProviderUsage = usageStats?.byProvider || {};
    const providerMap = {};
    const limitedAccountsList = [];
    const failedAccountsList = [];

    for (const conn of connections) {
      const pid = conn.provider || "unknown";
      if (!providerMap[pid]) {
        const provMeta = AI_PROVIDERS[pid] || {};
        const isFree = FREE_PROVIDER_IDS.has(pid) || !!(provMeta.noAuth);
        providerMap[pid] = {
          provider: pid,
          name: provMeta.name || pid,
          icon: provMeta.icon || pid,
          isFree,
          totalAccounts: 0,
          activeAccounts: 0,
          limitedAccounts: 0,
          failedAccounts: 0,
          tokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          requests: 0,
        };
      }

      providerMap[pid].totalAccounts += 1;
      const classification = classifyConnection(conn);

      const connDisplayName =
        conn.displayName || conn.name || conn.email || conn.id?.slice(0, 12);

      if (classification.status === "limited") {
        providerMap[pid].limitedAccounts += 1;
        limitedAccountsList.push({
          id: conn.id,
          provider: pid,
          providerName: providerMap[pid].name,
          name: connDisplayName,
          email: conn.email || null,
          authType: conn.authType || "apikey",
          limitType: classification.limitType,
          resetAt: classification.resetAt,
          lastError: conn.lastError || classification.reason,
          lastErrorAt: conn.lastErrorAt || null,
          priority: conn.priority || 999,
        });
      } else if (classification.status === "dead") {
        providerMap[pid].failedAccounts += 1;
        failedAccountsList.push({
          id: conn.id,
          provider: pid,
          providerName: providerMap[pid].name,
          name: connDisplayName,
          email: conn.email || null,
          authType: conn.authType || "apikey",
          lastError: conn.lastError || classification.reason,
          lastErrorAt: conn.lastErrorAt || null,
          priority: conn.priority || 999,
        });
      } else {
        providerMap[pid].activeAccounts += 1;
      }
    }

    for (const [pid, pUsage] of Object.entries(byProviderUsage)) {
      if (!providerMap[pid] && pUsage.requests > 0) {
        const provMeta2 = AI_PROVIDERS[pid] || {};
        const isFree2 = FREE_PROVIDER_IDS.has(pid) || !!(provMeta2.noAuth);
        providerMap[pid] = {
          provider: pid,
          name: provMeta2.name || pid,
          icon: provMeta2.icon || pid,
          isFree: isFree2,
          totalAccounts: 0,
          activeAccounts: 0,
          limitedAccounts: 0,
          failedAccounts: 0,
          tokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          requests: 0,
        };
      }
    }

    let overallTokens = 0;
    let overallRequests = 0;
    let overallTotalAccounts = 0;
    let overallActiveAccounts = 0;
    let overallLimitedAccounts = 0;
    let overallFailedAccounts = 0;

    const providersList = Object.values(providerMap).map((item) => {
      const u = byProviderUsage[item.provider] || {};
      const prompt = u.promptTokens || 0;
      const completion = u.completionTokens || 0;
      const totalTok = prompt + completion;
      const reqCount = u.requests || 0;

      item.tokens = totalTok;
      item.promptTokens = prompt;
      item.completionTokens = completion;
      item.requests = reqCount;

      overallTokens += totalTok;
      overallRequests += reqCount;
      // Skip free/noAuth providers from account counts (no real accounts to track)
      if (!item.isFree) {
        overallTotalAccounts += item.totalAccounts;
        overallActiveAccounts += item.activeAccounts;
        overallLimitedAccounts += item.limitedAccounts;
        overallFailedAccounts += item.failedAccounts;
      }

      return item;
    });

    providersList.sort((a, b) => {
      if (b.activeAccounts !== a.activeAccounts) return b.activeAccounts - a.activeAccounts;
      if (b.totalAccounts !== a.totalAccounts) return b.totalAccounts - a.totalAccounts;
      return b.tokens - a.tokens;
    });

    return NextResponse.json({
      summary: {
        totalProviders: providersList.length,
        activeProviders: providersList.filter((p) => p.isFree || p.activeAccounts > 0).length,
        totalAccounts: overallTotalAccounts,
        totalActiveAccounts: overallActiveAccounts,
        totalLimitedAccounts: overallLimitedAccounts,
        totalFailedAccounts: overallFailedAccounts,
        totalTokens: overallTokens,
        totalRequests: overallRequests,
        liveCheckIntervalSec: 60,
      },
      providers: providersList,
      limitedAccountsList,
      failedAccountsList,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Failed to load dashboard stats" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runDeadAccountsCheck();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
