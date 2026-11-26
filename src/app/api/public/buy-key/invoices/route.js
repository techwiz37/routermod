import { NextResponse } from "next/server";
import { getPaymentConfig } from "@/lib/db/repos/paymentRepo.js";
import {
  createKeyPurchaseInvoice,
  listKeyPurchaseInvoices,
} from "@/lib/db/repos/keyPurchaseRepo.js";
import { pickMerchantName } from "@/lib/payment/qris.js";
import { renderQrDataUrl } from "@/lib/payment/qrImage.js";
import { findTokenPackage } from "@/shared/constants/tokenPackages.js";
import {
  BUY_KEY_SESSION_COOKIE,
  buyKeyCookieOptions,
  newBuyKeySessionId,
} from "@/lib/auth/buyKeySession.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET(request) {
  try {
    const sessionId = request.cookies.get(BUY_KEY_SESSION_COOKIE)?.value;
    const invoices = await listKeyPurchaseInvoices(sessionId);
    return json({ invoices });
  } catch (error) {
    return json({ error: error.message || "Failed to load key invoices." }, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pkg = findTokenPackage(body?.packageId);
    if (!pkg) return json({ error: "Choose a valid key package.", code: "invalid_package" }, 400);

    const config = await getPaymentConfig();
    if (!config.qrisTemplate) {
      return json({ error: "QRIS payment has not been configured by the administrator.", code: "qris_not_configured" }, 409);
    }

    // Static merchant QRIS: the configured string itself, no amount injected.
    // The invoice amount is recorded server-side and must match the transfer.
    const qrisDataUrl = await renderQrDataUrl(config.qrisTemplate);
    const existingSession = request.cookies.get(BUY_KEY_SESSION_COOKIE)?.value;
    const sessionId = existingSession || newBuyKeySessionId();
    const { invoice, reused } = await createKeyPurchaseInvoice({
      sessionId,
      pkg,
      name: body?.name,
    });

    const response = json({
      invoice,
      reused,
      qris: {
        mode: "static",
        dataUrl: qrisDataUrl,
        merchant: config.qrisMerchant || pickMerchantName(config.qrisTemplate),
      },
    });
    if (!existingSession) {
      response.cookies.set(BUY_KEY_SESSION_COOKIE, sessionId, buyKeyCookieOptions(request));
    }
    return response;
  } catch (error) {
    return json({ error: error.message || "Failed to create the key invoice." }, 500);
  }
}
