const addDurationMigration = {
  version: 2,
  name: "add-duration-to-usage-history",
  up(db) {
    let columns = [];
    try {
      columns = (db.all(`PRAGMA table_info(usageHistory)`) || []).map((c) => c.name);
    } catch {
      columns = [];
    }

    if (columns.length === 0) {
      console.log("[Migration 002] usageHistory not present, skipping duration column");
      return;
    }

    if (columns.includes("duration")) {
      console.log("[Migration 002] duration column already present");
      return;
    }

    db.exec("ALTER TABLE usageHistory ADD COLUMN duration INTEGER DEFAULT 0");
    console.log("[Migration 002] Added duration column to usageHistory");
  },
};

export default addDurationMigration;
