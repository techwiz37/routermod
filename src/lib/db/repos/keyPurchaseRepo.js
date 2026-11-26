// Public "Buy Key" invoices and automatic key delivery.
//
// Buying a key has no existing API key to attach to, so an invoice is scoped
// to an anonymous browser session cookie. The same matching rules as token
// topup apply: a GoBiz mutation can settle at most one invoice, and it may
// only settle an invoice that already existed when the payment happened. When
// a payment matches, the API key is created inside the same transaction that
// claims the invoice, so a crash can never leave a paid invoice without a key.
import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";
import { INVOICE_TTL_MS, TOPUP_VALIDITY_DAYS } from "@/shared/constants/tokenPackages.js";
import { generateApiKeyWithMachine } from "@/shared/utils/apiKey";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { claimSettlement, matchMutations } from "./topupRepo.js";

const KEY_VALIDITY_MS = TOPUP_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
const NAME_MAX_LENGTH = 60;

function iso(ms) {
  return new Date(ms).toISOString();
}

function parseMs(value) {
  const ms = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

export function sanitizeKeyName(value) {
  return String(value || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, NAME_MAX_LENGTH);
}

export function rowToKeyPurchaseInvoice(row, { includeKey = false } = {}) {
  if (!row) return null;
  const paid = row.status === "paid";
  return {
    id: row.id,
    code: `KEY-${String(row.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    amount: Number(row.amount) || 0,
    tokens: Number(row.packageTokens) || 0,
    packageId: row.packageId || "",
    name: row.name || "",
    status: row.status || "pending",
    mutationId: row.mutationId || null,
    createdAt: row.createdAt || null,
    expiresAt: row.expiresAt || null,
    paidAt: row.paidAt || null,
    deliveredAt: row.deliveredAt || null,
    // The raw key only ever leaves the server to the session that bought it,
    // and only after the payment has been settled.
    apiKey: includeKey && paid && row.apiKey ? row.apiKey : null,
  };
}

async function expireStaleInvoices(db) {
  db.run(
    `UPDATE keyPurchaseInvoices SET status = 'expired' WHERE status = 'pending' AND expiresAt <= ?`,
    [iso(Date.now())]
  );
}

export async function createKeyPurchaseInvoice({ sessionId, pkg, name }) {
  const db = await getAdapter();
  await expireStaleInvoices(db);
  const now = Date.now();

  // Double-submitting the same package must not create two indistinguishable
  // pending invoices for the same amount in one browser session.
  const existing = db.get(
    `SELECT * FROM keyPurchaseInvoices
      WHERE sessionId = ? AND amount = ? AND status = 'pending' AND expiresAt > ?
      ORDER BY createdAt ASC LIMIT 1`,
    [sessionId, pkg.price, iso(now)]
  );
  if (existing) return { invoice: rowToKeyPurchaseInvoice(existing), reused: true };

  const displayName = sanitizeKeyName(name) || `${pkg.label} Key`;
  const row = {
    id: randomUUID(),
    sessionId,
    packageId: pkg.id,
    packageTokens: pkg.tokens,
    amount: pkg.price,
    name: displayName,
    status: "pending",
    createdAt: iso(now),
    expiresAt: iso(now + INVOICE_TTL_MS),
  };
  db.run(
    `INSERT INTO keyPurchaseInvoices(id, sessionId, packageId, packageTokens, amount, name, status, createdAt, expiresAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.sessionId, row.packageId, row.packageTokens, row.amount, row.name, row.status, row.createdAt, row.expiresAt]
  );
  return { invoice: rowToKeyPurchaseInvoice(row), reused: false };
}

export async function listKeyPurchaseInvoices(sessionId, { includeKeys = true, limit = 12 } = {}) {
  if (!sessionId) return [];
  const db = await getAdapter();
  await expireStaleInvoices(db);
  const rows = db.all(
    `SELECT * FROM keyPurchaseInvoices WHERE sessionId = ? ORDER BY createdAt DESC LIMIT ?`,
    [sessionId, Math.max(1, Math.min(50, Number(limit) || 12))]
  );
  return rows.map((row) => rowToKeyPurchaseInvoice(row, { includeKey: includeKeys }));
}

export async function getKeyPurchaseInvoiceById(id, sessionId) {
  const db = await getAdapter();
  await expireStaleInvoices(db);
  const row = db.get(
    `SELECT * FROM keyPurchaseInvoices WHERE id = ? AND sessionId = ?`,
    [id, sessionId]
  );
  return rowToKeyPurchaseInvoice(row);
}

function createPurchasedKey(db, invoice, machineId, nowMs) {
  const keyId = randomUUID();
  const { key } = generateApiKeyWithMachine(machineId);
  const createdAt = iso(nowMs);
  const expiresAt = iso(nowMs + KEY_VALIDITY_MS);
  const name = sanitizeKeyName(invoice.name) || "Purchased Key";

  // A purchase is a fixed, non-resetting quota: tokens never reset, and the
  // key itself is valid for the same 30 days as a token topup.
  db.run(
    `INSERT INTO apiKeys(
       id, key, name, machineId, isActive, createdAt,
       accessRestricted, accessAllow,
       tokenLimit, tokenLimitWindow, tokenResetEnabled, tokenCycleStart, expiresAt
     ) VALUES(?, ?, ?, ?, 1, ?, 0, NULL, ?, '30d', 0, ?, ?)`,
    [keyId, key, name, machineId, createdAt, invoice.packageTokens, createdAt, expiresAt]
  );
  return { keyId, key, name, expiresAt };
}

/**
 * Atomically settle matching Buy Key invoices and deliver exactly one API key
 * per invoice. Safe to call concurrently and repeatedly with overlapping
 * mutation lists.
 */
export async function settleKeyPurchaseInvoices(mutations, { nowMs = Date.now() } = {}) {
  const db = await getAdapter();
  await expireStaleInvoices(db);
  const pendingRows = db.all(
    `SELECT * FROM keyPurchaseInvoices WHERE status = 'pending' AND expiresAt > ? ORDER BY createdAt ASC`,
    [iso(nowMs)]
  );
  if (!pendingRows.length) return [];
  const machineId = await getConsistentMachineId();
  const matches = matchMutations(mutations, pendingRows.map((row) => rowToKeyPurchaseInvoice(row)));
  const settled = [];

  for (const match of matches) {
    let outcome = null;
    try {
      outcome = db.transaction(() => {
        const current = db.get(`SELECT * FROM keyPurchaseInvoices WHERE id = ?`, [match.invoice.id]);
        if (!current || current.status !== "pending") return null;
        if (parseMs(current.expiresAt) <= nowMs) {
          db.run(`UPDATE keyPurchaseInvoices SET status = 'expired' WHERE id = ?`, [current.id]);
          return null;
        }
        const claim = db.run(
          `UPDATE keyPurchaseInvoices
              SET status = 'paid', mutationId = ?, paidAt = ?, deliveredAt = ?
            WHERE id = ? AND status = 'pending' AND mutationId IS NULL`,
          [String(match.mutation.id_trx), iso(nowMs), iso(nowMs), current.id]
        );
        if (!claim.changes) return null;
        // One mutation pays one invoice across every invoice type.
        claimSettlement(db, {
          mutationId: match.mutation.id_trx,
          kind: "key",
          invoiceId: current.id,
          amount: current.amount,
          nowMs,
        });
        const created = createPurchasedKey(db, current, machineId, nowMs);
        db.run(
          `UPDATE keyPurchaseInvoices SET keyId = ?, apiKey = ?, name = ? WHERE id = ?`,
          [created.keyId, created.key, created.name, current.id]
        );
        return {
          invoiceId: current.id,
          mutationId: String(match.mutation.id_trx),
          sessionId: current.sessionId,
          apiKey: created.key,
          keyId: created.keyId,
          name: created.name,
          tokens: Number(current.packageTokens) || 0,
          keyExpiresAt: created.expiresAt,
        };
      });
    } catch {
      // The mutation was already claimed (or the generated key collided); the
      // transaction rolled back and the invoice stays pending for a retry.
      outcome = null;
    }
    if (outcome) settled.push(outcome);
  }

  return settled;
}
