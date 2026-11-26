import { NextResponse } from "next/server";
import { createPromo, listPromos } from "@/lib/db/repos/promosRepo.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const promos = await listPromos();
    return NextResponse.json({ promos });
  } catch (error) {
    console.log("Error fetching promos:", error);
    return NextResponse.json({ error: "Failed to fetch promos" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createPromo(body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ promo: result.promo }, { status: 201 });
  } catch (error) {
    console.log("Error creating promo:", error);
    return NextResponse.json({ error: "Failed to create promo" }, { status: 500 });
  }
}
