import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 8,
  name: "add-automate-tables",
  up(db) {
    // Create automateConfig table
    if (TABLES.automateConfig) {
      db.exec(buildCreateTableSql("automateConfig", TABLES.automateConfig));
    }
    
    // Create automateFailures table
    if (TABLES.automateFailures) {
      db.exec(buildCreateTableSql("automateFailures", TABLES.automateFailures));
      for (const idx of TABLES.automateFailures.indexes || []) {
        db.exec(idx);
      }
    }

    // Add whatsappRecipient column if table exists
    try {
      db.exec(`ALTER TABLE automateConfig ADD COLUMN whatsappRecipient TEXT`);
    } catch (e) {
      // Column already exists or table doesn't exist yet
    }
  },
};
