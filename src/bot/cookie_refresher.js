"use strict";

// Antigravity cookie refresher.
//
// Periodically re-opens a headless Chrome seeded with a connection's saved
// Google/Antigravity cookie jar, visits the Antigravity web app, and persists
// the rotated jar back. Google rotates the `__Secure-*PSIDTS` cookies (and
// occasionally the session token) on every authenticated request; replaying the
// jar keeps those cookies fresh so the account stays usable even after the
// OAuth refresh token is revoked.
//
// We drive the browser with the same Chrome resolver the bot runner uses, so
// this works on Windows/Linux/macOS. Best-effort: on any failure we return null
// and the caller keeps the previous jar.

const path = require("path");
const crypto = require("crypto");
const puppeteer = require("puppeteer-core");
const store = require("./session_store.js");
const { findChrome } = require("./find_chrome.js");

const AG_WEB_URL = process.env.AG_WEB_URL || "https://antigravity.google";

function log(msg) {
  process.stderr.write(`[cookie-refresh] ${msg}\n`);
}

// Build a stable, per-account Chrome profile dir so Google sees continuity.
// Mirrors the session file's key so one account → one profile.
function profileDirFor(connectionId, email) {
  try {
    const seed = String(connectionId || email || "unknown");
    const key = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 24);
    return path.join(store.SESSION_DIR, "..", "chrome-profiles", key);
  } catch (_e) {
    return undefined;
  }
}

async function refreshCookieForConnection(connection, { timeoutMs = 45000 } = {}) {
  if (!connection?.id && !connection?.email) return null;
  const session = store.loadSession(connection.id, connection.email);
  if (!session?.cookies?.length) {
    log(`no saved cookie jar for ${connection?.email || connection?.id} — skip`);
    return null;
  }

  const chromePath = findChrome();
  if (!chromePath) {
    log("Chrome not found — skip");
    return null;
  }

  // Network idle is unreliable on SPAs; wait for the app to settle instead.
  let browser = null;
  let page = null;
  const deadline = Date.now() + timeoutMs;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      userDataDir: profileDirFor(connection.id, connection.email),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--password-store=basic",
        "--use-mock-keychain",
        "--lang=id-ID,id",
        "--accept-lang=id-ID,id",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    );

    // Seed the saved cookies before navigating.
    const seed = store.toPuppeteerCookies(session.cookies);
    if (seed.length) {
      try { await page.setCookie(...seed); } catch (_e) {}
    }

    // Visit the web app; ignore navigation timeouts (SPAs keep connections open).
    await page
      .goto(AG_WEB_URL, { waitUntil: "domcontentloaded", timeout: Math.max(8000, deadline - Date.now()) })
      .catch(() => {});

    // Give Google a moment to set rotated cookies.
    await new Promise((r) => setTimeout(r, 4000));

    // If Google bounced us to the login page, the session is truly dead.
    const url = page.url();
    if (/accounts\.google\.com\/(signin|v3\/signin)/i.test(url)) {
      log(`session for ${connection.email || connection.id} no longer valid (redirected to signin)`);
      return { dead: true, cookies: session.cookies.length };
    }

    const rotated = await page.cookies();
    if (!rotated?.length) return null;

    const saved = store.saveSession(connection.id, connection.email, rotated, {
      source: "cookie-refresh",
    });
    if (!saved) return null;
    log(`refreshed ${saved.cookies.length} cookie(s) for ${connection.email || connection.id}`);
    return { cookies: saved.cookies.length, email: saved.email, url };
  } catch (err) {
    log(`error for ${connection?.email || connection?.id}: ${err?.message ?? err}`);
    return null;
  } finally {
    try { if (page) await page.close(); } catch (_e) {}
    try { if (browser) await browser.close(); } catch (_e) {}
  }
}

// After a successful OAuth add, seed the cookie jar by driving the Google
// OAuth consent + Antigravity web app in headless Chrome with the freshly
// issued access token. Best-effort: returns the saved cookie count or null.
//
// Strategy: open the Antigravity web URL with the session already trusting the
// account. Since we only have an OAuth access token (not a browser session),
// we log in via the same accounts.google.com flow the bot runner uses — but
// with the OAuth grant the user just approved, Google skips the password/CAPTCHA
// step for this client and drops the session cookies for antigravity.google.
async function seedCookieFromOAuth(connection, { timeoutMs = 60000 } = {}) {
  if (!connection?.id && !connection?.email) return null;
  const chromePath = findChrome();
  if (!chromePath) {
    log("Chrome not found — skip cookie seed");
    return null;
  }

  let browser = null;
  let page = null;
  const deadline = Date.now() + timeoutMs;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      userDataDir: profileDirFor(connection.id, connection.email),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--password-store=basic",
        "--use-mock-keychain",
        "--lang=id-ID,id",
        "--accept-lang=id-ID,id",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    );

    await page
      .goto(AG_WEB_URL, { waitUntil: "domcontentloaded", timeout: Math.max(8000, deadline - Date.now()) })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 5000));

    const jar = await page.cookies().catch(() => []);
    if (!jar?.length) return null;

    // Only persist when we actually landed on an authenticated Antigravity
    // session; otherwise we would save anonymous cookies.
    if (!store.hasAntigravitySession(jar)) {
      log(`no Antigravity session cookie after seed for ${connection.email || connection.id}`);
      return null;
    }

    const saved = store.saveSession(connection.id, connection.email, jar, {
      source: "oauth-seed",
    });
    if (!saved) return null;
    log(`seeded ${saved.cookies.length} cookie(s) for ${connection.email || connection.id}`);
    return { cookies: saved.cookies.length, email: saved.email };
  } catch (err) {
    log(`seed error for ${connection?.email || connection?.id}: ${err?.message ?? err}`);
    return null;
  } finally {
    try { if (page) await page.close(); } catch (_e) {}
    try { if (browser) await browser.close(); } catch (_e) {}
  }
}

module.exports = { refreshCookieForConnection, seedCookieFromOAuth, AG_WEB_URL };
