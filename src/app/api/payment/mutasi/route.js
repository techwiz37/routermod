import { NextResponse } from "next/server";
import { getGopaySession, publicGopayStatus, saveGopaySession } from "@/lib/db/repos/paymentRepo.js";
import { settleTopupInvoices } from "@/lib/db/repos/topupRepo.js";
import { settleKeyPurchaseInvoices } from "@/lib/db/repos/keyPurchaseRepo.js";
import { fetchGopayMutations } from "@/lib/payment/gopay.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") === "today" ? "today" : "month";
    const session = await getGopaySession();
    if (!session.authorized) {
      return json({ error: "GoPay Merchant is not connected. Sign in first.", code: "not_connected" }, 400);
    }

    const result = await fetchGopayMutations(session, range);
    const nextSession = result.session || session;
    if (
      nextSession.access_token !== session.access_token
      || nextSession.refresh_token !== session.refresh_token
      || nextSession.merchant_id !== session.merchant_id
    ) {
      await saveGopaySession(nextSession);
    }

    if (result.error) {
      if (result.error === "not_connected") {
        return json({ error: "The GoPay session is invalid. Sign in again.", code: result.error }, 401);
      }
      if (result.error === "no_merchant") {
        return json({ error: "Merchant ID was not found on this GoPay account.", code: result.error }, 400);
      }
      if (result.error === "upstream_401" || result.error === "upstream_403") {
        return json({ error: "The GoPay session was rejected. Sign in again.", code: result.error }, 401);
      }
      return json({ error: "Failed to fetch mutations from GoPay.", code: result.error }, 502);
    }

    const rows = [...result.rows].sort((a, b) => {
      const left = a.timestamp ? Date.parse(a.timestamp) : 0;
      const right = b.timestamp ? Date.parse(b.timestamp) : 0;
      return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
    });
    // Settle any pending QRIS topup invoices against these mutations. Safe to
    // repeat: a mutation id can only be consumed once.
    const settled = await settleTopupInvoices(result.rows).catch(() => []);
    // Buy Key invoices share the same mutation registry, so the same rows are
    // offered here too; the unique claim decides which invoice (if any) wins.
    const keySettled = await settleKeyPurchaseInvoices(result.rows).catch(() => []);
    const total = rows.reduce((sum, row) => sum + (Number(row.jumlah) || 0), 0);
    return json({
      rows,
      count: rows.length,
      total,
      settled: settled.length,
      keySettled: keySettled.length,
      range,
      fetchedAt: new Date().toISOString(),
      refreshed: !!result.refreshed,
      gopay: publicGopayStatus(nextSession),
    });
  } catch (error) {
    return json({ error: error.message || "Failed to fetch GoPay mutations." }, 500);
  }
}
