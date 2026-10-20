import { NextResponse } from "next/server";
import { getProviderConnectionById } from "@/models";
import { resolveConnectionModels } from "@/lib/providerModels/resolveConnectionModels";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const result = await resolveConnectionModels(connection);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 });
    }

    return NextResponse.json({
      provider: connection.provider,
      connectionId: connection.id,
      models: result.models || [],
      ...(result.warning ? { warning: result.warning } : {})
    });
  } catch (error) {
    console.log("Error fetching provider models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}
