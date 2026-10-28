import { NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/usageDb";

// The login-page monitor polls this endpoint for newly completed requests.
// Prevent Next.js from serving a cached snapshot of the old model labels.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Keep the public/custom model prefix. The login monitor uses this
    // endpoint directly, so stripping `xro/` here made custom model IDs
    // impossible to distinguish and showed internal model names instead.
    const logs = await getRecentLogs(200);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
