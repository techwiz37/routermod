import crypto from "crypto";
import https from "https";
import { PassThrough } from "stream";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { MEMORY_CONFIG } from "../config/runtimeConfig.js";
import { getThinkingLevels } from "../providers/thinkingLevels.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";
import { applyFingerprintTools } from "../utils/opencodeFingerprint.js";
import { ANTHROPIC_API_VERSION } from "../providers/shared.js";
import { resolveProxyTarget, openProxyTunnel, isProxyBlocked, noteProxyBlocked, clearProxyBlocked } from "../utils/proxyTunnel.js";
import {
  normalizeResponsesInput,
  clampResponsesCallId,
  coerceResponsesArguments,
  coerceResponsesOutput,
} from "../translator/formats/responsesApi.js";

// OpenCode v2 UA shape: opencode/<channel>/<version>/<client>. Upstream rejects
// the v1 "opencode/1.18.x" form with 403 FreeTierError since 2026-10-14.
const OPENCODE_UA = "opencode/latest/2.0.26/cli";
const OPENCODE_CLIENT = "cli";
const MAX_SESSION_LENGTH = 256;
const MAX_TOOL_NAME_LEN = 128;
const SESSION_HEADER = "x-opencode-session";
const SESSION_FIELD = "_opencodeSession";
/**
 * Tell the two 403 flavours apart.
 *
 * - "blocked": an HTML error page - Cloudflare (or the proxy's own nginx)
 *   refused the exit IP. A new connection through a pool proxy lands on
 *   another exit IP, so this one is worth a retry.
 * - "free-tier": the JSON FreeTierError (or its encrypted blob) - the request
 *   reached the API and the free tier rejected it. Rotating the session and
 *   backing off is what clears that.
 */
function classifyForbidden(rawBody) {
  const text = String(rawBody || "").trim();
  if (!text) return "blocked";
  if (text.startsWith("<")) return "blocked";
  return "free-tier";
}

export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function hasValidOpencodeVersion(ua) {
  const m = String(ua || "").match(/^opencode\/[a-z0-9-]+\/(\d+)\.\d+\.\d+\/[a-z0-9-]+$/i);
  return !!m && parseInt(m[1], 10) >= 2;
}
// Models served by /inference/v1/responses; every other model stays on /chat/completions.
const RESPONSES_MODELS = new Set([
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
]);
const MESSAGES_MODELS = new Set(["union-alpha"]);

let lastTimestamp = 0;
let counter = 0;

// Session prefix = 12 hex of ~(timeMs * 0x1000 + counter), low 48 bits, like the CLI.
// Upstream decodes it and rejects a non-small counter with 403 FreeTierError
// (live probes: counter 0–16 pass, >=100 fail), so the counter must stay real.
const SESSION_PREFIX_MASK = (1n << 48n) - 1n;
const SESSION_TIME_MASK = (1n << 36n) - 1n;

function descendingTimeHex(time, counterValue) {
  return (~(BigInt(time) * 0x1000n + BigInt(counterValue)) & SESSION_PREFIX_MASK)
    .toString(16)
    .padStart(12, "0");
}

function unstableRandom() {
  const bytes = crypto.randomBytes(14);
  let randomPart = "";
  for (let i = 0; i < 14; i++) {
    randomPart += BASE62_CHARS[bytes[i] % 62];
  }
  return randomPart;
}

export function generateSessionId(timestamp = Date.now()) {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter++;
  return `ses_${descendingTimeHex(timestamp, counter)}${unstableRandom()}`;
}

export function generateRequestId(timestamp = Date.now()) {
  const current = BigInt(timestamp) * 0x1000n + 1n;
  const value = current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `msg_${time}${unstableRandom()}`;
}

export function translateSessionId(sessionId, clientTool = "") {
  if (typeof sessionId === "string" && OPENCODE_SESSION_RE.test(sessionId.trim())) {
    return sessionId.trim();
  }
  const digest = crypto
    .createHash("sha256")
    .update(`opencode\0${clientTool || "generic"}\0${sessionId || ""}`)
    .digest();
  const timeHex = digest.subarray(0, 6).toString("hex");
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  return `ses_${timeHex}${randomPart}`;
}

function normalizeSession(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_LENGTH) return null;
  return normalized;
}

function nativeSession(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) {
      const normalized = normalizeSession(value);
      if (normalized && OPENCODE_SESSION_RE.test(normalized)) return normalized;
    }
  }
  return null;
}

// Upstream free-tier quota is accounted per session. Minting a fresh
// x-opencode-session on every request burns through it and surfaces as
// 429 FreeUsageLimitError with growing reset-after delays, while the real
// CLI reuses one long-lived canonical session per conversation. Mirror
// that: one stable canonical session per downstream identity, evicted
// after MEMORY_CONFIG.sessionTtlMs like the other session stores.
const stableOpencodeSessions = new Map();
const MAX_STABLE_SESSIONS = 1000;
const stableSessionCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of stableOpencodeSessions) {
    if (now - entry.lastUsed > MEMORY_CONFIG.sessionTtlMs) {
      stableOpencodeSessions.delete(key);
    }
  }
}, MEMORY_CONFIG.sessionCleanupIntervalMs);
if (stableSessionCleanup.unref) stableSessionCleanup.unref();

function identityKey(credentials) {
  const connectionId = credentials?.connectionId || credentials?.id;
  if (connectionId) return `opencode:conn:${String(connectionId).slice(0, 128)}`;
  const raw = credentials?.rawHeaders || {};
  const auth = raw.authorization || raw.Authorization || raw["x-api-key"] || raw["X-Api-Key"] || "";
  if (auth) {
    const digest = crypto.createHash("sha256").update(String(auth)).digest("hex").slice(0, 32);
    return `opencode:auth:${digest}`;
  }
  return "opencode:default";
}

export function stableSessionId(credentials) {
  const key = identityKey(credentials);
  const existing = stableOpencodeSessions.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    stableOpencodeSessions.delete(key);
    stableOpencodeSessions.set(key, existing);
    return existing.sessionId;
  }
  const sessionId = generateSessionId();
  if (stableOpencodeSessions.size >= MAX_STABLE_SESSIONS) {
    stableOpencodeSessions.delete(stableOpencodeSessions.keys().next().value);
  }
  stableOpencodeSessions.set(key, { sessionId, lastUsed: Date.now() });
  return sessionId;
}

function bodyHasSessionHints(body) {
  try {
    if (!body || typeof body !== "object") return false;
    if (typeof body.session_id === "string" && body.session_id.trim()) return true;
    if (typeof body.conversation_id === "string" && body.conversation_id.trim()) return true;
    if (typeof body.prompt_cache_key === "string" && body.prompt_cache_key.trim()) return true;
    if (body.metadata && typeof body.metadata.user_id === "string" && body.metadata.user_id.trim()) return true;
    if (body.request && body.request.sessionId != null && String(body.request.sessionId) !== "") return true;
    const arr = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.input)
        ? body.input
        : null;
    if (arr) {
      let assistantText = "";
      for (const msg of arr) {
        if (msg?.role === "assistant") {
          const content = msg.content;
          if (typeof content === "string") assistantText += content;
          else if (Array.isArray(content)) {
            for (const part of content) assistantText += part?.text || part?.output || "";
          }
          if (assistantText.length >= 50) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Strip the thinking suffix "model(level)" so registry lookups hit the base id.
function baseModelId(model) {
  return String(model || "").replace(/\([^()]+\)\s*$/, "").trim();
}

function isResponsesModel(model) {
  const base = baseModelId(model);
  return RESPONSES_MODELS.has(base) || isMuseSparkModel(base);
}

function isMessagesModel(model) {
  return MESSAGES_MODELS.has(baseModelId(model));
}

function resolveOpencodeSession(body, credentials, providerSessionId, clientTool) {
  const headers = credentials?.rawHeaders || {};
  const native = nativeSession(headers);
  if (native) return native;

  let incoming = null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) {
      incoming = normalizeSession(value);
      break;
    }
  }

  const hinted = incoming || normalizeSession(providerSessionId);
  if (hinted) return translateSessionId(hinted, clientTool);

  if (credentials?.connectionId || bodyHasSessionHints(body)) {
    let viaManager = null;
    try {
      viaManager = resolveSessionId({
        headers,
        body,
        connectionId: credentials?.connectionId,
        scope: "opencode",
      });
    } catch {
      viaManager = null;
    }
    if (viaManager) return translateSessionId(viaManager, clientTool);
  }

  return stableSessionId(credentials);
}

function normalizeResponsesTools(body) {
  if (!Array.isArray(body.tools)) return;
  const validNames = new Set();
  body.tools = body.tools.filter((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;
    const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function) ? tool.function : null;
    const rawName = typeof tool.name === "string" ? tool.name : (typeof fn?.name === "string" ? fn.name : "");
    const name = rawName.trim();
    if (!name) return false;
    const description = typeof tool.description === "string" ? tool.description : (typeof fn?.description === "string" ? fn.description : "");
    let parameters = (tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters))
      ? tool.parameters
      : (fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters) ? fn.parameters : { type: "object", properties: {} });
    if (parameters.type === "object" && !parameters.properties) parameters = { ...parameters, properties: {} };
    for (const k of Object.keys(tool)) delete tool[k];
    tool.type = "function";
    tool.name = name.slice(0, MAX_TOOL_NAME_LEN);
    if (description) tool.description = description;
    tool.parameters = parameters;
    validNames.add(tool.name);
    return true;
  });
  if (body.tool_choice && typeof body.tool_choice === "object" && !Array.isArray(body.tool_choice)) {
    if (body.tool_choice.type === "function") {
      const n = typeof body.tool_choice.name === "string" ? body.tool_choice.name.trim() : "";
      if (!n || !validNames.has(n)) delete body.tool_choice;
    }
  }
}

function sanitizeResponsesItems(body) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    // Strip prior-turn reasoning items: OpenCode Free uses public/pooled credentials
    // (`Bearer public`) routing to an upstream OpenAI/Console account pool.
    // OpenAI Responses API strictly enforces that reasoning `encrypted_content`
    // can only be decrypted by the exact caller/account that issued it; sending it
    // across different accounts or rotating proxy relays triggers:
    // [invalid_request_error] reasoning `encrypted_content` was not issued to this caller (400).
    // Furthermore, under stateless mode (store=false), omitting encrypted_content
    // causes OpenAI to reject the referenced reasoning item as "not found or was deleted".
    // Dropping prior reasoning items allows multi-turn conversations and tool-calling
    // loops to succeed cleanly.
    if (item.type === "reasoning") return false;
    delete item.encrypted_content;
    delete item.reasoning_encrypted_content;
    if (item.type === "function_call") {
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") return false;
      item.name = item.name.trim().slice(0, MAX_TOOL_NAME_LEN);
      item.call_id = clampResponsesCallId(item.call_id);
      item.arguments = coerceResponsesArguments(item.arguments);
      return true;
    }
    if (item.type === "function_call_output") {
      item.call_id = clampResponsesCallId(item.call_id);
      item.output = coerceResponsesOutput(item.output);
      return true;
    }
    return true;
  });
}

function normalizeOpencodeReasoning(model, body) {
  const current = body.reasoning;
  const currentReasoning = current && typeof current === "object" && !Array.isArray(current)
    ? current
    : null;
  const requestedEffort = typeof body.reasoning_effort === "string"
    ? body.reasoning_effort
    : currentReasoning?.effort;
  if (typeof requestedEffort !== "string") return;

  const cleanModel = baseModelId(model || body.model);
  const supportedLevels = getThinkingLevels("opencode", cleanModel);
  let effort = requestedEffort.toLowerCase().trim();
  if ((effort === "max" || effort === "ultra") && supportedLevels?.length && !supportedLevels.includes(effort)) {
    if (effort === "ultra" && supportedLevels.includes("max")) effort = "max";
    else if (supportedLevels.includes("xhigh")) effort = "xhigh";
  }

  body.reasoning = { ...currentReasoning, effort };
  if (!body.reasoning.summary) body.reasoning.summary = "auto";
  delete body.reasoning_effort;
}


// The streaming handler pipes providerResponse.body with pipeThrough(), which
// only exists on the Web Streams API. A bare Node PassThrough has no
// pipeThrough(), so every oc/* request died with an unhandled TypeError and
// the client saw HTTP 500 with an empty body. Wrap the Node stream lazily so
// the non-streaming path (text()/json()) keeps its buffered fan-out.
function nodeStreamToWeb(nodeStream) {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch { /* stream already closed */ }
      });
      nodeStream.on("end", () => {
        try { controller.close(); } catch { /* already closed */ }
      });
      nodeStream.on("error", (err) => {
        try { controller.error(err); } catch { /* already errored */ }
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
  }

  prepareRequestCredentials({ body, credentials, providerSessionId, clientTool } = {}) {
    const sourceCredentials = credentials || {};
    const session = resolveOpencodeSession(body, sourceCredentials, providerSessionId, clientTool);

    return {
      ...sourceCredentials,
      [SESSION_FIELD]: session,
    };
  }

  transformRequest(model, body, stream, credentials) {
    if (body && typeof body === "object" && model && !body.model) body.model = model;
    // Zen rejects non-streaming requests on free models with 403 FreeTierError;
    // always stream upstream and let the handler layer aggregate for non-stream clients.
    if (body && typeof body === "object") body.stream = true;
    // Debug: log body before fingerprint
    if (body && typeof body === "object") {
      console.log("[OPENCODE DEBUG] body before fingerprint:", JSON.stringify({
        model: body.model,
        messages: body.messages?.length,
        tools: body.tools?.map?.(t => t.function?.name || t.name),
        tool_choice: body.tool_choice,
        stream: body.stream,
      }));
    }
    if (isResponsesModel(model || body?.model) && body && typeof body === "object") {
      // ponytail: chỉ model đã xác nhận auto-only; mở allowlist khi có bằng chứng.
      if ("tool_choice" in body && body.tool_choice !== "auto"
        && this.config.quirks?.forceAutoToolChoiceModels?.includes(baseModelId(model))) {
        body.tool_choice = "auto";
      }
      const normalized = normalizeResponsesInput(body.input);
      if (normalized) body.input = normalized;
      if (!Array.isArray(body.input) || body.input.length === 0) {
        body.input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
      }
      // Responses API names the output cap max_output_tokens and takes thinking
      // as reasoning:{effort,summary} — normalize the Chat fields at this boundary.
      if (body.max_output_tokens === undefined) {
        if (body.max_completion_tokens !== undefined) body.max_output_tokens = body.max_completion_tokens;
        else if (body.max_tokens !== undefined) body.max_output_tokens = body.max_tokens;
      }
      delete body.max_tokens;
      delete body.max_completion_tokens;
      normalizeOpencodeReasoning(model, body);
      body.stream = true;
      body.store = false;
      normalizeResponsesTools(body);
      sanitizeResponsesItems(body);
      // Free-tier fingerprint tools are required even when an agent client
      // already supplied tools. ZCode/Claude Code requests normally have
      // non-empty tool arrays; skipping cloaking here triggers 403 FreeTierError.
      applyFingerprintTools(body, true);
    } else if (body && typeof body === "object") {
      applyFingerprintTools(body, false);
      // Free tier rejects tool_choice: "none" — remove if set by fingerprint helper
      if (body.tool_choice === "none") delete body.tool_choice;
    }
    // Ensure system prompt exists (free tier requires OpenCode-like system prompt)
    if (body && typeof body === "object" && Array.isArray(body.messages) && body.messages.length > 0) {
      const hasSystem = body.messages.some(m => m.role === "system");
      if (!hasSystem) {
        body.messages.unshift({
          role: "system",
          content: "You are a helpful coding assistant. Always answer clearly and concisely. Provide complete working examples when asked for code."
        });
      }
      // Ensure stream_options for free tier
      if (body.stream && !body.stream_options) {
        body.stream_options = { include_usage: true };
      }
    }
    return injectReasoningContent({ provider: this.provider, model, body });
  }

  async execute(args) {
    const { model, body, stream, credentials, signal, proxyOptions } = args;
    const transformedBody = this.transformRequest(model, body, stream, credentials);

    // Exact replica of working bypass test (bypass_test.js)
    const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    function rnd() { const b = crypto.randomBytes(14); let s = ""; for (let i = 0; i < 14; i++) s += B62[b[i] % 62]; return s; }
    function newSid() { const c = BigInt(Date.now()) * 4096n + 1n, v = ~c; const t = Array.from({ length: 6 }, (_, i) => Number((v >> BigInt(40 - 8 * i)) & 0xffn).toString(16).padStart(2, "0")).join(""); return "ses_" + t + rnd(); }
    const MAX_RETRIES = 4;
    // A pool proxy rotates its exit IP per connection, so one blocked IP is
    // worth exactly one more tunnel - not a full backoff.
    const MAX_PROXY_BLOCK_RETRIES = 1;
    // Handshake + response headers. A working proxy answers in well under a
    // second; a stalled one must not hold the request hostage.
    const SETUP_TIMEOUT_MS = 20000;
    // Backoff grows fast: the free tier rejects a second concurrent request
    // from the same egress IP, and the first one can run for 10+ seconds.
    const RETRY_BACKOFF_MS = [2000, 5000, 10000];
    const isResponses = isResponsesModel(model);

    // Set to false when the proxy IP turns out to be blocked upstream.
    let useProxy = true;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const sid = newSid();
      const id = crypto.randomBytes(16).toString("hex");
      const sp = crypto.randomBytes(8).toString("hex");
      const headers = {
        Authorization: "Bearer public",
        "Content-Type": "application/json",
        "User-Agent": "opencode/latest/2.0.24/cli",
        "x-opencode-client": "cli",
        "x-opencode-project": "c4bc9052beef2f7f869305b46b596151835ec89c",
        "x-opencode-session": sid,
        "x-opencode-session-id": sid,
        "x-session-affinity": sid,
        "x-session-id": sid,
        b3: id + "-" + sp + "-1-" + crypto.randomBytes(8).toString("hex"),
        traceparent: "00-" + id + "-" + sp + "-01",
        Accept: "*/*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        Connection: "keep-alive",
      };

      // Build request body for the correct protocol
      let requestBody;
      const path = isResponses ? "/zen/v1/responses" : "/inference/v1/chat/completions";
      if (isResponses) {
        // Responses API format
        requestBody = JSON.stringify({
          model,
          input: transformedBody.messages?.map(m => ({ role: m.role, content: m.content })) || [],
          stream: transformedBody.stream,
          tools: transformedBody.tools,
          tool_choice: transformedBody.tool_choice,
          stream_options: transformedBody.stream_options,
        });
      } else {
        requestBody = JSON.stringify(transformedBody);
      }

      // Route through the proxy pool when one is configured. The pool is
      // picked per request by the credential resolver, so the egress IP
      // rotates and the free tier does not answer 429.
      const upstreamUrl = `https://opencode.ai${path}`;
      let proxyTarget = useProxy ? resolveProxyTarget(proxyOptions || {}, upstreamUrl) : null;
      const strictProxy = proxyOptions?.strictProxy === true;

      // A pool proxy rotates its exit IP per connection, so one refused
      // request is not enough to condemn it - only a streak of them is.
      if (proxyTarget && isProxyBlocked(proxyTarget)) {
        console.warn(
          `[OPENCODE PROXY] proxy ${proxyTarget.host}:${proxyTarget.port} ditolak berulang, pakai koneksi langsung`
        );
        proxyTarget = null;
      }

      const openTunnel = async () => {
        if (!proxyTarget) return null;
        try {
          const socket = await openProxyTunnel(proxyTarget, "opencode.ai", 443);
          console.log(
            `[OPENCODE PROXY] tunnel via ${proxyTarget.host}:${proxyTarget.port} pool=${proxyOptions?.proxyPoolId || "none"}`
          );
          return socket;
        } catch (e) {
          if (strictProxy) throw e;
          console.warn(
            `[OPENCODE PROXY] tunnel failed (${e?.message}), falling back to direct`
          );
          // A proxy that cannot even open the tunnel is as useless as one
          // whose exit IP is blocked - count it so the rotation drops it.
          noteProxyBlocked(proxyTarget);
          return null;
        }
      };

      let tunnelSocket = await openTunnel();

      // One upstream call. `socket` decides whether the request leaves through
      // the proxy tunnel or straight from this host.
      const performRequest = (socket) =>
        new Promise((resolve, reject) => {
          // The socket timeout of https.request only starts once the TLS
          // handshake is done. A proxy that accepts the CONNECT and then
          // stalls would hang the request forever, so the setup phase gets
          // its own watchdog.
          let setupTimedOut = false;
          const setupTimer = setTimeout(() => {
            setupTimedOut = true;
            try {
              req.destroy();
            } catch {
              /* ignore */
            }
            // Settle the promise here instead of waiting for the request's
            // error event - a socket that stalls mid-handshake never emits
            // one, and the caller would hang with it.
            if (socket) {
              resolve({ proxyFailed: true, reason: "stalled" });
            } else {
              reject(new Error("timeout saat menghubungi upstream"));
            }
          }, SETUP_TIMEOUT_MS);
          const req = https.request({
            ...(socket
              ? { socket, servername: "opencode.ai", agent: false }
              : { hostname: "opencode.ai", port: 443 }),
            path,
            method: "POST",
            headers,
            timeout: 120000,
          }, (res) => {
            // The response headers are here: the setup phase is over and the
            // socket timeout takes over for the stream.
            clearTimeout(setupTimer);
            const isRateLimited = res.statusCode === 429;
            // The free tier answers concurrent/over-quota requests with an
            // encrypted 403 (FreeTierError) instead of 429. Rotating the session
            // and backing off like the 429 path does clears it, so treat 403 as
            // retryable too instead of failing the request outright.
            const isRetryable = isRateLimited || res.statusCode === 403;
            const isError = res.statusCode >= 400 && !isRetryable;

            if (isError) {
              const errChunks = [];
              res.on("data", (c) => errChunks.push(c));
              res.on("end", () => {
                const errText = Buffer.concat(errChunks).toString("utf8");
                reject(new Error(`HTTP ${res.statusCode}: ${errText.slice(0, 2000)}`));
              });
              res.on("error", reject);
              return;
            }

            // A free-tier 403 carries an encrypted blob instead of a readable
            // error body. Drain it and answer with a clean JSON error so the
            // client can parse the failure instead of choking on binary noise.
            if (res.statusCode === 403) {
              // The body tells the two flavours apart: an HTML page means the
              // exit IP was blocked (Cloudflare or the proxy's own nginx), a
              // JSON error means the request reached the API and the free
              // tier rejected it.
              const bodyChunks = [];
              res.on("data", (c) => {
                if (bodyChunks.length < 16) bodyChunks.push(c);
              });
              res.on("end", () => {
                const raw = Buffer.concat(bodyChunks).toString("utf8");
                if (socket && classifyForbidden(raw) === "blocked") {
                  // Cloudflare refused this exit IP. A fresh tunnel lands on
                  // another exit IP, so let the caller retry right away.
                  resolve({ proxyFailed: true, reason: "blocked" });
                  return;
                }
                const clean = JSON.stringify({
                  error: {
                    message: "OpenCode free tier rejected the request (403 FreeTierError).",
                    type: "server_error",
                    code: "free_tier_error",
                  },
                });
                const response = {
                  ok: false,
                  status: 403,
                  statusText: res.statusMessage,
                  headers: new Map(Object.entries(res.headers)),
                  body: null,
                  async text() { return clean; },
                  async json() { return JSON.parse(clean); },
                  async arrayBuffer() { return Buffer.from(clean); },
                };
                response.rateLimited = true;
                resolve({
                  response,
                  url: `https://opencode.ai${path}`,
                  headers,
                  transformedBody,
                  rateLimited: true,
                  sessionId: sid,
                });
              });
              res.on("error", reject);
              return;
            }

            // Fan out the upstream stream: one copy feeds the live streaming consumer,
            // the other is buffered so text()/json() work for non-streaming callers.
            const out = new PassThrough({ highWaterMark: 64 * 1024 * 1024 });
            const bufferedChunks = [];
            let bufferedText = null;
            let streamDone = false;
            let markDone;
            const donePromise = new Promise((r) => { markDone = r; });
            res.on("data", (c) => { bufferedChunks.push(c); out.write(c); });
            const finish = () => {
              if (streamDone) return;
              streamDone = true;
              bufferedText = Buffer.concat(bufferedChunks).toString("utf8");
              out.end();
              markDone();
            };
            res.on("end", finish);
            res.on("error", (e) => { if (!streamDone) out.destroy(e); });

            let webBody = null;
            const response = {
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: new Map(Object.entries(res.headers)),
              get body() { return webBody || (webBody = nodeStreamToWeb(out)); },
              async text() { await donePromise; return bufferedText; },
              async json() { return JSON.parse(await this.text()); },
              async arrayBuffer() { await donePromise; return Buffer.from(bufferedText); },
            };
            if (isRetryable) {
              response.rateLimited = true;
              donePromise.then(() => {
                try { response.rateLimitBody = JSON.parse(bufferedText); } catch {}
              });
            }
            resolve({ response, url: `https://opencode.ai${path}`, headers, transformedBody, rateLimited: isRetryable, sessionId: sid });
          });
          req.on("error", (e) => {
            clearTimeout(setupTimer);
            if (socket) {
              try {
                socket.destroy();
              } catch {
                /* ignore */
              }
            }
            // The proxy stalled before the response headers arrived. That is
            // a proxy failure, not a request failure - the caller can still
            // fall back to a direct connection.
            if (setupTimedOut && socket) {
              resolve({ proxyFailed: true, reason: "stalled" });
              return;
            }
            reject(e);
          });
          req.on("timeout", () => req.destroy(new Error("timeout")));
          req.end(requestBody);
        });

      let result = await performRequest(tunnelSocket);

      // The proxy failed us - Cloudflare refused the exit IP, or it stalled
      // during the handshake. The pool rotates the exit IP per connection, so
      // a fresh tunnel can land on a working one. Retry right away - no
      // backoff, no wasted retry slot.
      let blockedTries = 0;
      while (result?.proxyFailed && proxyTarget && blockedTries < MAX_PROXY_BLOCK_RETRIES) {
        blockedTries += 1;
        try {
          tunnelSocket?.destroy();
        } catch {
          /* ignore */
        }
        if (noteProxyBlocked(proxyTarget)) {
          console.warn(
            `[OPENCODE PROXY] proxy ${proxyTarget.host}:${proxyTarget.port} gagal berulang, dilewati`
          );
          proxyTarget = null;
          break;
        }
        tunnelSocket = await openTunnel();
        if (!tunnelSocket) break;
        result = await performRequest(tunnelSocket);
      }

      if (result?.proxyFailed) {
        // Still failing - the proxy is useless for this request, go direct.
        try {
          tunnelSocket?.destroy();
        } catch {
          /* ignore */
        }
        tunnelSocket = null;
        if (strictProxy) {
          // Strict pools must never silently fall back to a direct connection.
          throw new Error(
            `[OPENCODE PROXY] proxy ${proxyTarget?.host}:${proxyTarget?.port} ditolak upstream (403) dan strictProxy=1`
          );
        }
        console.warn(
          result?.reason === "stalled"
            ? "[OPENCODE PROXY] proxy macet saat handshake, lanjut koneksi langsung"
            : "[OPENCODE PROXY] IP proxy diblokir Cloudflare (403), lanjut koneksi langsung"
        );
        useProxy = false;
        result = await performRequest(null);
      }

      // The proxy answered - it is healthy, so drop any refusal streak.
      if (result?.response?.ok && proxyTarget) {
        clearProxyBlocked(proxyTarget);
      }

      if (!result.rateLimited) return result;
      // Rate limited / free-tier blocked — rotate session & retry
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[attempt] ?? 10000));
        continue;
      }
      // Last attempt rate limited — return anyway (upstream will handle)
      return result;
    }
  }

  buildUrl(model) {
    // Free tier moved from /zen/v1 to /inference/v1 (OpenCode v2); /zen/v1 now
    // answers every free request with 403 FreeTierError.
    const base = this.config.baseUrl;
    if (isResponsesModel(model)) return `${base}/inference/v1/responses`;
    if (isMessagesModel(model)) return `${base}/inference/v1/messages`;
    return `${base}/inference/v1/chat/completions`;
  }

  buildHeaders(credentials, stream = true, url = "") {
    const raw = credentials?.rawHeaders || {};
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;

    const downstreamUa = lower["user-agent"] || "";
    const isOpencodeDownstream = hasValidOpencodeVersion(downstreamUa);

    const session = credentials?.[SESSION_FIELD] || this.prepareRequestCredentials({ credentials })[SESSION_FIELD];

    // Stable 40-hex project ID derived from session (reused per identity)
    const projectId = crypto.createHash("sha256").update(`opencode-project\0${session}`).digest("hex").slice(0, 40);

    // Tracing headers (b3 + traceparent) – stable per request
    const traceId = crypto.randomBytes(16).toString("hex");
    const spanId = crypto.randomBytes(8).toString("hex");
    const b3 = `${traceId}-${spanId}-1-${crypto.randomBytes(8).toString("hex")}`;
    const traceparent = `00-${traceId}-${spanId}-01`;

    // Mirrors the v2 CLI. Upstream needs x-opencode-session-id next to
    // x-opencode-session, and rejects any x-opencode-request (v1 only) with 403.
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer public",
      "User-Agent": isOpencodeDownstream ? downstreamUa : OPENCODE_UA,
      "x-opencode-client": lower["x-opencode-client"] || OPENCODE_CLIENT,
      "x-opencode-session": session,
      "x-opencode-session-id": session,
      "x-session-affinity": session,
      "x-session-id": session,
      "x-opencode-project": lower["x-opencode-project"] || "global",
      "b3": b3,
      "traceparent": traceparent,
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Connection": "keep-alive",
    };
    if (url.endsWith("/messages")) headers["anthropic-version"] = ANTHROPIC_API_VERSION;
    // Debug: log headers being sent
    console.log("[OPENCODE DEBUG] headers:", JSON.stringify(Object.keys(headers).sort()));
    return headers;
  }
}
