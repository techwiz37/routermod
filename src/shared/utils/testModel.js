export async function testModel(model, kind = "llm") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  const startedAt = performance.now();
  try {
    const response = await fetch("/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, kind }),
      signal: controller.signal,
    });
    const result = await response.json();
    const latencyMs = typeof result.latencyMs === "number" && Number.isFinite(result.latencyMs) && result.latencyMs >= 0
      ? result.latencyMs
      : performance.now() - startedAt;
    const next = { ...result, latencyMs, ok: response.ok && result.ok === true };
    if (next.ok) rememberModelTest(model, kind, next);
    return next;
  } catch (error) {
    return { ok: false, error: error.name === "AbortError" ? "No response within 60 seconds" : "Network error" };
  } finally {
    clearTimeout(timeout);
  }
}
import { rememberModelTest } from "@/store/modelTestStore";
