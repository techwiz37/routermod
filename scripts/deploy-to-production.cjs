// Deploy the working copy to the production instance that serves
// btvwi.toolwiz.id (pm2 app "routermod", folder Desktop\routermod).
//
// The two folders share one database, so the production build has to carry the
// same source: src/, the open-sse package (bundled into the standalone build)
// and the i18n literals.
//
// The pm2 environment used to force the AI Agent off - that is switched on
// here as well.
const fs = require("node:fs");
const path = require("node:path");

const SRC = "C:\\Users\\Administrator\\Desktop\\run-routermod";
const DST = "C:\\Users\\Administrator\\Desktop\\routermod";

// Folders that are copied as a whole (source wins, extra files are removed).
const SYNC_DIRS = ["src", "open-sse", "public\\i18n", "scripts"];

function copyTree(rel) {
  const from = path.join(SRC, rel);
  const to = path.join(DST, rel);
  if (!fs.existsSync(from)) return 0;

  let copied = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(child);
      continue;
    }
    const same =
      fs.existsSync(dst) &&
      fs.statSync(src).size === fs.statSync(dst).size &&
      fs.readFileSync(src).compare(fs.readFileSync(dst)) === 0;
    if (!same) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied++;
    }
  }
  return copied;
}

function removeExtra(rel) {
  const from = path.join(SRC, rel);
  const to = path.join(DST, rel);
  if (!fs.existsSync(from) || !fs.existsSync(to)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(to, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      removed += removeExtra(child);
      continue;
    }
    if (!fs.existsSync(path.join(from, entry.name))) {
      fs.rmSync(path.join(to, entry.name), { force: true });
      removed++;
    }
  }
  return removed;
}

for (const dir of SYNC_DIRS) {
  const copied = copyTree(dir);
  const removed = removeExtra(dir);
  console.log(`OK  ${dir}: ${copied} file diperbarui, ${removed} file dihapus`);
}

// The pm2 environment forced the AI Agent off.
const ECO = path.join(DST, "ecosystem.config.js");
let eco = fs.readFileSync(ECO, "utf8");
const before = eco;
eco = eco.replace(/AGENT_ENABLED:\s*"[^"]*"/, 'AGENT_ENABLED: "1"');
eco = eco.replace(/AGENT_ALLOW_TERMINAL:\s*"[^"]*"/, 'AGENT_ALLOW_TERMINAL: "1"');
if (eco !== before) {
  fs.writeFileSync(ECO, eco, "utf8");
  console.log("OK  ecosystem.config.js: AGENT_ENABLED=1, AGENT_ALLOW_TERMINAL=1");
} else {
  console.log("OK  ecosystem.config.js sudah AGENT_ENABLED=1");
}
