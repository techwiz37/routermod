// Cloudflare Tunnel configuration.
//
// Two layers exist in production:
//   1. Quick tunnel (cloudflared) → the machine truly only needs outbound 7844.
//   2. Public domain (https://abc-tunnel.us) → a worker that maps
//      https://r<shortId>.abc-tunnel.us onto the current quick-tunnel URL.
//      Only that worker performs WorkerOrigin fetches, so the origin machine
//      never has to be directly reachable.
//
// The worker is looked up with shortId only — never with a slug/token — and
// the register endpoint rewrites the mapping, so a restart of the app keeps
// working with the same public domain.
export const TUNNEL_WORKER_URL = (process.env.TUNNEL_WORKER_URL || "https://abc-tunnel.us").replace(/\/+$/, "");

// Cloudflare DNS read access (used only to detect a missing public subdomain).
// Writing KV/DNS requires an API token owned by the worker, not by this app.
export const CF_API = "https://api.cloudflare.com/client/v4";
export const CF_TOKEN = process.env.CF_API_TOKEN || "";
export const CF_ZONE = process.env.CF_ZONE_ID || "";
export const CF_PUBLIC_DOMAIN = process.env.CF_PUBLIC_DOMAIN || new URL(TUNNEL_WORKER_URL).hostname;

// Quick tunnel DNS is flaky for the first seconds after creation.
export const HEALTH_CHECK = {
  intervalMs: 2000,
  timeoutMs: 60000,
  fetchTimeoutMs: 5000,
  dnsTimeoutMs: 2000,
};
