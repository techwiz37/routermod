import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * RouterMod owns its own WhatsApp bot and queue. The bot process polls the
 * same SQLite file and sends through zapo; this module only receives messages.
 */
export const WHATSAPP_DB_PATH =
  process.env.ROUTERMOD_WA_DB || path.join("/root/.routermod/db", "whatsapp.sqlite");

const CREATE_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS message_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT NOT NULL,
    message TEXT NOT NULL,
    sent INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;

export function normalizeWhatsAppPhone(value) {
  if (typeof value !== "string" || !/^\+?[\d() -]{8,32}$/.test(value.trim())) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0") && !value.trim().startsWith("+")) digits = `62${digits.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : "";
}

/** Normalize a phone number or group id into a WhatsApp JID. */
export function normalizeWhatsAppJid(recipient) {
  const jid = typeof recipient === "string" ? recipient.trim() : "";
  if (/^(?:[1-9]\d{7,14}@s\.whatsapp\.net|\d{5,24}(?:-\d{5,24})?@g\.us)$/.test(jid)) return jid;
  const phone = normalizeWhatsAppPhone(jid);
  return phone ? `${phone}@s.whatsapp.net` : "";
}

/**
 * Insert a message into RouterMod's WhatsApp queue. Throws when the database is
 * unavailable so callers surface a useful error instead of dropping the alert.
 */
export function getQueueOutcome(jid, message) {
  if (!existsSync(WHATSAPP_DB_PATH)) return null;
  const db = new DatabaseSync(WHATSAPP_DB_PATH, { readOnly: true });
  try {
    return db.prepare(
      "SELECT sent, attempts, last_error FROM message_queue WHERE jid = ? AND message = ? ORDER BY id DESC LIMIT 1"
    ).get(jid, message) || null;
  } finally {
    db.close();
  }
}

export function enqueueWhatsAppMessage(recipient, message) {
  const jid = normalizeWhatsAppJid(recipient);
  if (!jid) throw new Error("Nomor penerima WhatsApp tidak valid");

  if (!existsSync(path.dirname(WHATSAPP_DB_PATH))) {
    throw new Error(`Direktori database WhatsApp tidak ditemukan: ${path.dirname(WHATSAPP_DB_PATH)}`);
  }

  const db = new DatabaseSync(WHATSAPP_DB_PATH);
  try {
    db.exec(CREATE_QUEUE_TABLE);
    db.prepare("INSERT INTO message_queue (jid, message) VALUES (?, ?)").run(jid, message);
    return jid;
  } finally {
    db.close();
  }
}
