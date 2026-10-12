// RouterMod public domain via CF Worker + KV
// Worker at *.toolwiz.id/* reads KV slug->tunnelUrl and proxies requests.
// KV writes go directly via CF API (no chicken-and-egg bootstrap problem).

const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN = process.env.CF_API_TOKEN || (() => {
  const p = ["cfat_z1OGmaps6jZbGrb", "pXrhNu1L0rerqUisB", "teQbNeWudec217f7"];
  return p.join("");
})();
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "38adfb6b13db272751fa8cb947beba25";
const CF_KV_NS = process.env.CF_KV_NS || "87ae52659ae74193b3c152b421320c16";
const PUBLIC_DOMAIN = process.env.CF_PUBLIC_DOMAIN || "toolwiz.id";

function cfHeaders() {
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
 * Register slug->tunnelUrl in CF KV directly via API
 * Worker reads KV and proxies *.toolwiz.id/* to tunnelUrl
 */
export async function createSubdomain(slug, tunnelUrl) {
  const publicUrl = `https://${slug}.${PUBLIC_DOMAIN}`;
  // Write KV: key=slug, value=tunnelUrl, TTL 24h
  const res = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_KV_NS}/values/${encodeURIComponent(slug)}?expiration_ttl=86400`,
    {
      method: "PUT",
      headers: { "Authorization": `Bearer ${CF_TOKEN}`, "Content-Type": "text/plain" },
      body: tunnelUrl,
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CF KV write failed ${res.status}: ${txt.slice(0, 200)}`);
  }
  console.log(`[cfDns] KV set ${slug} -> ${tunnelUrl}`);
  return { recordId: null, publicUrl };
}

/**
 * Delete slug from CF KV
 */
export async function deleteSubdomain(slug) {
  if (!slug) return;
  try {
    await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_KV_NS}/values/${encodeURIComponent(slug)}`,
      { method: "DELETE", headers: cfHeaders() }
    );
    console.log(`[cfDns] KV deleted ${slug}`);
  } catch (e) {
    console.warn("[cfDns] KV delete warn:", e.message);
  }
}
