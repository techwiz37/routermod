import { NextResponse } from "next/server";
import { loadState } from "@/lib/tunnel/shared/state";

export async function GET() {
  try {
    const state = loadState();
    return NextResponse.json({ active: !!(state?.tunnelUrl) });
  } catch {
    return NextResponse.json({ active: true }); // fail open
  }
}
