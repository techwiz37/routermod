import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import {
  MEMORY_CONFIG,
  resolveOpencodeRotationSettings,
} from "../config/runtimeConfig.js";
import { getSettings } from "@/lib/localDb";
import { OPENCODE_MAX_HISTORY_TURNS } from "../config/contextGuard.js";
import { FORMATS } from "../translator/formats.js";
import { capConversationHistory } from "../translator/concerns/contextTrim.js";
import { getThinkingLevels } from "../providers/thinkingLevels.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";
import { applyFingerprintTools } from "../utils/opencodeFingerprint.js";
import { opencodeTlsFetch, resetOpencodeTlsSession } from "../services/opencodeTlsClient.js";
import { warpHop, warpStatus, waitForWarpIdle, hopCooldownRemainingMs } from "@/lib/network/warpRotator.js";
import { ANTHROPIC_API_VERSION } from "../providers/shared.js";
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
export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// Free-lane load shedding: total attempts (first try + retries) and backoff.
// Live bursts last ~20 s (a request that kept failing for 8 s succeeded at 19 s),
// so the schedule below covers 800+1600+2400+3200+4000*3 = ~20 s.
const OPENCODE_OVERLOAD_ATTEMPTS = 8;
const OPENCODE_OVERLOAD_BASE_MS = 800;
const OPENCODE_OVERLOAD_MAX_MS = 4000;
const OPENCODE_OVERLOAD_RE = /overloaded/i;

// WARP-backed quota hop limits live in config/runtimeConfig.js. Rotation keeps
// going across every free model until the 429 clears, the budget expires, or
// the client disconnects — a single failed/same-IP hop no longer ends the loop.

async function warpAvailable() {
  try { return (await warpStatus()).connected === true; } catch { return false; }
}

async function hopAndReset(args) {
  try {
    // Let other in-flight WARP requests finish streaming before disconnecting
    // the shared tunnel — otherwise they fail with a broken pipe.
    await waitForWarpIdle();
    const hop = await warpHop();
    if (!hop?.ok || !hop.changed) {
      console.log(`[HOP] WARP hop did not change address (${hop?.error || "same IP"})`);
      return false;
    }
    // Drop cached wreq-js sessions — they are keyed by proxy URL, and the
    // tunnel behind that URL now exits from a different IPv6 /64.
    resetOpencodeTlsSession();
    console.log(`[HOP] WARP ${hop.oldIp || "?"} → ${hop.newIp} — retrying OpenCode request`);
    return true;
  } catch (error) {
    console.log(`[HOP] WARP hop failed: ${error?.message || error}`);
    return false;
  }
}

/**
 * Classify a gated free-lane rejection:
 * - "overload": transient 429 load shedding, worth retrying with backoff.
 * - "limit":    429 FreeUsageLimitError — the /64 quota bucket is spent. A
 *               WARP hop can hand us a fresh bucket (openhop.cfd behaviour).
 * - "session":  403 or a spent/flagged session id.
 * - null:       anything else.
 */
async function classifyRejection(response) {
  const status = response?.status;
  if (status !== 429 && status !== 403) return null;
  if (status === 403) return "session";
  let text = "";
  try { text = await response.clone().text(); } catch { /* keep as-is */ }
  if (OPENCODE_OVERLOAD_RE.test(text)) return "overload";
  return "limit";
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { signal?.removeEventListener?.("abort", onAbort); resolve(); }, ms);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

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

function unstableRandom() {
  const bytes = crypto.randomBytes(14);
  let randomPart = "";
  for (let i = 0; i < 14; i++) {
    randomPart += BASE62_CHARS[bytes[i] % 62];
  }
  return randomPart;
}

// Session prefix = 12 hex of ~(timeMs * 0x1000 + counter), low 48 bits, like the CLI.
// Upstream decodes it and rejects a non-small counter with 403 FreeTierError
// (live probes: counter 0–16 pass, >=100 fail), so the counter must stay real.
const SESSION_PREFIX_MASK = (1n << 48n) - 1n;

function descendingTimeHex(time, counterValue) {
  return (~(BigInt(time) * 0x1000n + BigInt(counterValue)) & SESSION_PREFIX_MASK)
    .toString(16)
    .padStart(12, "0");
}

export function generateSessionId(timestamp = Date.now()) {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter++;
  return `ses_${descendingTimeHex(timestamp, counter)}${unstableRandom()}`;
}

// Upstream decodes the prefix timestamp and refuses sessions whose time is in
// the future or older than the free-tier window (live probes 2026-10-26: a
// Date.now() session passed 10/10 while digest-derived ones passed 1/10). A
// digest is uniform over 2^36 ms, so most translated ids were refused even
// though their shape matched. Mint with the current time and memoize per
// conversation so a conversation keeps one stable, valid session.
const translatedOpencodeSessions = new Map();
const MAX_TRANSLATED_SESSIONS = 5000;
const translatedSessionCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of translatedOpencodeSessions) {
    if (now - entry.lastUsed > MEMORY_CONFIG.sessionTtlMs) {
      translatedOpencodeSessions.delete(key);
    }
  }
}, MEMORY_CONFIG.sessionCleanupIntervalMs);
if (translatedSessionCleanup.unref) translatedSessionCleanup.unref();

export function translateSessionId(sessionId, clientTool = "") {
  if (typeof sessionId === "string" && OPENCODE_SESSION_RE.test(sessionId.trim())) {
    return sessionId.trim();
  }
  const key = `${clientTool || "generic"}\0${sessionId || ""}`;
  const existing = translatedOpencodeSessions.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.sessionId;
  }
  const translated = `ses_${descendingTimeHex(Date.now(), 1)}${unstableRandom()}`;
  if (translatedOpencodeSessions.size >= MAX_TRANSLATED_SESSIONS) {
    translatedOpencodeSessions.delete(translatedOpencodeSessions.keys().next().value);
  }
  translatedOpencodeSessions.set(key, { sessionId: translated, lastUsed: Date.now() });
  return translated;
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

// The memoized sessions above are never refreshed on failure, so once upstream
// spends or flags one, every later request reuses it and fails the same way
// until restart (#5559). Drop the rejected id so the next request mints a fresh
// one. Match by value, not identity key: a concurrent request may already have
// minted a replacement, which must survive.
export function forgetOpencodeSession(sessionId) {
  if (!sessionId) return false;
  let removed = false;
  for (const store of [stableOpencodeSessions, translatedOpencodeSessions]) {
    for (const [key, entry] of store) {
      if (entry.sessionId === sessionId) {
        store.delete(key);
        removed = true;
      }
    }
  }
  return removed;
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

// Chat Completions lane: the free backend validates reasoning_effort against the
// plain OpenAI enum (none|minimal|low|medium|high|xhigh|max) and answers 400
// "Invalid option" for anything else — including "auto", which adaptive thinking
// (Claude Code's thinking:{type:"adaptive"}) arrives as. Omitting the field lets
// the upstream pick its own default, which is what adaptive means; same rationale
// as the Responses path above, which rejects "unknown variant `auto`".
function dropAdaptiveReasoningEffort(body) {
  if (body?.reasoning_effort === "auto") delete body.reasoning_effort;
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
      dropAdaptiveReasoningEffort(body);
      applyFingerprintTools(body, false, { claude: isMessagesModel(model || body?.model) });
    }
    const name = model || body?.model;
    const format = isResponsesModel(name)
      ? FORMATS.OPENAI_RESPONSES
      : isMessagesModel(name) ? FORMATS.CLAUDE : FORMATS.OPENAI;
    const prepared = injectReasoningContent({ provider: this.provider, model, body });
    // Cap replayed history for this provider only — see contextGuard config.
    capConversationHistory(prepared, format, OPENCODE_MAX_HISTORY_TURNS);
    return prepared;
  }

  // Keep the custom quota-exhausted payload readable. Base parseError returns
  // the whole raw body as the message, which surfaces as an intimidating JSON
  // blob in the client's log detail — extract the human line instead.
  parseError(response, bodyText) {
    try {
      const json = JSON.parse(bodyText);
      if (json?.error?.type === "opencode_free_quota_exhausted") {
        return {
          status: response.status,
          message: json.error.message,
          quotaExhausted: true,
        };
      }
    } catch { /* not our custom payload */ }
    return super.parseError(response, bodyText);
  }

  // The free gate keys on the TLS ClientHello, so a native Node fetch is refused
  // no matter how faithful the body is. Route through the impersonating client
  // and keep proxy handling on the existing path (proxyAwareFetch delegates to
  // `directFetch` when no proxy is configured, and passes the resolved proxy
  // URL through when one is). Fail-open: without wreq-js the request still goes
  // out on native fetch instead of erroring here.
  async execute(args) {
    // Rotation knobs live in Dashboard → Settings → Network (no .env needed).
    // Read once per request; the resolver enforces the 100-IP target even when
    // an older DB still holds a smaller cap (e.g. 7 hops / 610 s).
    const saved = await getSettings().catch(() => ({}));
    const { maxHops, cooldownMs: hopCooldownMs, budgetMs: hopBudgetMs } = resolveOpencodeRotationSettings(saved);

    const credentials = this.prepareRequestCredentials(args);
    const directFetch = (url, options, proxyUrl) => opencodeTlsFetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    }, { signal: options.signal, proxyUrl });
    // wreq-js tunnels the proxy itself; adapters that cannot must stay on undici.
    directFetch.proxyCapable = true;
    // One prepared-body cache per request: WARP hops replay the same body, so
    // transform + JSON.stringify must happen once, not on every rotation.
    const preparedCache = new Map();
    const run = () => super.execute({ ...args, credentials, directFetch, _preparedCache: preparedCache });

    // The free lane sheds load with 429 "The inference service is overloaded.
    // Please try again later." even after the request passes the TLS gate, and
    // the OpenCode CLI retries it. Match that behaviour here: inspect a clone of
    // the body (a stream, so never read the original), retry transient overloads
    // with backoff, and hand back every other response untouched.
    let rotationAttempts = 0;
    let rotations = 0;
    let hopDeadline = 0; // set on the first 429 so the budget covers retries, not the first attempt

    // Rotate the WARP /64 and signal the caller to replay the request. A hop
    // that fails or returns the same IP is NOT a stop condition: keep going
    // until a different exit is found, the budget runs out, or the client leaves.
    const hopAndRetry = async (result) => {
      // Free models are IP-quota limited: even a health probe needs a fresh
      // WARP /64 or it will always report a false failure. Rotation is already
      // rate-limited by hopCooldownRemainingMs() (45s default), so a burst of
      // probes cannot thrash the tunnel.
      if (!hopDeadline) hopDeadline = Date.now() + hopBudgetMs;
      if (args.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      if (maxHops > 0 && rotationAttempts >= maxHops) return false;
      if (Date.now() >= hopDeadline) return false;
      // A transient warp-status read failure must not end the rotation early:
      // hopAndReset() probes the tunnel itself and a failed hop is retried.
      if (!(await warpAvailable())) {
        console.log(`[HOP] WARP status temporarily unavailable — attempting hop ${rotationAttempts + 1}/${maxHops} anyway`);
      }

      result.response?.body?.cancel?.().catch?.(() => {});

      // Don't disconnect/reconnect the shared tunnel on every 429. Space the
      // rotations out; within the gap the same IP is retried instead.
      const cooldown = args.isHealthProbe ? 0 : hopCooldownRemainingMs(hopCooldownMs);
      if (cooldown > 0) {
        const wait = Math.min(cooldown, Math.max(0, hopDeadline - Date.now()));
        if (wait > 0) await sleep(wait, args.signal);
      }
      if (args.signal?.aborted || Date.now() >= hopDeadline) return false;

      rotationAttempts++;
      const hop = await hopAndReset(args);
      if (hop) rotations++;
      return true;
    };

    for (let attempt = 1; ; attempt++) {
      const result = await run();
      const rejection = await classifyRejection(result?.response);
      if (rejection === "session") {
        if (forgetOpencodeSession(credentials[SESSION_FIELD])) {
          args.log?.debug?.("SESSION", `OpenCode ${result.response.status}: dropped cached session, next request re-mints`);
        }
        // A 403 can also be a spent quota bucket on some clients — hop and retry.
        if (await hopAndRetry(result)) continue;
        return result;
      }
      if (rejection === "limit") {
        // 429 FreeUsageLimitError: keep rotating the WARP /64 and retrying
        // within the wall-clock budget until a fresh, unthrottled IP is found.
        if (await hopAndRetry(result)) continue;
        console.log(`[HOP] 429 persists after ${rotationAttempts} rotation(s) (${rotations} IP change(s)) within ${hopBudgetMs / 1000}s — declaring failure`);
        // The raw upstream body is an intimidating JSON blob and reads like a
        // RouterMod/proxy limit. Replace it with a clear, actionable message
        // that says the free-model quota is exhausted at OpenCode itself.
        const modelId = baseModelId(args.model || "") || "model ini";
        const elapsedS = hopDeadline
          ? Math.round((Date.now() - (hopDeadline - hopBudgetMs)) / 1000)
          : Math.round(hopBudgetMs / 1000);
        const payload = {
          type: "error",
          error: {
            type: "opencode_free_quota_exhausted",
            message: `Kuota gratis OpenCode untuk model "${modelId}" sedang habis di sisi penyedia (bukan batas RouterMod/proxy). RouterMod sudah mencoba ${rotationAttempts}× rotasi IP WARP (${rotations}× ganti IP) selama ${elapsedS} detik namun tetap menerima 429. Silakan pakai model gratis lain, tunggu reset kuota OpenCode, atau upgrade ke OpenCode Go.`,
            provider: "opencode",
            model: modelId,
            upstream_status: 429,
            warp_rotations: rotations,
            rotation_attempts: rotationAttempts,
            retry_duration_s: elapsedS,
          },
        };
        const headers = new Headers(result.response.headers);
        headers.set("Content-Type", "application/json; charset=utf-8");
        const customResponse = new Response(JSON.stringify(payload), { status: 429, headers });
        return { ...result, response: customResponse };
      }
      // A disconnected client should not keep the retry loop (and the free lane)
      // busy for another ~20 s.
      if (rejection !== "overload" || attempt >= OPENCODE_OVERLOAD_ATTEMPTS || args.signal?.aborted) {
        return result;
      }
      result.response.body?.cancel?.().catch?.(() => {});
      args.log?.debug?.("RETRY", `OpenCode free lane overloaded, retry ${attempt}/${OPENCODE_OVERLOAD_ATTEMPTS - 1}`);
      const backoff = Math.min(OPENCODE_OVERLOAD_BASE_MS * attempt, OPENCODE_OVERLOAD_MAX_MS);
      await sleep(backoff + Math.random() * 250, args.signal);
      if (args.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    }
  }

  // Free tier moved from /zen/v1 to /inference/v1 (OpenCode v2); /zen/v1 now
  // answers every free request with 403 FreeTierError.
  buildUrl(model) {
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
      "Accept": stream ? "text/event-stream" : "*/*",
    };
    if (url.endsWith("/messages")) headers["anthropic-version"] = ANTHROPIC_API_VERSION;
    return headers;
  }
}
