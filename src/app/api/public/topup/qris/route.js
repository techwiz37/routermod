import { NextResponse } from "next/server";
import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { getPaymentConfig } from "@/lib/db/repos/paymentRepo.js";
import { pickMerchantName, setQrisAmount } from "@/lib/payment/qris.js";
import { renderQrDataUrl } from "@/lib/payment/qrImage.js";
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

export async function POST(request) {
  try {
    const key = request.cookies.get(KEY_SESSION_COOKIE)?.value;
    const record = await activeKey(key);
    if (!record) return json({ error: "The key session is invalid. Enter your API key again." }, 401);

    const body = await request.json().catch(() => ({}));
    const amount = Math.floor(Number(body.amount));
    const config = await getPaymentConfig();
    const min = Math.max(1000, Number(config.topupMin) || 10000);
    const max = Math.max(min, Number(config.topupMax) || 10000000);
    if (!Number.isFinite(amount) || amount < min || amount > max) {
      return json({
        error: "Topup amount must be between the allowed minimum and maximum.",
        code: "amount_out_of_range",
        min,
        max,
      }, 400);
    }
    if (!config.qrisTemplate) {
      return json({ error: "QRIS payment has not been configured by the administrator.", code: "qris_not_configured" }, 409);
    }

    const dynamicPayload = setQrisAmount(config.qrisTemplate, amount);
    if (!dynamicPayload) {
      return json({ error: "The merchant QRIS cannot be made dynamic. Contact the administrator.", code: "qris_invalid" }, 409);
    }

    const qrisDataUrl = await renderQrDataUrl(dynamicPayload);
    return json({
      amount,
      merchant: config.qrisMerchant || pickMerchantName(config.qrisTemplate),
      qrisDataUrl,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    return json({ error: error.message || "Failed to generate the topup QRIS." }, 500);
  }
}
