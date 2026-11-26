// Promo codes for API-key owners.
//
// Admin CRUD lives here together with the claim path. A claim is recorded
// before credits are written, inside one transaction, so a repeated click or
// two tabs cannot award the same promo twice to one key.
import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";

const MAX_TOKENS = 1_000_000_000_000;
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

function isoNow() {
  return new Date().toISOString();
}

function toBool(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseMs(value) {
  const ms = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

export function normalizeCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeInput(body = {}, { partial = false } = {}) {
  const input = {};

  if (!partial || body.code !== undefined) {
    const code = normalizeCode(body.code);
    if (!code) return { error: "Promo code is required" };
    if (!CODE_RE.test(code)) {
      return { error: "Use 3–32 letters, numbers, dashes, or underscores" };
    }
    input.code = code;
  }

  if (!partial || body.tokens !== undefined) {
    const tokens = Math.floor(Number(body.tokens));
    if (!Number.isFinite(tokens) || tokens <= 0) return { error: "Token amount must be greater than zero" };
    if (tokens > MAX_TOKENS) return { error: "Token amount is too large" };
    input.tokens = tokens;
  }

  if (!partial || body.expiresAt !== undefined) {
    const ms = parseMs(body.expiresAt);
    if (ms == null) return { error: "A valid expiry date is required" };
    input.expiresAt = new Date(ms).toISOString();
  }

  if (body.isActive !== undefined) input.isActive = toBool(body.isActive, true);
  return input;
}

export function rowToPromo(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code || "",
    tokens: Number(row.tokens) || 0,
    expiresAt: row.expiresAt || null,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    claimedCount: Number(row.claimedCount) || 0,
  };
}

export async function listPromos() {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT p.*,
            (SELECT COUNT(*) FROM promoClaims c WHERE c.promoId = p.id) AS claimedCount
       FROM promos p
      ORDER BY p.createdAt DESC`
  );
  return rows.map(rowToPromo);
}

export async function getPromo(id) {
  const db = await getAdapter();
  const row = db.get(
    `SELECT p.*,
            (SELECT COUNT(*) FROM promoClaims c WHERE c.promoId = p.id) AS claimedCount
       FROM promos p WHERE p.id = ?`,
    [id]
  );
  return rowToPromo(row);
}

async function codeTaken(code, exceptId = null) {
  const db = await getAdapter();
  const row = exceptId
    ? db.get(`SELECT id FROM promos WHERE code = ? AND id != ?`, [code, exceptId])
    : db.get(`SELECT id FROM promos WHERE code = ?`, [code]);
  return Boolean(row);
}

export async function createPromo(body = {}) {
  const input = normalizeInput(body);
  if (input.error) return { error: input.error };
  if (await codeTaken(input.code)) return { error: "That promo code already exists" };

  const db = await getAdapter();
  const now = isoNow();
  const id = randomUUID();
  db.run(
    `INSERT INTO promos(id, code, tokens, expiresAt, isActive, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [id, input.code, input.tokens, input.expiresAt, input.isActive === false ? 0 : 1, now, now]
  );
  return { promo: await getPromo(id) };
}

export async function updatePromo(id, body = {}) {
  const existing = await getPromo(id);
  if (!existing) return { error: "Promo not found", notFound: true };

  const partial = normalizeInput(body, { partial: true });
  if (partial.error) return { error: partial.error };

  const next = {
    code: partial.code ?? existing.code,
    tokens: partial.tokens ?? existing.tokens,
    expiresAt: partial.expiresAt ?? existing.expiresAt,
    isActive: partial.isActive ?? existing.isActive,
  };
  if (partial.code && (await codeTaken(next.code, id))) return { error: "That promo code already exists" };

  const db = await getAdapter();
  db.run(
    `UPDATE promos SET code = ?, tokens = ?, expiresAt = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
    [next.code, next.tokens, next.expiresAt, next.isActive ? 1 : 0, isoNow(), id]
  );
  return { promo: await getPromo(id) };
}

// Claims are intentionally kept: a deleted promo must not erase the owner's
// history, and the claim snapshot already stores the code.
export async function deletePromo(id) {
  const db = await getAdapter();
  db.run(`DELETE FROM promos WHERE id = ?`, [id]);
  return { deleted: !(await getPromo(id)) };
}

export async function listClaimsForKey(keyId) {
  if (!keyId) return [];
  const db = await getAdapter();
  const rows = db.all(
    `SELECT id, promoId, code, tokens, promoExpiresAt, claimedAt
       FROM promoClaims
      WHERE keyId = ?
      ORDER BY claimedAt DESC, id DESC`,
    [keyId]
  );
  return rows.map((row) => ({
    id: row.id,
    promoId: row.promoId,
    code: row.code || "",
    tokens: Number(row.tokens) || 0,
    expiresAt: row.promoExpiresAt || null,
    claimedAt: row.claimedAt || null,
  }));
}

/**
 * Claim a promo for one key. The claim row is the concurrency guard: its
 * unique (promoId, keyId) index means a second claim can never credit twice.
 * Tokens are merged into the existing topup bucket and keep the later expiry,
 * so an active paid topup is never shortened by a short-lived promo.
 */
export async function claimPromo({ code, keyId }) {
  const normalized = normalizeCode(code);
  if (!normalized) return { error: "Enter a promo code", status: 400 };
  if (!keyId) return { error: "The key session is invalid. Enter your API key again.", status: 401 };

  const db = await getAdapter();
  const now = Date.now();

  try {
    return db.transaction(() => {
      const promo = db.get(`SELECT * FROM promos WHERE code = ?`, [normalized]);
      if (!promo) return { error: "Promo code not found", status: 404 };
      if (!(promo.isActive === 1 || promo.isActive === true)) {
        return { error: "This promo code is inactive", status: 400 };
      }
      const expiresMs = parseMs(promo.expiresAt);
      if (expiresMs == null || expiresMs <= now) {
        return { error: "This promo code has expired", status: 400 };
      }

      const already = db.get(
        `SELECT id FROM promoClaims WHERE promoId = ? AND keyId = ?`,
        [promo.id, keyId]
      );
      if (already) return { error: "You already claimed this promo code", status: 409 };

      const keyRow = db.get(`SELECT topupTokens, topupExpiresAt FROM apiKeys WHERE id = ?`, [keyId]);
      if (!keyRow) return { error: "The key session is invalid. Enter your API key again.", status: 401 };

      const currentExpiry = parseMs(keyRow.topupExpiresAt) ?? 0;
      const stillActive = currentExpiry > now;
      const currentTokens = stillActive ? Math.max(0, Number(keyRow.topupTokens) || 0) : 0;
      const addedTokens = Math.max(0, Number(promo.tokens) || 0);
      const totalTokens = currentTokens + addedTokens;
      const nextExpiryMs = Math.max(stillActive ? currentExpiry : 0, expiresMs);

      db.run(
        `INSERT INTO promoClaims(promoId, keyId, code, tokens, promoExpiresAt, claimedAt) VALUES(?, ?, ?, ?, ?, ?)`,
        [promo.id, keyId, promo.code, addedTokens, promo.expiresAt, isoNow()]
      );
      db.run(
        `UPDATE apiKeys SET topupTokens = ?, topupExpiresAt = ? WHERE id = ?`,
        [totalTokens, new Date(nextExpiryMs).toISOString(), keyId]
      );

      return {
        ok: true,
        code: promo.code,
        tokens: addedTokens,
        totalTokens,
        expiresAt: new Date(nextExpiryMs).toISOString(),
      };
    });
  } catch (error) {
    // The UNIQUE index is the final guard when two simultaneous requests race
    // past the SELECT above. Translate that into the same friendly message.
    if (/unique/i.test(String(error?.message || ""))) {
      return { error: "You already claimed this promo code", status: 409 };
    }
    throw error;
  }
}
