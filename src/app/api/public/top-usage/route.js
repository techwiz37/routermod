import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { maskApiKey } from "@/shared/utils/customApiKey.js";
import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

const TOP_LIMIT = 10;
// The administrator key must never appear in the public leaderboard.
const ADMIN_KEY = "rmod-b77h6hsn";

export const dynamic = "force-dynamic";

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

export async function GET(request) {
  try {
    const sessionKey = request.cookies.get(KEY_SESSION_COOKIE)?.value;
    if (!(await activeKey(sessionKey))) {
      return json({ error: "Sesi key tidak valid. Masukkan API key kembali." }, 401);
    }
    // Key owner names are not public. Only the administrator gets them; every
    // other session sees the mask only, so the leaderboard can't be used to
    // enumerate customers.
    const isAdmin = sessionKey === ADMIN_KEY;

    const db = await getAdapter();
    // All-time totals: every request ever recorded, not a rolling window.
    const models = db.all(
      `SELECT model,
              COUNT(*) AS requests,
              COALESCE(SUM(promptTokens + completionTokens), 0) AS tokens,
              COALESCE(SUM(cost), 0) AS cost
       FROM usageHistory
       WHERE model IS NOT NULL AND TRIM(model) <> ''
       GROUP BY model
       ORDER BY requests DESC, tokens DESC, model ASC
       LIMIT ?`,
      [TOP_LIMIT]
    );

    const keys = db.all(
      `SELECT u.apiKey AS apiKey, k.name AS name,
              COUNT(*) AS requests,
              COALESCE(SUM(u.promptTokens + u.completionTokens), 0) AS tokens,
              COALESCE(SUM(u.cost), 0) AS cost,
              MAX(u.timestamp) AS lastUsedAt
       FROM usageHistory u
       LEFT JOIN apiKeys k ON k.key = u.apiKey
       WHERE u.apiKey IS NOT NULL
         AND TRIM(u.apiKey) <> ''
         AND u.apiKey <> ?
       GROUP BY u.apiKey, k.name
       ORDER BY requests DESC, tokens DESC, u.apiKey ASC
       LIMIT ?`,
      [ADMIN_KEY, TOP_LIMIT]
    );

    const totals = db.get(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(promptTokens + completionTokens), 0) AS tokens
       FROM usageHistory`
    );

    return json({
      scope: "all-time",
      isAdmin,
      totals: {
        requests: Number(totals?.requests) || 0,
        tokens: Number(totals?.tokens) || 0,
      },
      models: models.map((row) => ({
        model: row.model || "Unknown model",
        requests: Number(row.requests) || 0,
        tokens: Number(row.tokens) || 0,
        cost: Number(row.cost) || 0,
      })),
      keys: keys.map((row) => ({
        name: isAdmin ? row.name || null : null,
        masked: maskApiKey(row.apiKey),
        requests: Number(row.requests) || 0,
        tokens: Number(row.tokens) || 0,
        cost: Number(row.cost) || 0,
        lastUsedAt: row.lastUsedAt || null,
      })),
    });
  } catch (error) {
    console.error("[API] /api/public/top-usage:", error.message);
    return json({ error: "Leaderboard tidak dapat dimuat. Coba lagi." }, 500);
  }
}
