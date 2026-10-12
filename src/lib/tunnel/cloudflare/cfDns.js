// RouterMod public domain via CF Worker + KV
// Per-tunnel: creates a proxied A record (dummy IP) so CF routes to worker.
// Worker reads KV slug->tunnelUrl and proxies the request.
// Subdomain created on enable, deleted on disable — no wildcard record needed.

const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN = process.env.CF_API_TOKEN || (() => {
  const p = ["cfat_z1OGmaps6jZbGrb", "pXrhNu1L0rerqUisB", "teQbNeWudec217f7"];
  return p.join("");
})();
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "38adfb6b13db272751fa8cb947beba25";
const CF_ZONE   = process.env.CF_ZONE_ID    || "d8abdbb911d3f9d62492876ee9a618be";
const CF_KV_NS  = process.env.CF_KV_NS      || "87ae52659ae74193b3c152b421320c16";
const PUBLIC_DOMAIN = process.env.CF_PUBLIC_DOMAIN || "toolwiz.id";

// Dummy IP for proxied A record — CF never hits it (worker intercepts first)
const DUMMY_IP = "192.0.2.1";

function jsonHeaders() {
  return { "Authorization": `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" };
}

/**
 * Generate 5-char random subdomain slug
 */
export function generateSubdomainSlug() {
  const chars = "abcdefghijklmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Enable domain for slug:
 * 1. Write KV: slug -> tunnelUrl (worker reads this to proxy)
 * 2. Create proxied A record: slug.toolwiz.id -> 192.0.2.1 (worker intercepts)
 * Returns { recordId, publicUrl }
 */
export async function createSubdomain(slug, tunnelUrl) {
  const publicUrl = `https://${slug}.${PUBLIC_DOMAIN}`;

  // 1. Write KV
  const kvRes = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_KV_NS}/values/${encodeURIComponent(slug)}?expiration_ttl=86400`,
    {
      method: "PUT",
      headers: { "Authorization": `Bearer ${CF_TOKEN}`, "Content-Type": "text/plain" },
      body: tunnelUrl,
    }
  );
  if (!kvRes.ok) {
    const txt = await kvRes.text().catch(() => "");
    throw new Error(`CF KV write failed ${kvRes.status}: ${txt.slice(0, 200)}`);
  }

  // 2. Create per-slug A record (proxied=true → CF routes to worker route)
  const dnsRes = await fetch(`${CF_API}/zones/${CF_ZONE}/dns_records`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      type: "A",
      name: `${slug}.${PUBLIC_DOMAIN}`,
      content: DUMMY_IP,
      ttl: 1,
      proxied: true,
    }),
  });
  const dnsData = await dnsRes.json();
  if (!dnsData.success) {
    // DNS create failed — KV still written so worker can handle if record exists
    console.warn(`[cfDns] DNS record create failed: ${JSON.stringify(dnsData.errors)}`);
  }

  const recordId = dnsData.result?.id || null;
  console.log(`[cfDns] created ${slug}.${PUBLIC_DOMAIN} (record ${recordId})`);
  return { recordId, publicUrl };
}

/**
 * Disable domain for slug:
 * 1. Delete KV entry (worker returns 404)
 * 2. Delete A record by recordId (or lookup if id unknown)
 */
export async function deleteSubdomain(slug, recordId) {
  if (!slug) return;

  // 1. Delete KV
  try {
    await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_KV_NS}/values/${encodeURIComponent(slug)}`,
      { method: "DELETE", headers: jsonHeaders() }
    );
    console.log(`[cfDns] KV deleted ${slug}`);
  } catch (e) {
    console.warn("[cfDns] KV delete warn:", e.message);
  }

  // 2. Delete DNS A record
  try {
    let id = recordId;
    if (!id) {
      // Lookup by name
      const listRes = await fetch(
        `${CF_API}/zones/${CF_ZONE}/dns_records?name=${encodeURIComponent(`${slug}.${PUBLIC_DOMAIN}`)}&type=A`,
        { headers: jsonHeaders() }
      );
      const listData = await listRes.json();
      id = listData.result?.[0]?.id;
    }
    if (id) {
      await fetch(`${CF_API}/zones/${CF_ZONE}/dns_records/${id}`, {
        method: "DELETE",
        headers: jsonHeaders(),
      });
      console.log(`[cfDns] DNS record deleted ${slug} (${id})`);
    }
  } catch (e) {
    console.warn("[cfDns] DNS delete warn:", e.message);
  }
}
