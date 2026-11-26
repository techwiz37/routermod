// Admin-published information for key owners. Each item is global; read state
// is per key so a notice stays unread until THAT key acknowledges it. The
// unique index makes "mark read" idempotent and prevents duplicate rows when a
// modal and an information page both acknowledge the same item.
export default {
  version: 15,
  name: "informations",
  up(adapter) {
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS informations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_informations_active
        ON informations(isActive, createdAt DESC)
    `);
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS informationReads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        informationId TEXT NOT NULL,
        keyId TEXT NOT NULL,
        readAt TEXT NOT NULL
      )
    `);
    adapter.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_information_reads_unique
        ON informationReads(informationId, keyId)
    `);
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_information_reads_key
        ON informationReads(keyId)
    `);
  },
};
