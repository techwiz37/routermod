import { request } from "node:http";
import { normalizeWhatsAppJid, normalizeWhatsAppPhone } from "./whatsappQueue.js";

export class WhatsAppControlError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function whatsappControl(path, body) {
  return new Promise((resolve, reject) => {
    const unavailable = () => reject(new WhatsAppControlError(503, "WhatsApp bot is unavailable. Try again shortly."));
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      socketPath: process.env.ROUTERMOD_WA_SOCKET || "/root/.routermod/whatsapp/control.sock",
      path,
      method: payload ? "POST" : "GET",
      signal: AbortSignal.timeout(payload ? 45_000 : 2500),
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; if (text.length > 4096) req.destroy(new Error("Invalid bot response")); });
      res.on("error", unavailable);
      res.on("end", () => {
        try {
          const data = JSON.parse(text);
          if (res.statusCode !== 200) reject(new WhatsAppControlError(res.statusCode, data.error || "WhatsApp operation failed."));
          else resolve(data);
        } catch { unavailable(); }
      });
    });
    req.on("error", unavailable);
    req.end(payload);
  });
}

export async function getWhatsAppQueueStatus() {
  try {
    return await whatsappControl("/queue");
  } catch {
    return null;
  }
}

export async function requireWhatsAppConnected() {
  if ((await whatsappControl("/status")).state !== "connected") {
    throw new WhatsAppControlError(409, "Connect the WhatsApp bot first.");
  }
}

export async function resolveWhatsAppDestination(value) {
  const phone = normalizeWhatsAppPhone(value);
  if (phone) return `${phone}@s.whatsapp.net`;
  let url;
  if (typeof value === "string" && value.length <= 256) {
    try { url = new URL(value); } catch { /* Invalid destination below. */ }
  }
  const invite = url?.pathname.match(/^\/([A-Za-z0-9]{16,64})\/?$/)?.[1];
  if (url?.origin === "https://chat.whatsapp.com" && !url.username && !url.password && invite) {
    const { jid } = await whatsappControl("/group", { invite });
    if (normalizeWhatsAppJid(jid) && jid.endsWith("@g.us")) return jid;
    throw new WhatsAppControlError(502, "The bot did not return a valid group destination.");
  }
  throw new WhatsAppControlError(400, "Enter a phone number with country code or a valid WhatsApp group invite link.");
}
