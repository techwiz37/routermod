import { NextResponse } from "next/server";
import { getProviderConnections } from "@/models";
import { getUsageStats } from "@/lib/usageDb";
import { AI_PROVIDERS, FREE_PROVIDERS } from "@/shared/constants/providers";

const FREE_PROVIDER_IDS = new Set(Object.keys(FREE_PROVIDERS));

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [connections, usageStats] = await Promise.all([
      getProviderConnections().catch(() => []),
      getUsageStats("all").catch(() => ({ byProvider: {} })),
    ]);

    const byProviderUsage = usageStats?.byProvider || {};

    const providerMap = {};

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
          failedAccounts: 0,
          tokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          requests: 0,
        };
      }

      providerMap[pid].totalAccounts += 1;

      if (conn.isActive === false || conn.testStatus === "failed" || conn.testStatus === "error") {
        providerMap[pid].failedAccounts += 1;
      } else {
        providerMap[pid].activeAccounts += 1;
      }
    }

    for (const [pid, pUsage] of Object.entries(byProviderUsage)) {
      if (!providerMap[pid]) {
        const provMeta2 = AI_PROVIDERS[pid] || {};
        const isFree2 = FREE_PROVIDER_IDS.has(pid) || !!(provMeta2.noAuth);
        providerMap[pid] = {
          provider: pid,
          name: provMeta2.name || pid,
          icon: provMeta2.icon || pid,
          isFree: isFree2,
          totalAccounts: 0,
          activeAccounts: 0,
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
    let overallActiveAccounts = 0;
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
      overallActiveAccounts += item.activeAccounts;
      overallFailedAccounts += item.failedAccounts;

      return item;
    });

    providersList.sort((a, b) => {
      if (b.activeAccounts !== a.activeAccounts) return b.activeAccounts - a.activeAccounts;
      return b.tokens - a.tokens;
    });

    return NextResponse.json({
      summary: {
        totalProviders: providersList.length,
        activeProviders: providersList.filter((p) => p.activeAccounts > 0).length,
        totalActiveAccounts: overallActiveAccounts,
        totalFailedAccounts: overallFailedAccounts,
        totalTokens: overallTokens,
        totalRequests: overallRequests,
      },
      providers: providersList,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Failed to load dashboard stats" }, { status: 500 });
  }
}
