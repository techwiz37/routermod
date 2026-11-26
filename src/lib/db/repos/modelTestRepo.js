import { makeKv } from "../helpers/kvStore.js";
import { modelTestKey } from "../../../shared/utils/modelTestIdentity.js";

const results = makeKv("modelTestResults");

export async function getModelTestResults() {
  return results.getAll();
}

export async function saveSuccessfulModelTest(model, kind, result) {
  if (result?.ok !== true || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) return null;
  const saved = {
    model, kind: kind || "llm", latencyMs: Math.round(result.latencyMs),
    ...(Number.isFinite(result.tps) && result.tps > 0 ? { tps: Math.round(result.tps * 10) / 10 } : {}),
    ...(Number.isFinite(result.outputTokens) && result.outputTokens > 0 ? { outputTokens: Math.round(result.outputTokens) } : {}),
    testedAt: new Date().toISOString(),
  };
  await results.set(modelTestKey(model, kind), saved);
  return saved;
}

export async function deleteModelTestResult(model, kind = "llm") {
  await results.remove(modelTestKey(model, kind));
}
