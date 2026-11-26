import { NextResponse } from "next/server";
import { deletePromo, updatePromo } from "@/lib/db/repos/promosRepo.js";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await updatePromo(id, body);
    if (result.notFound) return NextResponse.json({ error: result.error }, { status: 404 });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ promo: result.promo });
  } catch (error) {
    console.log("Error updating promo:", error);
    return NextResponse.json({ error: "Failed to update promo" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deletePromo(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log("Error deleting promo:", error);
    return NextResponse.json({ error: "Failed to delete promo" }, { status: 500 });
  }
}
