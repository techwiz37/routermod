export default {
  version: 7,
  name: "api-key-token-quota",
  up(adapter) {
    // Token quota + spend cap + concurrency limits per API key.
    // tokenLimit 0 = unlimited; tokenLimitWindow is the rolling window used
    // for the token quota ("1h" | "24h" | "7d" | "30d").
    for (const sql of [
      "ALTER TABLE apiKeys ADD COLUMN tokenLimit INTEGER DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN tokenLimitWindow TEXT DEFAULT '24h'",
      "ALTER TABLE apiKeys ADD COLUMN spendLimit REAL DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN tokensPerMinuteLimit INTEGER DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN maxConcurrentLimit INTEGER DEFAULT 0",
    ]) {
      try {
        adapter.exec(sql);
      } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
  },
};
