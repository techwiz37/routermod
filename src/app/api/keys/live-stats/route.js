import { NextResponse } from "next/server";
import { getApiKeys } from "@/lib/localDb";
import { getKeysLiveStats } from "@/lib/db/repos/keyUsageRepo.js";

export const dynamic = "force-dynamic";

// Live per-key counters for the endpoint page: requests/min, in-flight
// requests, and tokens/cost consumed inside each key's quota window.
export async function GET() {
  try {
    const keys = await getApiKeys();
    const stats = await getKeysLiveStats(keys);
    return NextResponse.json({ stats, at: new Date().toISOString() });
  } catch (error) {
    console.log("Error fetching key live stats:", error);
    return NextResponse.json({ error: "Failed to fetch key live stats" }, { status: 500 });
  }
}
