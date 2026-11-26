// Promo codes that grant bonus tokens to API-key owners.
//
// A promo stores the claim deadline in `expiresAt`; the tokens it grants use
// the same deadline, or the key's existing topup deadline if that is later.
// `promoClaims` records one row per (promo, key) so a code cannot be claimed
// twice by the same key even when the button is double-clicked.
export default {
  version: 16,
  name: "promos",
  up(adapter) {
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS promos (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        tokens INTEGER NOT NULL,
        expiresAt TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    adapter.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_promos_code
        ON promos(code)
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_promos_active
        ON promos(isActive, expiresAt)
    `);
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS promoClaims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promoId TEXT NOT NULL,
        keyId TEXT NOT NULL,
        tokens INTEGER NOT NULL,
        claimedAt TEXT NOT NULL
      )
    `);
    adapter.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_claims_unique
        ON promoClaims(promoId, keyId)
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_promo_claims_key
        ON promoClaims(keyId)
    `);
  },
};
