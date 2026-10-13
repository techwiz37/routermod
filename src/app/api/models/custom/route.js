import { NextResponse } from "next/server";
import { getCustomModels, addCustomModel, deleteCustomModel } from "@/models";
import { CAPACITY_META, isSttTransport } from "@/shared/constants/models";

export const dynamic = "force-dynamic";


function sanitizeCaps(caps) {
  if (!caps || typeof caps !== "object") return null;
  const clean = {};
  for (const key of Object.keys(CAPACITY_META)) {
    if (typeof caps[key] === "boolean") clean[key] = caps[key];
  }
  return Object.keys(clean).length ? clean : null;
}


function sanitizeTransport(transport, type) {
  if (type !== "stt" || !isSttTransport(transport)) return null;
  return transport.trim();
}


export async function GET() {
  try {
    const models = await getCustomModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}


export async function POST(request) {
  try {
    const { providerAlias, id, type, name, caps, transport } = await request.json();
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const cleanCaps = sanitizeCaps(caps);
    const cleanTransport = sanitizeTransport(transport, type || "llm");
    const added = await addCustomModel({ providerAlias, id, type: type || "llm", name, ...(cleanCaps ? { caps: cleanCaps } : {}), ...(cleanTransport ? { transport: cleanTransport } : {}) });
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}


export async function PATCH(request) {
  try {
    const { providerAlias, id, newId, type, name } = await request.json();
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const resolvedType = type || "llm";

    if (newId && newId.trim() && newId.trim() !== id) {

      const oldModels = await getCustomModels();
      const old = oldModels.find((m) => m.providerAlias === providerAlias && m.id === id && m.type === resolvedType);
      await deleteCustomModel({ providerAlias, id, type: resolvedType });
      await addCustomModel({
        providerAlias,
        id: newId.trim(),
        type: resolvedType,
        name: (name?.trim() || old?.name || newId.trim()),
        ...(old?.caps ? { caps: old.caps } : {}),
        ...(old?.transport ? { transport: old.transport } : {}),
      });
    } else if (name?.trim()) {

      await addCustomModel({ providerAlias, id, type: resolvedType, name: name.trim() });
    } else {
      return NextResponse.json({ error: "name or newId required" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error updating custom model:", error);
    return NextResponse.json({ error: "Failed to update model" }, { status: 500 });
  }
}


export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    await deleteCustomModel({ providerAlias, id, type });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
