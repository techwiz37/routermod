import { NextResponse } from "next/server";
import { listProjects, getAgentStatus } from "@/lib/agent/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getAgentStatus();
  if (!status.enabled) {
    return NextResponse.json(
      { error: "AI Agent is disabled. Set AGENT_ENABLED=1 to turn it on.", projects: [] },
      { status: 403 },
    );
  }
  return NextResponse.json({ projects: listProjects(), projectsRoot: status.projectsRoot });
}
