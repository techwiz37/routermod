import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig.js";

/**
 * Build OpenAI-compatible error response body
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {object} Error response object
 */
export function buildErrorBody(statusCode, message) {
  const errorInfo = ERROR_TYPES[statusCode] || 
    (statusCode >= 500 
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" });

  return {
    error: {
      message: message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred",
      type: errorInfo.type,
      code: errorInfo.code
    }
  };
}

/**
 * Create error Response object (for non-streaming)
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Response} HTTP Response object
 */
export function errorResponse(statusCode, message, extraHeaders = null) {
  return new Response(JSON.stringify(buildErrorBody(statusCode, message)), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders
    }
  });
}

/**
 * Write error to SSE stream (for streaming)
 * @param {WritableStreamDefaultWriter} writer - Stream writer
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
export async function writeStreamError(writer, statusCode, message) {
  const errorBody = buildErrorBody(statusCode, message);
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify(errorBody)}\n\n`));
}

/**
 * Read a reset hint from response headers: `Retry-After` (seconds or HTTP date),
 * `x-ratelimit-reset*` (epoch seconds) and RateLimit RFC 9331 `RateLimit-Reset`
 * (delta seconds).
 * @param {Headers} headers
 * @returns {number|null} epoch ms when the limit resets
 */
export function parseRetryAfterMs(headers) {
  if (!headers || typeof headers.get !== "function") return null;
  const now = Date.now();

  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const asNumber = Number(retryAfter);
    if (Number.isFinite(asNumber) && asNumber >= 0) return now + asNumber * 1000;
    const asDate = Date.parse(retryAfter);
    if (Number.isFinite(asDate) && asDate > now) return asDate;
  }

  for (const name of ["x-ratelimit-reset", "x-ratelimit-reset-requests", "anthropic-ratelimit-requests-reset"]) {
    const raw = headers.get(name);
    if (!raw) continue;
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const ms = asNumber > 1e12 ? asNumber : asNumber > 1e9 ? asNumber * 1000 : now + asNumber * 1000;
      if (ms > now) return ms;
    }
    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate) && asDate > now) return asDate;
  }

  const rateLimitReset = Number(headers.get("ratelimit-reset"));
  if (Number.isFinite(rateLimitReset) && rateLimitReset >= 0) return now + rateLimitReset * 1000;

  return null;
}

/**
 * Pull a reset hint from common upstream error body shapes so the cooldown
 * matches what the provider actually said instead of a generic backoff.
 * @param {any} root parsed error JSON
 * @returns {number|null} epoch ms
 */
export function extractResetFromBody(root) {
  if (!root || typeof root !== "object") return null;
  const now = Date.now();
  const buckets = [root, root.error, root.detail, root.meta, root.data]
    .filter((v) => v && typeof v === "object");

  for (const obj of buckets) {
    for (const key of ["resets_at", "reset_at", "resetAt", "resetsAt"]) {
      const value = obj[key];
      if (value === undefined || value === null) continue;
      const asNumber = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        const ms = asNumber > 1e12 ? asNumber : asNumber * 1000;
        if (ms > now) return ms;
        continue;
      }
      const asDate = Date.parse(String(value));
      if (Number.isFinite(asDate) && asDate > now) return asDate;
    }
    for (const key of ["resets_in_seconds", "reset_in_seconds", "retry_after", "retryAfter", "retry_after_seconds"]) {
      const seconds = Number(obj[key]);
      if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000;
    }
  }

  // Some providers only embed the reset epoch inside the message text.
  const text = typeof root.error?.message === "string"
    ? root.error.message
    : typeof root.message === "string" ? root.message : "";
  const match = text.match(/"resets?_at"\s*:\s*(\d{10,})/i) || text.match(/reset[s]? (?:at|in) (\d{10,})/i);
  if (match) {
    const ms = Number(match[1]);
    if (ms > now) return ms * 1000;
  }
  return null;
}

/**
 * Parse upstream provider error response
 * @param {Response} response - Fetch response from provider
 * @param {object} [executor] - Optional executor with parseError() override for provider-specific parsing
 * @returns {Promise<{statusCode: number, message: string, resetsAtMs?: number}>}
 */
export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  // Header hint is provider-authoritative (Retry-After / RateLimit-*), so it is
  // the baseline any body-derived hint can override.
  const headerResetsAtMs = parseRetryAfterMs(response.headers);

  // Let executor-specific parser extract provider-specific fields (e.g. codex resetsAtMs)
  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText);
      if (parsed && typeof parsed === "object") {
        const msg = parsed.message || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
        return {
          statusCode: parsed.status || response.status,
          message: msg,
          resetsAtMs: parsed.resetsAtMs ?? headerResetsAtMs ?? undefined,
        };
      }
    } catch { /* fall through to default parsing */ }
  }

  let message = "";
  let bodyResetsAtMs = null;
  try {
    const json = JSON.parse(bodyText);
    message = json.error?.message || json.message || json.error || bodyText;
    bodyResetsAtMs = extractResetFromBody(json);
  } catch {
    message = bodyText;
  }

  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const finalMessage = messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;

  return {
    statusCode: response.status,
    message: finalMessage,
    resetsAtMs: bodyResetsAtMs ?? headerResetsAtMs ?? undefined,
  };
}

export function isCustomProvider(provider) {
  return typeof provider === "string" && (
    provider.startsWith("openai-compatible-") ||
    provider.startsWith("anthropic-compatible-") ||
    provider.startsWith("custom-embedding-")
  );
}

const ID_WORDS_RE = /\b(tolong|bisa|apa|apakah|yang|dan|di|ke|dari|untuk|dengan|tidak|gak|ga|nggak|saya|aku|kamu|anda|ini|itu|gimana|bagaimana|kenapa|mengapa|buat|buatkan|cari|cek|jelaskan|perbaiki|tambahkan|hapus|ubah|lanjut|dong|ya|kak|halo|hai)\b/i;
const EN_WORDS_RE = /\b(please|can|could|what|which|the|and|for|with|not|you|this|that|how|why|create|make|find|check|explain|fix|add|remove|update|continue|hello|hi)\b/i;

function extractLastUserText(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.prompt === "string") return body.prompt;
  if (typeof body.input === "string") return body.input;
  const list = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.input)
      ? body.input
      : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (!item || (item.role && item.role !== "user")) continue;
    if (typeof item.content === "string") return item.content;
    if (Array.isArray(item.content)) {
      const texts = item.content
        .map((c) => (typeof c === "string" ? c : c?.text || ""))
        .filter(Boolean)
        .join(" ");
      if (texts) return texts;
    }
  }
  return "";
}

/**
 * Return a clean, user-facing error message for custom providers without leaking
 * raw upstream provider error details, matching the request/user language.
 */
export function getMaskedProviderErrorMessage(clientRawRequest = null, body = null) {
  const userText = extractLastUserText(body || clientRawRequest?.body);
  if (userText) {
    const hasId = ID_WORDS_RE.test(userText);
    const hasEn = EN_WORDS_RE.test(userText);
    if (hasId && !hasEn) return "Terjadi kesalahan. Silakan hubungi admin.";
    if (hasEn && !hasId) return "An error occurred. Please contact the administrator.";
    if (hasId) return "Terjadi kesalahan. Silakan hubungi admin.";
  }

  const headers = clientRawRequest?.headers || {};
  const explicitLocale = String(headers["x-locale"] || "").toLowerCase();
  if (explicitLocale.startsWith("en")) return "An error occurred. Please contact the administrator.";
  if (explicitLocale.startsWith("id")) return "Terjadi kesalahan. Silakan hubungi admin.";

  const acceptLang = String(headers["accept-language"] || "").toLowerCase();
  if (acceptLang.startsWith("en") && !acceptLang.includes("id")) {
    return "An error occurred. Please contact the administrator.";
  }

  return "Terjadi kesalahan. Silakan hubungi admin.";
}

/**
 * Create error result for chatCore handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Internal error message (kept on result.error for fallback/admin logs)
 * @param {number} [resetsAtMs] - Optional precise cooldown expiry (ms epoch) for provider-specific quota errors
 * @param {object} [extraHeaders] - Optional extra response headers
 * @param {string} [clientMessage] - Optional sanitized message sent in HTTP response body to the client
 * @returns {{ success: false, status: number, error: string, response: Response, resetsAtMs?: number }}
 */
export function createErrorResult(statusCode, message, resetsAtMs, extraHeaders = null, clientMessage = null) {
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    response: errorResponse(statusCode, clientMessage || message, extraHeaders)
  };
}

/**
 * Create unavailable response when all accounts are rate limited
 * @param {number} statusCode - Original error status code
 * @param {string} message - Error message (without retry info)
 * @param {string} retryAfter - ISO timestamp when earliest account becomes available
 * @param {string} retryAfterHuman - Human-readable retry info e.g. "reset after 30s"
 * @returns {Response}
 */
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman, extraHeaders = null) {
  const retryAfterSec = Math.max(Math.ceil((new Date(retryAfter).getTime() - Date.now()) / 1000), 1);
  const msg = `${message} (${retryAfterHuman})`;
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    {
      status: statusCode,
      headers: {
        ...extraHeaders,
        "Content-Type": "application/json",
        // Intentionally mis-cased to prevent duplicate headers
        "retry-after": String(retryAfterSec)
      }
    }
  );
}

/**
 * Format provider error with context
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number|string} statusCode - HTTP status code or error code
 * @returns {string} Formatted error message
 */
export function formatProviderError(error, provider, model, statusCode) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const message = error.message || "Unknown error";
  // Expose low-level cause (e.g. UND_ERR_SOCKET, ECONNRESET, ETIMEDOUT) for diagnosing fetch failures
  const causeCode = error.cause?.code;
  const causeMsg = error.cause?.message;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  return `[${code}]: ${message}${causeStr}`;
}
