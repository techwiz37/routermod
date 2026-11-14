// Scan for mojibake: characters that can only appear when UTF-8 was decoded
// as Latin-1 (e.g. "â€¢" for "•", "Â·" for "·", "Ã©" for "é").
const fs = require("fs");
const path = require("path");

const ROOTS = ["src", "open-sse", "scripts"];
const EXT = new Set([".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".md"]);

// Suspect lead bytes of a mojibake sequence.
const LEADS = /[\u00C2\u00C3\u00C4\u00C5\u00E2\u00E3\u00E4\u00E5\u00EF\u00F0\u00F4\u00F8]/;
// A mojibake lead is normally followed by U+0080-U+00BF (or a currency char
// produced by a 3-byte sequence) — and never by a plain ASCII letter.
const TAIL = /[\u0080-\u00BF\u20AC\u0192\u201A\u201E\u2020\u2022\u2026\u2030\u2039\u203A\u00A0-\u00FF]/;

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

let hits = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (file.endsWith("mojibake-scan.cjs")) continue; // this file documents the pattern
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      // Find a lead char followed by a tail char that is NOT a plain ASCII letter.
      for (let k = 0; k < line.length - 1; k++) {
        if (!LEADS.test(line[k])) continue;
        const nxt = line[k + 1];
        if (nxt === " " || /[A-Za-z0-9]/.test(nxt)) continue;
        if (!TAIL.test(nxt)) continue;
        hits++;
        console.log(`${file}:${i + 1}  ${line.trim().slice(0, 120)}`);
        break;
      }
    });
  }
}
console.log(hits ? `\nTOTAL: ${hits}` : "\nCLEAN — tidak ada mojibake");
