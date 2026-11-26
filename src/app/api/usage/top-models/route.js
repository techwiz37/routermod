import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get("limit") || 10);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 10)) : 10;

    const db = await getAdapter();
    
    // Daily aggregates include pending/failed attempts. Count completed successes
    // from history so each successful request contributes once, with its usage.
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sorted = db.all(`
      SELECT model, COUNT(*) AS totalRequests,
        SUM(COALESCE(promptTokens, 0) + COALESCE(completionTokens, 0)) AS totalTokens
      FROM usageHistory
      WHERE timestamp >= ? AND timestamp <= ?
        AND lower(trim(status)) IN ('ok', '200 ok')
      GROUP BY model
      ORDER BY totalRequests DESC, totalTokens DESC, model ASC
      LIMIT ?
    `, [start.toISOString(), end.toISOString(), limit]);

    return NextResponse.json({ data: sorted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API] /api/usage/top-models:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch top models" },
      { status: 500 }
    );
  }
}
