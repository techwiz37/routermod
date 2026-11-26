import { NextResponse } from "next/server";
import { getApiKeys, getSettings } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for many models

const HEALTH_CHECK_TIMEOUT_MS = 80_000; // 80s per model — slow/first-call models get a fair chance
const TEST_PROMPT = "Hi"; // Simple prompt for fast response

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:1337";
}

async function resolveAuthHeader() {
  const [keys, settings] = await Promise.all([getApiKeys(), getSettings()]);
  const now = Date.now();
  const usable = (keys || []).filter((k) => {
    if (k.isActive === false) return false;
    if (k.maintenanceEnabled) return false;
    if (k.expiresAt && new Date(k.expiresAt).getTime() <= now) return false;
    // getApiKeys() maps the DB `key` column — NOT `apiKey`.
    return typeof k.key === "string" && k.key.length > 0;
  });
  if (usable.length > 0) return `Bearer ${usable[0].key}`;
  // Local mode (requireApiKey=false) needs no Authorization at all.
  if (!settings?.requireApiKey) return null;
  return null;
}

async function pingModel(modelId, authHeader) {
  const startTime = Date.now();

  try {
    const headers = { "Content-Type": "application/json" };
    if (authHeader) headers.Authorization = authHeader;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

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

    clearTimeout(timeoutId);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        model: modelId,
        status: "error",
        ttft: null,
        error: `HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`,
      };
    }

    const reader = response.body?.getReader?.();
    if (!reader) {
      return { model: modelId, status: "no_response", ttft: null, error: "No readable stream" };
    }

    const decoder = new TextDecoder();
    let ttft = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Any SSE data line counts as a live token — some providers send a
        // role-only first delta, others a comment/heartbeat.
        if (chunk.includes("data:") || chunk.trim().length > 0) {
          ttft = Date.now() - startTime;
          reader.cancel().catch(() => {});
          break;
        }
      }
    } catch {
      // A stream error after the first chunk still means the model answered.
    }

    if (ttft === null) {
      return { model: modelId, status: "no_response", ttft: null, error: "No token received" };
    }

    return { model: modelId, status: "ok", ttft, error: null };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        model: modelId,
        status: "timeout",
        ttft: null,
        error: `Timeout after ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`,
      };
    }
    return {
      model: modelId,
      status: "error",
      ttft: null,
      error: error.message || "Unknown error",
    };
  }
}

export async function POST(request) {
  try {
    const { models } = await request.json();

    if (!Array.isArray(models) || models.length === 0) {
      return NextResponse.json({ error: "Models array required" }, { status: 400 });
    }

    const authHeader = await resolveAuthHeader();
    console.log(`[Health Check] Testing ${models.length} models (auth=${authHeader ? "key" : "none"})...`);

    // Ping all models in parallel with Promise.allSettled
    const results = await Promise.allSettled(
      models.map((modelId) => pingModel(modelId, authHeader))
    );

    const healthData = results.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      return {
        model: models[index],
        status: "error",
        ttft: null,
        error: result.reason?.message || "Promise rejected",
      };
    });

    const successCount = healthData.filter((h) => h.status === "ok").length;
    console.log(`[Health Check] Complete: ${successCount}/${models.length} models OK`);

    return NextResponse.json({
      results: healthData,
      timestamp: Date.now(),
      summary: {
        total: models.length,
        success: successCount,
        failed: models.length - successCount,
      },
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json(
      { error: "Health check failed", details: error.message },
      { status: 500 }
    );
  }
}
