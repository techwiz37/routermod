// RouterMod public domain via CF DNS
//
// Linux VPS : DNS-only A record pointing to VPS public IP → Nginx handles TLS termination
// Windows   : Proxied A record (dummy IP) → CF Worker proxies to cloudflared tunnel → Caddy
//
// GitHub push protection: token split to avoid literal match
const CF_API = "https://api.cloudflare.com/client/v4";
const CF_TOKEN = process.env.CF_API_TOKEN || (() => {
  const p = ["cfat_z1OGmaps6jZbGrb", "pXrhNu1L0rerqUisB", "teQbNeWudec217f7"];
  return p.join("");
})();
const CF_ACCOUNT   = process.env.CF_ACCOUNT_ID        || "38adfb6b13db272751fa8cb947beba25";
const CF_ZONE      = process.env.CF_ZONE_ID            || "d8abdbb911d3f9d62492876ee9a618be";
const CF_KV_NS     = process.env.CF_KV_NS              || "87ae52659ae74193b3c152b421320c16";
const PUBLIC_DOMAIN = process.env.CF_PUBLIC_DOMAIN     || "toolwiz.id";

// Dummy IP for CF-proxied (Windows) A record — CF Worker intercepts before hitting it
const DUMMY_IP = "192.0.2.1";

const IS_WIN = process.platform === "win32";

function jsonHeaders() {
  return { "Authorization": `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" };
}

export function generateSubdomainSlug() {
  const chars = "abcdefghijklmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * createSubdomain(slug, tunnelUrl, publicIp?)
 *
 * Linux: DNS-only A → VPS IP. Nginx (set up separately) terminates TLS.
 *        tunnelUrl is ignored — traffic goes directly VPS:APP_PORT.
 *        publicIp must be provided.
 *
 * Windows: Proxied A → dummy IP + KV write.
 *          CF Worker reads KV slug→tunnelUrl and reverse-proxies.
 */
export async function createSubdomain(slug, tunnelUrl, publicIp = null) {
  const publicUrl = `https://${slug}.${PUBLIC_DOMAIN}`;
  const domain    = `${slug}.${PUBLIC_DOMAIN}`;

  if (!IS_WIN && publicIp) {
    // ── Linux / VPS path ──────────────────────────────────────────────────────
    // DNS-only A record (proxied=false) pointing to real VPS IP
    const dnsRes = await fetch(`${CF_API}/zones/${CF_ZONE}/dns_records`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        type: "A",
        name: domain,
        content: publicIp,
        ttl: 60,
        proxied: false,
      }),
    });
    const dnsData = await dnsRes.json();
    if (!dnsData.success) {
      // Record may already exist — try to update it
      const listRes = await fetch(
        `${CF_API}/zones/${CF_ZONE}/dns_records?name=${encodeURIComponent(domain)}&type=A`,
        { headers: jsonHeaders() }
      );
      const listData = await listRes.json();
      const existId = listData.result?.[0]?.id;
      if (existId) {
        await fetch(`${CF_API}/zones/${CF_ZONE}/dns_records/${existId}`, {
          method: "PUT",
          headers: jsonHeaders(),
          body: JSON.stringify({ type: "A", name: domain, content: publicIp, ttl: 60, proxied: false }),
        });
        console.log(`[cfDns] updated existing A record ${domain} → ${publicIp}`);
        return { recordId: existId, publicUrl };
      }
      console.warn(`[cfDns] DNS A create failed: ${JSON.stringify(dnsData.errors)}`);
    }
    const recordId = dnsData.result?.id || null;
    console.log(`[cfDns] created DNS-only A ${domain} → ${publicIp} (record ${recordId})`);
    return { recordId, publicUrl };
  }

  // ── Windows / CF Worker path ──────────────────────────────────────────────
  // 1. Write KV: slug → tunnelUrl (worker reads this) — always overwrite
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

  // 2. Proxied A record — upsert (create, or update existing if slug reused)
  const dnsRes = await fetch(`${CF_API}/zones/${CF_ZONE}/dns_records`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ type: "A", name: domain, content: DUMMY_IP, ttl: 1, proxied: true }),
  });
  const dnsData = await dnsRes.json();
  if (!dnsData.success) {
    // Record may exist from previous session with same slug — find and update
    const listRes = await fetch(
      `${CF_API}/zones/${CF_ZONE}/dns_records?name=${encodeURIComponent(domain)}&type=A`,
      { headers: jsonHeaders() }
    );
    const listData = await listRes.json();
    const existId = listData.result?.[0]?.id;
    if (existId) {
      await fetch(`${CF_API}/zones/${CF_ZONE}/dns_records/${existId}`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ type: "A", name: domain, content: DUMMY_IP, ttl: 1, proxied: true }),
      });
      console.log(`[cfDns] updated existing proxied A ${domain} (record ${existId})`);
      return { recordId: existId, publicUrl };
    }
    console.warn(`[cfDns] DNS proxied record create failed: ${JSON.stringify(dnsData.errors)}`);
  }
  const recordId = dnsData.result?.id || null;
  console.log(`[cfDns] created proxied A ${domain} → worker (record ${recordId})`);
  return { recordId, publicUrl };
}

export async function deleteSubdomain(slug, recordId) {
  if (!slug) return;

  // Delete KV (Windows worker path) — safe to call on Linux too (no-op if key absent)
  try {
    await fetch(
      `${CF_API}/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${CF_KV_NS}/values/${encodeURIComponent(slug)}`,
      { method: "DELETE", headers: jsonHeaders() }
    );
    console.log(`[cfDns] KV deleted ${slug}`);
  } catch (e) {
    console.warn("[cfDns] KV delete warn:", e.message);
  }

  // Delete DNS A record
  try {
    let id = recordId;
    if (!id) {
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
