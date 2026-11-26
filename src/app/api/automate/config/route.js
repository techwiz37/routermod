import { NextResponse } from "next/server";
import { getAutomateConfig, updateAutomateConfig } from "@/lib/db/repos/automateRepo";
import { WhatsAppControlError, requireWhatsAppConnected, resolveWhatsAppDestination } from "@/lib/automate/whatsappControl";
import { applyKiroFarmEnv } from "@/lib/automate/kiroFarmConfig";

export async function GET() {
  try {
    const config = await getAutomateConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    if (!req.headers.get("content-type")?.startsWith("application/json")) {
      return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid configuration." }, { status: 400 });
    }
    const previous = await getAutomateConfig();
    const input = body.whatsappRecipient ?? previous.whatsappRecipient;
    if (typeof input !== "string" || input.length > 256) {
      return NextResponse.json({ error: "Invalid WhatsApp destination." }, { status: 400 });
    }
    let whatsappRecipient = input.trim();
    if (whatsappRecipient && whatsappRecipient !== previous.whatsappRecipient) {
      await requireWhatsAppConnected();
      whatsappRecipient = await resolveWhatsAppDestination(whatsappRecipient);
    }
    const merged = { ...previous, ...body, whatsappRecipient };
    await updateAutomateConfig(merged);
    // Push farming options into env immediately so the next krg.js child
    // picks them up without needing a restart.
    const kiroFarm = applyKiroFarmEnv(merged);
    return NextResponse.json({ success: true, whatsappRecipient, kiroFarm });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error instanceof WhatsAppControlError ? error.status : 500 });
  }
}
