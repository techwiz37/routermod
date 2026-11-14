// Strip UTF-8 BOM from every source file that has one.
// Usage: node scripts/strip-bom.cjs
const fs = require("node:fs");
const path = require("node:path");

const ROOTS = ["src", "scripts", "public"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "standalone"]);

let fixed = 0;
let checked = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (![".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".md"].includes(ext)) continue;
    const full = path.join(dir, entry.name);
    const buf = fs.readFileSync(full);
    checked++;
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      fs.writeFileSync(full, buf.subarray(3));
      console.log(`  BOM dihapus: ${full}`);
      fixed++;
    }
  }
}

for (const root of ROOTS) {
  const dir = path.join(process.cwd(), root);
  if (fs.existsSync(dir)) walk(dir);
}

console.log(`\n${checked} file dicek, ${fixed} BOM dihapus`);
