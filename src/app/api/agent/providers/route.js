import { NextResponse } from "next/server";
import { isAgentEnabled } from "@/lib/agent/config";
import { listProviders, upsertProvider, deleteProvider, reloadModels } from "@/lib/agent/providerStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabled() {
  return NextResponse.json(
    { error: "AI Agent is disabled. Set AGENT_ENABLED=1 to turn it on." },
    { status: 403 },
  );
}

export async function GET() {
  if (!isAgentEnabled()) return disabled();
  const providers = await listProviders();
  return NextResponse.json({ providers });
}

export async function POST(request) {
  if (!isAgentEnabled()) return disabled();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "delete") {
      await deleteProvider(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "reload-models") {
      const models = await reloadModels(body.id);
      return NextResponse.json({ ok: true, models });
    }
    const id = await upsertProvider(body);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
