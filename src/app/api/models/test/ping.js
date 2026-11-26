import { getApiKeys } from "@/lib/localDb";
import { resolveProviderId } from "@/shared/constants/providers.js";
import { unwrapClineEnvelope } from "open-sse/shared/clineEnvelope.js";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { getConsistentMachineId } from "@/shared/utils/machineId";

const CLI_TOKEN_SALT = "9r-cli-auth";

// A model test must fail fast so users can try another model without waiting.
// Require an actual response within one minute, including reading its body.
const PROBE_TIMEOUT_MS = 60000;

function createSilentWavFile() {
  const sampleRate = 16000;
  const channels = 1;
  const bitsPerSample = 16;
  const durationMs = 250;
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * channels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
  view.setUint16(32, channels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  return new Blob([buffer], { type: "audio/wav" });
}

async function getInternalHeaders(options = {}) {
  let apiKey = null;
  try {
    const keys = await getApiKeys();
    const activeKeys = keys.filter((k) => k.isActive !== false);
    apiKey = (activeKeys.find((k) => !k.access?.restricted) || activeKeys[0])?.key || null;
  } catch {}

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (options.internalProbe === true) {
    headers["x-9r-cli-token"] = await getConsistentMachineId(CLI_TOKEN_SALT);
    headers["x-routermod-model-test"] = "1";
    if (options.bypassAccessPolicy === true) headers["x-routermod-health-probe"] = "1";
  }
  return headers;
}

export async function pingModelByKind(model, kind, baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`, requestedModel = model, signal, options = {}) {
  const headers = { ...await getInternalHeaders(options), ...(options?.headers || {}) };
  // Send the public ID in the probe body so the normal request logger records
  // the same custom ID shown in the model-test dialog.
  const probeModel = requestedModel || model;
  const benchmark = options?.benchmark === true;
  const start = Date.now();
  const probeSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)])
    : AbortSignal.timeout(PROBE_TIMEOUT_MS);

  if (kind === "embedding") {
    const res = await fetch(`${baseUrl}/api/v1/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: probeModel, input: "test" }),
      signal: probeSignal,
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }
    const hasEmbedding = Array.isArray(parsed?.data) && parsed.data.length > 0 && Array.isArray(parsed.data[0]?.embedding);
    if (!hasEmbedding) {
      return { ok: false, latencyMs, status: res.status, error: "Provider returned no embedding data" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  if (kind === "image") {
    const res = await fetch(`${baseUrl}/api/v1/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: probeModel, prompt: "test" }),
      signal: probeSignal,
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }

    const hasImages = Array.isArray(parsed?.data) && parsed.data.length > 0;
    if (!hasImages) {
      return { ok: false, latencyMs, status: res.status, error: "Provider returned no image data for this model" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  if (kind === "stt") {
    const form = new FormData();
    const sampleAudio = createSilentWavFile();
    form.append("file", sampleAudio, "test.wav");
    form.append("model", probeModel);

    const res = await fetch(`${baseUrl}/api/v1/audio/transcriptions`, {
      method: "POST",
      headers: Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== "content-type")),
      body: form,
      signal: probeSignal,
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }

    const text = typeof parsed?.text === "string" ? parsed.text : "";
    if (!text.trim()) {
      return { ok: false, latencyMs, status: res.status, error: "Provider returned no transcription text for this model" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  if (kind === "systemone") {
    const res = await fetch(`${baseUrl}/api/v1/systemone`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: probeModel,
        state: "Customer: I was charged twice for my order this morning.",
        questions: {
          probe: { type: "noul", instructions: "Is the customer reporting a billing problem?" },
        },
      }),
      signal: probeSignal,
    });
    const latencyMs = Date.now() - start;
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
      return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 240)}` : ""}`, status: res.status };
    }

    const hasAnswers = parsed?.answers && typeof parsed.answers === "object" && Object.keys(parsed.answers).length > 0;
    if (!hasAnswers) {
      return { ok: false, latencyMs, status: res.status, error: "Provider returned no answers for this model" };
    }
    return { ok: true, latencyMs, error: null, status: res.status };
  }

  // When withTools is set, mirror a real coding-agent request: some models
  // answer fine to a plain chat but fail as soon as a tool schema is present.
  // Realistic by default: every model-test surface in RouterMod (UI buttons,
  // bulk test, provider health check, WhatsApp .models) must verify the model
  // answers when a tool schema is present, like a real coding agent does.
  // Pass { withTools: false } explicitly only for a plain-chat-only probe.
  const withTools = options.withTools !== false;
  const probeBody = {
    model: probeModel,
    max_tokens: benchmark ? 160 : (withTools ? 64 : 16),
    stream: false,
    messages: [{
      role: "user",
      content: benchmark
        ? "Count from 1 to 80, separated by spaces. Output only the numbers."
        : withTools
          ? "Use the get_time tool with timezone UTC, then reply briefly."
          : "Reply briefly with OK.",
    }],
  };
  if (withTools) {
    probeBody.tools = [{
      type: "function",
      function: {
        name: "get_time",
        description: "Get the current time for a timezone",
        parameters: {
          type: "object",
          properties: { timezone: { type: "string" } },
          required: ["timezone"],
        },
      },
    }];
    probeBody.tool_choice = "auto";
  }

  const res = await fetch(`${baseUrl}/api/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(probeBody),
    signal: probeSignal,
  });
  let rawText = "";
  try {
    rawText = await res.text();
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return { ok: false, latencyMs: Date.now() - start, status: 0, error: `No response within ${Math.round(PROBE_TIMEOUT_MS / 1000)} seconds` };
    }
    return { ok: false, latencyMs: Date.now() - start, status: 0, error: `Probe aborted: ${e?.message || String(e)}` };
  }
  const latencyMs = Date.now() - start;
  let parsed = null;
  try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}

  const providerId = resolveProviderId(String(model).split("/")[0]);
  parsed = unwrapClineEnvelope(parsed, providerId);

  if (!res.ok) {
    const detail = parsed?.error?.message || parsed?.msg || parsed?.message || parsed?.error || rawText;
    return { ok: false, latencyMs, error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 500)}` : ""}`, status: res.status };
  }

  const providerStatus = parsed?.status;
  const providerMsg = parsed?.msg || parsed?.message;
  const hasProviderErrorStatus = providerStatus !== undefined
    && providerStatus !== null
    && String(providerStatus) !== "200"
    && String(providerStatus) !== "0";
  if (hasProviderErrorStatus && providerMsg) {
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: `Provider status ${providerStatus}: ${String(providerMsg).slice(0, 240)}`,
    };
  }

  if (parsed?.error) {
    const providerError = parsed?.error?.message || parsed?.error || "Provider returned an error";
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: String(providerError).slice(0, 240),
    };
  }

  const message = parsed?.choices?.[0]?.message;
  const content = message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content)
    ? content.map((part) => typeof part === "string" ? part : part?.text || "").join("") : "";
  const toolCalls = message?.tool_calls;
  const hasToolCall = withTools && Array.isArray(toolCalls) && toolCalls.length > 0;
  if (!text.trim() && !hasToolCall) {
    return {
      ok: false,
      latencyMs,
      status: res.status,
      error: "Provider returned no answer for this model",
    };
  }

  const outputTokens = Number(parsed?.usage?.completion_tokens ?? parsed?.usage?.output_tokens) || 0;
  const tps = benchmark && outputTokens > 0 && latencyMs > 0
    ? outputTokens / (latencyMs / 1000)
    : null;

  return {
    ok: true,
    latencyMs,
    error: null,
    status: res.status,
    ...(benchmark ? { outputTokens, ...(tps != null ? { tps } : {}) } : {}),
  };
}
