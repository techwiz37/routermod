import { NextResponse } from "next/server";
import { deleteInformation, updateInformation } from "@/lib/db/repos/informationsRepo.js";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await updateInformation(id, body);
    if (result.notFound) return NextResponse.json({ error: result.error }, { status: 404 });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ information: result.information });
  } catch (error) {
    console.log("Error updating information:", error);
    return NextResponse.json({ error: "Failed to update information" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteInformation(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.log("Error deleting information:", error);
    return NextResponse.json({ error: "Failed to delete information" }, { status: 500 });
  }
}
