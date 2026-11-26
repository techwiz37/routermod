// Context trimming — fit an outgoing prompt into the target model's real
// context window so a long conversation never dies with the upstream
// "prompt is too long" 400. Runs on the final (post-translate) body, so it
// works on whatever wire shape the provider speaks.
//
// Fail-open by contract: an unknown shape or any error leaves the body
// untouched — a broken trimmer must never break a chat request.
import { FORMATS } from "../formats.js";
import { ROLE, GEMINI_ROLE, RESPONSES_ITEM, CLAUDE_BLOCK } from "../schema/index.js";
import { BODY_TRIM_NOTICE } from "../../config/upstreamBodyLimits.js";
import {
  CHARS_PER_TOKEN,
  COMPACT_NOTICE,
  CONTEXT_GUARD,
  CONTEXT_SHRINK_MAX_DEPTH,
  MEDIA_TOKEN_COST,
  TRIM_NOTICE,
} from "../../config/contextGuard.js";

// Output-token fields, in the order providers spell them.
const OUTPUT_TOKEN_FIELDS = ["max_tokens", "max_completion_tokens", "max_output_tokens"];

// Baseline framing cost for one message (role markers, separators).
const MESSAGE_OVERHEAD_TOKENS = 4;

const CJK = /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/g;

function countStringTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  for (const [prefix, cost] of Object.entries(MEDIA_TOKEN_COST)) {
    if (text.startsWith(prefix)) return cost;
  }
  // Same estimate as the old per-character loop, but the CJK count runs in
  // native regex code. A long chat no longer blocks the event loop here.
  const wide = text.match(CJK)?.length || 0;
  return Math.ceil((text.length - wide) / CHARS_PER_TOKEN) + wide;
}

// Walk any provider-shaped value and count approximate tokens. Media payloads
// are replaced by a fixed cost so a base64 image cannot dominate the estimate.
export function estimateTokens(value) {
  if (value == null) return 0;
  if (typeof value === "string") return countStringTokens(value);
  if (typeof value === "number" || typeof value === "boolean") return 2;
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) total += estimateTokens(item);
    return total;
  }
  if (typeof value !== "object") return 0;

  let total = 0;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "type" || key === "role" || key === "id" || key === "name") {
      total += countStringTokens(String(entry));
      continue;
    }
    total += estimateTokens(entry);
  }
  return total;
}

// Input budget of one model: the window minus reserved output headroom. The
// output share is capped at 40% of the window so a client asking for a huge
// max_tokens cannot starve the prompt (which would trim the history to
// nothing on a small-context model).
export function resolveInputBudget(caps, requestedOutputTokens = null, ratio = CONTEXT_GUARD.inputRatio) {
  const window = Number(caps?.contextWindow);
  if (!Number.isFinite(window) || window <= 0) return null;

  const declaredOutput = Number(caps?.maxOutput);
  const requested = Number.isFinite(requestedOutputTokens) && requestedOutputTokens > 0
    ? requestedOutputTokens
    : (Number.isFinite(declaredOutput) ? declaredOutput : 0);
  const output = Math.min(
    Number.isFinite(declaredOutput) && declaredOutput > 0 ? Math.min(requested, declaredOutput) : requested,
    Math.floor(window * 0.4),
  );

  const usable = Math.floor(window * ratio) - CONTEXT_GUARD.reserveTokens;
  return Math.max(usable - output, Math.floor(window * 0.25));
}

// Upstreams word their context rejection differently, but they all mean the
// same thing: the prompt is larger than the window this model really serves.
const OVERFLOW_PATTERNS = [
  "context_length_exceeded",
  "context length",
  "context window",
  "context size",
  "maximum context",
  "prompt is too long",
  "prompt too long",
  "input is too long",
  "input too long",
  "too many tokens",
  "exceeds the maximum",
  "exceeded the maximum",
  "reduce the length",
  "reduce your prompt",
  "too large for the model",
  // Kiro / AWS Q Developer reject an oversized request body with this reason
  // long before the model window is full.
  "content_length_exceeds_threshold",
  "content length exceeds",
  "input content length",
  // FreePi (via freepi-bridge) refuses requests past its hard 250k ceiling with
  // "This conversation is too long. Run /compact or start a new session with
  // /new." and code context_too_long. Treat it as an overflow so chatCore and
  // the agent route compact the oldest turns and retry instead of surfacing a
  // dead-end 413 to the client.
  "context_too_long",
  "conversation is too long",
  "conversation too long",
  "session is too long",
  "run /compact",
];

export function isContextOverflowError(statusCode, message) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  if (!OVERFLOW_PATTERNS.some((pattern) => text.includes(pattern))) return false;
  const status = Number(statusCode);
  if (Number.isFinite(status) && status > 0) return status === 400 || status === 413 || status === 422;
  return true;
}

const NUMBER = String.raw`(\d{1,3}(?:[,_]\d{3})+|\d+)`;
const WINDOW_PATTERNS = [
  new RegExp(String.raw`context (?:window|length)(?: size)?(?: is| of|:)?\s*${NUMBER}`, "i"),
  new RegExp(String.raw`maximum (?:context|prompt|input)(?: length| size)?(?: is| of|:)?\s*${NUMBER}`, "i"),
  new RegExp(String.raw`(?:limit|maximum|max)(?: is| of|:)?\s*${NUMBER}\s*tokens`, "i"),
  new RegExp(String.raw`${NUMBER}\s*tokens?\s*(?:maximum|limit|allowed)`, "i"),
];

function toTokenCount(raw) {
  const n = Number(String(raw).replace(/[,_]/g, ""));
  return Number.isFinite(n) && n >= 1000 ? n : null;
}

// "maximum context length is 32768 tokens", "prompt is too long: 210000 tokens
// > 200000 maximum": the upstream names the real window. Publishing it back
// into the caps makes the next request fit the model instead of guessing.
export function parseContextWindow(statusCode, message) {
  if (!isContextOverflowError(statusCode, message)) return null;
  const text = String(message || "");
  // An output-token complaint ("max_tokens 200000 > 64000") is about the
  // completion budget, not the window: learning it would shrink the prompt
  // budget for no reason.
  if (/max_(?:new_)?tokens|max_completion_tokens|max_output_tokens|output tokens/i.test(text)) return null;
  const rangeMatch = text.match(/\d[\d,_]*\s*tokens?\s*>\s*(\d[\d,_]*)/i);
  if (rangeMatch) {
    const bound = toTokenCount(rangeMatch[1]);
    if (bound) return bound;
  }

  let smallest = null;
  for (const pattern of WINDOW_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = toTokenCount(match[1]);
    if (!value) continue;
    smallest = smallest == null ? value : Math.min(smallest, value);
  }
  if (smallest) return smallest;
  return null;
}

function readOutputLimit(body) {
  for (const field of OUTPUT_TOKEN_FIELDS) {
    const raw = Number(body?.[field]);
    if (Number.isFinite(raw) && raw > 0) return { field, value: raw };
  }
  const gemini = Number(body?.generationConfig?.maxOutputTokens);
  if (Number.isFinite(gemini) && gemini > 0) {
    return { field: "generationConfig.maxOutputTokens", value: gemini };
  }
  return null;
}

function writeOutputLimit(body, field, value) {
  if (field === "generationConfig.maxOutputTokens") {
    body.generationConfig.maxOutputTokens = value;
    return;
  }
  body[field] = value;
}

// A conversation item that must stay with the message that introduced it: an
// assistant tool call and the tool results answering it are one unit.
function roleOf(item, format) {
  if (!item || typeof item !== "object") return null;
  if (format === FORMATS.KIRO) {
    if (item.userInputMessage) return ROLE.USER;
    if (item.assistantResponseMessage) return ROLE.ASSISTANT;
    return null;
  }
  if (format === FORMATS.OPENAI_RESPONSES || format === FORMATS.OPENAI_RESPONSE || format === FORMATS.CODEX) {
    if (item.type === RESPONSES_ITEM.FUNCTION_CALL_OUTPUT || item.type === RESPONSES_ITEM.CUSTOM_TOOL_CALL_OUTPUT) return ROLE.TOOL;
    return item.role || null;
  }
  if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI || format === FORMATS.VERTEX) {
    return item.role === GEMINI_ROLE.MODEL ? ROLE.ASSISTANT : item.role || null;
  }
  return item.role || null;
}

function conversationArray(body, format) {
  if (!body || typeof body !== "object") return null;
  switch (format) {
    case FORMATS.CLAUDE:
      return Array.isArray(body.messages) ? { items: body.messages, key: "messages", format } : null;
    case FORMATS.GEMINI:
    case FORMATS.GEMINI_CLI:
    case FORMATS.VERTEX:
      return Array.isArray(body.contents) ? { items: body.contents, key: "contents", format } : null;
    case FORMATS.OPENAI_RESPONSES:
    case FORMATS.OPENAI_RESPONSE:
    case FORMATS.CODEX:
      return Array.isArray(body.input) ? { items: body.input, key: "input", format } : null;
    case FORMATS.ANTIGRAVITY:
      return Array.isArray(body?.request?.contents)
        ? { items: body.request.contents, key: "request.contents", format }
        : null;
    case FORMATS.KIRO: {
      // Kiro/AWS Q keeps the newest turn outside the replay history.
      const state = body?.conversationState;
      if (!state || !state.currentMessage) return null;
      const history = Array.isArray(state.history) ? state.history : [];
      return {
        items: [...history, state.currentMessage],
        key: "conversationState",
        format,
      };
    }
    default:
      return Array.isArray(body.messages) ? { items: body.messages, key: "messages", format } : null;
  }
}

// A user-shaped entry that only answers an earlier assistant tool call. It
// must travel with that call, so it never starts a new droppable unit.
function carriesToolResult(item, format) {
  if (!item || typeof item !== "object") return false;
  if (format === FORMATS.KIRO) {
    const results = item.userInputMessage?.userInputMessageContext?.toolResults;
    return Array.isArray(results) && results.length > 0;
  }
  if (format === FORMATS.CLAUDE) {
    if (item.role !== ROLE.USER || !Array.isArray(item.content)) return false;
    return item.content.some((block) => block?.type === CLAUDE_BLOCK.TOOL_RESULT);
  }
  return false;
}

// Split into units that may be dropped from the front without orphaning a tool
// result. System/developer preamble is returned separately and always kept.
/**
 * Keep only the newest complete turns for providers that advertise a huge
 * window (so the generic token guard never trims) but still suffer a slow
 * prefill when the whole transcript is replayed. System preamble stays, and
 * assistant tool calls remain attached to their tool results.
 */
export function capConversationHistory(body, format, maxTurns) {
  if (!maxTurns || maxTurns <= 0) return false;
  const responses = format === FORMATS.OPENAI_RESPONSES;
  const key = responses ? "input" : "messages";
  const items = body?.[key];
  if (!Array.isArray(items)) return false;
  const { preamble, units } = splitUnits(items, format);
  if (units.length <= maxTurns) return false;
  const notice = responses
    ? { type: "message", role: ROLE.USER, content: [{ type: "input_text", text: TRIM_NOTICE }] }
    : { role: ROLE.USER, content: TRIM_NOTICE };
  body[key] = [...preamble, notice, ...units.slice(-maxTurns).flat()];
  return true;
}

export function splitUnits(items, format) {
  const preamble = [];
  const units = [];
  let current = null;

  for (const item of items) {
    const role = roleOf(item, format);
    const startsTurn = role === ROLE.USER && !carriesToolResult(item, format);
    const isPreamble = role === ROLE.SYSTEM || role === ROLE.DEVELOPER;

    if (isPreamble && units.length === 0 && !current) {
      preamble.push(item);
      continue;
    }
    if (startsTurn || !current) {
      current = [item];
      units.push(current);
      continue;
    }
    current.push(item);
  }
  return { preamble, units };
}

function unitTokens(unit) {
  let total = MESSAGE_OVERHEAD_TOKENS;
  for (const item of unit) total += estimateTokens(item);
  return total;
}

// Byte guard for OpenAI chat JSON. Unlike token compaction, never shorten an
// individual message, media block, instruction or tool schema. Work on a copy:
// combo fallback must still receive the caller's original, complete history.
export function fitChatBodyToBytes(body, maxBytes, options = {}) {
  const serialized = JSON.stringify(body);
  const beforeBytes = Buffer.byteLength(serialized, "utf8");
  const unchanged = { body, serialized, beforeBytes, afterBytes: beforeBytes, removedGroups: 0, fits: beforeBytes <= maxBytes };
  if (unchanged.fits || !(options.enabled ?? CONTEXT_GUARD.enabled) || !Array.isArray(body?.messages)) return unchanged;

  const { preamble, units } = splitUnits(body.messages, FORMATS.OPENAI);
  const minKeep = options.minKeepMessages ?? CONTEXT_GUARD.minKeepMessages;
  let remaining = units.reduce((sum, unit) => sum + unit.length, 0);
  let maxRemove = 0;
  for (let i = 0; i < units.length - 1; i++) {
    if (remaining - units[i].length < minKeep) break;
    // Instructions occurring mid-conversation must not disappear either.
    if (units[i].some(item => item?.role === ROLE.SYSTEM || item?.role === ROLE.DEVELOPER)) break;
    remaining -= units[i].length;
    maxRemove++;
  }
  const candidate = removedGroups => {
    const nextBody = { ...body, messages: [
      ...preamble,
      { role: ROLE.USER, content: BODY_TRIM_NOTICE },
      ...units.slice(removedGroups).flat(),
    ] };
    const nextSerialized = JSON.stringify(nextBody);
    const afterBytes = Buffer.byteLength(nextSerialized, "utf8");
    return { body: nextBody, serialized: nextSerialized, beforeBytes, afterBytes, removedGroups, fits: afterBytes <= maxBytes };
  };
  if (!maxRemove) return unchanged;
  // Fixed notice size makes candidate byte sizes monotonic. Find the smallest
  // removable prefix in O(log turns) serializations, not a quadratic loop.
  let best = candidate(maxRemove);
  if (!best.fits) return unchanged;
  let low = 1, high = maxRemove;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const fit = candidate(middle);
    if (fit.fits) { best = fit; high = middle; }
    else low = middle + 1;
  }
  return best;
}

function systemTokens(preamble, body, format) {
  let total = 0;
  for (const item of preamble) total += estimateTokens(item) + MESSAGE_OVERHEAD_TOKENS;

  if (format === FORMATS.CLAUDE && body.system !== undefined) total += estimateTokens(body.system);
  if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI || format === FORMATS.VERTEX) {
    total += estimateTokens(body.systemInstruction) + estimateTokens(body.system_instruction);
  }
  if (format === FORMATS.ANTIGRAVITY) {
    total += estimateTokens(body?.request?.systemInstruction);
  }
  total += estimateTokens(body?.instructions);
  // Tool schemas are part of the prompt the upstream counts.
  total += estimateTokens(body?.tools);
  return total;
}

function setConversationArray(body, target, items) {
  if (target.key === "request.contents") {
    body.request.contents = items;
    return;
  }
  if (target.format === FORMATS.KIRO) {
    const next = Array.isArray(items) ? items.slice() : [];
    // The last entry is the current turn, the rest is replay history.
    const current = next.length > 0 && next[next.length - 1]?.userInputMessage
      ? next.pop()
      : null;
    body.conversationState.history = next;
    if (current) body.conversationState.currentMessage = current;
    return;
  }
  body[target.key] = items;
}

function trimSystemText(body, format, overflow) {
  const shrink = (value) => {
    if (typeof value !== "string" || value.length === 0) return value;
    const keep = Math.max(0, value.length - overflow * CHARS_PER_TOKEN);
    if (keep <= 0) return `[system prompt trimmed: ${overflow} tokens over budget]`;
    return `${value.slice(0, keep)}\n${TRIM_NOTICE}`;
  };

  if (format === FORMATS.CLAUDE && typeof body.system === "string") {
    body.system = shrink(body.system);
    return;
  }
  if (format === FORMATS.CLAUDE && Array.isArray(body.system)) {
    for (const block of body.system) {
      if (block && typeof block.text === "string") block.text = shrink(block.text);
    }
    return;
  }
  if (typeof body.instructions === "string") {
    body.instructions = shrink(body.instructions);
  }
}

const SUMMARY_STRING_LIMIT = 240;
const SUMMARY_MIN_TOKENS = 64;

// Collect readable text out of any provider-shaped message so the replaced
// turns can be condensed into a short transcript instead of vanishing.
function collectText(value, out, budgetChars) {
  if (out.chars >= budgetChars) return;
  if (typeof value === "string") {
    if (value.length === 0) return;
    if (Object.keys(MEDIA_TOKEN_COST).some((prefix) => value.startsWith(prefix))) return;
    const room = budgetChars - out.chars;
    if (room <= 0) return;
    const slice = value.length > SUMMARY_STRING_LIMIT ? value.slice(0, SUMMARY_STRING_LIMIT) : value;
    const text = slice.length > room ? slice.slice(0, room) : slice;
    out.parts.push(text.replace(/\s+/g, " ").trim());
    out.chars += text.length;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out, budgetChars);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectText(entry, out, budgetChars);
  }
}

function summarizeUnits(units, roleOfItem, maxChars) {
  const lines = [];
  let used = 0;
  for (const unit of units) {
    if (used >= maxChars) break;
    const label = roleOfItem(unit[0]) || ROLE.USER;
    const out = { parts: [], chars: 0 };
    collectText(unit, out, maxChars - used);
    const text = out.parts.join(" ").trim();
    if (!text) continue;
    const line = `- ${label}: ${text}`;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

// Last resort when even the newest turns alone exceed the window: the single
// oversized message (a pasted file, a huge tool result) is cut down instead of
// being sent as-is and rejected upstream. Short strings — ids, tool names,
// roles — are never touched.
const SHRINKABLE_MIN_CHARS = 1000;
const SHRUNK_SUFFIX = `\n${TRIM_NOTICE}`;
const SHRINK_SKIP_KEYS = new Set(["id", "role", "type", "name", "tool_call_id"]);

// Pure: returns a copy with long strings truncated, leaving the caller's
// messages untouched (the agent route reuses its history across steps).
function shrinkStrings(value, state, depth = 0) {
  if (state.chars <= 0 || depth > CONTEXT_SHRINK_MAX_DEPTH) return value;
  if (typeof value === "string") {
    if (value.length < SHRINKABLE_MIN_CHARS) return value;
    const cut = Math.min(value.length - SHRINKABLE_MIN_CHARS, Math.ceil(state.chars) + SHRUNK_SUFFIX.length);
    if (cut <= SHRUNK_SUFFIX.length) return value;
    state.chars -= cut - SHRUNK_SUFFIX.length;
    return `${value.slice(0, value.length - cut)}${SHRUNK_SUFFIX}`;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((entry) => {
      const next = shrinkStrings(entry, state, depth + 1);
      if (next !== entry) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (!value || typeof value !== "object") return value;

  let changed = false;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SHRINK_SKIP_KEYS.has(key)) {
      out[key] = entry;
      continue;
    }
    const next = shrinkStrings(entry, state, depth + 1);
    if (next !== entry) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}

/**
 * Shrink an outgoing body until its prompt fits the model's context window.
 *
 * @param {object} body - final (post-translate) request body, mutated in place
 * @param {string} format - FORMATS value of the body
 * @param {object} caps - capabilities of the target model
 * @param {{ratio?: number, compact?: boolean}} [options] - smaller ratio for a
 *   retry after the upstream rejected the prompt; compact condenses the dropped
 *   turns into a short transcript instead of dropping them silently
 * @returns {{trimmed: boolean, reason?: string, before: number, after: number, budget: number|null, removed: number, clampedOutput: boolean}}
 */
export function fitBodyToContext(body, format, caps, options = {}) {
  const result = { trimmed: false, reason: null, before: 0, after: 0, budget: null, removed: 0, clampedOutput: false };
  if (!CONTEXT_GUARD.enabled || !body || typeof body !== "object") return result;

  const ratio = Number.isFinite(options.ratio) && options.ratio > 0 ? options.ratio : CONTEXT_GUARD.inputRatio;
  const compact = options.compact !== false;

  try {
    const target = conversationArray(body, format);
    if (!target) {
      result.budget = resolveInputBudget(caps, null, ratio);
      return result;
    }

    const output = readOutputLimit(body);
    // A retry after an upstream "payload too large" rejection may need a budget
    // tighter than the advertised model window (some upstreams accept less
    // than they advertise). The caller passes that budget explicitly.
    const forcedBudget = Number(options.forceBudgetTokens);
    const budget = Number.isFinite(forcedBudget) && forcedBudget > 0
      ? Math.floor(forcedBudget)
      : resolveInputBudget(caps, output?.value ?? null, ratio);
    result.budget = budget;
    if (!Number.isFinite(budget) || budget <= 0) return result;

    const { preamble, units } = splitUnits(target.items, format);
    const fixed = systemTokens(preamble, body, format);

    let total = fixed;
    const sizes = units.map((unit) => {
      const size = unitTokens(unit);
      total += size;
      return size;
    });
    result.before = total;
    result.after = total;

    // Output cap: never ask for more tokens than the window can still hold.
    if (output && output.value >= budget) {
      const clamped = Math.max(1024, Math.floor(budget * 0.25));
      writeOutputLimit(body, output.field, clamped);
      result.clampedOutput = true;
    }

    const overflow = total - budget;
    if (overflow <= 0) return result;

    // Reserve the space the notice itself takes, so the trimmed body really
    // ends up inside the budget instead of just short of it. When compacting,
    // also leave room for the condensed transcript of the dropped turns.
    const minimalNotice = [{ role: ROLE.USER, content: TRIM_NOTICE }];
    const noticeTokens = unitTokens(minimalNotice);
    const summaryBudget = compact
      ? Math.min(Math.floor(CONTEXT_GUARD.anchorChars / CHARS_PER_TOKEN), Math.floor(budget * 0.25))
      : 0;

    // Drop whole oldest turns, never a single message of a turn: an assistant
    // tool call must keep its tool results or every provider rejects the body.
    // Kiro also keeps its newest turn outside the history array, so at least
    // one unit must survive to become `currentMessage` again.
    const keep = Math.max(
      format === FORMATS.KIRO ? Math.max(CONTEXT_GUARD.minKeepMessages, 1) : CONTEXT_GUARD.minKeepMessages,
      0,
    );
    let dropped = 0;
    let sizeDropped = 0;
    const dropTarget = budget - noticeTokens - summaryBudget;
    while (dropped < units.length - keep && total - sizeDropped > dropTarget) {
      sizeDropped += sizes[dropped];
      dropped += 1;
    }

    if (dropped === 0) {
      // Every remaining turn is newer than the keep floor, so the oversized
      // payload is inside the newest turns or the tool schemas: cut it down in
      // place instead of sending a body the upstream will reject. Copies are
      // used so the caller's original messages stay intact.
      const shrinkState = { chars: Math.ceil(overflow * CHARS_PER_TOKEN) };
      if (Array.isArray(body.tools)) body.tools = shrinkStrings(body.tools, shrinkState);
      const shrunkItems = shrinkStrings(target.items, shrinkState);
      if (shrunkItems !== target.items) {
        target.items = shrunkItems;
        setConversationArray(body, target, shrunkItems);
      }
      if (shrinkState.chars > 0) trimSystemText(body, format, overflow);
      const resized = splitUnits(target.items, format);
      let resizedTotal = systemTokens(resized.preamble, body, format);
      for (const unit of resized.units) resizedTotal += unitTokens(unit);
      result.trimmed = resizedTotal < result.before;
      result.reason = result.trimmed ? "in-place-shrink" : "system-overflow";
      result.after = resizedTotal;
      return result;
    }

    // Compact: the dropped turns become a short transcript so the model keeps
    // the thread of the task (files, errors, decisions) after the trim.
    let noticeText = TRIM_NOTICE;
    let after = total - sizeDropped + noticeTokens;
    if (compact) {
      const headingTokens = countStringTokens(COMPACT_NOTICE);
      const available = budget - (total - sizeDropped) - MESSAGE_OVERHEAD_TOKENS - headingTokens;
      const summaryChars = Math.min(
        CONTEXT_GUARD.anchorChars,
        Math.floor(Math.max(0, available) * CHARS_PER_TOKEN * 0.9),
      );
      if (available >= SUMMARY_MIN_TOKENS && summaryChars > 0) {
        const summary = summarizeUnits(units.slice(0, dropped), (item) => roleOf(item, format), summaryChars);
        if (summary) {
          noticeText = `${COMPACT_NOTICE}\n${summary}`;
          after = total - sizeDropped + unitTokens([{ role: ROLE.USER, content: noticeText }]);
        }
      }
    }

    let kept = units.slice(dropped).flat();
    const notice = {
      role: ROLE.USER,
      content: noticeText,
    };
    if (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI || format === FORMATS.VERTEX) {
      notice.role = GEMINI_ROLE.USER;
      notice.parts = [{ text: noticeText }];
      delete notice.content;
    } else if (format === FORMATS.OPENAI_RESPONSES || format === FORMATS.OPENAI_RESPONSE || format === FORMATS.CODEX) {
      notice.content = [{ type: "input_text", text: noticeText }];
    }

    // The newest turns can still exceed the budget on their own — a huge tool
    // result, a pasted file, a big diff. Dropping them would drop the user's
    // actual question, so cut their long strings instead. (Upstreams with a
    // payload cap tighter than the advertised window, e.g. Kiro, land here.)
    if (after > budget) {
      const shrinkState = { chars: Math.ceil((after - budget) * CHARS_PER_TOKEN) };
      if (Array.isArray(body.tools)) body.tools = shrinkStrings(body.tools, shrinkState);
      const shrunkKept = shrinkStrings(kept, shrinkState);
      if (shrunkKept !== kept) {
        kept = shrunkKept;
        let resized = systemTokens(preamble, body, format) + unitTokens([{ role: ROLE.USER, content: noticeText }]);
        for (const item of kept) resized += estimateTokens(item) + MESSAGE_OVERHEAD_TOKENS;
        after = resized;
      }
    }

    // Gemini rejects two user turns in a row, so the summary is folded into the
    // first kept user turn instead of being inserted as its own content entry.
    if (
      (format === FORMATS.GEMINI || format === FORMATS.GEMINI_CLI || format === FORMATS.VERTEX) &&
      kept.length > 0 &&
      roleOf(kept[0], format) === ROLE.USER
    ) {
      const head = kept[0];
      if (Array.isArray(head.parts)) {
        head.parts = [{ text: noticeText }, ...head.parts];
      } else {
        head.parts = [{ text: noticeText }];
      }
      setConversationArray(body, target, [...preamble, ...kept]);
    } else if (format === FORMATS.KIRO && kept.length > 0 && kept[0].userInputMessage) {
      // Kiro requires alternating user/assistant turns; a standalone notice
      // would create two user turns in a row, so prefix the first kept turn.
      const head = kept[0].userInputMessage;
      head.content = head.content ? `${noticeText}\n\n${head.content}` : noticeText;
      // Ensure modelId is preserved on the head turn so Kiro schema validation passes
      if (!head.modelId && body?.conversationState?.currentMessage?.userInputMessage?.modelId) {
        head.modelId = body.conversationState.currentMessage.userInputMessage.modelId;
      }
      setConversationArray(body, target, [...preamble, ...kept]);
    } else {
      setConversationArray(body, target, [...preamble, notice, ...kept]);
    }
    result.trimmed = true;
    result.removed = dropped;
    result.reason = compact && noticeText !== TRIM_NOTICE ? "messages-compacted" : "messages-trimmed";
    result.after = after;
    return result;
  } catch {
    return result;
  }
}
