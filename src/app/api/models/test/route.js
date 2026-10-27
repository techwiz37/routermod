import { NextResponse } from "next/server";
import { pingModelByKind } from "./ping";
import { getModelInfo } from "@/sse/services/model";

function getCanonicalModel(model, resolved) {
  if (!resolved?.provider || !resolved?.model) return model;
  return `${resolved.provider}/${resolved.model}`;
}

export async function POST(request) {
  try {
    const { model, kind } = await request.json();
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

    const result = await pingModelByKind(canonicalModel, kind || "llm");
    return NextResponse.json({ ...result, requestedModel: model, testedModel: canonicalModel });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
