// Remove every DNS record with a given name from the public zone
// (e.g. opn.toolwiz.id) + its KV entry.
// Usage: node scripts/remove-subdomain.mjs <slug>
import fs from "node:fs";
import path from "node:path";
import { deleteSubdomain } from "../src/lib/tunnel/cloudflare/cfDns.js";

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
const publicDomain =
  process.env.CF_PUBLIC_DOMAIN ||
  (src.match(/CF_PUBLIC_DOMAIN\s*=\s*process\.env\.CF_PUBLIC_DOMAIN\s*\|\|\s*"([^"]+)"/) || [])[1];

const slug = process.argv[2];
if (!slug) {
  console.error("usage: node scripts/remove-subdomain.mjs <slug>");
  process.exit(1);
}
const name = `${slug}.${publicDomain}`;

// 1. List + delete every record with that name.
const listRes = await fetch(
  `${CF_API}/zones/${zone}/dns_records?name=${encodeURIComponent(name)}&per_page=100`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const listData = await listRes.json();
const records = listData.result || [];
console.log(`record "${name}": ${records.length}`);
for (const r of records) {
  const del = await fetch(`${CF_API}/zones/${zone}/dns_records/${r.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const delData = await del.json();
  console.log(
    `  hapus ${r.type} ${r.name} -> ${r.content} (proxied=${r.proxied}) : ${delData.success ? "OK" : JSON.stringify(delData.errors)}`
  );
}

// 2. KV entry.
await deleteSubdomain(slug, records[0]?.id);
console.log(`selesai: "${name}" + KV "${slug}" dihapus`);
