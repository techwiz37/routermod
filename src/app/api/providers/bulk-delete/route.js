import { NextResponse } from "next/server";
import { deleteProviderConnectionsByIds, getProviderConnections } from "@/models";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "No connection ids provided" }, { status: 400 });
    }
    if (ids.length > 5000) {
      return NextResponse.json({ error: "Too many connection ids" }, { status: 400 });
    }

    const before = await getProviderConnections();
    const existingIds = new Set(before.map((c) => String(c.id)));
    const validIds = ids.filter((id) => existingIds.has(id));

    const deleted = await deleteProviderConnectionsByIds(validIds);

    return NextResponse.json({
      success: true,
      deleted,
      requested: ids.length,
      missing: ids.length - validIds.length,
    });
  } catch (error) {
    console.error("Error bulk deleting connections:", error);
    return NextResponse.json({ error: error?.message || "Bulk delete failed" }, { status: 500 });
  }
}
