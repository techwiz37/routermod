import { NextResponse } from "next/server";
import { clearQrisTemplate, updatePaymentConfig } from "@/lib/db/repos/paymentRepo.js";
import { pickMerchantName, validateQrisTemplate } from "@/lib/payment/qris.js";
import { decodeQrFromImage, renderQrDataUrl } from "@/lib/payment/qrImage.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

async function readTemplate(request) {
  const contentType = String(request.headers.get("content-type") || "");
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file && typeof file === "object" && typeof file.arrayBuffer === "function") {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("The image must be 6 MB or smaller.");
      const buffer = Buffer.from(await file.arrayBuffer());
      const decoded = await decodeQrFromImage(buffer);
      if (!decoded) throw new Error("Could not read a QR code from the image. Try a clearer image or paste the QRIS string.");
      return decoded;
    }
    const pasted = form.get("template");
    if (typeof pasted === "string") return pasted;
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.template === "string") return body.template;
  return "";
}

export async function POST(request) {
  try {
    const template = String(await readTemplate(request) || "").trim();
    if (!template) {
      return NextResponse.json({ error: "Upload a QRIS image or paste the static QRIS string." }, { status: 400 });
    }
    const validation = validateQrisTemplate(template);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const config = await updatePaymentConfig({
      qrisTemplate: template,
      qrisMerchant: validation.merchant || pickMerchantName(template),
      qrisUpdatedAt: new Date().toISOString(),
    });
    let previewDataUrl = "";
    try { previewDataUrl = await renderQrDataUrl(template); } catch { /* preview is optional */ }
    return NextResponse.json({
      ok: true,
      qris: {
        configured: true,
        merchant: config.qrisMerchant,
        updatedAt: config.qrisUpdatedAt,
        template: config.qrisTemplate,
        previewDataUrl,
      },
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to save QRIS." }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await clearQrisTemplate();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to delete QRIS." }, { status: 500 });
  }
}
