export default {
  version: 6,
  name: "api-key-rate-limits",
  up(adapter) {
    // Additional per-key request windows alongside the existing dailyLimit.
    // 0 means unlimited for that window.
    for (const sql of [
      "ALTER TABLE apiKeys ADD COLUMN minuteLimit INTEGER DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN hourLimit INTEGER DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN monthLimit INTEGER DEFAULT 0",
    ]) {
      try {
        adapter.exec(sql);
      } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
  },
};
