import { NextResponse } from "next/server";
import { formatNotificationTime } from "@/lib/automate/notificationFormat";

export async function POST(req) {
  try {
    const { botToken, chatId } = await req.json();
    
    if (!botToken || !chatId) {
      return NextResponse.json({ error: "Bot token dan chat ID diperlukan" }, { status: 400 });
    }

    const message = `🤖 *RouterMod Automate Test*\n\nNotifikasi Telegram berhasil terhubung!\n\n_Waktu: ${formatNotificationTime()}_`;
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const data = await response.json();
    
    if (!data.ok) {
      return NextResponse.json({ error: data.description || "Telegram API error" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Pesan test berhasil dikirim" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
