import net from "net";
import tls from "tls";

/**
 * HTTP CONNECT tunnel for providers that talk raw https.request instead of
 * fetch (the OpenCode free tier executor is one of them).
 *
 * The proxy pool is picked per request by the credential resolver, so every
 * request leaves through a different egress IP. Without this the free tier
 * sees one IP and answers 429 FreeUsageLimitError.
 */

// A working proxy answers CONNECT in well under a second. The dead ones hang
// until the socket timeout, and every request that picks them pays that wait
// before the fallback kicks in - so keep the leash short.
const CONNECT_TIMEOUT_MS = 10000;

// How long a proxy stays skipped after the upstream refused its egress IP.
const BLOCKED_PROXY_COOLDOWN_MS = 10 * 60 * 1000;

// A pool proxy rotates its exit IP per connection, so a single 403 proves
// nothing about the proxy itself. Only a streak of them does.
const BLOCKED_PROXY_STRIKES = 3;

// "host:port" → { strikes, blockedUntil }. In-memory on purpose: the rotation
// state in connectionProxy.js is in-memory too, and a restart re-tests the
// pool anyway.
const blockedProxies = new Map();

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function normalizeProxyUrl(raw) {
  const value = normalizeString(raw);
  if (!value) return null;
  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Resolve the proxy that should be used for a target URL. */
export function resolveProxyTarget(proxyOptions = {}, targetUrl = "") {
  const enabled =
    proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true;
  if (!enabled) return null;

  const raw = normalizeString(proxyOptions?.url ?? proxyOptions?.connectionProxyUrl);
  if (!raw) return null;

  const noProxy = normalizeString(proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy);
  if (noProxy && shouldBypassByNoProxy(targetUrl, noProxy)) return null;

  const parsed = normalizeProxyUrl(raw);
  if (!parsed) return null;

  return {
    url: parsed.href,
    host: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
    secure: parsed.protocol === "https:",
    auth: parsed.username
      ? `Basic ${Buffer.from(
          `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password || "")}`
        ).toString("base64")}`
      : "",
  };
}

/** Stable identity of a proxy endpoint, used as the blocked-registry key. */
function proxyKey(target) {
  if (!target?.host) return "";
  return `${target.host}:${target.port}`;
}

/**
 * True when the upstream refused this proxy over and over again.
 * Sending through it again only burns a round trip, so the caller goes
 * straight to a direct connection until the cooldown expires.
 */
export function isProxyBlocked(target) {
  const key = proxyKey(target);
  if (!key) return false;
  const entry = blockedProxies.get(key);
  if (!entry) return false;
  if (Date.now() >= entry.blockedUntil) {
    // Cooldown over - the proxy gets a clean slate again.
    entry.strikes = 0;
    entry.blockedUntil = 0;
    return false;
  }
  return true;
}

/**
 * Record one failure of this proxy — a refused exit IP or a tunnel that
 * never opened.
 *
 * Returns true once the streak is long enough for the proxy to be skipped.
 * The exit IP of a pool proxy rotates per connection, so a single 403 is not
 * enough to condemn the whole proxy - only a streak of them is.
 */
export function noteProxyBlocked(target, ttlMs = BLOCKED_PROXY_COOLDOWN_MS) {
  const key = proxyKey(target);
  if (!key) return false;
  const entry = blockedProxies.get(key) || { strikes: 0, blockedUntil: 0 };
  entry.strikes += 1;
  if (entry.strikes >= BLOCKED_PROXY_STRIKES) {
    entry.strikes = 0;
    entry.blockedUntil = Date.now() + ttlMs;
    blockedProxies.set(key, entry);
    return true;
  }
  blockedProxies.set(key, entry);
  return false;
}

/** Forget the refusals of a proxy that answered normally again. */
export function clearProxyBlocked(target) {
  const key = proxyKey(target);
  if (!key) return;
  blockedProxies.delete(key);
}

/** Same check as isProxyBlocked() but for a raw proxy URL string. */
export function isProxyUrlBlocked(proxyUrl) {
  const parsed = normalizeProxyUrl(proxyUrl);
  if (!parsed) return false;
  return isProxyBlocked({
    host: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)),
  });
}

function shouldBypassByNoProxy(targetUrl, noProxyValue) {
  const noProxy = normalizeString(noProxyValue);
  if (!noProxy) return false;

  let hostname;
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  const patterns = noProxy.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.startsWith(".")) return hostname.endsWith(pattern) || hostname === pattern.slice(1);
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  });
}

/**
 * Open a tunnel through the proxy and return the connected socket, ready to be
 * handed to https.request({ socket }).
 */
export function openProxyTunnel(proxyTarget, targetHost, targetPort = 443, options = {}) {
  const timeoutMs = options.timeoutMs ?? CONNECT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = proxyTarget.secure
      ? tls.connect({ host: proxyTarget.host, port: proxyTarget.port, servername: proxyTarget.host })
      : net.connect({ host: proxyTarget.host, port: proxyTarget.port });

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      reject(err);
    };

    socket.setTimeout(timeoutMs, () => fail(new Error(`proxy connect timeout (${proxyTarget.host})`)));
    socket.once("error", fail);

    const onReady = () => {
      socket.removeListener("error", fail);
      socket.setTimeout(0);

      const authority = `${targetHost}:${targetPort}`;
      const lines = [
        `CONNECT ${authority} HTTP/1.1`,
        `Host: ${authority}`,
        "Proxy-Connection: Keep-Alive",
      ];
      if (proxyTarget.auth) lines.push(`Proxy-Authorization: ${proxyTarget.auth}`);
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);

      let buf = Buffer.alloc(0);
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        socket.removeListener("data", onData);
        const head = buf.slice(0, end).toString("utf8");
        const statusLine = head.split("\r\n")[0] || "";
        const match = statusLine.match(/HTTP\/1\.[01]\s+(\d+)/);
        const status = match ? Number(match[1]) : 0;
        if (status !== 200) {
          settled = true;
          try {
            socket.destroy();
          } catch {
            /* ignore */
          }
          reject(new Error(`proxy CONNECT failed: ${status || statusLine}`));
          return;
        }
        settled = true;
        resolve(socket);
      };
      socket.on("data", onData);
    };

    if (proxyTarget.secure) socket.once("secureConnect", onReady);
    else socket.once("connect", onReady);
  });
}
