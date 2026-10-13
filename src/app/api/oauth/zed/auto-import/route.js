import { NextResponse } from "next/server";
import { readZedIdeCredentials } from "@/lib/oauth/utils/zedCredentials";


export async function GET() {
  try {
    const result = await readZedIdeCredentials();
    if (!result.found) {
      return NextResponse.json({
        found: false,
        error: result.error || "Zed IDE credentials not found",
        credentialsUrl: result.credentialsUrl || null,
      });
    }

    return NextResponse.json({
      found: true,
      userId: result.userId,
      accessToken: result.accessToken,
      systemId: result.systemId,
      credentialsUrl: result.credentialsUrl,
    });
  } catch (error) {
    console.log("Zed auto-import error:", error);
    return NextResponse.json(
      { found: false, error: error.message || "Failed to read Zed credentials" },
      { status: 500 },
    );
  }
}
