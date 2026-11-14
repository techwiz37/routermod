export default {
  version: 5,
  name: "api-key-policy",
  up(adapter) {
    // Kept explicit for SQLite installations that do not rebuild tables when
    // the schema definition changes.
    for (const sql of [
      "ALTER TABLE apiKeys ADD COLUMN dailyLimit INTEGER DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN maintenanceEnabled INTEGER DEFAULT 0",
      "ALTER TABLE apiKeys ADD COLUMN maintenanceMessage TEXT",
      "ALTER TABLE apiKeys ADD COLUMN expiresAt TEXT",
    ]) {
      try { adapter.exec(sql); } catch (error) {
        if (!String(error?.message || error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
  },
};
