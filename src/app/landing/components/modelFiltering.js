// Pure helpers for the public model catalogue. Kept framework-free so the
// filter rules can be reasoned about without rendering the page.

// The live probe calls /v1/chat/completions with a plain text prompt. Probing
// non-chat kinds (stt, embedding, ...) only produces guaranteed failures.
export const PROBEABLE_KINDS = new Set(["llm"]);
// Recommendations must cover the whole public catalogue, not just the models
// that already have traffic history — otherwise newly added free providers
// (FreePi, Solana, OpenCode) are never probed and can never be recommended.
// The server caps each batch and dedupes/caches repeated taps.
export const MAX_LIVE_PROBES = 0; // 0 = no client-side cap

export function recommendationScore(model) {
  const requests = Number(model?.stats?.requests) || 0;
  const successes = Number(model?.stats?.successes) || 0;
  const successRate = Number(model?.stats?.successRate) || 0;
  if (requests <= 0 || successRate <= 0) return 0;
  return successes * (successRate / 100);
}

export function hasSuccessfulTelemetry(model) {
  const requests = Number(model?.stats?.requests) || 0;
  const successes = Number(model?.stats?.successes) || 0;
  const successRate = Number(model?.stats?.successRate) || 0;
  return requests > 0 && successes > 0 && successRate > 0;
}

export function liveProbeCandidates(models, limit = MAX_LIVE_PROBES) {
  const all = (models || [])
    .filter((model) => model && typeof model.id === "string" && PROBEABLE_KINDS.has(model.kind || "llm"))
    .slice()
    .sort((a, b) => recommendationScore(b) - recommendationScore(a) || a.name.localeCompare(b.name));
  return (limit > 0 ? all.slice(0, limit) : all).map((model) => model.id);
}

/**
 * A recommendation is either a model that answered the live probe or one with
 * a proven success record in traffic data. When the probe fails outright (or
 * finds zero passing models) we fall back to the whole base list instead of
 * blanking a healthy catalogue — that is the bug this helper exists to prevent.
 */
export function selectRecommendedModels(models, liveCheck) {
  const status = liveCheck?.status;
  const results = liveCheck?.data || {};

  // While probing, show nothing rather than a stale list that may contain
  // models about to fail. The UI shows a "testing" badge in this window and
  // swaps in the real live results as soon as the probe finishes.
  if (status === "running" || status === "idle") {
    return { models: [], usedFallback: false };
  }

  // Probe completed: trust the live results. A model that answered "ok" is a
  // recommendation; every other status (error/timeout/no_response) is dropped.
  if (status === "ready") {
    const recommended = (models || []).filter((model) => results[model.id]?.status === "ok");
    if (recommended.length > 0) return { models: recommended, usedFallback: false };
    // Zero live successes but the probe worked — fall back to telemetry so a
    // healthy catalogue isn't blanked by a transient upstream outage.
    const fallback = (models || []).filter(hasSuccessfulTelemetry);
    return { models: fallback, usedFallback: fallback.length > 0 };
  }

  // Probe failed outright (network/HTTP error): no live evidence either way.
  const fallback = (models || []).filter(hasSuccessfulTelemetry);
  return { models: fallback, usedFallback: fallback.length > 0 };
}
