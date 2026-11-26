import { getApiKeyByKey, validateApiKey } from "@/lib/localDb";
import { UPDATER_CONFIG } from "@/shared/constants/config";
import { KEY_SESSION_COOKIE } from "@/lib/auth/keySession.js";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store, private" };
const TIMEOUT_MS = 60_000;
const MAX_PROMPT_LENGTH = 8_000;

function json(body, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

async function activeKey(key) {
  if (!key || !(await validateApiKey(key))) return null;
  const record = await getApiKeyByKey(key);
  if (!record?.isActive) return null;
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return null;
  return record;
}

function extractText(parsed) {
  const choice = parsed?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
  }
  if (typeof parsed?.choices?.[0]?.text === "string") return parsed.choices[0].text.trim();
  if (typeof parsed?.response === "string") return parsed.response.trim();
  return "";
}

/**
 * Live playground for the API-key dashboard. Sends a single user prompt to the
 * requested model through this gateway, using the key from the key session
 * cookie, and returns the answer so the dashboard can show it inline.
 */
export async function POST(request) {
  const key = request.cookies.get(KEY_SESSION_COOKIE)?.value;
  const record = await activeKey(key);
  if (!record) return json({ error: "Invalid or expired key session." }, 401);

  let body = null;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!model) return json({ error: "Model required." }, 400);
  if (!prompt) return json({ error: "Prompt required." }, 400);
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return json({ error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1_024,
        stream: false,
      }),
      signal: AbortSignal.any([controller.signal, request.signal].filter(Boolean)),
    });
    const latencyMs = Date.now() - started;
    const raw = await res.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch {}

    if (!res.ok) {
      const detail = parsed?.error?.message || parsed?.error || raw;
      return json({
        error: `HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 400)}` : ""}`,
        status: res.status,
        latencyMs,
      });
    }

    const answer = extractText(parsed);
    if (!answer) {
      return json({ error: "The model returned an empty answer.", status: res.status, latencyMs });
    }

    return json({ answer, latencyMs, status: res.status });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return json({
      error: aborted ? `No response within ${TIMEOUT_MS / 1_000} seconds.` : (error?.message || "Request failed."),
      latencyMs: Date.now() - started,
    }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
}
