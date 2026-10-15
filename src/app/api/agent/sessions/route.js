import { NextResponse } from "next/server";
import { isAgentEnabled } from "@/lib/agent/config";
import { listSessions, getSession, saveSession, deleteSession } from "@/lib/agent/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabled() {
  return NextResponse.json(
    { error: "AI Agent is disabled. Set AGENT_ENABLED=1 to turn it on." },
    { status: 403 },
  );
}

export async function GET(request) {
  if (!isAgentEnabled()) return disabled();
  const url = new URL(request.url);
  const project = url.searchParams.get("project") || "";
  const id = url.searchParams.get("id") || "";

  if (id) {
    const session = await getSession(id);
    if (!session || (project && session.project !== project)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  }

  return NextResponse.json({ sessions: await listSessions(project) });
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
      await deleteSession(body.id);
      return NextResponse.json({ ok: true });
    }
    const saved = await saveSession(body);
    return NextResponse.json({ ok: true, ...saved });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
