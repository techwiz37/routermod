import { NextResponse } from "next/server";
import { findWarpCli, warpStatus, warpHop, WARP_PROXY_PORT } from "@/lib/network/warpRotator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const bin = findWarpCli();
  const status = await warpStatus();
  return NextResponse.json({
    ...status,
    available: !!bin,
    binary: bin || "",
    proxyUrl: status.connected ? `http://127.0.0.1:${WARP_PROXY_PORT}` : "",
  }, { headers });
}

/** POST /api/proxy-pools/warp  { action: "hop" } */
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { /* empty body ok */ }
  const action = body?.action || "hop";
  if (action !== "hop") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400, headers });
  }
  const result = await warpHop();
  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers });
}
