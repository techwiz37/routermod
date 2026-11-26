import { NextResponse } from "next/server";
import { getGopaySession, publicGopayStatus, saveGopaySession } from "@/lib/db/repos/paymentRepo.js";
import {
  listKeyPurchaseInvoices,
  settleKeyPurchaseInvoices,
} from "@/lib/db/repos/keyPurchaseRepo.js";
import { fetchGopayMutations } from "@/lib/payment/gopay.js";
import { BUY_KEY_SESSION_COOKIE } from "@/lib/auth/buyKeySession.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GoBiz mutation reads are shared across every public payment page. A short
// process-wide throttle keeps polling cheap without making a buyer wait long.
const MIN_INTERVAL_MS = 6_000;
if (!global._buyKeySync) global._buyKeySync = { at: 0 };
const syncState = global._buyKeySync;

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

async function currentState(sessionId, reason, extra = {}) {
  const invoices = await listKeyPurchaseInvoices(sessionId);
  return json({ synced: false, reason, invoices, ...extra });
}

export async function POST(request) {
  try {
    const sessionId = request.cookies.get(BUY_KEY_SESSION_COOKIE)?.value;
    if (!sessionId) return json({ synced: false, reason: "no_session", invoices: [] });

    const session = await getGopaySession();
    if (!session.authorized) return currentState(sessionId, "not_connected");

    const now = Date.now();
    if (now - (syncState.at || 0) < MIN_INTERVAL_MS) {
      return currentState(sessionId, "throttled");
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
      return currentState(sessionId, result.error, { gopay: publicGopayStatus(nextSession) });
    }

    const settled = await settleKeyPurchaseInvoices(result.rows);
    const mine = settled.filter((entry) => entry.sessionId === sessionId);
    const invoices = await listKeyPurchaseInvoices(sessionId);

    return json({
      synced: true,
      reason: null,
      settled: mine.length,
      key: mine[0] || null,
      invoices,
      gopay: publicGopayStatus(nextSession),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json({ error: error.message || "Failed to sync the key payment." }, 500);
  }
}
