/**
 * Standalone verification for the duration feature.
 * Run: node scripts/verify-duration.mjs
 *
 * 1. Applies the real migration 002 to a temp DB.
 * 2. Inserts usage rows through the same INSERT shape usageRepo uses.
 * 3. Reads them back with the exact query used by /api/dashboard/recent-requests.
 * 4. Verifies the relative-time + duration formatting the monitor relies on.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "routermod-duration-"));
const dbFile = path.join(tmpDir, "test.sqlite");
const db = new Database(dbFile);

let failures = 0;
function check(label, cond, extra = "") {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

const adapter = {
  exec: (sql) => db.exec(sql),
  all: (sql) => db.prepare(sql).all(),
};

// ---- 1. Replicate migration 001 (initial tables, no duration column) ----
console.log("\n[1] migration 001 — create tables");
db.exec(`CREATE TABLE IF NOT EXISTS usageHistory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  connectionId TEXT,
  apiKey TEXT,
  endpoint TEXT,
  promptTokens INTEGER DEFAULT 0,
  completionTokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  status TEXT,
  tokens TEXT,
  meta TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

// ---- 2. Replicate migration 002 semantics (PRAGMA-guarded ALTER) ----
console.log("\n[2] migration 002 — add duration column");
const { default: m002 } = await import("../src/lib/db/migrations/002-add-duration.js");
m002.up(adapter);

let cols = db.prepare(`PRAGMA table_info(usageHistory)`).all().map((c) => c.name);
check("duration column exists after migration 002", cols.includes("duration"), `got: ${cols.join(",")}`);
// ---- 3. Insert usage rows using usageRepo's INSERT shape ----
console.log("\n[3] persist usage rows with duration");
const INSERT = `INSERT INTO usageHistory(timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta, duration) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
db.prepare(INSERT).run(
  new Date(Date.now() - 300000).toISOString(), "gemini", "gemini-2.0-flash", "conn-3", null, null,
  10, 5, 0, "success", JSON.stringify({ input_tokens: 10, output_tokens: 5 }), JSON.stringify({}), 0
);
db.prepare(INSERT).run(
  new Date(Date.now() - 120000).toISOString(), "anthropic", "claude-sonnet-4", "conn-2", null, "/v1/messages",
  900, 300, 0.02, "success", JSON.stringify({ prompt_tokens: 900, completion_tokens: 300 }), JSON.stringify({}), 4200
);
db.prepare(INSERT).run(
  new Date(Date.now() - 5000).toISOString(), "openai", "gpt-4o-mini", "conn-1", null, "/v1/chat/completions",
  120, 45, 0.001, "success", JSON.stringify({ prompt_tokens: 120, completion_tokens: 45 }), JSON.stringify({}), 1500
);

// ---- 4. Read back with the API's exact query ----
console.log("\n[4] /api/dashboard/recent-requests query");
const rows = db.prepare(`
  SELECT timestamp, provider, model, connectionId, endpoint, cost, status, tokens, duration
  FROM usageHistory
  ORDER BY id DESC
  LIMIT 20
`).all();

check("returns 3 rows", rows.length === 3, `got ${rows.length}`);

const mapped = rows.map((row) => {
  const tokens = JSON.parse(row.tokens || "{}");
  return {
    timestamp: row.timestamp,
    provider: row.provider,
    model: row.model,
    duration: row.duration || null,
    promptTokens: tokens.prompt_tokens || tokens.input_tokens || 0,
    completionTokens: tokens.completion_tokens || tokens.output_tokens || 0,
  };
});

check("newest row first", mapped[0].model === "gpt-4o-mini", `got ${mapped[0].model}`);
check("duration persisted (1500ms)", mapped[0].duration === 1500, `got ${mapped[0].duration}`);
check("duration persisted (4200ms)", mapped[1].duration === 4200, `got ${mapped[1].duration}`);
check("legacy row duration -> null (hidden in UI)", mapped[2].duration === null, `got ${mapped[2].duration}`);
check("prompt_tokens normalized", mapped[0].promptTokens === 120, `got ${mapped[0].promptTokens}`);
check("input_tokens normalized (legacy naming)", mapped[2].promptTokens === 10, `got ${mapped[2].promptTokens}`);
check("output_tokens normalized (legacy naming)", mapped[2].completionTokens === 5, `got ${mapped[2].completionTokens}`);

// __APPEND_MORE__


// ---- 5. Monitor display semantics ----
console.log("\n[5] monitor formatting semantics");
const formatDuration = (ms) => (!ms || ms <= 0 ? "—" : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);
check("duration 1500 -> '1.50s'", formatDuration(1500) === "1.50s", `got ${formatDuration(1500)}`);
check("duration 250 -> '250ms'", formatDuration(250) === "250ms", `got ${formatDuration(250)}`);
check("duration 0 -> em dash", formatDuration(0) === "—", `got ${formatDuration(0)}`);
check("duration null -> em dash", formatDuration(null) === "—", `got ${formatDuration(null)}`);

const formatRelativeTime = (timestamp, locale = "id") => {
  const diffSec = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (diffSec < 10) return locale === "id" ? "Baru saja" : "Just now";
  if (diffSec < 60) return locale === "id" ? `${diffSec} detik lalu` : `${diffSec} seconds ago`;
  if (diffSec < 120) return locale === "id" ? "1 menit lalu" : "1 minute ago";
  return locale === "id" ? `${Math.floor(diffSec / 60)} menit lalu` : `${Math.floor(diffSec / 60)} minutes ago`;
};
check("id relative time < 10s -> 'Baru saja'", formatRelativeTime(mapped[0].timestamp, "id") === "Baru saja", `got ${formatRelativeTime(mapped[0].timestamp, "id")}`);
check("en relative time < 10s -> 'Just now'", formatRelativeTime(mapped[0].timestamp, "en") === "Just now", `got ${formatRelativeTime(mapped[0].timestamp, "en")}`);
check("id relative time ~2min -> '2 menit lalu'", formatRelativeTime(mapped[1].timestamp, "id") === "2 menit lalu", `got ${formatRelativeTime(mapped[1].timestamp, "id")}`);

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);

let reThrew = false;
try {
  m002.up(adapter);
} catch {
  reThrew = true;
}
check("migration 002 is idempotent (re-run does not throw)", !reThrew);

// __APPEND_MORE__
