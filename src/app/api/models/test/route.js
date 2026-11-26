import { NextResponse } from "next/server";
import { pingModelByKind } from "./ping";
import { getModelInfo } from "@/sse/services/model";
import { getModelTestResults, saveSuccessfulModelTest } from "@/lib/db/repos/modelTestRepo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ results: await getModelTestResults() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load model test results" }, { status: 500 });
  }
}

const MODEL_TEST_TIMEOUT_MS = 60000;

function getCanonicalModel(model, resolved) {
  if (!resolved?.provider || !resolved?.model) return model;
  return `${resolved.provider}/${resolved.model}`;
}

export async function POST(request) {
  const controller = new AbortController();
  let timeoutId;
  try {
    const { model, kind, benchmark, withTools } = await request.json();
    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });
    // A provider's global prefix is a display/routing alias (for example
    // `xro/agnes-2.5-flash`), not necessarily a registered provider id. Resolve
    // it before pinging so model tests keep working after the prefix changes.
    let canonicalModel = model;
    try {
      const resolved = await getModelInfo(model);
      canonicalModel = getCanonicalModel(model, resolved);
    } catch (resolveError) {
      console.warn("Model test: failed to resolve display alias:", resolveError?.message || resolveError);
    }

    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(
        () => {
          resolve({ ok: false, latencyMs: MODEL_TEST_TIMEOUT_MS, status: 0, error: "No response within 60 seconds" });
          controller.abort();
        },
        MODEL_TEST_TIMEOUT_MS
      );
    });

    const result = await Promise.race([
      pingModelByKind(canonicalModel, kind || "llm", undefined, model, AbortSignal.any([request.signal, controller.signal]), {
        // Model tests are authenticated internal probes: show the real upstream
        // error (status + message) so failures can actually be diagnosed.
        internalProbe: true,
        benchmark: benchmark === true,
        // Undefined (normal UI call) keeps ping.js's realistic default (true).
        // Only an explicit false asks for the legacy plain-chat probe.
        withTools: withTools !== false,
      }),
      timeout,
    ]).finally(() => { clearTimeout(timeoutId); controller.abort(); });

    let savedResult = null;
    try {
      savedResult = await saveSuccessfulModelTest(canonicalModel, kind || "llm", result);
    } catch (error) {
      console.error("Failed to save model test result:", error.message);
    }
    return NextResponse.json({ ...result, requestedModel: model, testedModel: canonicalModel, savedResult,
      ...(result.ok && !savedResult ? { persistenceError: true } : {}),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return NextResponse.json({
      ok: false,
      error: timedOut ? "No response within 60 seconds" : err.message,
    }, { status: timedOut ? 200 : 500 });
  }
}
