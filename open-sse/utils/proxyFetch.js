import { Readable } from "stream";
import {
  MEMORY_CONFIG,
  OPENCODE_MAX_HOPS,
  OPENCODE_HOP_BUDGET_MS,
  FRESH_RETRY_KEEPALIVE_TIMEOUT_MS,
  STALE_SOCKET_ERROR_CODES,
  NON_STALE_SOCKET_ERROR_CODES,
  STALE_SOCKET_ERROR_SUBSTRINGS,
  resolveKeepAliveTimeouts,
  isFreshSocketReplayEnabled,
} from "../config/runtimeConfig.js";
import { dbg } from "./debugLog.js";
import { ensureClaudeCliVersion, applyClaudeCliVersion } from "./claudeCliVersion.js";
import {
  warpHop,
  whenWarpStable,
  beginWarpRequest,
  releaseWarpRequest,
  waitForWarpIdle,
  ensureWarpProxyReady,
} from "@/lib/network/warpRotator.js";

// Generic WARP auto-hop (openhop.cfd behaviour) for EVERY provider that uses
// the RouterMod WARP tunnel — not just OpenCode Free. A 429 from an IP-limited
// upstream rotates the IPv6 /64 and replays the request through the fresh
// tunnel. Use the SAME 100-IP / 1h target as the OpenCode executor: a failed
// or same-IP hop is not a stop condition, only the target or budget ends it.
const WARP_AUTO_HOP_BUDGET_MS = Number(process.env.ROUTERMOD_WARP_HOP_BUDGET_MS || OPENCODE_HOP_BUDGET_MS);
const WARP_AUTO_HOP_MAX = Number(process.env.ROUTERMOD_WARP_HOP_MAX || OPENCODE_MAX_HOPS);

function isRouterModWarpProxy(proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    const port = String(process.env.ROUTERMOD_WARP_PORT || 40000);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    return (host === "127.0.0.1" || host === "localhost" || host === "::1")
      && (u.port || (u.protocol === "https:" ? "443" : "80")) === port;
  } catch { return false; }
}

// A WARP hop disconnects and reconnects the tunnel; any request already in
// flight through it dies with a broken pipe / ECONNRESET. Wait for the hop to
// settle, then replay the request instead of surfacing a spurious 502.
const HOP_DISRUPTION_RE = /broken pipe|econnreset|econnrefused|connection error|stream closed|socket closed|sendrequest|und_err_socket|proxy required but failed/i;

function isHopDisruption(error) {
  if (!error || error?.name === "AbortError") return false;
  const message = `${error?.message || ""} ${error?.cause?.message || ""}`;
  return HOP_DISRUPTION_RE.test(message);
}

async function retryAfterHop(url, options, once) {
  // Use the same 100-IP / 1h target as the 429 hop loop. A tunnel disruption
  // is just another symptom of an exhausted exit — rotate it and replay until
  // the target or budget ends, instead of giving up after two retries.
  const maxAttempts = WARP_AUTO_HOP_MAX;
  const deadline = Date.now() + WARP_AUTO_HOP_BUDGET_MS;
  for (let attempt = 1; attempt <= maxAttempts && Date.now() < deadline; attempt++) {
    try {
      return await once();
    } catch (error) {
      const replaySafe = isBodyReplaySafe(options?.body);
      if (!replaySafe || !isHopDisruption(error) || options?.signal?.aborted || attempt >= maxAttempts) throw error;
      console.log(`[WARP-HOP] tunnel dropped mid-request (${String(error?.message || error).slice(0, 110)}) — rotating then retry ${attempt}/${maxAttempts}: ${safeTargetHost(url)}`);
      await whenWarpStable().catch(() => {});
      const detail = `${error?.message || ""} ${error?.cause?.message || ""}`;
      if (/proxyconnect|connection refused|econnrefused|proxy required but failed/i.test(detail)) {
        // Tunnel is down (port 40000 closed). Reconnect it instead of replaying
        // into a dead socket — strictProxy would otherwise surface a 502.
        console.log(`[WARP-HOP] proxy unreachable — reconnecting tunnel then retry ${attempt}/${maxAttempts}`);
        await ensureWarpProxyReady().catch(() => {});
      }
      const hop = await warpHop().catch((e) => ({ ok: false, changed: false, error: e?.message }));
      console.log(`[WARP-HOP] disruption hop ${attempt}/${maxAttempts}: ${hop?.oldIp || "?"} → ${hop?.newIp || "?"} (changed=${hop?.changed}${hop?.error ? `, ${hop.error}` : ""})`);
      // Drop pooled sockets — the proxy now exits from a different address.
      proxyDispatchers.clear();
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * attempt, 1000)));
    }
  }
  return once(); // unreachable
}

/**
 * Keep a WARP-proxied response "active" until its body has been fully read or
 * cancelled, so a concurrent hop never tears down a stream mid-flight.
 */
function withWarpTracking(response, onRelease) {
  if (!response?.body || typeof response.body.pipeThrough !== "function") {
    onRelease();
    return response;
  }
  let released = false;
  const release = () => { if (!released) { released = true; onRelease(); } };
  const tracked = response.body.pipeThrough(new TransformStream({
    flush() { release(); },
    cancel() { release(); },
  }));
  return new Response(tracked, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function warpHopAndRetry(url, options, proxyUrl, once, onBeforeHop, onAfterHop) {
  const deadline = Date.now() + WARP_AUTO_HOP_BUDGET_MS;
  for (let hop = 1; hop <= WARP_AUTO_HOP_MAX && Date.now() < deadline; hop++) {
    const res = await once();
    if (res?.status !== 429 || options?.signal?.aborted) return res;

    // This response is discarded — release its tunnel before hopping so the
    // gate does not wait on the very request that triggered the hop.
    try { await res.body?.cancel?.(); } catch { /* already closed */ }
    onBeforeHop?.();
    await waitForWarpIdle();

    console.log(`[WARP-HOP] HTTP 429 from ${safeTargetHost(url)} — rotating WARP IP (${hop}/${WARP_AUTO_HOP_MAX})`);
    let result;
    try { result = await warpHop(); }
    catch (error) {
      console.log(`[WARP-HOP] failed on ${hop}/${WARP_AUTO_HOP_MAX}, continuing: ${error?.message || error}`);
      onAfterHop?.();
      continue;
    }
    onAfterHop?.();
    console.log(`[WARP-HOP] ${hop}/${WARP_AUTO_HOP_MAX} ${result?.oldIp || "?"} → ${result?.newIp || "?"} (changed=${result?.changed})`);
    // A same-IP / failed hop only means this attempt did not earn a fresh
    // quota bucket. Keep rotating until the 100-IP target or the budget ends.
    if (!result?.ok || !result?.changed) {
      // Drop pooled sockets anyway — the tunnel may have reconnected with the
      // same address but a different CONNECT session.
      proxyDispatchers.clear();
      continue;
    }

    // Drop cached CONNECT tunnels to the proxy so the next request reconnects
    // through the new WARP address instead of reusing a dead pooled socket.
    proxyDispatchers.clear();
  }
  return once();
}

const CLAUDE_UA_PROBE = /claude-cli\/\d/;
function hasClaudeCliHeader(headers) {
  if (!headers) return false;
  const values = headers instanceof Headers ? [...headers.values()] : Array.isArray(headers) ? headers.map((h) => h[1]) : Object.values(headers);
  return values.some((v) => typeof v === "string" && CLAUDE_UA_PROBE.test(v));
}

const proxyDispatchers = new Map();
const directDispatchers = new Map();

export function resetDirectDispatchersForTests() {
  directDispatchers.clear();
  proxyDispatchers.clear();
}

export function isStaleSocketError(error) {
  if (!error || error.name === "AbortError" || isTlsCertError(error)) return false;
  const code = error?.cause?.code || error?.code || "";
  if (NON_STALE_SOCKET_ERROR_CODES.has(code)) return false;
  if (STALE_SOCKET_ERROR_CODES.has(code)) return true;
  const msg = `${error?.message || ""} ${error?.cause?.message || ""}`.toLowerCase();
  return STALE_SOCKET_ERROR_SUBSTRINGS.some((sub) => msg.includes(sub));
}

// Always fetch through the package's own undici instance so fetch and the
// Agents below come from the same copy — dispatcher options are only guaranteed
// to match within one undici version.
let undiciFetch = null;
async function rawFetch(url, options) {
  undiciFetch ??= (await import("undici")).fetch;
  return undiciFetch(url, options);
}

// ─── TLS fingerprinting via got-scraping (browser-like JA3) ───────────────
// Disabled: not in use. Kept commented for future re-enable.
// Restore the original block to re-enable per-host JA3 spoofing.
/*
let _gotScraping = null;
let _gotScrapingChecked = false;
const _gotScrapingLoggedHosts = new Set();

async function getGotScraping() {
  if (_gotScrapingChecked) return _gotScraping;
  _gotScrapingChecked = true;
  try {
    const mod = await import("got-scraping");
    _gotScraping = typeof mod.gotScraping === "function" ? mod.gotScraping : null;
    if (_gotScraping) dbg("TLS", "got-scraping loaded (browser-like JA3 enabled)");
  } catch (e) {
    console.warn(`[ProxyFetch] got-scraping unavailable, falling back to native fetch: ${e.message}`);
    _gotScraping = null;
  }
  return _gotScraping;
}

async function gotScrapingFetch(url, options) {
  const gs = await getGotScraping();
  if (!gs) return null;

  const method = (options.method || "GET").toUpperCase();
  const headersInit = options.headers || {};
  const headers = headersInit instanceof Headers
    ? Object.fromEntries(headersInit.entries())
    : { ...headersInit };

  return new Promise((resolve, reject) => {
    let settled = false;
    const stream = gs.stream({
      url,
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : options.body,
      throwHttpErrors: false,
      retry: { limit: 0 },
      timeout: { request: undefined },
      followRedirect: false,
      decompress: true,
    });

    if (options.signal) {
      const onAbort = () => { try { stream.destroy(new Error("aborted")); } catch { } };
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }

    stream.once("response", (res) => {
      if (settled) return;
      settled = true;
      const resHeaders = new Headers();
      for (const [k, v] of Object.entries(res.headers || {})) {
        if (Array.isArray(v)) v.forEach((x) => resHeaders.append(k, String(x)));
        else if (v != null) resHeaders.set(k, String(v));
      }
      const body = Readable.toWeb(stream);
      resolve(new Response(body, { status: res.statusCode, statusText: res.statusMessage || "", headers: resHeaders }));
    });

    stream.once("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

async function tryGotScrapingFetch(url, options) {
  try {
    const res = await gotScrapingFetch(url, options);
    if (res) {
      try {
        const host = new URL(typeof url === "string" ? url : url.toString()).hostname;
        if (!_gotScrapingLoggedHosts.has(host)) {
          _gotScrapingLoggedHosts.add(host);
          dbg("TLS", `using got-scraping for ${host}`);
        }
      } catch { }
    }
    return res;
  } catch (e) {
    console.warn(`[ProxyFetch] got-scraping request failed, fallback to native fetch: ${e.message}`);
    return null;
  }
}
*/

// DNS cache — use Map to avoid prototype pollution via malformed hostnames
const DNS_CACHE = new Map();
const TLS_CERT_ERRORS = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function isTlsCertError(err) {
  const code = err?.cause?.code || err?.code;
  return TLS_CERT_ERRORS.has(code);
}
const MITM_BYPASS_HOSTS = [
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.googleapis.com",
  "api.individual.githubcopilot.com",
  "q.us-east-1.amazonaws.com",
  "codewhisperer.us-east-1.amazonaws.com",
  "api2.cursor.sh",
];
const GOOGLE_DNS_SERVERS = ["8.8.8.8", "8.8.4.4"];
const HTTPS_PORT = 443;
const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 300;

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/** scheme://host:port only — never credentials. */
function safeProxyHost(proxyUrl) {
  try {
    const parsed = new URL(String(proxyUrl));
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "unparseable-proxy-url";
  }
}

/** Destination host only, never the full URL (which may carry a query/path). */
function safeTargetHost(url) {
  try {
    return new URL(typeof url === "string" ? url : url.toString()).host;
  } catch {
    return "unparseable-url";
  }
}

/**
 * Resolve real IP using Google DNS (bypass system DNS)
 */
async function resolveRealIP(hostname) {
  const cached = DNS_CACHE.get(hostname);
  if (cached && Date.now() < cached.expiry) return cached.ip;

  try {
    const dns = await import("dns");
    const { promisify } = await import("util");
    const resolver = new dns.Resolver();
    resolver.setServers(GOOGLE_DNS_SERVERS);
    const resolve4 = promisify(resolver.resolve4.bind(resolver));
    const addresses = await resolve4(hostname);
    DNS_CACHE.set(hostname, { ip: addresses[0], expiry: Date.now() + MEMORY_CONFIG.dnsCacheTtlMs });
    return addresses[0];
  } catch (error) {
    console.warn(`[ProxyFetch] DNS resolve failed for ${hostname}:`, error.message);
    return null;
  }
}

/**
 * Check if request should bypass MITM DNS redirect
 */
function shouldBypassMitmDns(url) {
  try {
    const hostname = new URL(url).hostname;
    return MITM_BYPASS_HOSTS.some(host => hostname.includes(host));
  } catch { return false; }
}

function shouldBypassByNoProxy(targetUrl, noProxyValue) {
  const noProxy = normalizeString(noProxyValue);
  if (!noProxy) return false;

  let hostname;
  try { hostname = new URL(targetUrl).hostname.toLowerCase(); } catch { return false; }
  const patterns = noProxy.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);

  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.startsWith(".")) return hostname.endsWith(pattern) || hostname === pattern.slice(1);
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  });
}

/**
 * Get proxy URL from environment
 */
function getEnvProxyUrl(targetUrl) {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (shouldBypassByNoProxy(targetUrl, noProxy)) return null;

  let protocol;
  try { protocol = new URL(targetUrl).protocol; } catch { return null; }

  if (protocol === "https:") {
    return process.env.HTTPS_PROXY || process.env.https_proxy ||
      process.env.ALL_PROXY || process.env.all_proxy;
  }

  return process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy;
}

/**
 * Normalize proxy URL (allow host:port)
 */
function normalizeProxyUrl(proxyUrl) {
  const normalizedInput = normalizeString(proxyUrl);
  if (!normalizedInput) return null;

  try {

    new URL(normalizedInput);
    return normalizedInput;
  } catch {
    // Allow "127.0.0.1:7890" style values
    return `http://${normalizedInput}`;
  }
}

function resolveConnectionProxyUrl(targetUrl, proxyOptions) {
  const enabled = proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true;
  if (!enabled) return null;

  const proxyUrlRaw = normalizeString(proxyOptions?.url ?? proxyOptions?.connectionProxyUrl);
  if (!proxyUrlRaw) return null;

  const noProxy = normalizeString(proxyOptions?.noProxy ?? proxyOptions?.connectionNoProxy);
  if (noProxy && shouldBypassByNoProxy(targetUrl, noProxy)) return null;

  return normalizeProxyUrl(proxyUrlRaw);
}

// ISP DPI (VN → api.anthropic.com) RSTs Node's default TLS ClientHello curve
// list, so keep X25519 first. But X25519 alone is too narrow: AWS OIDC
// (Kiro IdC / Builder ID sign-in and IdC token refresh) resets an X25519-only
// handshake, so offer P-256/P-384 as well (#5613). NINEROUTER_TLS_ECDH_CURVE
// still overrides the list for operators who need the old behaviour.
const TLS_ECDH_CURVE = process.env.NINEROUTER_TLS_ECDH_CURVE || "X25519:prime256v1:secp384r1";
// Compatibility list for hosts that still reset the default handshake; the
// aliases below are equivalent to the OpenSSL names used above.
const TLS_COMPAT_CURVES = "X25519:P-256:P-384";
const compatTlsHosts = new Set();

function hostOf(url) {
  try {
    return new URL(typeof url === "string" ? url : url.toString()).host;
  } catch {
    return "";
  }
}

function isTlsResetError(err) {
  const code = err?.cause?.code || err?.code;
  return code === "ECONNRESET" || code === "UND_ERR_SOCKET" || code === "EPIPE";
}

// autoSelectFamilyAttemptTimeout = happy eyeballs (RFC 8305): race both address
// families, fall over in 250ms — replaces the old global ipv4first flag, which fixed
// one broken-family network by breaking the other (see claude-code#20240).
// requestTls must stay TLS-options-only (connect-level options belong in `connect`).
const EYEBALLS_CONNECT = { autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 250 };
function buildConnectOptions(insecure, curve = TLS_ECDH_CURVE) {
  return { ...EYEBALLS_CONNECT, ecdhCurve: curve, ...(insecure ? { rejectUnauthorized: false } : {}) };
}

function evictOldest(cacheMap) {
  if (cacheMap.size >= MEMORY_CONFIG.proxyDispatchersMaxSize) {
    cacheMap.delete(cacheMap.keys().next().value);
  }
}

async function getOrCreateDirectAgent(key, insecure, keepAliveTimeout, keepAliveMaxTimeout, curve = TLS_ECDH_CURVE) {
  const cached = directDispatchers.get(key);
  if (cached) return cached;
  const { Agent } = await import("undici");
  evictOldest(directDispatchers);
  const agent = new Agent({
    connect: buildConnectOptions(insecure, curve),
    keepAliveTimeout,
    keepAliveMaxTimeout,
  });
  directDispatchers.set(key, agent);
  return agent;
}

/**
 * Shared direct dispatcher with capped keep-alive TTL. Prevents undici from
 * reusing idle sockets that upstream edges (NVIDIA NIM, Cloudflare) silently
 * dropped without sending a TCP RST.
 */
export function getDirectDispatcher(insecure = false) {
  const { keepAliveTimeout, keepAliveMaxTimeout } = resolveKeepAliveTimeouts();
  const key = `direct::${insecure ? "insecure" : "secure"}::${keepAliveTimeout}::${keepAliveMaxTimeout}`;
  return getOrCreateDirectAgent(key, insecure, keepAliveTimeout, keepAliveMaxTimeout);
}

/**
 * No-keep-alive retry dispatcher (`keepAliveTimeout: 1ms`) — guarantees a fresh
 * TCP/TLS connection after a poisoned pooled socket or a connect timeout.
 */
export function getFreshRetryDispatcher(insecure = false) {
  const key = `fresh::${insecure ? "insecure" : "secure"}`;
  return getOrCreateDirectAgent(
    key,
    insecure,
    FRESH_RETRY_KEEPALIVE_TIMEOUT_MS,
    FRESH_RETRY_KEEPALIVE_TIMEOUT_MS
  );
}

function getCompatTlsDispatcher(insecure = false) {
  const { keepAliveTimeout, keepAliveMaxTimeout } = resolveKeepAliveTimeouts();
  const key = `compat::${insecure ? "insecure" : "secure"}::${keepAliveTimeout}::${keepAliveMaxTimeout}`;
  return getOrCreateDirectAgent(key, insecure, keepAliveTimeout, keepAliveMaxTimeout, TLS_COMPAT_CURVES);
}

/**
 * Create proxy or direct dispatcher lazily (undici-compatible).
 * Always returns a dispatcher — the direct path needs the custom Agent too,
 * otherwise the default global agent's ClientHello gets RST-ed by DPI.
 */
async function getDispatcher(proxyUrl, insecure = false, forceFreshSocket = false) {
  const normalized = normalizeProxyUrl(proxyUrl);
  if (!normalized) {
    return forceFreshSocket ? getFreshRetryDispatcher(insecure) : getDirectDispatcher(insecure);
  }

  const key = `${normalized}::${insecure ? "insecure" : "secure"}`;
  if (!proxyDispatchers.has(key)) {
    // Evict oldest entry if max size reached
    if (proxyDispatchers.size >= MEMORY_CONFIG.proxyDispatchersMaxSize) {
      proxyDispatchers.delete(proxyDispatchers.keys().next().value);
    }
    const { ProxyAgent } = await import("undici");
    const dispatcher = new ProxyAgent({
      uri: normalized,
      connect: EYEBALLS_CONNECT,
      requestTls: { ecdhCurve: TLS_ECDH_CURVE, ...(insecure ? { rejectUnauthorized: false } : {}) },
    });
    proxyDispatchers.set(key, dispatcher);
  }

  return proxyDispatchers.get(key);
}

function isBodyReplaySafe(body) {
  return !(body && typeof body.getReader === "function" && body.locked);
}

async function fetchWithTlsFallback(url, options, proxyUrl, forceFreshSocket = false) {
  try {
    // Protocol adapters may need Node's HTTP/1 transport on the direct path.
    // Keep proxy/no-proxy resolution and strict-proxy enforcement here.
    // Proxy-capable adapters (opencode wreq-js) are handled in proxyAwareFetch;
    // reaching here with a proxy means native proxied fetch (incl. fail-open).
    if (!proxyUrl && options.directFetch) return await options.directFetch(url, options);
    if (!proxyUrl && compatTlsHosts.has(hostOf(url))) {
      return await rawFetch(url, { ...options, dispatcher: await getCompatTlsDispatcher(false) });
    }
    const dispatcher = await getDispatcher(proxyUrl, false, forceFreshSocket);
    return await rawFetch(url, { ...options, dispatcher });
  } catch (err) {
    const host = hostOf(url);
    if (
      !proxyUrl
      && !options.directFetch
      && host
      && !compatTlsHosts.has(host)
      && !options.signal?.aborted
      && isBodyReplaySafe(options.body)
      && isTlsResetError(err)
    ) {
      try {
        const res = await rawFetch(url, { ...options, dispatcher: await getCompatTlsDispatcher(false) });
        compatTlsHosts.add(host);
        dbg("FETCH", `${host} resets X25519-only TLS; using standard curves from now on`);
        return res;
      } catch {
        // Fall through to the original error handling below.
      }
    }
    const isStrictSsl = options.strictTls === true || process.env.STRICT_SSL === "true" || process.env.STRICT_SSL === "1";
    if (!isStrictSsl && isTlsCertError(err)) {
      if (!isBodyReplaySafe(options.body)) {
        throw err;
      }
      // ponytail: in-memory insecure agent fallback for self-signed MITM corporate/antivirus certs
      console.warn(`[ProxyFetch] TLS cert verification failed (${err.cause?.code || err.code}), retrying with insecure TLS: ${url}`);
      const insecureDispatcher = await getDispatcher(proxyUrl, true, forceFreshSocket);
      return await rawFetch(url, { ...options, dispatcher: insecureDispatcher });
    }

    // Stale keep-alive recovery: a pooled socket died before returning headers. Replay
    // once on the fresh-socket dispatcher instead of waiting out the connect timeout.
    if (
      !proxyUrl
      && !forceFreshSocket
      && !options.directFetch
      && !options.signal?.aborted
      && isBodyReplaySafe(options.body)
      && isFreshSocketReplayEnabled()
      && isStaleSocketError(err)
    ) {
      dbg("FETCH", `stale keep-alive socket (${err.cause?.code || err.code || err.message}), retrying on fresh socket: ${url}`);
      return await fetchWithTlsFallback(url, options, proxyUrl, true);
    }
    throw err;
  }
}

/**
 * Create HTTPS request with manual socket connection (bypass DNS)
 */
async function createBypassRequest(parsedUrl, realIP, options) {
  const httpsModule = await import("https");
  const netModule = await import("net");
  // CJS modules expose exports via .default in ESM dynamic import context
  const https = httpsModule.default ?? httpsModule;
  const net = netModule.default ?? netModule;

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.connect(HTTPS_PORT, realIP, () => {
      const reqOptions = {
        socket,
        // SNI + cert hostname are validated against the hostname the caller
        // asked for, not the IP we connected to. This keeps the DNS-bypass
        // (avoiding /etc/hosts MITM) while still rejecting on-path attackers
        // that present a different cert. The MITM_BYPASS_HOSTS targets are
        // all public-CA-issued (Google / GitHub / AWS / Cursor) so default
        // verification works without any extra trust store.
        servername: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || "POST",
        headers: {
          ...options.headers,
          Host: parsedUrl.hostname,
        },
      };

      const req = https.request(reqOptions, (res) => {
        const response = {
          ok: res.statusCode >= HTTP_SUCCESS_MIN && res.statusCode < HTTP_SUCCESS_MAX,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: new Map(Object.entries(res.headers)),
          body: Readable.toWeb(res),
          text: async () => {
            const chunks = [];
            for await (const chunk of res) chunks.push(chunk);
            return Buffer.concat(chunks).toString();
          },
          json: async () => JSON.parse(await response.text()),
        };
        resolve(response);
      });

      req.on("error", reject);
      if (options.body) {
        req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });

    socket.on("error", reject);
  });
}

async function proxyAwareFetchOnce(url, options = {}, proxyOptions = null) {
  // Keep the spoofed Claude Code version current (new models require a minimum CLI version).
  // Refresh in the background: the request uses the version already known, so an
  // unreachable npm registry can never add latency to the chat path.
  if (hasClaudeCliHeader(options?.headers)) {
    void ensureClaudeCliVersion(rawFetch);
    options = { ...options, headers: applyClaudeCliVersion(options.headers) };
  }
  const targetUrl = typeof url === "string" ? url : url.toString();

  // Vercel relay: forward request via relay headers
  const vercelRelayUrl = normalizeString(proxyOptions?.vercelRelayUrl);
  if (vercelRelayUrl) {
    const parsed = new URL(targetUrl);
    const baseHeaders = options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : { ...(options.headers || {}) };
    const relayHeaders = {
      ...baseHeaders,
      "x-relay-target": `${parsed.protocol}//${parsed.host}`,
      "x-relay-path": `${parsed.pathname}${parsed.search}`,
    };
    return await rawFetch(vercelRelayUrl, { ...options, headers: relayHeaders });
  }

  const connectionProxyUrl = resolveConnectionProxyUrl(targetUrl, proxyOptions);
  const envProxyUrl = connectionProxyUrl ? null : normalizeProxyUrl(getEnvProxyUrl(targetUrl));
  const proxyUrl = connectionProxyUrl || envProxyUrl;
  const forceFreshSocket = proxyOptions?.forceFreshSocket === true || options?.forceFreshSocket === true;

  // Protocol adapters that own their transport (wreq-js TLS impersonation)
  // cannot use an undici dispatcher: they must drive the proxy themselves.
  // Only adapters that declare `proxyCapable` opt in — any other adapter
  // ignores the proxy URL and would leave over the direct interface, so they
  // keep the undici path below.
  if (proxyUrl && options?.directFetch?.proxyCapable === true) {
    try {
      const res = await options.directFetch(url, { ...options, proxyUrl }, proxyUrl);
      // Reported only after the adapter that holds the tunnel returned.
      const via = res?.headers?.get?.("x-9r-proxy-via");
      dbg("PROXY", `PROXY ROUTING VERIFIED | ${safeTargetHost(targetUrl)} | transport=adapter | proxy=${via || safeProxyHost(proxyUrl)} | status=${res?.status}`);
      return res;
    } catch (err) {
      // wreq-js missing: fail open to the native proxied fetch below (still
      // rides the proxy, so strictProxy is honored), just without impersonation.
      if (err?.name === "OpencodeTlsUnavailableError") {
        console.warn(`[ProxyFetch] directFetch unavailable (${err.message}); failing open to native proxied fetch`);
      } else if (proxyOptions?.strictProxy === true) {
        throw new Error(`[ProxyFetch] Proxy required but failed (strictProxy=true): ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  // MITM DNS bypass: for known MITM-intercepted hosts, resolve real IP to avoid DNS spoof
  if (shouldBypassMitmDns(targetUrl)) {
    if (proxyUrl) {
      // Proxy resolves DNS externally (not affected by /etc/hosts) — use proxy directly
      try {
        return await fetchWithTlsFallback(url, options, proxyUrl, forceFreshSocket);
      } catch (proxyError) {
        if (proxyOptions?.strictProxy === true) {
          throw new Error(`[ProxyFetch] Proxy required but failed (strictProxy=true): ${proxyError.message}`);
        }
        console.warn(`[ProxyFetch] Proxy failed, falling back to direct bypass: ${proxyError.message}`);
      }
    }
    // No proxy — manually resolve real IP to bypass DNS spoof
    try {
      const parsedUrl = new URL(targetUrl);
      const realIP = await resolveRealIP(parsedUrl.hostname);
      if (realIP) return await createBypassRequest(parsedUrl, realIP, options);
    } catch (error) {
      console.warn(`[ProxyFetch] MITM bypass failed: ${error.message}`);
    }
  }

  if (proxyUrl) {
    try {
      return await fetchWithTlsFallback(url, options, proxyUrl, forceFreshSocket);
    } catch (proxyError) {
      // If strictProxy is enabled, fail hard instead of falling back to direct
      if (proxyOptions?.strictProxy === true) {
        throw new Error(`[ProxyFetch] Proxy required but failed (strictProxy=true): ${proxyError.message}`);
      }
      console.warn(`[ProxyFetch] Proxy failed, falling back to direct: ${proxyError.message}`);
      return fetchWithTlsFallback(url, options, null, forceFreshSocket);
    }
  }

  // Strict mode means "never leave over the direct IP". Reaching here with a
  // proxy configured but unresolved is exactly that case — an inactive or
  // empty pool, or every proxy removed — so refuse instead of silently
  // exposing the real address (#4333). The catch blocks above only cover a
  // proxy that was actually tried.
  //
  // Gate on a proxy being *intended*: callers like the Qoder executor set
  // strictProxy to mean "do not replay this request directly if the proxy
  // fails" (a replayed COSY signature returns 403), not "a proxy is required".
  // With nothing configured they must keep working.
  const proxyIntended = proxyOptions?.proxyPoolId
    || proxyOptions?.enabled === true
    || proxyOptions?.connectionProxyEnabled === true
    || !!normalizeString(proxyOptions?.url ?? proxyOptions?.connectionProxyUrl);
  if (proxyOptions?.strictProxy === true && proxyIntended) {
    throw new Error("[ProxyFetch] Proxy required but none resolved (strictProxy=true)");
  }

  // got-scraping disabled — use native fetch directly
  // (Re-enable per-host by wrapping with tryGotScrapingFetch when needed)
  return fetchWithTlsFallback(url, options, null, forceFreshSocket);
}

/**
 * Fetch with automatic WARP rotation on IP-based rate limits. OpenCode owns
 * its own hop in its executor (wreq-js sessions), so adapters declaring
 * `proxyCapable` are left untouched here to avoid a double hop.
 */
export async function proxyAwareFetch(url, options = {}, proxyOptions = null) {
  const targetUrl = typeof url === "string" ? url : url.toString();
  let proxyUrl = null;
  try {
    const connectionProxyUrl = resolveConnectionProxyUrl(targetUrl, proxyOptions);
    proxyUrl = connectionProxyUrl || normalizeProxyUrl(getEnvProxyUrl(targetUrl));
  } catch { /* no proxy → no auto-hop */ }

  const once = () => proxyAwareFetchOnce(url, options, proxyOptions);
  if (!proxyUrl || !isRouterModWarpProxy(proxyUrl)) return await once();

  // A concurrent rotation briefly closes port 40000. New requests must wait
  // for the hop to finish instead of immediately failing with ECONNREFUSED
  // and triggering yet another "reconnect" cycle.
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 20_000);
    try {
      whenWarpStable().then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); resolve(); });
    } catch { clearTimeout(timer); resolve(); }
  });

  let held = false;
  const hold = () => { if (!held) { beginWarpRequest(); held = true; } };
  const drop = () => { if (held) { releaseWarpRequest(); held = false; } };
  hold();
  // The triggering request temporarily leaves the gate while it hops.
  const onBeforeHop = () => drop();
  const onAfterHop = () => hold();

  try {
    const stable = () => retryAfterHop(url, options, once);
    // OpenCode drives its own 429 hop in its executor; here we only need to
    // survive a concurrent hop that tears down the shared WARP tunnel.
    const response = options?.directFetch?.proxyCapable === true
      ? await stable()
      : await warpHopAndRetry(url, options, proxyUrl, stable, onBeforeHop, onAfterHop);
    return withWarpTracking(response, drop);
  } catch (error) {
    drop();
    throw error;
  }
}

/**
 * Patched global fetch with env-proxy support and MITM DNS bypass
 */
async function patchedFetch(url, options = {}) {
  return proxyAwareFetch(url, options, null);
}

// Idempotency guard — only patch once to avoid wrapping multiple times
if (globalThis.fetch !== patchedFetch) {
  globalThis.fetch = patchedFetch;
}

export default patchedFetch;
