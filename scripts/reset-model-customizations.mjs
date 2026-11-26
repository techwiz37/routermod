#!/usr/bin/env node
/**
 * Reset model customizations so every provider starts from its upstream catalog
 * with no hidden prompt layer.
 *
 * Clears:
 *   - kv scope `customModels` (every custom model) and `modelNames` (display names)
 *   - settings `jailbreakModels`, `providerModelSystemPrompts`
 *   - settings `promptInjectionGlobal`, `promptInjectionKeys`, `promptInjectionModels`
 *   - request transformers (RTK, headroom, caveman, ponytail, pxpipe, cc naming)
 *   - `providerSpecificData.systemPrompt` on saved connections and provider nodes
 *
 * Leaves aliases and the hidden-model tombstones alone unless asked:
 *   --aliases  also delete kv scope `modelAliases`
 *   --hidden   also delete kv scope `deletedModels`
 *
 * Usage:
 *   node scripts/reset-model-customizations.mjs            # dry run
 *   node scripts/reset-model-customizations.mjs --apply    # write + backup
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const withAliases = args.has("--aliases");
const withHidden = args.has("--hidden");

const PROMPT_KEYS = [
  "jailbreakModels",
  "providerModelSystemPrompts",
  "promptInjectionGlobal",
  "promptInjectionKeys",
  "promptInjectionModels",
];

// Request-body transformers that rewrite what the client sent. A fresh model
// should behave like a direct upstream call, so none of these stay on.
const REQUEST_TRANSFORM_DEFAULTS = {
  rtkEnabled: false,
  headroomEnabled: false,
  cavemanEnabled: false,
  ponytailEnabled: false,
  pxpipeEnabled: false,
  ccFilterNaming: false,
};

const dataDir = process.env.DATA_DIR || path.join(os.homedir(), ".routermod");
const dbFile = path.join(dataDir, "db", "routermod.sqlite");
if (!fs.existsSync(dbFile)) {
  console.error(`[reset] database not found: ${dbFile}`);
  process.exit(1);
}

const db = new DatabaseSync(dbFile);

function count(scope) {
  return db.prepare("SELECT COUNT(*) AS c FROM kv WHERE scope = ?").get(scope).c;
}

const customCount = count("customModels");
const aliasCount = count("modelAliases");
const nameCount = count("modelNames");
const hiddenCount = count("deletedModels");

const settingsRow = db.prepare("SELECT data FROM settings WHERE id = 1").get();
const settings = settingsRow ? JSON.parse(settingsRow.data || "{}") : {};
const promptSummary = PROMPT_KEYS.map((key) => {
  const value = settings[key];
  const size = Array.isArray(value)
    ? value.length
    : value && typeof value === "object"
      ? Object.keys(value).length
      : value ? 1 : 0;
  return `${key}=${size}`;
}).join(" ");

const connections = db.prepare("SELECT id, data FROM providerConnections").all();
const nodes = db.prepare("SELECT id, data FROM providerNodes").all();

function hasSystemPrompt(raw) {
  try {
    const data = JSON.parse(raw || "{}");
    return Boolean(
      (typeof data.systemPrompt === "string" && data.systemPrompt.trim())
      || (typeof data.providerSpecificData?.systemPrompt === "string" && data.providerSpecificData.systemPrompt.trim()),
    );
  } catch {
    return false;
  }
}

const connectionsWithPrompt = connections.filter((row) => hasSystemPrompt(row.data));
const nodesWithPrompt = nodes.filter((row) => hasSystemPrompt(row.data));

console.log(`[reset] database: ${dbFile}`);
console.log(`[reset] custom models: ${customCount}`);
console.log(`[reset] aliases: ${aliasCount}${withAliases ? " (delete)" : " (keep)"}`);
console.log(`[reset] custom display names: ${nameCount} (delete)`);
console.log(`[reset] hidden models: ${hiddenCount}${withHidden ? " (delete)" : " (keep)"}`);
console.log(`[reset] prompt settings: ${promptSummary}`);
console.log(`[reset] request transformers: rtk/headroom/caveman/ponytail/pxpipe/ccFilterNaming -> off`);
console.log(`[reset] connection-level prompts: ${connectionsWithPrompt.length}`);
console.log(`[reset] provider-node prompts: ${nodesWithPrompt.length}`);

if (!apply) {
  console.log("[reset] dry run — pass --apply to write");
  db.close();
  process.exit(0);
}

const backupDir = path.join(dataDir, "db", "backups");
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = path.join(backupDir, `reset-customizations-${stamp}.sqlite`);
db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
console.log(`[reset] backup: ${backupFile}`);

function stripSystemPrompt(raw) {
  const data = JSON.parse(raw || "{}");
  let changed = false;
  if (typeof data.systemPrompt === "string") {
    delete data.systemPrompt;
    changed = true;
  }
  if (data.providerSpecificData && typeof data.providerSpecificData === "object") {
    if (typeof data.providerSpecificData.systemPrompt === "string") {
      delete data.providerSpecificData.systemPrompt;
      changed = true;
    }
  }
  return changed ? JSON.stringify(data) : null;
}

db.exec("BEGIN");
try {
  db.prepare("DELETE FROM kv WHERE scope = 'customModels'").run();
  db.prepare("DELETE FROM kv WHERE scope = 'modelNames'").run();
  if (withAliases) db.prepare("DELETE FROM kv WHERE scope = 'modelAliases'").run();
  if (withHidden) db.prepare("DELETE FROM kv WHERE scope = 'deletedModels'").run();

  const next = { ...settings };
  for (const key of PROMPT_KEYS) {
    if (key === "promptInjectionGlobal") next[key] = null;
    else next[key] = {};
  }
  for (const [key, value] of Object.entries(REQUEST_TRANSFORM_DEFAULTS)) next[key] = value;
  db.prepare(
    "INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
  ).run(JSON.stringify(next));

  const updateConnection = db.prepare("UPDATE providerConnections SET data = ?, updatedAt = ? WHERE id = ?");
  const now = new Date().toISOString();
  for (const row of connectionsWithPrompt) {
    const data = stripSystemPrompt(row.data);
    if (data) updateConnection.run(data, now, row.id);
  }

  const updateNode = db.prepare("UPDATE providerNodes SET data = ?, updatedAt = ? WHERE id = ?");
  for (const row of nodesWithPrompt) {
    const data = stripSystemPrompt(row.data);
    if (data) updateNode.run(data, now, row.id);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const after = {
  custom: count("customModels"),
  aliases: count("modelAliases"),
  names: count("modelNames"),
  hidden: count("deletedModels"),
};
console.log(
  `[reset] done — custom=${after.custom} aliases=${after.aliases} names=${after.names} hidden=${after.hidden}`,
);
db.close();
