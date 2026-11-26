import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { replaceOwnApiKey } from "@/lib/db/repos/customApiKeyRepo.js";
import { maskApiKey } from "@/shared/utils/customApiKey.js";
import { KEY_SESSION_COOKIE as COOKIE_NAME, keySessionCookieOptions } from "@/lib/auth/keySession.js";

const PERIODS = new Set(["24h", "7d", "30d", "all"]);
const PERIOD_MS = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };

export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function cookieOptions(request) {
  return keySessionCookieOptions(request);
}

// Only what the key dashboard needs. `expiresAt` is required for the badge that
// tells the owner whether the credential is lifetime or when it dies — a null
// value means "no expiry", which must not be confused with "unknown".
export function publicKeyPayload(record, key) {
  const expiresAt = record.effectiveExpiresAt || record.expiresAt || null;
  return {
    name: record.name,
    masked: maskApiKey(key),
    createdAt: record.createdAt || null,
    expiresAt,
    tokenLimit: record.tokenLimit || 0,
    tokenLimitWindow: record.tokenLimitWindow || "24h",
    tokenResetEnabled: record.tokenResetEnabled !== false,
    // The owner may only rotate the secret while the admin's "Change key"
    // switch is on; otherwise Manage Keys shows a locked panel.
    changeKeyEnabled: record.changeKeyEnabled !== false,
    // "Manage IP" off makes the owner's IP page read-only for the blacklist.
    manageIpEnabled: record.manageIpEnabled !== false,
  };
}

async function activeKey(key) {
  if (!key || !(await validateApiKey(key))) return null;
  const record = await getApiKeyByKey(key);
  if (!record?.isActive) return null;
  const expiry = record.effectiveExpiresAt || record.expiresAt;
  if (expiry && Date.parse(expiry) <= Date.now()) return null;
  return record;
}

export async function POST(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const key = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const record = await activeKey(key);
    if (!record) return json({ error: "API key tidak valid, nonaktif, atau sudah kedaluwarsa." }, 401);

    const response = json({ key: publicKeyPayload(record, key) });
    response.cookies.set(COOKIE_NAME, key, cookieOptions(request));
    return response;
  } catch (error) {
    console.error("[Key dashboard] Login failed:", error);
    return json({ error: "Tidak dapat memvalidasi key saat ini. Coba lagi." }, 500);
  }
}

export async function GET(request) {
  try {
    const key = request.cookies.get(COOKIE_NAME)?.value;
    const record = await activeKey(key);
    if (!record) return json({ error: "Sesi key tidak valid. Masukkan API key kembali." }, 401);

    const period = new URL(request.url).searchParams.get("period") || "7d";
    if (!PERIODS.has(period)) return json({ error: "Periode tidak valid." }, 400);

    const since = period === "all"
      ? "1970-01-01T00:00:00.000Z"
      : new Date(Date.now() - PERIOD_MS[period]).toISOString();
    const db = await getAdapter();
    const totals = db.get(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(promptTokens), 0) AS promptTokens,
              COALESCE(SUM(completionTokens), 0) AS completionTokens,
              COALESCE(SUM(cost), 0) AS cost,
              SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%error%'
                         OR UPPER(COALESCE(status, '')) LIKE 'FAILED%' THEN 1 ELSE 0 END) AS failedRequests,
              MAX(timestamp) AS lastUsedAt
       FROM usageHistory WHERE apiKey = ? AND timestamp >= ?`,
      [key, since]
    );
    const models = db.all(
      `SELECT provider, model, COUNT(*) AS requests,
              COALESCE(SUM(promptTokens + completionTokens), 0) AS tokens,
              COALESCE(SUM(cost), 0) AS cost,
              MAX(timestamp) AS lastUsedAt
       FROM usageHistory WHERE apiKey = ? AND timestamp >= ?
        GROUP BY provider, model ORDER BY requests DESC, provider ASC, model ASC`,
      [key, since]
    );
    const daily = db.all(
      `SELECT substr(timestamp, 1, 10) AS day,
              COUNT(*) AS requests,
              COALESCE(SUM(promptTokens + completionTokens), 0) AS tokens
       FROM usageHistory WHERE apiKey = ? AND timestamp >= ?
       GROUP BY day ORDER BY day ASC LIMIT 31`,
      [key, new Date(Date.now() - (period === "24h" ? PERIOD_MS["24h"] : period === "7d" ? PERIOD_MS["7d"] : PERIOD_MS["30d"])).toISOString()]
    );
    const recent = db.all(
      `SELECT timestamp, provider, model, endpoint, promptTokens, completionTokens, cost, status
       FROM usageHistory WHERE apiKey = ? ORDER BY id DESC LIMIT 20`,
      [key]
    );

    const response = json({
      key: publicKeyPayload(record, key),
      period,
      totals: {
        requests: Number(totals?.requests) || 0,
        promptTokens: Number(totals?.promptTokens) || 0,
        completionTokens: Number(totals?.completionTokens) || 0,
        tokens: (Number(totals?.promptTokens) || 0) + (Number(totals?.completionTokens) || 0),
        cost: Number(totals?.cost) || 0,
        failedRequests: Number(totals?.failedRequests) || 0,
        lastUsedAt: totals?.lastUsedAt || null,
      },
      models: models.map((item) => ({ ...item, requests: Number(item.requests) || 0, tokens: Number(item.tokens) || 0, cost: Number(item.cost) || 0 })),
      daily: daily.map((item) => ({ ...item, requests: Number(item.requests) || 0, tokens: Number(item.tokens) || 0 })),
      recent: recent.map((item) => ({ ...item, promptTokens: Number(item.promptTokens) || 0, completionTokens: Number(item.completionTokens) || 0, cost: Number(item.cost) || 0 })),
    });
    // Sliding 24h window: a valid session stays alive while it keeps being used,
    // so the user is only signed out after a full day idle or an explicit logout.
    response.cookies.set(COOKIE_NAME, key, cookieOptions(request));
    return response;
  } catch (error) {
    console.error("[Key dashboard] Stats fetch failed:", error);
    return json({ error: "Statistik key tidak dapat dimuat. Coba muat ulang halaman." }, 500);
  }
}

export async function DELETE(request) {
  const response = json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { ...cookieOptions(request), maxAge: 0 });
  return response;
}

export async function PATCH(request) {
  // SameSite alone does not prevent same-site, cross-origin requests.
  // Next can rewrite request.url to its internal listening hostname. Host is
  // the browser's destination authority, which cross-origin JS cannot choose.
  const requestUrl = new URL(request.url);
  const publicOrigin = new URL(`${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`).origin;
  if (request.headers.get("origin") !== publicOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Permintaan harus berasal dari dashboard ini." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Format permintaan tidak valid." }, 415);
  }
  try {
    const currentKey = request.cookies.get(COOKIE_NAME)?.value;
    const record = await activeKey(currentKey);
    if (!record) return json({ error: "Sesi key tidak valid. Masukkan API key kembali." }, 401);
    if (record.changeKeyEnabled === false) {
      return json({ error: "Perubahan key dinonaktifkan oleh admin." }, 403);
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "newKey")) {
      return json({ error: "Permintaan hanya boleh berisi API key baru." }, 400);
    }
    const key = await replaceOwnApiKey(currentKey, body.newKey);
    const response = json({ key });
    response.cookies.set(COOKIE_NAME, body.newKey, cookieOptions(request));
    return response;
  } catch (error) {
    if ([400, 401, 409].includes(error.status)) return json({ error: error.message }, error.status);
    // Database errors can contain secrets. Never log the exception or query.
    return json({ error: "API key tidak dapat diubah saat ini. Coba lagi." }, 500);
  }
}
