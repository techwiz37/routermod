import { NextResponse } from "next/server";
import { getModelAliases, setModelAlias, deleteModelAlias } from "@/models";

export const dynamic = "force-dynamic";


export async function GET() {
  try {
    const aliases = await getModelAliases();
    return NextResponse.json({ aliases });
  } catch (error) {
    console.log("Error fetching aliases:", error);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}


export async function PUT(request) {
  try {
    const body = await request.json();
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    await setModelAlias(alias, model);

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}


export async function PATCH(request) {
  try {
    const { oldAlias, newAlias, model } = await request.json();
    if (!newAlias?.trim() || !model) {
      return NextResponse.json({ error: "newAlias and model required" }, { status: 400 });
    }
    if (oldAlias && oldAlias !== newAlias.trim()) {
      await deleteModelAlias(oldAlias);
    }
    await setModelAlias(newAlias.trim(), model);
    return NextResponse.json({ success: true, alias: newAlias.trim() });
  } catch (error) {
    console.log("Error renaming alias:", error);
    return NextResponse.json({ error: "Failed to rename alias" }, { status: 500 });
  }
}


export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const alias = searchParams.get("alias");

    if (!alias) {
      return NextResponse.json({ error: "Alias required" }, { status: 400 });
    }

    await deleteModelAlias(alias);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting alias:", error);
    return NextResponse.json({ error: "Failed to delete alias" }, { status: 500 });
  }
}
