export default {
  version: 10,
  name: "topup-invoices",
  up(adapter) {
    // One row per QRIS topup attempt. `mutationId` is UNIQUE so a GoBiz
    // transaction can settle at most one invoice, ever. That is the guard
    // against a previously paid transaction of the same nominal being reused
    // for a later invoice.
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS topupInvoices (
        id TEXT PRIMARY KEY,
        apiKey TEXT NOT NULL,
        keyId TEXT,
        packageId TEXT NOT NULL,
        packageTokens INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        mutationId TEXT,
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        paidAt TEXT,
        creditedAt TEXT
      )
    `);
    adapter.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_topup_mutation
        ON topupInvoices(mutationId)
        WHERE mutationId IS NOT NULL
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_topup_pending
        ON topupInvoices(status, amount, createdAt)
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_topup_key
        ON topupInvoices(apiKey, createdAt DESC)
    `);

    // Additive, time-limited topup balance. The base `tokenLimit` stays
    // untouched so an admin edit is never confused with a purchase. Active
    // topup tokens expire after TOPUP_VALIDITY_DAYS.
    for (const sql of [
      "ALTER TABLE apiKeys ADD COLUMN topupTokens INTEGER DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN topupExpiresAt TEXT",
    ]) {
      try {
        adapter.exec(sql);
      } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
  },
};
