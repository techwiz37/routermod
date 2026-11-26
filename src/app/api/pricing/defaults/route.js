import { NextResponse } from "next/server";
import { getDefaultPricing } from "open-sse/providers/pricing.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getDefaultPricing());
  } catch (error) {
    console.error("Error fetching default pricing:", error);
    return NextResponse.json({ error: "Failed to fetch default pricing" }, { status: 500 });
  }
}
