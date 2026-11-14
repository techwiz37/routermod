"use strict";

// Antigravity session-based token recovery.
//
// Called when the OAuth refresh token is dead (invalid_grant) but a persisted
// browser cookie jar still exists. Two recovery strategies, cheapest first:
//
//   1. HTTP-only: replay the saved Google/Antigravity cookies against the
//      Antigravity web session endpoint to mint a fresh access token.
//   2. Browser: launch the saved cookies in headless Chrome, ride the
//      Antigravity IDE web app's own token exchange, then persist the rotated
//      jar back so it keeps working for the next cycle.
//
// Both are best-effort and fail-open: a null return simply means the caller
// falls back to marking the account dead as before.

const https = require("https");
const http = require("http");
const { URL } = require("url");
const store = require("./session_store.js");

const AG_WEB_BASE = process.env.AG_WEB_BASE || "https://antigravity.google";
const AG_TOKEN_URL =
  process.env.AG_SESSION_TOKEN_URL ||
  "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

function request(method, urlStr, { headers = {}, body, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          "User-Agent": DEFAULT_UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (_e) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json,
            text: data,
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (body) req.write(body);
    req.end();
  });
}

function extractAccessToken(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct =
    payload.accessToken ||
    payload.access_token ||
    payload.token ||
    payload.oauthToken;
  if (typeof direct === "string" && direct.length > 20) return direct;

  for (const key of ["credentials", "session", "data", "result", "auth"]) {
    const nested = extractAccessToken(payload[key]);
    if (nested) return nested;
  }
  return null;
}

function extractExpiresIn(payload) {
  if (!payload || typeof payload !== "object") return null;
  const v =
    payload.expiresIn ||
    payload.expires_in ||
    payload.expiry ||
    payload.expiresAt;
  if (typeof v === "number") return v > 1e6 ? Math.floor(v / 1000) : v;
  if (typeof v === "string") {
    const asNum = Number(v);
    if (Number.isFinite(asNum)) return asNum > 1e6 ? Math.floor(asNum / 1000) : asNum;
    const asDate = Date.parse(v);
    if (Number.isFinite(asDate)) return Math.max(1, Math.floor((asDate - Date.now()) / 1000));
  }
  return null;
}

// ── Strategy 1: HTTP-only cookie replay ─────────────────────────────────────
async function recoverViaHttp(session, log) {
  const cookieHeader = store.toCookieHeader(session.cookies);
  if (!cookieHeader) return null;

  const candidates = [
    { url: `${AG_WEB_BASE}/api/auth/session`, method: "GET" },
    { url: `${AG_WEB_BASE}/api/auth/token`, method: "GET" },
    { url: `${AG_WEB_BASE}/api/auth/session`, method: "POST", body: "{}" },
  ];

  for (const cand of candidates) {
    try {
      const res = await request(cand.method, cand.url, {
        headers: {
          Cookie: cookieHeader,
          Origin: AG_WEB_BASE,
          Referer: `${AG_WEB_BASE}/`,
          ...(cand.body ? { "Content-Type": "application/json" } : {}),
        },
        body: cand.body,
      });

      if (res.status >= 400) continue;

      const token = extractAccessToken(res.body);
      if (token) {
        const rotated = store.mergeSetCookies(
          session.cookies,
          res.headers["set-cookie"]
        );
        return {
          accessToken: token,
          expiresIn: extractExpiresIn(res.body) || 3600,
          cookies: rotated,
        };
      }

      // Even without a token, keep Set-Cookie rotation from a live session.
      if (res.headers["set-cookie"]) {
        session.cookies = store.mergeSetCookies(
          session.cookies,
          res.headers["set-cookie"]
        );
      }
    } catch (_e) {
      // try next candidate
    }
  }

  log?.debug?.("AG_SESSION", "HTTP cookie replay found no access token");
  return null;
}

// ── Strategy 2: headless browser on the Antigravity web app ─────────────────
// Chrome/Chromium discovery is shared with ag_runner.js (cross-platform).
const { findChrome: findChromeExecutable } = require("./find_chrome.js");

async function findChrome() {
  return findChromeExecutable();
}

async function recoverViaBrowser(session, log) {
  let puppeteer;
  try {
    puppeteer = require("puppeteer-core");
  } catch (_e) {
    log?.debug?.("AG_SESSION", "puppeteer-core not available, skipping browser recovery");
    return null;
  }

  const chromePath = await findChrome();
  if (!chromePath) return null;

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--disable-gpu",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_UA);

    // Seed the persisted cookie jar into the browser profile.
    const seedable = store
      .toPuppeteerCookies(session.cookies)
      .map((c) => ({ ...c, domain: c.domain.replace(/^\./, ".") }));
    for (const c of seedable) {
      try {
        await page.setCookie(c);
      } catch (_e) {}
    }

    const captured = { token: null, expiresIn: null };

    page.on("response", async (res) => {
      try {
        const url = res.url();
        if (!/token|session|auth|login/i.test(url)) return;
        const ct = res.headers()["content-type"] || "";
        if (!ct.includes("json")) return;
        const json = await res.json().catch(() => null);
        const token = extractAccessToken(json);
        if (token && !captured.token) {
          captured.token = token;
          captured.expiresIn = extractExpiresIn(json) || 3600;
        }
      } catch (_e) {}
    });

    await page.goto(`${AG_WEB_BASE}/`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    }).catch(() => {});

    // Give the SPA a moment to complete its own session bootstrap.
    for (let i = 0; i < 20 && !captured.token; i++) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Persist any rotated cookies regardless of token outcome.
    let cookies = session.cookies;
    try {
      cookies = await page.cookies();
    } catch (_e) {}

    return {
      accessToken: captured.token,
      expiresIn: captured.expiresIn,
      cookies,
      viaBrowser: true,
    };
  } finally {
    try {
      await browser?.close();
    } catch (_e) {}
  }
}

// ── Public entry ────────────────────────────────────────────────────────────
async function recoverAntigravityAccessToken({ connectionId, email, log } = {}) {
  const session = store.loadSession(connectionId, email);
  if (!session) {
    log?.debug?.("AG_SESSION", "No persisted browser session for connection", {
      connectionId,
      email,
    });
    return null;
  }

  log?.info?.("AG_SESSION", "Attempting cookie-based session recovery", {
    connectionId,
    email,
    cookies: session.cookies.length,
    hasAntigravitySession: store.hasAntigravitySession(session.cookies),
  });

  let result = await recoverViaHttp(session, log).catch(() => null);
  if (!result?.accessToken) {
    result = await recoverViaBrowser(session, log).catch((e) => {
      log?.warn?.("AG_SESSION", `Browser recovery failed: ${e.message}`);
      return null;
    });
  }

  if (result?.cookies?.length) {
    store.saveSession(connectionId, email, result.cookies, {
      recoveredAt: new Date().toISOString(),
    });
  }

  if (!result?.accessToken) {
    log?.warn?.("AG_SESSION", "Session recovery did not yield an access token", {
      connectionId,
      email,
    });
    return null;
  }

  log?.info?.("AG_SESSION", "Session recovery succeeded", {
    connectionId,
    email,
    viaBrowser: !!result.viaBrowser,
  });

  return {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn || 3600,
  };
}

module.exports = {
  recoverAntigravityAccessToken,
  extractAccessToken,
  extractExpiresIn,
  AG_WEB_BASE,
};
