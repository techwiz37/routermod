import { NextResponse } from "next/server";
import { getDisabledModels, disableModels, enableModels } from "@/lib/disabledModelsDb";
import { getRequestLocale } from "@/lib/i18n/requestLocale";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const id = getRequestLocale(request) === "id";
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const all = await getDisabledModels();
    if (providerAlias) return NextResponse.json({ ids: all[providerAlias] || [] });
    return NextResponse.json({ disabled: all });
  } catch (error) {
    console.log("Error fetching disabled models:", error);
    return NextResponse.json({ error: id ? "Gagal mengambil model yang dimatikan" : "Failed to fetch disabled models" }, { status: 500 });
  }
}

export async function POST(request) {
  const id = getRequestLocale(request) === "id";
  try {
    const { providerAlias, ids } = await request.json();
    if (!providerAlias || !Array.isArray(ids)) {
    return NextResponse.json({ error: id ? "providerAlias dan ids[] wajib diisi" : "providerAlias and ids[] required" }, { status: 400 });
    }
    await disableModels(providerAlias, ids);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error disabling models:", error);
    return NextResponse.json({ error: id ? "Gagal mematikan model" : "Failed to disable models" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = getRequestLocale(request) === "id";
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    if (!providerAlias) {
       return NextResponse.json({ error: id ? "providerAlias wajib diisi" : "providerAlias required" }, { status: 400 });
    }
    await enableModels(providerAlias, id ? [id] : []);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error enabling models:", error);
    return NextResponse.json({ error: id ? "Gagal mengaktifkan model" : "Failed to enable models" }, { status: 500 });
  }
}
