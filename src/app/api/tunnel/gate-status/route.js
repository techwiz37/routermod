import { NextResponse } from "next/server";
import { loadState } from "@/lib/tunnel/shared/state";

// Public endpoint — no auth needed. Used by CF Worker to check if tunnel is active
// before proxying web UI paths. Returns { active: bool }
export async function GET() {
  try {
    const state = loadState();
    // Active = tunnelUrl set (cleared on disable)
    return NextResponse.json({ active: !!(state?.tunnelUrl) });
  } catch {
    return NextResponse.json({ active: true }); // fail open
  }
}
