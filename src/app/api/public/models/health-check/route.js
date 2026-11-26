import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { GET as getPublicModels } from "../route.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Probe the entire public catalogue when the recommendations filter is used.
// Free providers have no traffic history, so capping to the top-40 telemetry
// models hid them permanently. Batching + caching keep repeated taps cheap.
// Probe at most this many chat models per batch. 40s each / 8 concurrent ≈
// a few minutes worst case; the UI shows progress while it runs.
const MAX_MODELS = 200;
// Low concurrency + generous timeout: free lanes (OpenCode) get overwhelmed by
// 16 parallel probes, and each 429 triggers a WARP hop that stalls the batch.
// Keep the probe gentle — it is a health check, not real traffic.
const CONCURRENCY = Number(process.env.MODEL_HEALTH_CONCURRENCY) || 16;
// Hard cap per model. A single slow provider must never keep the catalogue in
// "Testing models…" indefinitely. Free lanes may still pass within this window
// (WARP rotation typically answers in ~2-20s); slower ones are reported as
// timeouts and simply excluded from recommendations.
const TIMEOUT_MS = Number(process.env.MODEL_HEALTH_TIMEOUT_MS) || 40_000;
const CACHE_TTL_MS = 5 * 60_000;
const TEST_PROMPT = "Hi";

// Public visitors share one cached result per candidate set, so tapping the
// filter repeatedly cannot turn this into a free upstream traffic generator.
let cached = { key: "", at: 0, payload: null };
let inFlight = { key: "", promise: null };

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:1337";
}

async function resolveAuthHeader() {
  const keys = await getApiKeys();
  const now = Date.now();
  const usable = (keys || []).filter((key) => {
    if (key.isActive === false || key.maintenanceEnabled) return false;
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= now) return false;
    return typeof key.key === "string" && key.key.length > 0;
  });
  // No usable key: local mode needs no Authorization; otherwise every probe
  // will be rejected and the UI will fall back to traffic-based recommendations.
  return usable.length > 0 ? `Bearer ${usable[0].key}` : null;
}

async function pingModel(modelId, authHeader) {
  const startedAt = Date.now();
  const controller = new AbortController();
  // One uniform cap for every model — no provider gets an unbounded probe.
  const budgetMs = TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), budgetMs);
  try {
    const headers = { "Content-Type": "application/json", "x-routermod-health-probe": "1" };
    if (authHeader) headers.Authorization = authHeader;
    const response = await fetch(`${baseUrl()}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: TEST_PROMPT }],
        stream: true,
        max_tokens: 10,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { model: modelId, status: "error", ttft: null, error: `HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ""}` };
    }
    const reader = response.body?.getReader?.();
    if (!reader) return { model: modelId, status: "no_response", ttft: null, error: "No readable stream" };
    const decoder = new TextDecoder();
    let ttft = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (decoder.decode(value, { stream: true }).includes("data:")) {
          ttft = Date.now() - startedAt;
          break;
        }
      }
    } catch {
      // A stream error after the first chunk still means the model answered.
    }
    return ttft === null
      ? { model: modelId, status: "no_response", ttft: null, error: "No token received" }
      : { model: modelId, status: "ok", ttft, error: null };
  } catch (error) {
    return error?.name === "AbortError"
      ? { model: modelId, status: "timeout", ttft: null, error: `Timeout after ${budgetMs / 1000}s` }
      : { model: modelId, status: "error", ttft: null, error: error?.message || "Unknown error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function probeModels(models, authHeader, { onProbe, onResult } = {}) {
  const results = new Array(models.length);
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < models.length) {
      const index = cursor++;
      const modelId = models[index];
      onProbe?.(modelId, index + 1);
      const result = await pingModel(modelId, authHeader);
      results[index] = result;
      completed += 1;
      onResult?.(result, completed);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker));
  return results;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const catalogueResponse = await getPublicModels();
    const catalogue = await catalogueResponse.json();
    if (!Array.isArray(catalogue.models)) {
      return NextResponse.json({ error: "catalogue_unavailable" }, { status: 503 });
    }

    // Only probe models that are actually in the public catalogue, and only
    // chat models — arbitrary IDs / non-chat kinds must be ignored.
    const allowed = new Map(catalogue.models.map((model) => [model.id, model.kind]));
    const requested = Array.isArray(body?.models) ? body.models : [];
    const models = [...new Set(requested.filter(
      (id) => typeof id === "string" && allowed.get(id) === "llm",
    ))].slice(0, MAX_MODELS);

    if (models.length === 0) {
      return NextResponse.json({ results: [], timestamp: Date.now(), summary: { total: 0, success: 0, failed: 0 } });
    }

    const key = [...models].sort().join("|");
    // Streaming progress: the catalogue probe can run for minutes, so the UI
    // needs "n / total" plus the model currently being tested instead of one
    // silent request. `stream: true` opts in; default stays plain JSON.
    if (body?.stream === true) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (payload) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          send({ type: "start", total: models.length });
          try {
            if (cached.key === key && Date.now() - cached.at < CACHE_TTL_MS) {
              for (const result of cached.payload.results) send({ type: "result", result, done: null, total: models.length });
              send({ type: "done", ...cached.payload });
              return;
            }
            const shared = inFlight.key === key ? inFlight.promise : null;
            if (shared) {
              const payload = await shared;
              for (const result of payload.results) send({ type: "result", result, done: null, total: models.length });
              send({ type: "done", ...payload });
              return;
            }
            const authHeader = await resolveAuthHeader();
            const run = probeModels(models, authHeader, {
              onProbe: (model, index) => send({ type: "probe", model, index, total: models.length }),
              onResult: (result, done) => send({ type: "result", result, done, total: models.length }),
            });
            inFlight = { key, promise: run.then(() => null) };
            let results;
            try {
              results = await run;
            } finally {
              if (inFlight.key === key) inFlight = { key: "", promise: null };
            }
            const success = results.filter((result) => result.status === "ok").length;
            const payload = {
              results,
              timestamp: Date.now(),
              summary: { total: results.length, success, failed: results.length - success },
            };
            cached = { key, at: Date.now(), payload };
            send({ type: "done", ...payload });
          } catch (error) {
            console.error("Public model health check stream failed:", error);
            send({ type: "error", error: "health_check_failed" });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    if (cached.key === key && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.payload);
    }
    if (inFlight.key === key && inFlight.promise) {
      return NextResponse.json(await inFlight.promise);
    }

    const run = (async () => {
      const authHeader = await resolveAuthHeader();
      const results = await probeModels(models, authHeader);
      const success = results.filter((result) => result.status === "ok").length;
      return {
        results,
        timestamp: Date.now(),
        summary: { total: results.length, success, failed: results.length - success },
      };
    })();
    inFlight = { key, promise: run };
    try {
      const payload = await run;
      cached = { key, at: Date.now(), payload };
      return NextResponse.json(payload);
    } finally {
      if (inFlight.promise === run) inFlight = { key: "", promise: null };
    }
  } catch (error) {
    console.error("Public model health check failed:", error);
    return NextResponse.json(
      { error: "health_check_failed", results: [], timestamp: Date.now(), summary: { total: 0, success: 0, failed: 0 } },
      { status: 200 },
    );
  }
}
