import { NextResponse } from "next/server";
import { AI_PROVIDERS, resolveProviderId } from "@/shared/constants/providers";
import { getProviderNodeById } from "@/models";
import { saveCompletedProviderModelTest } from "@/lib/db/repos/providerModelTestRepo";

export async function POST(request) {
  try {
    const body = await request.json();
    const provider = typeof body.providerAlias === "string" ? resolveProviderId(body.providerAlias) : null;
    const kind = body.kind || "llm";
    if (!provider || !["llm", "embedding", "image", "stt", "tts", "video"].includes(kind)
      || ![body.total, body.completed, body.success, body.failed].every(Number.isSafeInteger)
      || body.total <= 0 || body.completed !== body.total || body.success < 0 || body.failed < 0
      || body.success + body.failed !== body.total) {
      return NextResponse.json({ error: "A complete model test batch is required" }, { status: 400 });
    }
    if (!AI_PROVIDERS[provider] && !await getProviderNodeById(provider)) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }
    const result = await saveCompletedProviderModelTest(provider, kind, body);
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to save provider model test batch:", error.message);
    return NextResponse.json({ error: "Failed to save provider model test batch" }, { status: 500 });
  }
}
