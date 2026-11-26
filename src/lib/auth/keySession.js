/**
 * Shared session for the public key dashboard (/login-key → /dashboard-keys).
 *
 * Security notes:
 *  - The cookie carries the API key itself, so it must stay HttpOnly (page JS
 *    never reads it).
 *  - SameSite=Lax (not Strict): Strict drops the cookie on *cross-site
 *    top-level navigation*, so opening the dashboard from a WhatsApp/Telegram or
 *    e-mail link landed on /login-key even with a perfectly valid session. Lax
 *    still withholds the cookie from cross-site POST/PATCH/DELETE, which is what
 *    actually guards the state-changing endpoints.
 *  - Its lifetime is a *persistent* 24h. A cookie without Max-Age is a session
 *    cookie: browsers drop it on close (and mobile browsers drop it when the tab
 *    is discarded), which logged users out even though they never signed out.
 *  - Logout (DELETE) overrides maxAge to 0 — that is the only way to shorten it.
 */

export const KEY_SESSION_COOKIE = "rmod_key_dashboard";
export const KEY_SESSION_MAX_AGE_SEC = 24 * 60 * 60;

export function keySessionCookieOptions(request) {
  return {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: KEY_SESSION_MAX_AGE_SEC,
  };
}
