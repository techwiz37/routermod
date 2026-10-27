import { NextResponse } from "next/server";
import { getComboById, updateCombo, deleteCombo, getComboByName } from "@/lib/localDb";
import { resetComboRotation } from "open-sse/services/combo.js";
import { getRequestLocale, localizedComboMessage } from "@/lib/i18n/requestLocale";

const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const combo = await getComboById(id);
    
    if (!combo) {
      return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "notFound") }, { status: 404 });
    }
    
    return NextResponse.json(combo);
  } catch (error) {
    console.log("Error fetching combo:", error);
    return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "failedFetch") }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    if (body.name) {
      if (!VALID_NAME_REGEX.test(body.name)) {
        return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "invalidName") }, { status: 400 });
      }
      
      const existing = await getComboByName(body.name);
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "nameExists") }, { status: 400 });
      }
    }
    
    const prev = await getComboById(id);
    const combo = await updateCombo(id, body);
    
    if (!combo) {
      return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "notFound") }, { status: 404 });
    }

    if (prev?.name) resetComboRotation(prev.name);
    if (combo.name && combo.name !== prev?.name) resetComboRotation(combo.name);

    return NextResponse.json(combo);
  } catch (error) {
    console.log("Error updating combo:", error);
    return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "failedUpdate") }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const prev = await getComboById(id);
    const success = await deleteCombo(id);
    
    if (!success) {
      return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "notFound") }, { status: 404 });
    }

    if (prev?.name) resetComboRotation(prev.name);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting combo:", error);
    return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "failedDelete") }, { status: 500 });
  }
}
