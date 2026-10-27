import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { LOCALE_COOKIE, normalizeLocale, isSupportedLocale } from "@/i18n/config";
import { getRequestLocale, localizedAuthMessage } from "@/lib/i18n/requestLocale";

export async function POST(request) {
  try {
    const { locale } = await request.json();
    
    if (!locale || !isSupportedLocale(locale)) {
      return NextResponse.json(
        { error: localizedAuthMessage(getRequestLocale(request), "invalidLocale") },
        { status: 400 }
      );
    }

    const normalized = normalizeLocale(locale);
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, normalized, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return NextResponse.json({ success: true, locale: normalized });
  } catch (error) {
    return NextResponse.json(
      { error: localizedAuthMessage(getRequestLocale(request), "localeFailed") },
      { status: 500 }
    );
  }
}
