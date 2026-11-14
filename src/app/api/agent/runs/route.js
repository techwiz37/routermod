import { NextResponse } from "next/server";
import { listRuns } from "@/lib/agent/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project") || "";
  return NextResponse.json({ runs: listRuns(project) });
}
