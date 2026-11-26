import { getAdapter } from "@/lib/db/driver.js";

export const dynamic = "force-dynamic";

/** Lifetime usage totals per API key, used by the WhatsApp .keys command. */
export async function GET() {
  try {
    const db = await getAdapter();
    const rows = db.all(`
      SELECT apiKey,
             COUNT(*) AS requests,
             COALESCE(SUM(promptTokens), 0) + COALESCE(SUM(completionTokens), 0) AS tokens,
             COALESCE(SUM(cost), 0) AS cost
      FROM usageHistory
      WHERE apiKey IS NOT NULL AND apiKey <> ''
      GROUP BY apiKey
    `);
    const totals = {};
    for (const row of rows) {
      totals[row.apiKey] = {
        requests: Number(row.requests) || 0,
        tokens: Number(row.tokens) || 0,
        cost: Number(row.cost) || 0,
      };
    }
    return Response.json({ totals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
