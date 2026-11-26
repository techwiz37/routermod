import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";

/**
 * Live OpenCode Free catalogue with a short in-process cache.
 *
 * The OpenCode CLI reads https://opencode.ai/zen/v1/models on every launch, so
 * RouterMod must follow the same source for new/removed free models. public
 * /v1/models deliberately skips slow dynamic provider discovery — OpenCode is
 * public, fast and cached here, so it is safe to include on the fast path.
 */

const CATALOG_URL = "https://opencode.ai/zen/v1/models";
const TTL_MS = 10 * 60 * 1000;
let cache = { data: null, expiresAt: 0 };

function seededIds() {
  const alias = PROVIDER_ID_TO_ALIAS?.opencode || "oc";
  return new Set((PROVIDER_MODELS[alias] || PROVIDER_MODELS.oc || []).map((m) => m.id));
}

export async function getLiveOpenCodeFreeModels() {
  if (cache.data && Date.now() < cache.expiresAt) return cache.data;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(CATALOG_URL, {
      headers: { "User-Agent": "opencode/2.2.7", Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    const list = Array.isArray(json?.data) ? json.data : [];
    const seeded = seededIds();
    const isFree = (id) => /-free$/.test(id) || seeded.has(id);
    const models = list
      .map((m) => (typeof m === "string" ? m : m?.id))
      .filter((id) => typeof id === "string" && id.trim() !== "" && isFree(id))
      .map((id) => ({ id, name: id }));

    if (!models.length) throw new Error("empty catalogue");
    cache = { data: models, expiresAt: Date.now() + TTL_MS };
    return models;
  } catch {
    // Stale cache is better than an empty list when the catalogue is briefly
    // unreachable; fall back to the seeded registry only on a cold failure.
    if (cache.data) return cache.data;
    return [...seededIds()].map((id) => ({ id, name: id }));
  }
}
