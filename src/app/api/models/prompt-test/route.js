import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getModelInfo } from "@/sse/services/model";

const CLI_TOKEN_SALT = "9r-cli-auth";

async function getInternalHeaders() {
  let apiKey = null;
  try {
    const keys = await getApiKeys();
    const activeKeys = keys.filter((k) => k.isActive !== false);
    apiKey = (activeKeys.find((k) => !k.access?.restricted) || activeKeys[0])?.key || null;
  } catch {}

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  headers["x-9r-cli-token"] = await getConsistentMachineId(CLI_TOKEN_SALT);
  return headers;
}

function extractText(parsed) {
  const choice = parsed?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
  }
  if (typeof parsed?.content === "string") return parsed.content;
  return "";
}

/**
 * Prompt-injection smoke test: sends the configured system prompt to the
 * selected model and returns the raw answer so the dashboard can show whether
 * the injection actually took effect.
 */
export async function POST(request) {
  try {
    const { model, systemPrompt, prompt } = await request.json();
    if (!model) {
      return NextResponse.json({ ok: false, error: "Model required" }, { status: 400 });
    }

    let canonicalModel = model;
    try {
      const resolved = await getModelInfo(model);
      if (resolved?.provider && resolved?.model) {
        canonicalModel = `${resolved.provider}/${resolved.model}`;
      }
    } catch {}

    const headers = await getInternalHeaders();
    headers["x-routermod-prompt-test"] = "1";
    const baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;
    const userPrompt = (prompt || "").trim() || "Who are you? Answer in one short sentence.";

    const messages = [];
    const sys = (systemPrompt || "").trim();
    if (sys) messages.push({ role: "system", content: sys });
    messages.push({ role: "user", content: userPrompt });

    const started = Date.now();
    const res = await fetch(`${baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: canonicalModel,
        messages,
        max_tokens: 512,
        stream: false,
      }),
      signal: AbortSignal.timeout(45000),
    });
    const latencyMs = Date.now() - started;

    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.error || rawText;
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 400)}` : ""}`,
        testedModel: canonicalModel,
      });
    }

    const answer = extractText(parsed);
    if (!answer) {
      return NextResponse.json({
        ok: false,
        latencyMs,
        status: res.status,
        error: "Provider returned an empty answer",
        testedModel: canonicalModel,
      });
    }

    return NextResponse.json({
      ok: true,
      latencyMs,
      status: res.status,
      answer,
      testedModel: canonicalModel,
      usedSystemPrompt: Boolean(sys),
      sentSystemPrompt: sys,
      prompt: userPrompt,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
