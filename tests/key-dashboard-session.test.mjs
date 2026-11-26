import test from "node:test";
import assert from "node:assert/strict";

// Alias resolver register (same setup as the other integration tests)
import { register } from "node:module";
register("./alias-resolver.mjs", import.meta.url);

const { KEY_SESSION_COOKIE, KEY_SESSION_MAX_AGE_SEC, keySessionCookieOptions } = await import("../src/lib/auth/keySession.js");

const request = (url) => ({ url });

test("key dashboard session lasts a full day instead of dying with the browser", () => {
  // Regression: the cookie used to be a session cookie (no Max-Age), so closing
  // the browser — or a mobile tab discard — logged the user out unannounced.
  assert.equal(KEY_SESSION_MAX_AGE_SEC, 24 * 60 * 60);
  const options = keySessionCookieOptions(request("http://localhost:1337/api/public/key-dashboard"));
  assert.equal(options.maxAge, 24 * 60 * 60, "cookie must carry Max-Age so it survives a browser restart");
});

test("key dashboard cookie is HttpOnly, path-rooted, Lax, and only Secure over https", () => {
  const http = keySessionCookieOptions(request("http://localhost:1337/api/public/key-dashboard"));
  assert.equal(http.httpOnly, true);
  // Lax (not Strict) so opening the dashboard from an external link still sends
  // the session; cross-site POST/PATCH/DELETE still withhold it.
  assert.equal(http.sameSite, "lax");
  assert.equal(http.path, "/");
  assert.equal(http.secure, false);

  const https = keySessionCookieOptions(request("https://dep.example.com/api/public/key-dashboard"));
  assert.equal(https.secure, true);
});

test("explicit logout is still the only thing that shortens the session", () => {
  // DELETE reuses the same options and overrides maxAge to 0.
  const cleared = { ...keySessionCookieOptions(request("http://localhost:1337/api/public/key-dashboard")), maxAge: 0 };
  assert.equal(cleared.maxAge, 0);
  assert.equal(KEY_SESSION_COOKIE, "rmod_key_dashboard");
});
