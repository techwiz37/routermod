import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { parseJson } from "@/lib/db/helpers/jsonCol.js";

export const dynamic = "force-dynamic";

const LIMIT = 20;

export async function GET() {
  try {
    const db = await getAdapter();

    const rows = db.all(
      `SELECT
        timestamp,
        provider,
        model,
        cost,
        status,
        tokens,
        duration
      FROM usageHistory
      ORDER BY id DESC
      LIMIT ?`,
      [LIMIT]
    );

    const requests = rows.map((row) => {
      const tokens = parseJson(row.tokens, {});
      const promptTokens = tokens.prompt_tokens || tokens.input_tokens || 0;
      const completionTokens = tokens.completion_tokens || tokens.output_tokens || 0;

      return {
        timestamp: row.timestamp,
        provider: row.provider,
        model: row.model,
        cost: row.cost || 0,
        status: row.status,
        promptTokens,
        completionTokens,
        duration: row.duration || null,
      };
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("[recent-requests] Error:", error);
    return NextResponse.json({ requests: [] }, { status: 500 });
  }
}