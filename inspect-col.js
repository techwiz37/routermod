const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const os = require("os");

const dbPath = path.join(process.env.APPDATA || os.homedir(), "run-routermod", "db", "routermod.sqlite");
const db = new DatabaseSync(dbPath);

// Cek struktur kolom
const cols = db.prepare("PRAGMA table_info(providerConnections)").all();
console.log("COLUMNS:", cols.map((c) => c.name).join(", "));

const one = db
  .prepare("SELECT * FROM providerConnections WHERE provider='antigravity' LIMIT 1")
  .all()[0];
console.log("\nSAMPLE ROW:");
for (const [k, v] of Object.entries(one || {})) {
  const s = typeof v === "string" ? v.slice(0, 120) : v;
  console.log(" ", k, "=", s);
}
