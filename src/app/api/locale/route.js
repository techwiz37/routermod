import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { LOCALE_COOKIE, normalizeLocale, isSupportedLocale } from "@/i18n/config";
import { getRequestLocale, localizedAuthMessage } from "@/lib/i18n/requestLocale";
import { getSettings, updateSettings } from "@/lib/localDb";
import { verifyDashboardAuthToken } from "@/lib/auth/dashboardSession";

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
    // Persist so server-side API responses (e.g. blocked IP) follow the
    // configured language even for clients without the dashboard cookie.
    // Only signed-in dashboard users may change the server-wide language.
    try {
      const token = cookieStore.get("auth_token")?.value;
      const settings = await getSettings();
      if (settings.requireLogin === false || await verifyDashboardAuthToken(token)) {
        await updateSettings({ locale: normalized });
      }
    } catch {}

    return NextResponse.json({ success: true, locale: normalized });
  } catch (error) {
    return NextResponse.json(
      { error: localizedAuthMessage(getRequestLocale(request), "localeFailed") },
      { status: 500 }
    );
  }
}
