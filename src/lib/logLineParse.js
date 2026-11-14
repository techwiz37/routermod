// Parse one captured console entry into the parts the Console Log panel
// renders MatLog-style: time, level badge, short tag, session dot, message.
// The logger's line shapes:
//
//   [23:13:18] ℹ️  [COMBO] trying model 1 of 2: ...
//   [23:13:18] 🟢 ▶ POST dpsk_un → dahl/... · stream · key Key 45
//   [23:13:18] 🔴 ✗ ERROR 402 · dahl/... · quota exhausted · 2.6s
//   [23:13:18] ⚪ 📊 done · 1.3s · in 45,231 · out 87
//   ❌ dahl [402]: quota exhausted
//
// Anything unrecognized degrades to a neutral row carrying the raw text,
// so no console output is ever lost or hidden by the parser.

const ANSI_RE = /\x1b\[[0-9;]*m/g;

const DOT_COLORS = {
  "🟢": "#22c55e",
  "🔵": "#3b82f6",
  "🟣": "#a855f7",
  "🟡": "#eab308",
  "🟠": "#f97316",
  "🔴": "#ef4444",
  "⚪": "#e5e7eb",
  "🟤": "#b45309",
};

const SYMBOL_TAGS = {
  "▶": "REQ",
  "✗": "ERR",
  "📊": "DONE",
  "⚙": "PRO",
  "📥": "HTTP",
  "📤": "HTTP",
  "💥": "ERR",
  "🌊": "STREAM",
};

// Leftover pictographs (e.g. "✅", "🚀") are noise once the level badge
// and tag carry the meaning.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

export function parseConsoleLine(raw, fallback = {}) {
  const text = String(raw ?? "").replace(ANSI_RE, "");
  const [firstLine = "", ...restLines] = text.split("\n");
  let rest = firstLine.trim();
  let time = "";

  const timeMatch = rest.match(/^\[(\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?\]\s*/);
  if (timeMatch) {
    time = timeMatch[1];
    rest = rest.slice(timeMatch[0].length);
  }

  // Session dot (logger line()/errorLine()): same request → same color.
  let dot = "";
  for (const [emoji, hex] of Object.entries(DOT_COLORS)) {
    if (rest.startsWith(emoji)) {
      dot = hex;
      rest = rest.slice(emoji.length).trimStart();
      break;
    }
  }

  // Level icons from the tag logger (info/warn/error/debug).
  let level = "";
  if (/^ℹ️?/.test(rest)) { level = "I"; rest = rest.replace(/^ℹ️?\s*/, ""); }
  else if (/^⚠️?/.test(rest)) { level = "W"; rest = rest.replace(/^⚠️?\s*/, ""); }
  else if (rest.startsWith("❌")) { level = "E"; rest = rest.replace(/^❌\s*/, ""); }
  else if (rest.startsWith("🔍")) { level = "D"; rest = rest.replace(/^🔍\s*/, ""); }

  // Symbol from line()/errorLine() and the request/response loggers.
  let symbol = "";
  const symMatch = rest.match(/^(▶|✗|📊|⚙|✔|📥|📤|💥|🌊)\s*/u);
  if (symMatch) {
    symbol = symMatch[1];
    rest = rest.slice(symMatch[0].length);
  }

  // [TAG] from the tag logger, when present.
  let tag = "";
  const tagMatch = rest.match(/^\[([A-Za-z0-9_. -]{1,24})\]\s*/);
  if (tagMatch) {
    tag = tagMatch[1].toUpperCase();
    rest = rest.slice(tagMatch[0].length);
  }

  // Plain console.error shape: "dahl [402]: quota exhausted" — the
  // provider becomes the tag so the row stays scannable.
  if (!tag) {
    const provMatch = rest.match(/^([A-Za-z0-9_-]+) \[(\d{3})\]:\s*(.*)$/);
    if (provMatch) {
      tag = provMatch[1].toUpperCase();
      rest = `${provMatch[2]} · ${provMatch[3]}`;
    }
  }

  if (!tag && symbol) tag = SYMBOL_TAGS[symbol] || "";

  if (!level) {
    if (symbol === "✗" || symbol === "💥" || /^ERROR\b/.test(rest)) level = "E";
    else if (fallback.level === "ERROR") level = "E";
    else if (fallback.level === "WARN") level = "W";
    else if (fallback.level === "DEBUG") level = "D";
    else if (symbol === "📊" || symbol === "✔") level = "✓";
    else if (symbol || dot || tag) level = "I";
    else level = "·";
  }

  const message = rest.replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").trim();
  const details = restLines.join("\n").replace(/[ \t]+$/gm, "").trim();

  return {
    time: time || String(fallback.time || "").slice(0, 8),
    level,
    tag,
    dot,
    message: message || firstLine.trim(),
    details,
  };
}

// Tags that are NOT provider calls: credential maintenance (the background
// refresh that spams the panel when a credential is dead), auth/system/quota
// bookkeeping. Everything else with a tag — COMBO, CHAT, REQ, DONE, ERR,
// routing/fetch/fallback, modality calls, provider names from the
// "NAME [402]:" shape — is call traffic.
const NON_CALL_TAGS = new Set([
  "TOKEN_REFRESH",
  "TOKEN",
  "BG_TOKEN_REFRESH",
  "AUTH",
  "SYSTEMONE",
  "QUOTA",
  "AG_QUOTA",
  "LIMIT",
  "TUNNEL",
  "BG_HEALTH",
]);

// Provider-call view: keep per-request rows (session dot) and call tags;
// server HTTP rows count only when they are the router's own chat API;
// untagged system noise is dropped.
export function isProviderCallParsed(p) {
  if (p.dot) return true;
  if (p.tag === "HTTP") return /\/v1\/(chat\/completions|messages|responses)/.test(p.message);
  if (!p.tag) return false;
  if (NON_CALL_TAGS.has(p.tag)) return false;
  return true;
}

export function isProviderCallLine(raw) {
  return isProviderCallParsed(parseConsoleLine(raw));
}
