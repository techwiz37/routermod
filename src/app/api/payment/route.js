import { NextResponse } from "next/server";
import { getGopaySession, getPaymentConfig, publicGopayStatus, updatePaymentConfig } from "@/lib/db/repos/paymentRepo.js";
import { pickMerchantName } from "@/lib/payment/qris.js";
import { renderQrDataUrl } from "@/lib/payment/qrImage.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function configPayload(config, session, previewDataUrl = "") {
  return {
    qris: {
      configured: !!config.qrisTemplate,
      merchant: config.qrisMerchant || (config.qrisTemplate ? pickMerchantName(config.qrisTemplate) : ""),
      updatedAt: config.qrisUpdatedAt || "",
      template: config.qrisTemplate || "",
      previewDataUrl,
    },
    topup: {
      min: config.topupMin,
      max: config.topupMax,
    },
    gopay: publicGopayStatus(session),
  };
}

export async function GET() {
  try {
    const [config, session] = await Promise.all([getPaymentConfig(), getGopaySession()]);
    let previewDataUrl = "";
    if (config.qrisTemplate) {
      try { previewDataUrl = await renderQrDataUrl(config.qrisTemplate); } catch { /* preview is optional */ }
    }
    return NextResponse.json(configPayload(config, session, previewDataUrl), {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load payment settings." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, "topupMin")) {
      const value = Math.floor(Number(body.topupMin));
      if (!Number.isFinite(value) || value < 1000) {
        return NextResponse.json({ error: "Invalid minimum topup (minimum IDR 1,000)." }, { status: 400 });
      }
      patch.topupMin = value;
    }
    if (Object.prototype.hasOwnProperty.call(body, "topupMax")) {
      const value = Math.floor(Number(body.topupMax));
      if (!Number.isFinite(value) || value < 1000) {
        return NextResponse.json({ error: "Invalid maximum topup." }, { status: 400 });
      }
      patch.topupMax = value;
    }
    const config = await updatePaymentConfig(patch);
    if (config.topupMax < config.topupMin) {
      return NextResponse.json({ error: "Maksimal topup harus lebih besar dari minimal topup." }, { status: 400 });
    }
    return NextResponse.json({ topup: { min: config.topupMin, max: config.topupMax } }, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to save topup settings." }, { status: 500 });
  }
}
