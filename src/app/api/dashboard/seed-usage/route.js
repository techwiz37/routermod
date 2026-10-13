import { NextResponse } from "next/server";
import { saveRequestUsage } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

const MOCK_ENTRIES = [
  { provider: "openai",    model: "gpt-4o",              promptTokens: 142500, completionTokens: 89300,  cost: 0.82, requests: 142 },
  { provider: "anthropic", model: "claude-3-5-sonnet",   promptTokens: 285400, completionTokens: 174800, cost: 1.95, requests: 218 },
  { provider: "gemini",    model: "gemini-1.5-pro",      promptTokens: 85200,  completionTokens: 41200,  cost: 0.35, requests: 76  },
  { provider: "deepseek",  model: "deepseek-reasoner",   promptTokens: 620400, completionTokens: 389100, cost: 0.55, requests: 384 },
  { provider: "xai",       model: "grok-2-beta",         promptTokens: 18500,  completionTokens: 9200,   cost: 0.12, requests: 15  },
];

export async function POST() {
  try {
    const now = new Date();
    for (let i = 0; i < MOCK_ENTRIES.length; i++) {
      const s = MOCK_ENTRIES[i];
      await saveRequestUsage({
        timestamp: new Date(now.getTime() - i * 3600000).toISOString(),
        provider: s.provider,
        model: s.model,
        endpoint: "/v1/chat/completions",
        cost: s.cost,
        status: "ok",
        meta: JSON.stringify({ _mock: true }),
        tokens: {
          prompt_tokens: s.promptTokens,
          completion_tokens: s.completionTokens,
          total_tokens: s.promptTokens + s.completionTokens,
        },
      });
    }
    return NextResponse.json({ success: true, seeded: MOCK_ENTRIES.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { getAdapter } = await import("@/lib/db/driver");
    const db = await getAdapter();

    const res = db.run(`DELETE FROM usageHistory WHERE meta LIKE '%"_mock":true%'`);
    const deleted = res?.changes ?? 0;

    db.run(`
      DELETE FROM usageDaily WHERE dateKey NOT IN (
        SELECT DISTINCT substr(timestamp, 1, 10) FROM usageHistory
      )
    `);

    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
