import { NextResponse } from "next/server";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { listClaimsForKey } from "@/lib/db/repos/promosRepo.js";
import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
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
    const key = request.cookies.get(KEY_SESSION_COOKIE)?.value;
    const record = await activeKey(key);
    if (!record) return json({ error: "The key session is invalid. Enter your API key again." }, 401);

    const claims = await listClaimsForKey(record.id);
    return json({
      claims,
      topup: {
        tokens: Number(record.topupTokens) || 0,
        expiresAt: record.topupExpiresAt || null,
      },
    });
  } catch (error) {
    return json({ error: error.message || "Failed to load promo claims" }, 500);
  }
}
