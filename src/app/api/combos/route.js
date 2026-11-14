import { NextResponse } from "next/server";
import { getCombos, createCombo, getComboByName } from "@/lib/localDb";
import { getRequestLocale, localizedComboMessage } from "@/lib/i18n/requestLocale";

export const dynamic = "force-dynamic";

const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

export async function GET(request) {
  try {
    const combos = await getCombos();
    return NextResponse.json({ combos });
  } catch (error) {
    console.log("Error fetching combos:", error);
    return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "failedFetch") }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, models, kind } = body;

    if (!name) {
      return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "nameRequired") }, { status: 400 });
    }

    if (!VALID_NAME_REGEX.test(name)) {
      return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "invalidName") }, { status: 400 });
    }

    const existing = await getComboByName(name);
    if (existing) {
      return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "nameExists") }, { status: 400 });
    }

    const combo = await createCombo({ name, models: models || [], kind: kind || null });

    return NextResponse.json(combo, { status: 201 });
  } catch (error) {
    console.log("Error creating combo:", error);
    return NextResponse.json({ error: localizedComboMessage(getRequestLocale(request), "failedCreate") }, { status: 500 });
  }
}
