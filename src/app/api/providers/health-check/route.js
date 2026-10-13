import { NextResponse } from "next/server";
import { getProviderConnections, updateProviderConnection } from "@/lib/db/index.js";
import { pingModelByKind } from "@/app/api/models/test/ping.js";
import { AI_MODELS } from "@/shared/constants/config.js";
import { getProviderAlias } from "@/shared/constants/providers.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

    const connections = await getProviderConnections({ provider, isActive: true });
    const invalid = connections.filter(c => c.testStatus === "unavailable" && c.lastError);
    const limited = connections.filter(c => {
      if (c.testStatus !== "unavailable") return false;
      const err = (c.lastError || "").toLowerCase();
      return err.includes("quota") || err.includes("limit") || err.includes("rate") || err.includes("429");
    });

    return NextResponse.json({
      total: connections.length,
      healthy: connections.filter(c => c.testStatus === "active").length,
      unavailable: invalid.length,
      limited: limited.length,
      connections: connections.map(c => ({
        id: c.id,
        name: c.name || c.email || c.id,
        testStatus: c.testStatus,
        lastError: c.lastError,
        lastErrorAt: c.lastErrorAt,
        authType: c.authType,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { connectionId, provider } = await request.json();
    if (!connectionId || !provider) {
      return NextResponse.json({ error: "connectionId and provider required" }, { status: 400 });
    }

    const alias = getProviderAlias(provider) || provider;
    const providerModels = AI_MODELS.filter(m => m.provider === provider || m.provider === alias);
    const firstModel = providerModels.find(m => !m.kind || m.kind === "llm");
    if (!firstModel) {
      return NextResponse.json({ ok: false, error: "No LLM model found for provider" });
    }

    const modelStr = `${getProviderAlias(firstModel.provider) || firstModel.provider}/${firstModel.model}`;

    const t0 = Date.now();
    let result;
    try {
      result = await pingModelByKind(modelStr, "llm");
    } catch (e) {
      result = { ok: false, error: e.message, latencyMs: Date.now() - t0 };
    }

    const update = {
      testStatus: result.ok ? "active" : "unavailable",
      lastCheckedAt: new Date().toISOString(),
    };
    if (!result.ok) {
      update.lastError = result.error || "Health check failed";
      update.lastErrorAt = new Date().toISOString();
    } else {
      update.lastError = null;
      update.lastErrorAt = null;
      update.errorCode = null;
    }

    await updateProviderConnection(connectionId, update);

    return NextResponse.json({
      ok: result.ok,
      latencyMs: result.latencyMs,
      error: result.error || null,
      model: modelStr,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
