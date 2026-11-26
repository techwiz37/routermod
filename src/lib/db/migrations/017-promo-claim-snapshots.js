// Snapshot the promo code on each claim so the owner's claim history stays
// readable after an admin edits or deletes the promo.
export default {
  version: 17,
  name: "promo-claim-snapshots",
  up(adapter) {
    const existing = new Set(adapter.all("PRAGMA table_info(promoClaims)").map((row) => row.name));
    if (!existing.has("code")) {
      adapter.exec("ALTER TABLE promoClaims ADD COLUMN code TEXT");
    }
    if (!existing.has("promoExpiresAt")) {
      adapter.exec("ALTER TABLE promoClaims ADD COLUMN promoExpiresAt TEXT");
    }
    adapter.exec(`
      UPDATE promoClaims
         SET code = COALESCE(code, (SELECT code FROM promos WHERE promos.id = promoClaims.promoId))
       WHERE code IS NULL
    `);
    adapter.exec(`
      UPDATE promoClaims
         SET promoExpiresAt = COALESCE(
           promoExpiresAt,
           (SELECT expiresAt FROM promos WHERE promos.id = promoClaims.promoId)
         )
       WHERE promoExpiresAt IS NULL
    `);
  },
};
