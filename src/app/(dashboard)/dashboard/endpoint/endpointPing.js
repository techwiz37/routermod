import { CLIENT_PING_TIMEOUT_MS } from "./endpointConstants";

// A public endpoint is considered reachable when *either* answer succeeds:
//   1. a JSON ping with CORS (new builds expose /api/tunnel/ping), or
//   2. an opaque response from /api/health (older builds / dashboard-blocked
//      tunnel hosts still answer, they just don't expose CORS headers).
// A 403/404/5xx means "the domain answered but this app is not behind it",
// which must be reported as NOT reachable — that is the "Domain not
// reachable" case users hit when the tunnel mapping is stale.

async function probe(url, path, mode) {
  try {
    const res = await fetch(`${url}${path}`, {
      mode,
      cache: "no-store",
      signal: AbortSignal.timeout(CLIENT_PING_TIMEOUT_MS),
    });
    if (mode === "no-cors") return res.type === "opaque" || res.ok;
    return res.ok;
  } catch {
    return false;
  }
}

export async function clientPingUrl(url) {
  if (!url) return false;
  if (await probe(url, "/api/tunnel/ping", "cors")) return true;
  return probe(url, "/api/health", "no-cors");
}

export async function clientPing(url) {
  // JSON ping when available: proves the request reached this RouterMod
  // instance and not some unrelated site behind the same domain.
  if (!url) return false;
  try {
    const res = await fetch(`${url}/api/tunnel/ping`, {
      mode: "cors",
      cache: "no-store",
      signal: AbortSignal.timeout(CLIENT_PING_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && data.ok === true);
  } catch {
    return clientPingUrl(url);
  }
}

export async function clientPingAny(...urls) {
  const checks = urls.filter(Boolean).map(clientPing);
  if (!checks.length) return false;
  return new Promise((resolve) => {
    let pending = checks.length;
    checks.forEach((p) => p.then((ok) => {
      if (ok) resolve(true);
      else if (--pending === 0) resolve(false);
    }));
  });
}

export const WENYAN_LOCALES = ["zh-CN", "zh-TW"];
