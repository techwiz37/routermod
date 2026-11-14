import { NextResponse } from "next/server";
import { loadState } from "@/lib/tunnel/shared/state";

export const dynamic = "force-dynamic";

// The dashboard uses this to decide whether the public endpoint should show as
// active, independently from any client-side network probe.
export async function GET() {
  try {
    const state = loadState();
    return NextResponse.json({
      active: !!(state?.tunnelUrl && state?.shortId),
      tunnelUrl: state?.tunnelUrl || "",
      publicUrl: state?.publicUrl || "",
    });
  } catch {
    return NextResponse.json({ active: true }); // fail open
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
