/**
 * Prompt injection engine.
 *
 * A request can receive at most three injections, applied in this order:
 *   global -> per API key (user) -> per model
 *
 * Each injection is either a single system prompt (prepended or appended) or a
 * chat script (a fake conversation inserted before the real messages). The
 * injector is wire-aware (OpenAI chat, Claude/Gemini `system`, Responses
 * `instructions`), idempotent on retries, and fails open: a broken injection
 * never breaks the chat.
 */

export const INJECTION_MODES = ["system", "script"];
export const INJECTION_POSITIONS = ["prepend", "append"];

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const enabled = entry.enabled !== false;
  if (!enabled) return null;
  const mode = INJECTION_MODES.includes(entry.mode) ? entry.mode : "system";
  const position = INJECTION_POSITIONS.includes(entry.position) ? entry.position : "prepend";
  const text = typeof entry.text === "string" ? entry.text.trim() : "";
  const script = Array.isArray(entry.script)
    ? entry.script
        .filter((turn) => turn && typeof turn.content === "string" && turn.content.trim())
        .map((turn) => ({
          role: turn.role === "assistant" ? "assistant" : "user",
          content: turn.content.trim(),
        }))
    : [];
  if (mode === "system" && !text) return null;
  if (mode === "script" && script.length === 0) return null;
  return { mode, position, text, script };
}

function lookupModelEntry(map, providerKeys, modelCandidates) {
  if (!map || typeof map !== "object") return null;
  for (const pKey of providerKeys) {
    for (const mKey of modelCandidates) {
      const entry = map[`${pKey}/${mKey}`];
      if (entry) return entry;
    }
  }
  return null;
}

// Legacy per-model prompts are stored as plain strings in
// `providerModelSystemPrompts`; treat them as a prepended system prompt.
function lookupLegacyModelPrompt(map, providerKeys, modelCandidates) {
  if (!map || typeof map !== "object") return null;
  for (const pKey of providerKeys) {
    for (const mKey of modelCandidates) {
      const value = map[`${pKey}/${mKey}`];
      if (typeof value === "string" && value.trim()) {
        return { mode: "system", position: "prepend", text: value.trim(), script: [] };
      }
    }
  }
  return null;
}

/**
 * Collects the injections that apply to one request, ordered global -> user ->
 * model. Missing or malformed entries are skipped.
 */
export function resolveInjections({ settings, providerKeys = [], modelCandidates = [], apiKeyId = null }) {
  const out = [];
  try {
    const globalEntry = normalizeEntry(settings?.promptInjectionGlobal);
    if (globalEntry) out.push({ scope: "global", ...globalEntry });

    if (apiKeyId) {
      const keyEntry = normalizeEntry(settings?.promptInjectionKeys?.[apiKeyId]);
      if (keyEntry) out.push({ scope: "user", ...keyEntry });
    }

    const modelEntry = normalizeEntry(
      lookupModelEntry(settings?.promptInjectionModels, providerKeys, modelCandidates)
    ) || normalizeEntry(
      lookupLegacyModelPrompt(settings?.providerModelSystemPrompts, providerKeys, modelCandidates)
    );
    if (modelEntry) out.push({ scope: "model", ...modelEntry });
  } catch {
    // fail open
  }
  return out.slice(0, 3);
}

function appendToSystemField(body, text, position) {
  const join = (current) => (position === "prepend" ? `${text}\n\n${current}` : `${current}\n\n${text}`);

  // Responses API uses `instructions`; only touch it when the body already
  // speaks that wire format (or has no messages at all).
  if (typeof body.instructions === "string") {
    body.instructions = body.instructions ? join(body.instructions) : text;
    return true;
  }
  if (typeof body.system === "string") {
    body.system = body.system ? join(body.system) : text;
    return true;
  }
  if (Array.isArray(body.system)) {
    const part = { type: "text", text };
    body.system = position === "prepend" ? [part, ...body.system] : [...body.system, part];
    return true;
  }
  if (!Array.isArray(body.messages) && body.instructions === undefined) {
    body.instructions = text;
    return true;
  }
  return false;
}

function applySystemPrompt(body, text, position) {
  if (appendToSystemField(body, text, position)) return;

  if (!Array.isArray(body.messages)) {
    body.messages = [];
  }
  const messages = body.messages;
  const systemIndex = messages.findIndex((m) => m?.role === "system");

  if (systemIndex === -1) {
    if (position === "prepend") messages.unshift({ role: "system", content: text });
    else messages.push({ role: "system", content: text });
    return;
  }

  const target = messages[systemIndex];
  if (typeof target.content === "string") {
    target.content = target.content
      ? position === "prepend"
        ? `${text}\n\n${target.content}`
        : `${target.content}\n\n${text}`
      : text;
  } else if (Array.isArray(target.content)) {
    const part = { type: "text", text };
    target.content = position === "prepend" ? [part, ...target.content] : [...target.content, part];
  } else {
    target.content = text;
  }
}

function applyScript(body, script, position) {
  if (!Array.isArray(body.messages)) body.messages = [];
  const turns = script.map((turn) => ({ role: turn.role, content: turn.content }));
  if (position === "prepend") {
    body.messages = [...turns, ...body.messages];
  } else {
    body.messages = [...body.messages, ...turns];
  }
}

/**
 * Applies every resolved injection to a request body. Returns a new body; the
 * input is never mutated. Idempotent: a body already marked as injected is
 * returned untouched.
 */
export function applyInjections(body, injections) {
  if (!body || typeof body !== "object") return body;
  if (!Array.isArray(injections) || injections.length === 0) return body;
  if (body.__promptInjected === true) return body;

  try {
    const next = { ...body, messages: Array.isArray(body.messages) ? body.messages.map((m) => ({ ...m })) : body.messages };
    for (const injection of injections) {
      if (injection.mode === "script") applyScript(next, injection.script, injection.position);
      else applySystemPrompt(next, injection.text, injection.position);
    }
    // Keep the idempotency marker internal. It must never be serialized into
    // an upstream provider request as an unsupported vendor parameter.
    Object.defineProperty(next, "__promptInjected", {
      value: true,
      enumerable: false,
      configurable: true,
    });
    return next;
  } catch {
    return body;
  }
}
