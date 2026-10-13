import { NextResponse } from "next/server";
import { listProfiles } from "../hermes-settings/hermesProfiles.js";

export const dynamic = "force-dynamic";


export async function GET() {
  try {
    const profiles = await listProfiles();
    return NextResponse.json({ profiles });
  } catch (error) {
    console.error("Error listing hermes profiles:", error);
    return NextResponse.json({ error: "Failed to list hermes profiles" }, { status: 500 });
  }
}
