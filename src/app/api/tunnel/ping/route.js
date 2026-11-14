import { NextResponse } from "next/server";
import { loadState } from "@/lib/tunnel/shared/state";
import { TUNNEL_WORKER_URL } from "@/lib/tunnel/cloudflare/config";

export const dynamic = "force-dynamic";

// CORS-enabled so the dashboard can probe reachability from the browser even
// when the tunnel host is not the page's own origin (and so `no-cors` opaque
// responses still count as "the public domain answered").
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store",
};

export async function GET() {
  const state = loadState();
  return NextResponse.json(
    {
      ok: true,
      tunnelUrl: state?.tunnelUrl || "",
      publicUrl: state?.publicUrl || "",
      shortId: state?.shortId || "",
      worker: TUNNEL_WORKER_URL,
    },
    { headers: CORS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
