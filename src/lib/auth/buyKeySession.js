/**
 * Anonymous browser session for the public Buy Key flow.
 *
 * A visitor has no API key yet, so invoices are scoped to a random HttpOnly
 * cookie instead. The cookie never carries a secret the buyer needs to keep:
 * losing it only hides the invoice history, while the API key itself is
 * revealed to the same session after the payment settles.
 */

import { randomBytes } from "node:crypto";

export const BUY_KEY_SESSION_COOKIE = "rmod_buy_key";
export const BUY_KEY_SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export function newBuyKeySessionId() {
  return randomBytes(24).toString("hex");
}

export function buyKeyCookieOptions(request) {
  return {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: BUY_KEY_SESSION_MAX_AGE_SEC,
  };
}
