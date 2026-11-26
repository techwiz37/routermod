// QRIS topup invoices and automatic settlement.
//
// The merchant uses ONE static QRIS, so a payment arrival carries no invoice
// reference. The only trustworthy identity is the GoBiz mutation id. We
// therefore:
//   1. record every mutation id that settles an invoice under a UNIQUE index,
//      so one payment can never credit a second invoice, and
//   2. only let a mutation settle an invoice that already existed when the
//      payment happened (createdAt <= mutation time), and
//   3. claim pending -> paid atomically.
// A previously paid transaction of the same nominal is already stored with
// its mutation id, so it is skipped even when a new invoice has the same price.
import { randomUUID } from "node:crypto";
import { getAdapter } from "../driver.js";
import { INVOICE_TTL_MS, TOPUP_VALIDITY_DAYS } from "@/shared/constants/tokenPackages.js";
import { keyExpiryAt } from "@/shared/constants/keyQuota.js";
const VALIDITY_MS = TOPUP_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
const PAID_STATUSES = new Set(["settlement", "capture"]);

function iso(ms) {
  return new Date(ms).toISOString();
}

function parseMs(value) {
  const ms = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

export function rowToInvoice(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: `INV-${String(row.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    amount: Number(row.amount) || 0,
    tokens: Number(row.packageTokens) || 0,
    packageId: row.packageId || "",
    status: row.status || "pending",
    mutationId: row.mutationId || null,
    createdAt: row.createdAt || null,
    expiresAt: row.expiresAt || null,
    paidAt: row.paidAt || null,
  };
}

export async function expireStaleInvoices(db) {
  const adapter = db || (await getAdapter());
  adapter.run(
    `UPDATE topupInvoices SET status = 'expired' WHERE status = 'pending' AND expiresAt <= ?`,
    [iso(Date.now())]
  );
}

export async function createTopupInvoice({ apiKey, keyId, pkg }) {
  const db = await getAdapter();
  await expireStaleInvoices(db);
  const now = Date.now();

  // Double-submit of the same package must not create two indistinguishable
  // pending invoices for the same amount. Reuse the live one instead.
  const existing = db.get(
    `SELECT * FROM topupInvoices
      WHERE apiKey = ? AND amount = ? AND status = 'pending' AND expiresAt > ?
      ORDER BY createdAt ASC LIMIT 1`,
    [apiKey, pkg.price, iso(now)]
  );
  if (existing) return { invoice: rowToInvoice(existing), reused: true };

  const row = {
    id: randomUUID(),
    apiKey,
    keyId: keyId || null,
    packageId: pkg.id,
    packageTokens: pkg.tokens,
    amount: pkg.price,
    status: "pending",
    createdAt: iso(now),
    expiresAt: iso(now + INVOICE_TTL_MS),
  };
  db.run(
    `INSERT INTO topupInvoices(id, apiKey, keyId, packageId, packageTokens, amount, status, createdAt, expiresAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.apiKey, row.keyId, row.packageId, row.packageTokens, row.amount, row.status, row.createdAt, row.expiresAt]
  );
  return { invoice: rowToInvoice(row), reused: false };
}

export async function listInvoicesForKey(apiKey, limit = 12) {
  const db = await getAdapter();
  await expireStaleInvoices(db);
  const rows = db.all(
    `SELECT * FROM topupInvoices WHERE apiKey = ? ORDER BY createdAt DESC LIMIT ?`,
    [apiKey, Math.max(1, Math.min(50, Number(limit) || 12))]
  );
  return rows.map(rowToInvoice);
}

export async function getInvoiceById(id) {
  const db = await getAdapter();
  await expireStaleInvoices(db);
  return rowToInvoice(db.get(`SELECT * FROM topupInvoices WHERE id = ?`, [id]));
}

/**
 * Pure matching step: pair each successful mutation with at most one pending
 * invoice of the same amount that existed before the payment. Mutations are
 * visited oldest-first so a long list cannot steal a newer invoice.
 */
export function matchMutations(mutations, invoices) {
  const pending = (invoices || [])
    .filter((invoice) => invoice && invoice.status === "pending")
    .map((invoice) => ({
      invoice,
      createdAtMs: parseMs(invoice.createdAt),
      expiresAtMs: parseMs(invoice.expiresAt),
    }))
    .filter((entry) => entry.createdAtMs != null && entry.expiresAtMs != null)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  const used = new Set();
  const matches = [];
  const ordered = [...(mutations || [])].sort((a, b) => (parseMs(a?.timestamp) ?? 0) - (parseMs(b?.timestamp) ?? 0));

  for (const mutation of ordered) {
    const status = String(mutation?.status_key || mutation?.status || "").toLowerCase();
    if (!PAID_STATUSES.has(status)) continue;
    const amount = Math.round(Number(mutation?.jumlah));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const at = parseMs(mutation?.timestamp);
    if (at == null) continue;

    const entry = pending.find((candidate) => (
      !used.has(candidate.invoice.id)
      && Number(candidate.invoice.amount) === amount
      // The invoice must already exist at payment time: an old payment can
      // never settle a newly created invoice of the same nominal.
      && candidate.createdAtMs <= at
      && candidate.expiresAtMs > at
    ));
    if (!entry) continue;
    used.add(entry.invoice.id);
    matches.push({ invoice: entry.invoice, mutation });
  }
  return matches;
}

function creditTopup(db, apiKey, tokens, nowMs) {
  const keyRow = db.get(
    `SELECT topupTokens, topupExpiresAt, expiresAt, tokenResetEnabled, tokenLimit,
            spendLimit, tokenCycleStart, createdAt, tokenLimitWindow
       FROM apiKeys WHERE key = ?`,
    [apiKey]
  );
  if (!keyRow) return null;
  const currentExpiry = parseMs(keyRow.topupExpiresAt) ?? 0;
  const stillActive = currentExpiry > nowMs;
  const baseTokens = stillActive ? Math.max(0, Number(keyRow.topupTokens) || 0) : 0;
  const nextTokens = baseTokens + Math.max(0, Number(tokens) || 0);
  const nextExpiry = iso(Math.max(currentExpiry, nowMs) + VALIDITY_MS);

  // A topup also extends the key's own active period by the same 30 days, but
  // only when the key actually has one and it has not lapsed. Lifetime keys
  // (no expiry) stay lifetime: adding an expiry would shorten their access.
  const keyExpiryMs = parseMs(keyExpiryAt(keyRow));
  const extendKey = keyExpiryMs != null && keyExpiryMs > nowMs;
  const keyExtendedTo = extendKey ? iso(keyExpiryMs + VALIDITY_MS) : null;

  if (keyExtendedTo) {
    db.run(
      `UPDATE apiKeys SET topupTokens = ?, topupExpiresAt = ?, expiresAt = ? WHERE key = ?`,
      [nextTokens, nextExpiry, keyExtendedTo, apiKey]
    );
  } else {
    db.run(
      `UPDATE apiKeys SET topupTokens = ?, topupExpiresAt = ? WHERE key = ?`,
      [nextTokens, nextExpiry, apiKey]
    );
  }
  return { tokens: nextTokens, expiresAt: nextExpiry, keyExtendedTo };
}

/**
 * Atomically settle matching invoices. Returns one entry per credited invoice.
 * Safe to call concurrently and repeatedly with overlapping mutation lists.
 */
/**
 * Claim a GoBiz mutation for one invoice. The primary key makes this a
 * compare-and-set: the first invoice to insert wins, every other settlement
 * (topup or key purchase) is rejected and its transaction rolls back.
 */
export function claimSettlement(db, { mutationId, kind, invoiceId, amount, nowMs }) {
  const claim = db.run(
    `INSERT INTO paymentSettlements(mutationId, kind, invoiceId, amount, settledAt)
     VALUES(?, ?, ?, ?, ?)`,
    [String(mutationId), kind, invoiceId, Number(amount) || 0, iso(nowMs)]
  );
  return !!claim.changes;
}

export async function settleTopupInvoices(mutations, { nowMs = Date.now() } = {}) {
  const db = await getAdapter();
  await expireStaleInvoices(db);
  const pendingRows = db.all(
    `SELECT * FROM topupInvoices WHERE status = 'pending' AND expiresAt > ? ORDER BY createdAt ASC`,
    [iso(nowMs)]
  );
  const matches = matchMutations(mutations, pendingRows.map(rowToInvoice));
  const settled = [];

  for (const match of matches) {
    let outcome = null;
    try {
      outcome = db.transaction(() => {
        const current = db.get(`SELECT * FROM topupInvoices WHERE id = ?`, [match.invoice.id]);
        if (!current || current.status !== "pending") return null;
        if (parseMs(current.expiresAt) <= nowMs) {
          db.run(`UPDATE topupInvoices SET status = 'expired' WHERE id = ?`, [current.id]);
          return null;
        }
        const claim = db.run(
          `UPDATE topupInvoices
              SET status = 'paid', mutationId = ?, paidAt = ?, creditedAt = ?
            WHERE id = ? AND status = 'pending' AND mutationId IS NULL`,
          [String(match.mutation.id_trx), iso(nowMs), iso(nowMs), current.id]
        );
        if (!claim.changes) return null;
        // Cross-format guard: a mutation may also have paid a Buy Key invoice.
        // The unique primary key throws here and rolls the claim back.
        claimSettlement(db, {
          mutationId: match.mutation.id_trx,
          kind: "topup",
          invoiceId: current.id,
          amount: current.amount,
          nowMs,
        });
        const credit = creditTopup(db, current.apiKey, current.packageTokens, nowMs);
        return {
          invoiceId: current.id,
          mutationId: String(match.mutation.id_trx),
          apiKey: current.apiKey,
          tokens: Number(current.packageTokens) || 0,
          topupExpiresAt: credit?.expiresAt || null,
          keyExtendedTo: credit?.keyExtendedTo || null,
        };
      });
    } catch {
      // A concurrent sync claimed the same mutation id first; the UNIQUE
      // index rejected this transaction, which is exactly what we want.
      outcome = null;
    }
    if (outcome) settled.push(outcome);
  }

  return settled;
}
