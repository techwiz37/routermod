import { NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/usageDb";

export async function GET() {
  try {
    const logs = (await getRecentLogs(200)).map((log) => {
      const parts = String(log).split(" | ");
      if (parts.length > 1) parts[1] = parts[1].replace(/^[^/]+\//, "");
      return parts.join(" | ");
    });
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
