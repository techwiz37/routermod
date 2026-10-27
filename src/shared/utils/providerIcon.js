
const ICON_ALIASES = {
  "perplexity-agent": "perplexity",
  "gitlab-duo": "gitlab",
  "vercel-ai-gateway": "vercel",
  "ollama-search": "ollama",
  "minimax-code": "minimax",
  "minimax-code-global": "minimax",
};

function dynamicCompatibleIconId(providerId) {
  if (typeof providerId !== "string") return null;
  const lower = providerId.toLowerCase();
  if (lower.startsWith("openai-compatible-chat-")) return "oai-cc";
  if (lower.startsWith("openai-compatible-responses-")) return "oai-r";
  if (lower.startsWith("openai-compatible-")) return "openai";
  if (lower.startsWith("anthropic-compatible-")) return "anthropic-m";
  if (lower.startsWith("custom-embedding-")) return "selfhosted-embedding";
  return null;
}

const failedIds = new Set();

function normalizeId(providerId) {
  if (!providerId || typeof providerId !== "string") return "";
  return providerId.trim().toLowerCase();
}

export function resolveProviderIconId(providerId) {
  const id = normalizeId(providerId);
  if (!id) return "";
  const dynamic = dynamicCompatibleIconId(id);
  if (dynamic) return dynamic;
  if (failedIds.has(id)) return "";
  const aliased = ICON_ALIASES[id] || id;
  if (failedIds.has(aliased)) return "";
  return aliased;
}

export function getProviderIconSrc(providerId) {
  const id = resolveProviderIconId(providerId);
  return id ? `/providers/${id}.png` : null;
}

export function markProviderIconMissing(providerId) {
  const id = normalizeId(providerId);
  if (!id) return;
  if (failedIds.has(id)) return;
  const aliased = ICON_ALIASES[id];
  const resolved = dynamicCompatibleIconId(id) || aliased || id;
  if (aliased || dynamicCompatibleIconId(id)) failedIds.add(id);
  failedIds.add(resolved);
}

export function getCompatibleIconSrc(providerId) {
  const dynamic = dynamicCompatibleIconId(providerId);
  return dynamic ? `/providers/${dynamic}.png` : null;
}

export function getDynamicProviderName(providerId) {
  if (typeof providerId !== "string") return null;
  const lower = providerId.toLowerCase();
  if (lower.startsWith("openai-compatible-responses-")) return "OpenAI Compatible (Responses)";
  if (lower.startsWith("openai-compatible-")) return "OpenAI Compatible";
  if (lower.startsWith("anthropic-compatible-")) return "Anthropic Compatible";
  if (lower.startsWith("custom-embedding-")) return "Custom Embedding";
  return null;
}
