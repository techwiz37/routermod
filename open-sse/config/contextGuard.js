// Context guard — keeps an outgoing prompt inside the target model's real
// context window instead of failing upstream with a 400 "prompt too long".
//
// The guard is fail-open: if it cannot reason about a body shape it does
// nothing. Env overrides:
//   CONTEXT_GUARD=off                disable entirely
//   CONTEXT_GUARD_RATIO=0.9          fraction of the window the prompt may use
//   CONTEXT_GUARD_RESERVE=512         tokens kept free for framing overhead
//   CONTEXT_GUARD_MIN_KEEP=2          newest non-system messages always kept
//   CONTEXT_GUARD_RETRY_RATIO=0.7     ratio used when the upstream rejects a prompt
//   CONTEXT_GUARD_MAX_RETRY=2         retries after an upstream context overflow
//   CONTEXT_GUARD_ANCHOR_CHARS=4000   chars of the original request kept as a summary

function envNumber(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export const CONTEXT_GUARD = {
  enabled: String(process.env.CONTEXT_GUARD || "").toLowerCase() !== "off",
  inputRatio: Math.min(Math.max(envNumber("CONTEXT_GUARD_RATIO", 0.9), 0.3), 1),
  reserveTokens: Math.floor(envNumber("CONTEXT_GUARD_RESERVE", 512)),
  minKeepMessages: Math.floor(envNumber("CONTEXT_GUARD_MIN_KEEP", 2)),
  retryRatio: Math.min(Math.max(envNumber("CONTEXT_GUARD_RETRY_RATIO", 0.7), 0.2), 1),
  maxRetry: Math.floor(envNumber("CONTEXT_GUARD_MAX_RETRY", 2)),
  anchorChars: Math.floor(envNumber("CONTEXT_GUARD_ANCHOR_CHARS", 4000)),
};

// Average bytes per token used by the estimator below. Latin prose/code packs
// ~3.6 chars per token; CJK and emoji are counted per character in the
// estimator, so only the non-CJK share uses this divisor.
export const CHARS_PER_TOKEN = 3.6;

// Fixed costs for inline media, which would otherwise be counted as millions of
// characters of base64 and skew the estimate for the whole conversation.
export const MEDIA_TOKEN_COST = {
  "data:image/": 1600,
  "data:audio/": 2400,
  "data:video/": 8000,
  "data:application/pdf": 6000,
};

export const TRIM_NOTICE =
  "[Earlier messages were trimmed so the conversation fits this model's context window.]";

// Header used when the dropped turns are replaced by a compact summary instead
// of being lost: the model keeps the gist of the conversation (files touched,
// errors seen, decisions taken) while the token count drops to the window.
export const COMPACT_NOTICE =
  "[Earlier messages were compacted so the conversation fits this model's context window. Condensed transcript of the replaced turns:]";

// Human-readable wording of why a prompt had to be shrunk, keyed by the reason
// reported by fitBodyToContext. Kept here so the handler stays config-driven.
export const CONTEXT_FIT_REASON = {
  "messages-compacted": "oldest turns replaced by a condensed transcript",
  "messages-trimmed": "oldest turns dropped",
  "in-place-shrink": "oversized message/tool payload shortened",
  "system-overflow": "system prompt or tool schemas shortened",
};
