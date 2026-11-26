import { NextResponse } from "next/server";
import { enqueueWhatsAppMessage, getQueueOutcome, normalizeWhatsAppJid } from "@/lib/automate/whatsappQueue";
import { WhatsAppControlError, requireWhatsAppConnected } from "@/lib/automate/whatsappControl";
import { getAutomateConfig } from "@/lib/db/repos/automateRepo";
import { formatNotificationTime } from "@/lib/automate/notificationFormat";

export async function POST(req) {
  try {
    const { recipient } = await req.json();

    const jid = normalizeWhatsAppJid(recipient);
    const saved = (await getAutomateConfig()).whatsappRecipient;
    if (!jid || (jid.endsWith("@g.us") && jid !== saved)) {
      return NextResponse.json({ error: "Enter a valid phone number or save the group invite first." }, { status: 400 });
    }
    await requireWhatsAppConnected();

    const message = `🤖 *RouterMod Automate Test*\n\nNotifikasi WhatsApp berhasil terhubung!\n\n_Waktu: ${formatNotificationTime()}_`;

    try {
      enqueueWhatsAppMessage(jid, message);

      // The bot polls the same queue every 5s. Wait briefly so the response can
      // report a real delivery result instead of pretending a queue write is
      // proof the message reached WhatsApp.
      let outcome = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        outcome = getQueueOutcome(jid, message);
        if (outcome?.sent === 1 || (outcome?.attempts || 0) > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const delivered = outcome?.sent === 1;
      return NextResponse.json({
        success: true,
        jid,
        delivered,
        error: delivered ? null : outcome?.last_error || "Belum terkirim, masih dalam antrean bot.",
        message: delivered
          ? "Pesan test berhasil dikirim ke WhatsApp."
          : "Pesan test masuk antrean, bot belum berhasil mengirimkannya.",
      });
    } catch (dbError) {
      console.error("[AUTOMATE] WhatsApp queue error:", dbError.message);
      return NextResponse.json(
        { error: `Gagal menulis ke queue database: ${dbError.message}` },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error instanceof WhatsAppControlError ? error.status : 500 });
  }
}
