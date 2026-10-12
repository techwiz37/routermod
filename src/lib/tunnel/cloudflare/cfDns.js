// Cloudflare DNS API — create/delete CNAME subdomain on toolwiz.id
// Used by tunnel enable/disable to provision public domain automatically.

const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN = process.env.CF_API_TOKEN;
const CF_ZONE_ID = process.env.CF_ZONE_ID || "d8abdbb911d3f9d62492876ee9a618be";
const PUBLIC_DOMAIN = process.env.CF_PUBLIC_DOMAIN || "toolwiz.id";

function headers() {
  return {
    "Authorization": `Bearer ${CF_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/**
 * Generate 5-char random subdomain slug
 * @returns {string} e.g. "a3k9m"
 */
export function generateSubdomainSlug() {
  const chars = "abcdefghijklmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Create CNAME record: {slug}.toolwiz.id → trycloudflare tunnelUrl hostname
 * @param {string} slug - 5-char subdomain
 * @param {string} tunnelHostname - e.g. "dts-molecular-rent-briefs.trycloudflare.com"
 * @returns {Promise<{ recordId: string, publicUrl: string }>}
 */
export async function createSubdomain(slug, tunnelHostname) {
  const name = `${slug}.${PUBLIC_DOMAIN}`;
  const res = await fetch(`${CF_API}/zones/${CF_ZONE_ID}/dns_records`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "CNAME",
      name,
      content: tunnelHostname,
      ttl: 1, // auto
      proxied: true, // Cloudflare proxy — handles SSL
    }),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`CF DNS create failed: ${JSON.stringify(data.errors)}`);
  }
  return {
    recordId: data.result.id,
    publicUrl: `https://${name}`,
  };
}

/**
 * Delete CNAME record by recordId
 * @param {string} recordId
 */
export async function deleteSubdomain(recordId) {
  if (!recordId) return;
  const res = await fetch(`${CF_API}/zones/${CF_ZONE_ID}/dns_records/${recordId}`, {
    method: "DELETE",
    headers: headers(),
  });
  const data = await res.json();
  if (!data.success) {
    console.warn(`[cfDns] delete record ${recordId} failed:`, data.errors);
  }
}

/**
 * List all CNAME records for toolwiz.id subdomains (for cleanup)
 */
export async function listSubdomains() {
  const res = await fetch(
    `${CF_API}/zones/${CF_ZONE_ID}/dns_records?type=CNAME&per_page=100`,
    { headers: headers() }
  );
  const data = await res.json();
  if (!data.success) throw new Error(`CF DNS list failed: ${JSON.stringify(data.errors)}`);
  return data.result || [];
}
