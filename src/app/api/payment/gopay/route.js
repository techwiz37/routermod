import { NextResponse } from "next/server";
import {
  clearGopaySession,
  getGopaySession,
  publicGopayStatus,
  saveGopaySession,
} from "@/lib/db/repos/paymentRepo.js";
import { loginGopayMerchant, loginGopayMerchantWithOtp, requestGopayOtp, refreshGopaySession, safeError } from "@/lib/payment/gopay.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function GET() {
  try {
    return json({ gopay: publicGopayStatus(await getGopaySession()) });
  } catch (error) {
    return json({ error: error.message || "Failed to read the GoPay session." }, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "logout") {
      await clearGopaySession();
      return json({ ok: true, gopay: publicGopayStatus({}) });
    }

    if (action === "refresh") {
      const current = await getGopaySession();
      if (!current.authorized) return json({ error: "GoPay Merchant is not connected." }, 400);
      const result = await refreshGopaySession(current);
      if (!result.refreshed) return json({ error: "The GoPay session could not be refreshed. Sign in again." }, 400);
      const saved = await saveGopaySession(result.session);
      return json({ ok: true, gopay: publicGopayStatus(saved) });
    }

    if (action === "login") {
      const email = String(body.email || "").trim();
      const password = String(body.password || "");
      if (!email || !password) return json({ error: "GoPay Merchant email and password are required." }, 400);
      try {
        const session = await loginGopayMerchant(email, password);
        const saved = await saveGopaySession(session);
        return json({ ok: true, gopay: publicGopayStatus(saved) });
      } catch (error) {
        return json({ error: safeError(error.message || error) || "GoPay Merchant login failed." }, 400);
      }
    }

    if (action === "request_otp") {
      const email = String(body.email || "").trim();
      if (!email) return json({ error: "GoPay Merchant email is required." }, 400);
      try {
        const challenge = await requestGopayOtp(email);
        if (!challenge.otpToken) return json({ error: "The GoPay OTP code could not be requested. Try signing in with a password." }, 400);
        return json({ ok: true, challenge, gopay: publicGopayStatus(await getGopaySession()) });
      } catch (error) {
        return json({ error: safeError(error.message || error) || "Failed to send the GoPay OTP code." }, 400);
      }
    }

    if (action === "login_otp") {
      const email = String(body.email || "").trim();
      const otp = String(body.otp || "").trim();
      const otpToken = String(body.otpToken || "").trim();
      const deviceId = String(body.deviceId || "").trim();
      if (!email || !otp || !otpToken) {
        return json({ error: "GoPay Merchant email and OTP code are required." }, 400);
      }
      try {
        const session = await loginGopayMerchantWithOtp(email, otp, otpToken, deviceId);
        const saved = await saveGopaySession(session);
        return json({ ok: true, gopay: publicGopayStatus(saved) });
      } catch (error) {
        return json({ error: safeError(error.message || error) || "The GoPay OTP code is invalid or has expired." }, 400);
      }
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return json({ error: error.message || "Failed to process GoPay Merchant." }, 500);
  }
}
