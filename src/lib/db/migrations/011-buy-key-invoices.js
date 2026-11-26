// Public "Buy Key" invoices.
//
// A Buy Key purchase has no existing API key to attach to, so it is stored in
// its own table and scoped to an anonymous browser session cookie. Settlement
// creates the API key in the same transaction that claims the invoice.
//
// `paymentSettlements` is the single source of truth for "which GoBiz
// mutation already paid something". Both topup and key-purchase invoices claim
// a mutation there, so one transfer can never credit two invoices across the
// two tables. Existing topup settlements are backfilled so old payments stay
// spent forever.
export default {
  version: 11,
  name: "buy-key-invoices",
  up(adapter) {
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS keyPurchaseInvoices (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        packageId TEXT NOT NULL,
        packageTokens INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        mutationId TEXT,
        keyId TEXT,
        apiKey TEXT,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        paidAt TEXT,
        deliveredAt TEXT
      )
    `);
    adapter.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_keypurchase_mutation
        ON keyPurchaseInvoices(mutationId)
        WHERE mutationId IS NOT NULL
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_keypurchase_pending
        ON keyPurchaseInvoices(status, amount, createdAt)
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_keypurchase_session
        ON keyPurchaseInvoices(sessionId, createdAt DESC)
    `);

    adapter.exec(`
      CREATE TABLE IF NOT EXISTS paymentSettlements (
        mutationId TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        invoiceId TEXT NOT NULL,
        amount INTEGER,
        settledAt TEXT NOT NULL
      )
    `);

    // Backfill every topup payment that was already claimed before this
    // migration, so the registry does not hand those mutation ids out again.
    adapter.exec(`
      INSERT OR IGNORE INTO paymentSettlements(mutationId, kind, invoiceId, amount, settledAt)
      SELECT mutationId, 'topup', id, amount, COALESCE(creditedAt, paidAt, createdAt)
        FROM topupInvoices
       WHERE mutationId IS NOT NULL
    `);
  },
};
