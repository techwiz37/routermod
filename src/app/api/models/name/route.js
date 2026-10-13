import { NextResponse } from "next/server";
import { getModelNames, setModelName, deleteModelName } from "@/models";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ names: await getModelNames() });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { providerAlias, modelId, name } = await request.json();
    if (!providerAlias || !modelId || !name?.trim()) {
      return NextResponse.json({ error: "providerAlias, modelId, name required" }, { status: 400 });
    }
    await setModelName(providerAlias, modelId, name.trim());
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const modelId = searchParams.get("modelId");
    if (!providerAlias || !modelId) {
      return NextResponse.json({ error: "providerAlias and modelId required" }, { status: 400 });
    }
    await deleteModelName(providerAlias, modelId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
