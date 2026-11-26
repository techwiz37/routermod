import { NextResponse } from "next/server";
import { createInformation, listInformations } from "@/lib/db/repos/informationsRepo.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const activeOnly = new URL(request.url).searchParams.get("active") === "1";
    const informations = await listInformations({ activeOnly });
    return NextResponse.json({ informations });
  } catch (error) {
    console.log("Error fetching informations:", error);
    return NextResponse.json({ error: "Failed to fetch informations" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createInformation(body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ information: result.information }, { status: 201 });
  } catch (error) {
    console.log("Error creating information:", error);
    return NextResponse.json({ error: "Failed to create information" }, { status: 500 });
  }
}
