import { NextResponse } from "next/server";
import { getRun, listRuns } from "@/lib/agent/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;

  if (id) {
    const run = getRun(id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: run.id,
      project: run.project,
      sessionId: run.sessionId,
      providerId: run.providerId,
      model: run.model,
      status: run.status,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      eventCount: run.events.length,
      events: run.events,
    });
  }

  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project") || "";
  return NextResponse.json({ runs: listRuns(project) });
}
