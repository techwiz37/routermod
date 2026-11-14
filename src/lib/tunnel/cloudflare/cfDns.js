import { CF_API, CF_TOKEN, CF_ZONE, CF_PUBLIC_DOMAIN } from "./config.js";

// The public subdomain is a Cloudflare *Worker route* (r<shortId>.<domain>),
// not a per-user DNS record we own. We only look it up so the UI can warn the
// user when the worker route is missing — we never create or delete records
// with a token this app doesn't control.

function authHeaders() {
  return { Authorization: `Bearer ${CF_TOKEN}` };
}

export async function findPublicRecord(shortId) {
  if (!CF_TOKEN || !CF_ZONE) return { known: false, present: false };
  const name = `r${shortId}.${CF_PUBLIC_DOMAIN}`;
  try {
    const res = await fetch(
      `${CF_API}/zones/${CF_ZONE}/dns_records?name=${encodeURIComponent(name)}&per_page=1`,
      { headers: authHeaders(), signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json().catch(() => ({}));
    if (!data.success) {
      console.warn(`[cfDns] lookup failed for ${name}: ${JSON.stringify(data.errors || res.status)}`);
      return { known: false, present: false };
    }
    return { known: true, present: (data.result || []).length > 0 };
  } catch (e) {
    console.warn(`[cfDns] lookup error for ${name}: ${e.message}`);
    return { known: false, present: false };
  }
}

export function publicUrlFor(shortId) {
  return `https://r${shortId}.${CF_PUBLIC_DOMAIN}`;
}
