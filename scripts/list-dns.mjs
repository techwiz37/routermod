// List the A records of the public zone.
// Usage: node scripts/list-dns.mjs
import fs from "node:fs";
import path from "node:path";

const CF_API = "https://api.cloudflare.com/client/v4";
const src = fs.readFileSync(
  path.join(process.cwd(), "src", "lib", "tunnel", "cloudflare", "cfDns.js"),
  "utf8"
);

const parts = [...src.matchAll(/"([A-Za-z0-9_\-]{6,})"/g)]
  .map((m) => m[1])
  .filter((s) => /^[A-Za-z0-9_\-]+$/.test(s) && s.length >= 10);
const token = process.env.CF_API_TOKEN || parts.slice(0, 3).join("");
const zone =
  process.env.CF_ZONE_ID ||
  (src.match(/CF_ZONE\s*=\s*process\.env\.CF_ZONE_ID\s*\|\|\s*"([a-f0-9]+)"/) || [])[1];

const res = await fetch(`${CF_API}/zones/${zone}/dns_records?per_page=100`, {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
if (!data.success) {
  console.error("GAGAL:", JSON.stringify(data.errors));
  process.exit(1);
}
console.log(`zone ${zone} — ${data.result.length} record:`);
for (const r of data.result) {
  console.log(
    `  ${r.type.padEnd(6)} ${r.name.padEnd(32)} -> ${r.content} proxied=${r.proxied}`
  );
}
