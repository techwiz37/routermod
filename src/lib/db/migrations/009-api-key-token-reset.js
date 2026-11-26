export default {
  version: 9,
  name: "api-key-token-reset",
  up(adapter) {
    // tokenResetEnabled: when 0, the token quota never resets (no countdown).
    // tokenCycleStart: baseline for 7d/30d windows so the countdown starts from
    // key creation / last reset, not from the Unix epoch.
    for (const sql of [
      "ALTER TABLE apiKeys ADD COLUMN tokenResetEnabled INTEGER DEFAULT 1",
      "ALTER TABLE apiKeys ADD COLUMN tokenCycleStart TEXT",
    ]) {
      try {
        adapter.exec(sql);
      } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
    // Backfill existing keys so their cycle starts from creation, not epoch.
    try {
      adapter.exec("UPDATE apiKeys SET tokenCycleStart = createdAt WHERE tokenCycleStart IS NULL");
    } catch {}
  },
};
