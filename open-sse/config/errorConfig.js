// OpenAI-compatible error types mapping (client-facing)
export const ERROR_TYPES = {
  400: { type: "invalid_request_error", code: "bad_request" },
  401: { type: "authentication_error", code: "invalid_api_key" },
  402: { type: "billing_error", code: "payment_required" },
  403: { type: "permission_error", code: "insufficient_quota" },
  404: { type: "invalid_request_error", code: "model_not_found" },
  406: { type: "invalid_request_error", code: "model_not_supported" },
  429: { type: "rate_limit_error", code: "rate_limit_exceeded" },
  500: { type: "server_error", code: "internal_server_error" },
  502: { type: "server_error", code: "bad_gateway" },
  503: { type: "server_error", code: "service_unavailable" },
  504: { type: "server_error", code: "gateway_timeout" }
};

// Default error messages per status code (client-facing)
export const DEFAULT_ERROR_MESSAGES = {
  400: "Bad request",
  401: "Invalid API key provided",
  402: "Payment required",
  403: "You exceeded your current quota",
  404: "Model not found",
  406: "Model not supported",
  429: "Rate limit exceeded",
  500: "Internal server error",
  502: "Bad gateway - upstream provider error",
  503: "Service temporarily unavailable",
  504: "Gateway timeout"
};

// Exponential backoff config for rate limits
export const BACKOFF_CONFIG = {
  // Base backoff starts at 5s, max 15 minutes for 429
  base: 5000,
  max: 15 * 60 * 1000,
  maxLevel: 15
};

// Default cooldown for transient/unknown errors
export const TRANSIENT_COOLDOWN_MS = 30 * 1000;

// Hard cap for provider-reported rate limit cooldown (e.g. codex resets_at can be 5-6h, or full reset time)
// Allow up to 2 hours for genuine rate limit hold windows instead of cutting off early
export const MAX_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

// Synthetic HTTP status for credential-level failures that are not transient
// capacity/rate limits (invalid key, exhausted wallet, revoked account). A
// non-transient failure gets a long cooldown instead of an exponential backoff
// retry loop, so the account is parked until an explicit health recovery.
export const PERMANENT_AUTH_STATUS = 401;

// Error wording that means "this account is banned/rejected" rather than
// "temporarily limited". Matched case-insensitively against the upstream error
// text; such accounts are deactivated instead of cooled down.
export const DEACTIVATE_KEYWORDS = [
  "account was rejected",
  "account is banned",
  "account banned",
  "account suspended",
  "account deactivated",
  "account disabled",
  "account deleted",
  "account terminated",
  "account has been blocked",
  "toS violation",
];

// `rateLimitedUntil` stamped on a deactivated account: effectively permanent,
// kept so the UI can show when/why the account left rotation.
export const PERMANENT_COOLDOWN_MS = 100 * 365 * 24 * 60 * 60 * 1000;

// Kiro quota/rate-limit accounts leave rotation for a day, then the background
// connection health tick re-enables them automatically. Field name is shared by
// the writer (auth/failureTracker) and the scheduler so they cannot drift.
export const KIRO_LIMIT_REACTIVATION_MS = 24 * 60 * 60 * 1000;
export const KIRO_LIMIT_REACTIVATION_FIELD = "reactivateAt";

// Cooldown durations (ms)
const COOLDOWN = {
  long: 2 * 60 * 1000,
  short: 5 * 1000,
  antigravityLong: 24 * 60 * 60 * 1000, // 24 hours for Antigravity suspension/validation
};


/**
 * Unified error classification rules.
 * Checked top-to-bottom: text rules first (by order), then status rules.
 * Each rule: { text?, status?, cooldownMs?, backoff? }
 *   - text: substring match (case-insensitive) on error message
 *   - status: HTTP status code match
 *   - cooldownMs: fixed cooldown duration
 *   - backoff: true = use exponential backoff (rate limit)
 */
export const ERROR_RULES = [
  // --- Text-based rules (checked first, order = priority) ---
  // Antigravity (Google Cloud Code) suspension/validation errors: 24-hour cooldown
  { provider: "antigravity", text: "toS violation", cooldownMs: COOLDOWN.antigravityLong },
  { provider: "antigravity", text: "validation error", cooldownMs: COOLDOWN.antigravityLong },
  { provider: "antigravity", text: "requires re-validation", cooldownMs: COOLDOWN.antigravityLong },
  { provider: "antigravity", text: "account suspended", cooldownMs: COOLDOWN.antigravityLong },
  
  { provider: "codex", text: "model is not supported when using codex with a chatgpt account", cooldownMs: MAX_RATE_LIMIT_COOLDOWN_MS },
  { text: "you've used this period's free allowance", cooldownMs: MAX_RATE_LIMIT_COOLDOWN_MS },
  { text: "free models are turned off", cooldownMs: MAX_RATE_LIMIT_COOLDOWN_MS },
  // NVIDIA NIM returns 400 with "degraded" when specific model cluster is unhealthy.
  // Lock only the degraded model (modelScoped: true) without locking the API key.
  { provider: "nvidia", text: "degraded", cooldownMs: 15 * 60 * 1000, modelScoped: true },
  { text: "no credentials",           cooldownMs: COOLDOWN.long },
  { text: "request not allowed",      cooldownMs: COOLDOWN.short },
  // "improperly formed request" / REQUEST_BODY_INVALID (e.g. Kiro, OpenAI) is a
  // client-payload validation error, not a broken credential. Cooling down the
  // account parks healthy sessions and causes all later requests to fail with
  // locked accounts. Treat it as requestScoped so it doesn't trigger account cooldown.
  { text: "improperly formed request", cooldownMs: 0 },
  { text: "request_body_invalid",     cooldownMs: 0 },
  // If the provider specifically indicates it resets after some time, honor it
  { text: "rate limit",               cooldownMs: 2 * 60 * 1000 },
  { text: "too many requests",        cooldownMs: 2 * 60 * 1000 },
  { text: "quota exceeded",           cooldownMs: 5 * 60 * 1000 },
  // Concurrency shedding (e.g. Dahl `model_concurrency`) is *capacity*, not a
  // quota lock. The message literally says "or switch model" — parking the
  // account would starve the pool while every account is equally refused on the
  // busy model, so keep a short cooldown and let another model/account serve.
  { text: "concurrency capacity",     cooldownMs: COOLDOWN.short },
  { text: "capacity",                 backoff: true },
  { text: "overloaded",               backoff: true },

  // --- Status-based rules (fallback when text doesn't match) ---
  { status: 401, cooldownMs: COOLDOWN.long },
  { status: 402, cooldownMs: COOLDOWN.long },
  { status: 403, cooldownMs: COOLDOWN.long },
  { status: 404, cooldownMs: COOLDOWN.long },
  { status: 429, cooldownMs: 2 * 60 * 1000 },
];

// Backward compat: COOLDOWN_MS object (used by index.js re-export)
export const COOLDOWN_MS = {
  unauthorized: COOLDOWN.long,
  paymentRequired: COOLDOWN.long,
  notFound: COOLDOWN.long,
  transient: TRANSIENT_COOLDOWN_MS,
  requestNotAllowed: COOLDOWN.short,
};
