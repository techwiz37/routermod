import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { updateApiKey } from "@/lib/db/repos/apiKeysRepo.js";
import { maskApiKey } from "@/shared/utils/customApiKey.js";
import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";
import { IP_BLACKLIST_MAX_ENTRIES, isIpBlacklisted, normalizeIp, parseIpBlacklistInput } from "@/shared/utils/ipBlacklist.js";

export const dynamic = "force-dynamic";

// How many distinct addresses the page lists. Aggregated server-side so a
// customer's own traffic stays proportional to its IP count, not its requests.
const MAX_IPS = 500;

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

// A key-dashboard session cookie carries the key it owns. The owner may only
// change the IP blacklist; models, quotas and expiry stay administrator-only.

function sessionRecord(request) {
  return activeKey(request.cookies.get(KEY_SESSION_COOKIE)?.value);
}

function sameOrigin(request) {
  // SameSite=Lax does not stop same-site, cross-origin requests, so state
  // changes also require the browser's destination authority to match Origin.
  const requestUrl = new URL(request.url);
  const publicOrigin = new URL(`${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`).origin;
  return request.headers.get("origin") === publicOrigin &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function GET(request) {
  try {
    const record = await sessionRecord(request);
    if (!record) return json({ error: "Sesi key tidak valid. Masukkan API key kembali." }, 401);

    const db = await getAdapter();
    // clientIp is stamped from the real connection (custom-server overwrites the
    // forwarded header), so this list is what actually reached the API.
    const rows = db.all(
      `SELECT clientIp AS ip,
              COUNT(*) AS requests,
              COALESCE(SUM(promptTokens + completionTokens), 0) AS tokens,
              MIN(timestamp) AS firstSeenAt,
              MAX(timestamp) AS lastSeenAt
       FROM usageHistory
       WHERE apiKey = ? AND clientIp IS NOT NULL AND TRIM(clientIp) <> ''
       GROUP BY clientIp
       ORDER BY lastSeenAt DESC
       LIMIT ?`,
      [record.key, MAX_IPS]
    );

    // Rows written before normalization existed can still contain an IPv4-mapped
    // IPv6 form. Merge those onto the normalized address so a block hits both.
    const merged = new Map();
    for (const row of rows) {
      const ip = normalizeIp(row.ip);
      if (!ip) continue;
      const current = merged.get(ip);
      if (!current) {
        merged.set(ip, {
          ip,
          requests: Number(row.requests) || 0,
          tokens: Number(row.tokens) || 0,
          firstSeenAt: row.firstSeenAt || null,
          lastSeenAt: row.lastSeenAt || null,
        });
        continue;
      }
      current.requests += Number(row.requests) || 0;
      current.tokens += Number(row.tokens) || 0;
      if (row.firstSeenAt && (!current.firstSeenAt || row.firstSeenAt < current.firstSeenAt)) current.firstSeenAt = row.firstSeenAt;
      if (row.lastSeenAt && (!current.lastSeenAt || row.lastSeenAt > current.lastSeenAt)) current.lastSeenAt = row.lastSeenAt;
    }

    const blacklist = Array.isArray(record.ipBlacklist) ? record.ipBlacklist : [];
    const ips = [...merged.values()]
      .map((row) => ({ ...row, blocked: isIpBlacklisted(row.ip, blacklist) }))
      .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));

    return json({
      key: { name: record.name, masked: maskApiKey(record.key), createdAt: record.createdAt || null },
      permissions: record.access || { restricted: false, allow: [] },
      limits: {
        dailyLimit: record.dailyLimit || 0,
        minuteLimit: record.minuteLimit || 0,
        hourLimit: record.hourLimit || 0,
        monthLimit: record.monthLimit || 0,
        tokenLimit: record.effectiveTokenLimit || record.tokenLimit || 0,
        tokenLimitWindow: record.tokenLimitWindow || "24h",
        tokensPerMinuteLimit: record.tokensPerMinuteLimit || 0,
        maxConcurrentLimit: record.maxConcurrentLimit || 0,
        spendLimit: record.spendLimit || 0,
      },
      ips,
      blacklist,
    });
  } catch (error) {
    console.error("[Key permissions] Load failed:", error);
    return json({ error: "Daftar IP tidak dapat dimuat. Coba muat ulang halaman." }, 500);
  }
}

export async function PATCH(request) {
  if (!sameOrigin(request)) return json({ error: "Permintaan harus berasal dari dashboard ini." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Format permintaan tidak valid." }, 415);
  }
  try {
    const record = await sessionRecord(request);
    if (!record) return json({ error: "Sesi key tidak valid. Masukkan API key kembali." }, 401);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((field) => field !== "ipBlacklist")) {
      return json({ error: "Permintaan hanya boleh berisi daftar IP yang diblokir." }, 400);
    }
    const { valid, invalid } = parseIpBlacklistInput(body.ipBlacklist);
    if (invalid.length) {
      return json({ error: `IP tidak valid: ${invalid.slice(0, 10).join(", ")}` }, 400);
    }
    if (valid.length > IP_BLACKLIST_MAX_ENTRIES) {
      return json({ error: `Daftar IP melebihi batas ${IP_BLACKLIST_MAX_ENTRIES} entri.` }, 400);
    }

    const updated = await updateApiKey(record.id, { ipBlacklist: valid });
    if (!updated) return json({ error: "Daftar IP tidak dapat disimpan. Coba lagi." }, 500);
    return json({ blacklist: updated.ipBlacklist || [] });
  } catch (error) {
    // Database errors can contain values from other rows. Never echo them.
    console.error("[Key permissions] Save failed");
    return json({ error: "Daftar IP tidak dapat disimpan. Coba lagi." }, 500);
  }
}
