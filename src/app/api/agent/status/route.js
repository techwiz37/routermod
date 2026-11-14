import { NextResponse } from "next/server";
import { getAgentStatus } from "@/lib/agent/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getAgentStatus());
}
