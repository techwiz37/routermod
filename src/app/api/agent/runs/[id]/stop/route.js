import { NextResponse } from "next/server";
import { cancelRun } from "@/lib/agent/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { id } = await params;
  const result = cancelRun(id);
  if (!result) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...result });
}
