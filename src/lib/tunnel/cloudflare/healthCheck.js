import { resolveDns } from "../shared/dnsResolver.js";
import { HEALTH_CHECK } from "./config.js";

export async function probeUrlAlive(url) {
  if (!url) return false;
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return false; }

  // DNS is only a hint: *.trycloudflare.com is routinely unresolved on the
  // machine that created the tunnel while the public URL already works.
  // A failed lookup must not veto the actual HTTP probe.
  const dnsOk = await resolveDns(hostname, HEALTH_CHECK.dnsTimeoutMs);

  const probe = async (ms) => {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(ms) });
      return res.ok;
    } catch {
      return false;
    }
  };

  if (await probe(HEALTH_CHECK.fetchTimeoutMs)) return true;
  return dnsOk ? false : probe(HEALTH_CHECK.fetchTimeoutMs);
}

export async function waitForHealth(url, cancelToken = { cancelled: false }) {
  const start = Date.now();
  while (Date.now() - start < HEALTH_CHECK.timeoutMs) {
    if (cancelToken.cancelled) throw new Error("cancelled");
    if (await probeUrlAlive(url)) return true;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK.intervalMs));
  }
  throw new Error(`Health check timeout after ${HEALTH_CHECK.timeoutMs}ms`);
}
