// HTTP status codes
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_ACCEPTABLE: 406,
  REQUEST_TIMEOUT: 408,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// Re-export error config (backward compat)
export { ERROR_TYPES, DEFAULT_ERROR_MESSAGES, BACKOFF_CONFIG, COOLDOWN_MS } from "./errorConfig.js";

// Cache TTLs (seconds)
export const CACHE_TTL = {
  userInfo: 300,    // 5 minutes
  modelAlias: 3600  // 1 hour
};

// Memory management config
export const MEMORY_CONFIG = {
  sessionTtlMs: 2 * 60 * 60 * 1000,
  sessionCleanupIntervalMs: 30 * 60 * 1000,
  dnsCacheTtlMs: 5 * 60 * 1000,
  proxyDispatchersMaxSize: 20,
};

// Parse a positive integer env override, falling back to a default.
function envMs(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

// OpenCode Free WARP rotation defaults — hardcoded on purpose: no .env needed.
// Every free model must be able to walk through at least TARGET distinct WARP
// exit IPs before the executor declares the quota exhausted. 0 hops = unlimited
// (the budget still bounds the loop).
export const OPENCODE_FREE_IP_TARGET = 100;
export const OPENCODE_MAX_HOPS = OPENCODE_FREE_IP_TARGET;

// A single hop is disconnect → reconnect → IP echo, so give the loop enough
// wall-clock time for TARGET hops (TARGET × (cooldown + hop estimate) below).
export const OPENCODE_HOP_BUDGET_MS = 60 * 60 * 1000;

// Minimum gap between two IP rotations. Without it a burst of 429s disconnects
// and reconnects the shared tunnel over and over. Capped so that TARGET hops
// remain reachable inside one budget; 0 = no cooldown.
export const WARP_HOP_COOLDOWN_MS = 5_000;

// Conservative estimate for one WARP hop, used to size the budget when an
// operator raises the hop count above the default target.
export const WARP_HOP_ESTIMATE_MS = 15_000;

/**
 * Resolve the free-lane rotation knobs from saved dashboard settings.
 *
 * Operator values are honoured when they are MORE generous than the target,
 * but the 100-IP target is enforced: a stale setting like `maxHops: 7` or a
 * 45 s cooldown would otherwise stop the rotation long before the target and
 * surface the misleading "quota exhausted" 429 too early.
 */
export function resolveOpencodeRotationSettings(saved = {}) {
  // `null * 1000` is 0, which would silently disable the cooldown. Only real
  // numeric input (including an explicit 0) is accepted.
  const parse = (value) => {
    if (value == null || value === "") return NaN;
    return Number(value);
  };
  const number = (value, fallback) => {
    const n = parse(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const nonNegative = (value, fallback) => {
    const n = parse(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  let maxHops = nonNegative(saved.opencodeMaxHops, OPENCODE_MAX_HOPS);
  if (maxHops !== 0) maxHops = Math.max(OPENCODE_FREE_IP_TARGET, maxHops);

  const cooldownMs = Math.min(
    nonNegative(saved.warpHopCooldownSec, WARP_HOP_COOLDOWN_MS / 1000) * 1000,
    WARP_HOP_COOLDOWN_MS,
  );

  const requiredMs = maxHops === 0
    ? OPENCODE_HOP_BUDGET_MS
    : Math.max(OPENCODE_HOP_BUDGET_MS, maxHops * (cooldownMs + WARP_HOP_ESTIMATE_MS));
  const budgetMs = Math.max(
    number(saved.opencodeHopBudgetSec, OPENCODE_HOP_BUDGET_MS / 1000) * 1000,
    requiredMs,
  );

  return { maxHops, cooldownMs, budgetMs };
}

function envUrl(name, def) {
  const raw = process.env[name]?.trim();
  return raw || def;
}

// SearXNG endpoint used by the unauthenticated web-search provider.
// Configure this for a separate Docker service or remote SearXNG instance.
export const SEARXNG_URL = envUrl("SEARXNG_URL", "http://localhost:8888/search");

// Inter-chunk stall timeout (once tokens are flowing). Generous headroom so
// slow reasoning models aren't aborted mid-stream. Env: STREAM_STALL_TIMEOUT_MS.
export const STREAM_STALL_TIMEOUT_MS = envMs("STREAM_STALL_TIMEOUT_MS", 360 * 1000);

// Time-to-first-token timeout (prompt prefill). Env: STREAM_FIRST_CHUNK_TIMEOUT_MS.
export const STREAM_FIRST_CHUNK_TIMEOUT_MS = envMs("STREAM_FIRST_CHUNK_TIMEOUT_MS", 200 * 1000);

// Combo empty-content failover: how long a 2xx stream may be held while waiting for its first
// content-bearing frame before committing to that model (fail-open on expiry).
// Env: EMPTY_PEEK_DEADLINE_MS.
export const EMPTY_PEEK_DEADLINE_MS = envMs("EMPTY_PEEK_DEADLINE_MS", 45 * 1000);

// Fetch connect timeout: abort if upstream doesn't return response headers within this duration
export const FETCH_CONNECT_TIMEOUT_MS = envMs("FETCH_CONNECT_TIMEOUT_MS", 60 * 1000);

// Keep-alive socket TTL. Cap it below upstream/edge idle windows (Cloudflare, AWS Global
// Accelerator / NVIDIA NIM) that drop idle sockets without a TCP RST. keepAliveMaxTimeout is
// clamped to the same value so an upstream `Keep-Alive` header cannot extend it to 600s.
export const DEFAULT_KEEPALIVE_TIMEOUT_MS = 4 * 1000;
export const FRESH_RETRY_KEEPALIVE_TIMEOUT_MS = 1;
export const FETCH_KEEPALIVE_TIMEOUT_MS = envMs("FETCH_KEEPALIVE_TIMEOUT_MS", DEFAULT_KEEPALIVE_TIMEOUT_MS);

export function resolveKeepAliveTimeouts() {
  const timeout = envMs("FETCH_KEEPALIVE_TIMEOUT_MS", DEFAULT_KEEPALIVE_TIMEOUT_MS);
  return { keepAliveTimeout: timeout, keepAliveMaxTimeout: timeout };
}

// Escape hatch: FETCH_FRESH_RETRY=off disables the transport-level replay, leaving only the
// executor's own retry path (which still forces a fresh socket). Defaults to on.
export function isFreshSocketReplayEnabled() {
  const raw = String(process.env.FETCH_FRESH_RETRY ?? "").trim().toLowerCase();
  return !(raw === "off" || raw === "0" || raw === "false" || raw === "no");
}

// Dead keep-alive sockets surface as these codes/substrings; DNS, connect-refused and TLS
// failures are excluded so a real unreachable host is never mistaken for a stale socket.
export const STALE_SOCKET_ERROR_CODES = new Set([
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "EPIPE",
  "UND_ERR_HEADERS_TIMEOUT",
]);

export const NON_STALE_SOCKET_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_INVALID_ARG",
]);

// Deliberately excludes a bare "fetch failed": with no error code the upstream may already
// hold the request, and replaying it would send (and bill) the same completion twice.
export const STALE_SOCKET_ERROR_SUBSTRINGS = [
  "other side closed",
  "socket hang up",
];

// Gemini native TTS fetch timeout: abort if Google does not return response headers in time.
export const GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS = envMs("GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS", 45 * 1000);

// Default token limits
export const DEFAULT_MAX_TOKENS = 15000000;
export const DEFAULT_MIN_TOKENS = 1000000;

export const TOKEN_SAVER_HEADER = "x-9router-token-saver";

// Retry config for 429 responses (legacy - kept for backward compatibility)
export const RETRY_CONFIG = {
  maxAttempts: 2,
  delayMs: 2000
};

// Default retry config by status code: { attempts, delayMs }
// Backward compat: if value is a number, treated as attempts with RETRY_CONFIG.delayMs
export const DEFAULT_RETRY_CONFIG = {
  // 429 is often a short upstream window (FreePi `upstream_rate_limited`,
  // provider busy lanes). Honour Retry-After via BaseExecutor.computeRetryDelay
  // and retry a few times instead of surfacing a hard failure to the client.
  429: { attempts: 3, delayMs: 2000 },
  502: { attempts: 3, delayMs: 3000 },
  503: { attempts: 3, delayMs: 2000 },
  504: { attempts: 2, delayMs: 3000 }
};

// Cap a server-issued Retry-After so a misbehaving upstream cannot park a
// request forever. Env overrides for operators on slower lanes.
export const RETRY_AFTER_CAP_MS = Number(process.env.RETRY_AFTER_CAP_MS) || 30_000;

// Normalize a retry entry to { attempts, delayMs }
export function resolveRetryEntry(entry) {
  if (entry == null) return { attempts: 0, delayMs: RETRY_CONFIG.delayMs };
  if (typeof entry === "number") return { attempts: entry, delayMs: RETRY_CONFIG.delayMs };
  return {
    attempts: entry.attempts || 0,
    delayMs: entry.delayMs != null ? entry.delayMs : RETRY_CONFIG.delayMs
  };
}

// Requests containing these texts will bypass provider
export const SKIP_PATTERNS = [
  "Please write a 5-10 word title for the following conversation:"
];
