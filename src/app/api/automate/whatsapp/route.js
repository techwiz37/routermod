import { normalizeWhatsAppPhone } from "@/lib/automate/whatsappQueue";
import { WhatsAppControlError, whatsappControl } from "@/lib/automate/whatsappControl";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json(await whatsappControl("/status"), { headers });
  } catch {
    return Response.json({ state: "unavailable" }, { headers });
  }
}

export async function POST(req) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Expected JSON." }, { status: 415, headers });
  }
  const body = await req.json().catch(() => null);
  const number = normalizeWhatsAppPhone(body?.number);
  if (!number) return Response.json({ error: "Enter the bot phone number with its country code." }, { status: 400, headers });
  try {
    return Response.json(await whatsappControl("/pair", { number, fresh: body?.fresh === true }), { headers });
  } catch (error) {
    const known = error instanceof WhatsAppControlError;
    return Response.json({ error: known ? error.message : "Pairing failed." }, { status: known ? error.status : 500, headers });
  }
}
