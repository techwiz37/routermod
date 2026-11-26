import { NextResponse } from "next/server";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { getPaymentConfig } from "@/lib/db/repos/paymentRepo.js";
import { createTopupInvoice, listInvoicesForKey } from "@/lib/db/repos/topupRepo.js";
import { pickMerchantName } from "@/lib/payment/qris.js";
import { renderQrDataUrl } from "@/lib/payment/qrImage.js";
import { findTokenPackage } from "@/shared/constants/tokenPackages.js";
import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request) {
  try {
    const key = request.cookies.get(KEY_SESSION_COOKIE)?.value;
    const record = await activeKey(key);
    if (!record) return json({ error: "The key session is invalid. Enter your API key again." }, 401);

    const invoices = await listInvoicesForKey(key);
    return json({ invoices, topup: topupSnapshot(record) });
  } catch (error) {
    return json({ error: error.message || "Failed to load topup invoices." }, 500);
  }
}

export async function POST(request) {
  try {
    const key = request.cookies.get(KEY_SESSION_COOKIE)?.value;
    const record = await activeKey(key);
    if (!record) return json({ error: "The key session is invalid. Enter your API key again." }, 401);

    const body = await request.json().catch(() => ({}));
    const pkg = findTokenPackage(body?.packageId);
    if (!pkg) return json({ error: "Choose a valid token package.", code: "invalid_package" }, 400);

    const config = await getPaymentConfig();
    if (!config.qrisTemplate) {
      return json({ error: "QRIS payment has not been configured by the administrator.", code: "qris_not_configured" }, 409);
    }

    // Static merchant QRIS: the exact configured string, no amount injected.
    // The invoice amount is recorded server-side and must match the transfer.
    const qrisDataUrl = await renderQrDataUrl(config.qrisTemplate);
    const { invoice, reused } = await createTopupInvoice({ apiKey: key, keyId: record.id, pkg });

    return json({
      invoice,
      reused,
      qris: {
        mode: "static",
        dataUrl: qrisDataUrl,
        merchant: config.qrisMerchant || pickMerchantName(config.qrisTemplate),
      },
      topup: topupSnapshot(record),
    });
  } catch (error) {
    return json({ error: error.message || "Failed to create the topup invoice." }, 500);
  }
}
