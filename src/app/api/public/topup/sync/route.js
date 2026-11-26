import { NextResponse } from "next/server";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { getGopaySession, publicGopayStatus, saveGopaySession } from "@/lib/db/repos/paymentRepo.js";
import { listInvoicesForKey, settleTopupInvoices } from "@/lib/db/repos/topupRepo.js";
import { fetchGopayMutations } from "@/lib/payment/gopay.js";
import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GoBiz mutation reads are shared across every topup page. A short process-wide
// throttle keeps polling cheap without making a returning customer wait long.
const MIN_INTERVAL_MS = 6_000;
if (!global._topupSync) global._topupSync = { at: 0 };
const syncState = global._topupSync;

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

function topupSnapshot(record) {
  return {
    tokens: record?.topupTokens || 0,
    expiresAt: record?.topupExpiresAt || null,
    effectiveTokenLimit: record?.effectiveTokenLimit ?? record?.tokenLimit ?? 0,
    keyExpiresAt: record?.effectiveExpiresAt || record?.expiresAt || null,
  };
}

async function currentState(key, reason, extra = {}) {
  const record = await getApiKeyByKey(key);
  const invoices = await listInvoicesForKey(key);
  return json({
    synced: false,
    reason,
    invoices,
    topup: topupSnapshot(record),
    ...extra,
  });
}

export async function POST(request) {
  try {
    const key = request.cookies.get(KEY_SESSION_COOKIE)?.value;
    const record = await activeKey(key);
    if (!record) return json({ error: "The key session is invalid. Enter your API key again." }, 401);

    const session = await getGopaySession();
    if (!session.authorized) return currentState(key, "not_connected");

    const now = Date.now();
    if (now - (syncState.at || 0) < MIN_INTERVAL_MS) {
      return currentState(key, "throttled");
    }
    syncState.at = now;

    const result = await fetchGopayMutations(session, "month");
    const nextSession = result.session || session;
    if (
      nextSession.access_token !== session.access_token
      || nextSession.refresh_token !== session.refresh_token
      || nextSession.merchant_id !== session.merchant_id
    ) {
      await saveGopaySession(nextSession);
    }

    if (result.error) {
      return currentState(key, result.error, { gopay: publicGopayStatus(nextSession) });
    }

    const settled = await settleTopupInvoices(result.rows);
    const mine = settled.filter((entry) => entry.apiKey === key);
    // Report the farthest key extension when this sync settled one or more
    // invoices for this key, so the page can show the new active-until date.
    const keyExtendedTo = mine.reduce((latest, entry) => {
      if (!entry.keyExtendedTo) return latest;
      if (!latest || Date.parse(entry.keyExtendedTo) > Date.parse(latest)) return entry.keyExtendedTo;
      return latest;
    }, null);
    const fresh = await getApiKeyByKey(key);
    const invoices = await listInvoicesForKey(key);

    return json({
      synced: true,
      reason: null,
      settled: mine.length,
      keyExtendedTo,
      invoices,
      topup: topupSnapshot(fresh),
      gopay: publicGopayStatus(nextSession),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json({ error: error.message || "Failed to sync topup payments." }, 500);
  }
}
