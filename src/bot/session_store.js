"use strict";

// Antigravity browser-session fallback.
//
// Primary auth path: OAuth refresh token. When Google revokes that refresh
// token (invalid_grant / "Account has been deleted"), the refresh loop can no
// longer mint access tokens even though the browser session on
// antigravity.google / accounts.google.com is still alive. This module keeps a
// persisted Google cookie jar per connection and replays it to recover a fresh
// access token whenever the OAuth refresh path dies.
//
// The jar is refreshed on every successful login (bulk bot, manual connect,
// or recovery) so `__Secure-next-auth.session-token` / `SID` / `SAPISID` stay
// current. While the cookies are valid the account keeps working even after
// the OAuth grant is deleted server-side.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const APP_NAME = process.env.ROUTERMOD_APP_NAME || "routermod";

// Cross-platform data dir, matching src/lib/dataDir.js:
//   Windows → %APPDATA%\routermod
//   Linux/macOS → ~/.routermod
function defaultDataDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      APP_NAME
    );
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

function resolveSessionDir() {
  if (process.env.AG_SESSION_DIR) return process.env.AG_SESSION_DIR;

  // Prefer the app's data dir when it's explicitly configured, so cookies live
  // alongside the DB on every platform.
  const configured = process.env.DATA_DIR;
  if (configured) {
    if (process.platform === "win32" && /^\//.test(configured)) {
      // Unix-style path on Windows → ignore, fall back to default.
    } else {
      return path.join(configured, "sessions");
    }
  }
  return path.join(defaultDataDir(), "sessions");
}

const SESSION_DIR = resolveSessionDir();

// Google/Antigravity cookies worth persisting. `__Secure-next-auth.session-token`
// is the Antigravity web session; SID/HSID/SSID/SAPISID/APISID are the Google
// account session used to re-mint it.
const KEEP_COOKIE_NAMES = new Set([
  "__Secure-next-auth.session-token",
  "__Host-next-auth.csrf-token",
  "__Secure-next-auth.callback-url",
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "SIDCC",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PSIDTS",
  "__Secure-3PSIDTS",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
  "NID",
  "AEC",
]);

function ensureDir() {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  } catch (_e) {}
}

function keyFor(connectionId, email) {
  const seed = String(connectionId || email || "unknown");
  return crypto.createHash("sha1").update(seed).digest("hex").slice(0, 24);
}

function sessionPath(connectionId, email) {
  return path.join(SESSION_DIR, `${keyFor(connectionId, email)}.json`);
}

function isGoogleCookie(cookie) {
  const domain = String(cookie?.domain || "").replace(/^\./, "");
  if (!domain) return KEEP_COOKIE_NAMES.has(cookie?.name);
  const google =
    domain.endsWith("google.com") ||
    domain.endsWith("googleusercontent.com") ||
    domain.endsWith("antigravity.google");
  return google && KEEP_COOKIE_NAMES.has(cookie?.name);
}

function normalizeCookies(cookies) {
  return (cookies || [])
    .filter((c) => c && c.name && typeof c.value === "string")
    .filter(isGoogleCookie)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".google.com",
      path: c.path || "/",
      expires: typeof c.expires === "number" ? c.expires : -1,
      httpOnly: !!c.httpOnly,
      secure: c.secure !== false,
      sameSite: c.sameSite || "None",
    }));
}

function loadSession(connectionId, email) {
  const candidates = [];
  if (connectionId) candidates.push(sessionPath(connectionId, null));
  if (email) candidates.push(sessionPath(null, email));
  candidates.push(sessionPath(connectionId, email));

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!raw || !Array.isArray(raw.cookies) || raw.cookies.length === 0) continue;
      return raw;
    } catch (_e) {}
  }
  return null;
}

function saveSession(connectionId, email, cookies, extra = {}) {
  const list = normalizeCookies(cookies);
  if (list.length === 0) return null;
  ensureDir();
  const file = sessionPath(connectionId, email);
  const payload = {
    connectionId: connectionId || null,
    email: email || null,
    savedAt: new Date().toISOString(),
    ...extra,
    cookies: list,
  };
  try {
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
    return payload;
  } catch (_e) {
    return null;
  }
}

// Parse a `Cookie:` header string into a cookie list (domain-less).
function cookiesFromHeader(header, domain = ".google.com") {
  if (!header || typeof header !== "string") return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf("=");
      if (idx <= 0) return null;
      return {
        name: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
        domain,
        path: "/",
        expires: -1,
        secure: true,
        sameSite: "None",
      };
    })
    .filter(Boolean);
}

// Merge `Set-Cookie` response headers into an existing jar (or a Cookie header
// string). Returns the updated cookie list.
function mergeSetCookies(existing, setCookieHeaders, domain = ".google.com") {
  const jar = new Map();
  for (const c of existing || []) {
    if (c?.name) jar.set(c.name, c);
  }

  const headers = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : setCookieHeaders
      ? [setCookieHeaders]
      : [];

  for (const raw of headers) {
    if (!raw) continue;
    const [pair] = String(raw).split(";");
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name) continue;
    if (value === "" || /^(deleted|expired)$/i.test(value)) {
      jar.delete(name);
      continue;
    }
    const prev = jar.get(name) || {};
    jar.set(name, {
      ...prev,
      name,
      value,
      domain: prev.domain || domain,
      path: prev.path || "/",
      secure: true,
      sameSite: prev.sameSite || "None",
    });
  }

  return [...jar.values()];
}

function toCookieHeader(cookies) {
  return normalizeCookies(cookies)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

// Translate a jar into puppeteer's setCookie() shape.
function toPuppeteerCookies(cookies) {
  return normalizeCookies(cookies).map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith(".") ? c.domain : `.${c.domain}`,
    path: c.path || "/",
    secure: true,
    httpOnly: !!c.httpOnly,
    sameSite: "None",
    expires: typeof c.expires === "number" ? c.expires : -1,
  }));
}

function hasAntigravitySession(cookies) {
  return (cookies || []).some(
    (c) => c.name === "__Secure-next-auth.session-token" && c.value
  );
}

function listSessions() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return [];
    return fs
      .readdirSync(SESSION_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf8"));
          return {
            file: f,
            connectionId: raw.connectionId || null,
            email: raw.email || null,
            savedAt: raw.savedAt || null,
            cookies: (raw.cookies || []).length,
            hasAntigravitySession: hasAntigravitySession(raw.cookies),
          };
        } catch (_e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (_e) {
    return [];
  }
}

module.exports = {
  SESSION_DIR,
  KEEP_COOKIE_NAMES,
  sessionPath,
  loadSession,
  saveSession,
  cookiesFromHeader,
  mergeSetCookies,
  toCookieHeader,
  toPuppeteerCookies,
  hasAntigravitySession,
  listSessions,
};
