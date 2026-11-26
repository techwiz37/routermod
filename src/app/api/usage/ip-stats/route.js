import { NextResponse } from "next/server";
import { getRequestIpStats } from "@/lib/usageDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") || 1);
    const pageSize = Number(searchParams.get("pageSize") || 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
    }
    return NextResponse.json(await getRequestIpStats(page, pageSize));
  } catch (error) {
    console.error("[API] Failed to get request IP stats:", error);
    return NextResponse.json({ error: "Failed to fetch request IP stats" }, { status: 500 });
  }
}
