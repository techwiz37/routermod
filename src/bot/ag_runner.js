"use strict";

const puppeteer = require("puppeteer-core");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const sessionStore = require("./session_store.js");
const { findChrome } = require("./find_chrome.js");
const os = require("os");

const GOOGLE_PASSWORD = "qwertyui";

// Headless Chrome is fingerprinted by Google (navigator.webdriver, missing
// plugins, odd languages, software WebGL...), which triggers an image CAPTCHA
// before the password step. This script runs on every new document and hides
// the most common automation tells. It is defense-in-depth, not a guarantee.
const STEALTH_SCRIPT = `
(() => {
  const define = (obj, prop, value) => {
    try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch (e) {}
  };
  // 1. navigator.webdriver → undefined
  try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true }); } catch (e) {}
  // 2. chrome runtime shim (headless often has none)
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) window.chrome.runtime = {};
  define(window.chrome.runtime, 'id', undefined);
  // 3. languages
  define(navigator, 'languages', ['id-ID', 'id', 'en-US', 'en']);
  define(navigator, 'language', 'id-ID');
  // 4. plugins + mimeTypes (headless reports 0)
  const fakePlugin = (name, filename, desc) => ({
    name, filename, description: desc, length: 1,
    item: () => null, namedItem: () => null,
  });
  const pluginList = [
    fakePlugin('PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
    fakePlugin('Chrome PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
    fakePlugin('Chromium PDF Viewer', 'internal-pdf-viewer', 'Portable Document Format'),
  ];
  define(navigator, 'plugins', pluginList);
  define(navigator, 'mimeTypes', [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }]);
  // 5. hardware concurrency / memory look like a real box
  define(navigator, 'hardwareConcurrency', 8);
  define(navigator, 'deviceMemory', 8);
  define(navigator, 'platform', 'Win32');
  // 6. permissions query spoof
  try {
    const origQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (origQuery) {
      window.navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    }
  } catch (e) {}
  // 7. WebGL vendor/renderer (software renderer is a giveaway)
  try {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return 'Google Inc. (Intel)';
      if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0)';
      return getParam.call(this, p);
    };
  } catch (e) {}
  // 8. hide that we run under CDP
  try {
    delete Object.getPrototypeOf(navigator).webdriver;
  } catch (e) {}
})();
`;


// Normalize a proxy string into { server, username, password } for Chrome.
// Chrome wants "scheme://host:port" without credentials; creds go to
// page.authenticate(). Defaults to http:// when no scheme is given.
function parseProxy(raw) {
  const out = { server: "", username: "", password: "" };
  if (!raw) return out;
  let s = String(raw).trim();
  if (!/^[a-z0-9]+:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    const scheme = (u.protocol || "http:").replace(":", "") || "http";
    out.server = `${scheme}://${u.hostname}${u.port ? ":" + u.port : ""}`;
    out.username = u.username ? decodeURIComponent(u.username) : "";
    out.password = u.password ? decodeURIComponent(u.password) : "";
  } catch (_e) {
    out.server = s;
  }
  return out;
}

function ts() { return new Date().toTimeString().slice(0, 8); }function log(msg) { process.stderr.write(`${ts()} ${msg}\n`); }
function logOk(msg) { log(`\x1b[32m${msg}\x1b[0m`); }
function logErr(msg) { log(`\x1b[31m${msg}\x1b[0m`); }

function httpLog(method, url, status) {
  const statusStr = status >= 400 ? `\x1b[31m${status}\x1b[0m` : `\x1b[32m${status}\x1b[0m`;
  log(`${method} ${url} - ${statusStr}`);
}

function request(method, urlStr, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === "https:" ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
    };
    const req = mod.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch (_e) { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function resolveAuth(baseUrl, raw) {
  if (raw && raw.includes("auth_token=")) {
    const res = await request("GET", `${baseUrl}/api/auth/status`, { cookie: raw });
    httpLog("GET", "/api/auth/status", res.status);
    return raw.startsWith("auth_token=") ? raw : `auth_token=${raw}`;
  }
  const res = await request("POST", `${baseUrl}/api/auth/login`, {
    body: JSON.stringify({ password: raw }),
  });
  httpLog("POST", "/api/auth/login", res.status);
  if (res.status !== 200) throw new Error(`Login gagal: ${res.status}`);
  for (const c of (res.headers["set-cookie"] || [])) {
    const m = c.match(/auth_token=([^;]+)/);
    if (m) return `auth_token=${m[1]}`;
  }
  throw new Error("Login gagal — tidak ada auth_token");
}

async function getAuthorizeData(baseUrl, cookie) {
  const redirectUri = `${baseUrl}/callback`;
  const res = await request("GET",
    `${baseUrl}/api/oauth/antigravity/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`,
    { cookie }
  );
  httpLog("GET", "/api/oauth/antigravity/authorize", res.status);
  if (res.status !== 200) throw new Error(`Authorize gagal: ${res.status}`);
  return res.body;
}

async function cdpClick(client, x, y) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  await new Promise(r => setTimeout(r, 50));
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await new Promise(r => setTimeout(r, 80));
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function cdpType(client, text) {
  for (const ch of text) {
    await client.send("Input.dispatchKeyEvent", { type: "char", text: ch });
    await new Promise(r => setTimeout(r, 60));
  }
}

async function cdpEnter(client) {
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });
  await new Promise(r => setTimeout(r, 50));
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  });
}

const ACCEPT_TEXTS = [
  "sign in", "allow", "accept", "agree", "i agree", "continue",
  "confirm", "lanjut", "izinkan", "i understand", "saya mengerti", "next", "berikutnya",
];
const DENY_TEXTS = ["cancel", "batal", "deny", "help", "privacy", "terms", "forgot"];

async function cdpClickButton(page, client, texts) {
  try {
    const handles = await page.$$("button,[role=button]");
    for (const h of handles) {
      const t = await h.evaluate(el => el.textContent.trim());
      if (!t) continue;
      const low = t.toLowerCase();
      if (!texts.some(tx => low.includes(String(tx).toLowerCase()))) continue;
      if (DENY_TEXTS.some(d => low === d)) continue;
      await h.evaluate(el => el.scrollIntoView({ block: "center" }));
      await new Promise(r => setTimeout(r, 250));
      const box = await h.boundingBox();
      if (box && box.width > 0 && box.y >= 0) {
        await cdpClick(client, box.x + box.width / 2, box.y + box.height / 2);
        return t;
      }
    }
  } catch (_e) {}
  return null;
}

async function googleOAuth(browser, email, googlePass, authUrl, redirectUri) {
  const cookiesOnly = redirectUri === null;
  // Prefer the default (persistent user-data-dir) context so Google sees a
  // profile with cookie/history continuity; fall back to an isolated context
  // if the default one is unavailable.
  let context = null;
  try {
    const pages = await browser.pages();
    if (pages.length) context = pages[0].browserContext();
  } catch (_e) {}
  if (!context) context = await browser.createBrowserContext();
  const page = await context.newPage();
  const client = await page.target().createCDPSession();
  try {
    // Install the anti-fingerprint script before any navigation so it runs on
    // every document (including Google's signin iframes).
    try { await client.send("Page.addScriptToEvaluateOnNewDocument", { source: STEALTH_SCRIPT }); } catch (_e) {}
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    );
    try {
      await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
      await page.setExtraHTTPHeaders({ "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7" });
    } catch (_e) {}

    log(`GET ${authUrl.slice(0, 80)} ...`);
    await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const chooser = await page.$(`[data-identifier="${email}"]`);
    if (chooser) {
      log(`POST /oauth2/v4/token [${email}] - account chooser`);
      const box = await chooser.boundingBox();
      if (box) await cdpClick(client, box.x + box.width / 2, box.y + box.height / 2);
      await new Promise(r => setTimeout(r, 2000));
    } else {
      let emailEl = null;
      for (let attempt = 0; attempt < 3 && !emailEl; attempt++) {
        emailEl = await page.waitForSelector("#identifierId", { timeout: 20000 }).catch(() => null);
        if (!emailEl) {
          const alt = await page.$('input[type="email"], input[name="identifier"]').catch(() => null);
          if (alt) { emailEl = alt; break; }
          const curr = page.url();
          if (curr.includes("accounts.google.com")) {
            log(`[retry ${attempt + 1}/3] identifierId belum muncul — reload...`);
            await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            await new Promise(r => setTimeout(r, 2500));
          } else {
            break;
          }
        }
      }
      if (!emailEl) {
        throw new Error(`Form email Google tidak muncul (URL: ${page.url().slice(0, 90)})`);
      }
      log(`POST /oauth2/v4/token [${email}] ...`);
      const eBox = await emailEl.boundingBox();
      await cdpClick(client, eBox.x + eBox.width / 2, eBox.y + eBox.height / 2);
      await new Promise(r => setTimeout(r, 300));
      await cdpType(client, email);
      await new Promise(r => setTimeout(r, 400));
      await cdpEnter(client);
      await new Promise(r => setTimeout(r, 500));
      const pwdCheck = await page.$('input[type="password"], input[name="Passwd"]').catch(() => null);
      if (!pwdCheck) {
        await cdpClickButton(page, client, ["Next", "Berikutnya"]);
      }
      await new Promise(r => setTimeout(r, 2500));
    }

    let pwdEl;
    try {
      pwdEl = await page.waitForSelector('input[type="password"], input[name="Passwd"]', { visible: true, timeout: 20000 });
    } catch (err) {
      // Google sometimes lands on a "Account deleted ... may be recoverable"
      // interstitial instead of the password page. Click its "Next" button and
      // see if Google restores the account into the normal password flow.
      try {
        const url = page.url();
        const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
        const looksDeleted = /deletedaccount/i.test(url) || /account deleted/i.test(bodyText);
        if (looksDeleted) {
          log(`[restore] "Account deleted" screen for ${email} — attempting restore via Next`);
          await cdpClickButton(page, client, ["Next", "Berikutnya"]);
          await new Promise(r => setTimeout(r, 2500));
          try {
            pwdEl = await page.waitForSelector('input[type="password"], input[name="Passwd"]', { visible: true, timeout: 15000 });
          } catch (_e2) {
            pwdEl = null;
          }
        }
      } catch (_e) {}

      if (!pwdEl) {
        // Screenshot + DOM dump so we can see what Google actually rendered
        // (consent screen, 2FA prompt, "couldn't sign in", etc).
        let pageTxt = "";
        try {
          const os = require("os");
          const shot = path.join(os.tmpdir(), `ag_nopwd_${Date.now()}.png`);
          await page.screenshot({ path: shot, fullPage: true });
          log(`[debug] password field not found — URL: ${page.url().slice(0, 120)}`);
          log(`[debug] screenshot: ${shot}`);
          pageTxt = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || "").catch(() => "");
          if (pageTxt) log(`[debug] page text: ${pageTxt.replace(/\s+/g, " ").slice(0, 300)}`);
        } catch (_e) {}
        // Turn Google's anti-bot / dead-account screens into an explicit reason
        // instead of a bare selector timeout, so the job log is actionable.
        const flat = pageTxt.replace(/\s+/g, " ");
        if (/captcha|ketik teks|type the text|unusual traffic|tidak biasa/i.test(flat + " " + page.url())) {
          throw new Error(`Google CAPTCHA/verifikasi muncul untuk ${email}. Butuh proxy residential (atau isi manual) — IP server ini ditandai Google.`);
        }
        if (/deletedaccount|account deleted|akun.*dihapus|berikutnya.*pulihkan/i.test(page.url() + " " + flat)) {
          throw new Error(`Akun Google ${email} dihapus/tidak bisa dipulihkan (halaman "Account deleted").`);
        }
        if (/signin\/rejected|couldn.?t sign you in|contact your domain admin|tidak dapat.*masuk/i.test(page.url() + " " + flat)) {
          throw new Error(`Google menolak login ${email} (signin/rejected — akun diblokir admin domain).`);
        }
        throw err;
      }
    }
    const pBox = await pwdEl.boundingBox();
    await cdpClick(client, pBox.x + pBox.width / 2, pBox.y + pBox.height / 2);
    await new Promise(r => setTimeout(r, 300));
    await cdpType(client, googlePass);
    await new Promise(r => setTimeout(r, 400));
    await cdpEnter(client);
    await new Promise(r => setTimeout(r, 500));
    const stillPwd = await page.$('input[type="password"]').catch(() => null);
    if (stillPwd) {
      await cdpClickButton(page, client, ["Next", "Berikutnya"]);
    }
    await new Promise(r => setTimeout(r, 2500));

    if (cookiesOnly) {
      // Cookies-only mode: we already authenticated to Google. Visit the
      // Antigravity web app so its own next-auth session cookie gets minted,
      // then persist the full jar. No OAuth code exchange, no new connection.
      log(`[cookies] visiting Antigravity web for ${email} ...`);
      await page.goto("https://antigravity.google/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
      // Give the SPA time to run its session bootstrap / redirect chains.
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1500));
        if (page.url().includes("antigravity.google")) break;
      }
      const jar = await context.cookies().catch(() => []);
      const saved = sessionStore.saveSession(null, email, jar, { source: "cookies-only" });
      const kept = saved ? saved.cookies.length : 0;
      log(`[cookies] captured ${jar.length} cookie(s), kept ${kept} for ${email}`);
      if (!kept) throw new Error(`Tidak ada cookie berguna untuk ${email}`);
      return { cookiesOnly: true, email, kept };
    }

    const base = redirectUri.split("?")[0];
    const deadline = Date.now() + 120000;
    let lastUrl = "";
    let dumped = false;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1200));
      const curr = page.url();

      if (curr !== lastUrl) {
        log(`GET ${curr.slice(0, 100)} - 302`);
        lastUrl = curr;
        dumped = false;
      }

      if (curr.startsWith(base) && curr.includes("code=")) {
        httpLog("GET", `/callback?code=*** [${email}]`, 200);
        // Persist the live Google/Antigravity cookie jar so the account can be
        // recovered later even if Google revokes the OAuth refresh token.
        try {
          const jar = await context.cookies();
          sessionStore.saveSession(null, email, jar, { source: "bot-bulk" });
          log(`[session] saved ${jar.length} cookie(s) for ${email}`);
        } catch (e) {
          log(`[session] failed to persist cookies for ${email}: ${e.message}`);
        }
        return curr;
      }
      if (curr.includes("error=") && !curr.includes("nativeapp")) {
        throw new Error(`OAuth error: ${curr.slice(0, 200)}`);
      }

      const clicked = await cdpClickButton(page, client, ACCEPT_TEXTS);
      if (clicked) log(`POST /signin/challenge - "${clicked}" - 200`);

      if (!clicked && !dumped && (curr.includes("speedbump") || curr.includes("tos") || curr.includes("interstitial"))) {
        dumped = true;
        try {
          const btns = await page.evaluate(() =>
            Array.from(document.querySelectorAll("button,[role=button]"))
              .filter(b => b.offsetParent !== null)
              .map(b => `"${b.textContent.trim().slice(0, 50)}"`)
          );
          log(`[challenge] buttons: ${btns.join(", ") || "(none)"}`);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        } catch (_e) {}
      }
    }

    try {
      const os = require("os");
      const shot = path.join(os.tmpdir(), `ag_debug_${Date.now()}.png`);
      await page.screenshot({ path: shot });
      log(`[debug] screenshot: ${shot}`);
    } catch (_e) {}

    throw new Error(`Timeout 120s [${email}] — URL: ${page.url().slice(0, 100)}`);
  } finally {
    await page.close().catch(() => {});
    // Never close the browser's default persistent context (that would wipe
    // the profile mid-run); only tear down isolated contexts we created.
    try {
      if (typeof context.isIncognito === "function" ? context.isIncognito() : true) {
        await context.close();
      }
    } catch (_e) {}
  }
}

async function exchangeCode(baseUrl, cookie, callbackUrl, authData) {
  const u = new URL(callbackUrl);
  const code = u.searchParams.get("code");
  if (!code) throw new Error(`Tidak ada 'code' di callback: ${callbackUrl.slice(0, 100)}`);
  const res = await request("POST", `${baseUrl}/api/oauth/antigravity/exchange`, {
    cookie,
    body: JSON.stringify({
      code,
      state: u.searchParams.get("state") || authData.state,
      redirectUri: authData.redirectUri,
      codeVerifier: authData.codeVerifier,
    }),
  });
  httpLog("POST", "/api/oauth/antigravity/exchange", res.status);
  if (!res.body?.success) throw new Error(`Exchange gagal: ${JSON.stringify(res.body)}`);
  logOk(`200 OK - [${res.body.connection?.email || "?"}] connected successfully`);
  return res.body;
}

const GOOGLE_LOGIN_URL = "https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&service=accountsettings";

async function processAccount(browser, email, googlePass, baseUrl, cookie, cookiesOnly = false) {
  log(`--- Processing [${email}]${cookiesOnly ? " (cookies-only)" : ""} ---`);
  try {
    if (cookiesOnly) {
      await googleOAuth(browser, email, googlePass, GOOGLE_LOGIN_URL, null);
      return true;
    }
    const authData = await getAuthorizeData(baseUrl, cookie);
    const authUrl = authData.authUrl || authData.url;
    const redirectUri = authData.redirectUri || `${baseUrl}/callback`;
    if (!authUrl) throw new Error(`Tidak ada authUrl`);
    const callbackUrl = await googleOAuth(browser, email, googlePass, authUrl, redirectUri);
    await exchangeCode(baseUrl, cookie, callbackUrl, authData);
    return true;
  } catch (e) {
    logErr(`500 Internal Server Error - [${email}] ${String(e.message || e).slice(0, 200)}`);
    return false;
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  let cookiesOnly = false;
  let proxyUrl = process.env.AG_PROXY_URL || null;
  const positional = [];
  for (const a of rawArgs) {
    if (a === "--cookies-only") cookiesOnly = true;
    else if (a.startsWith("--proxy=")) proxyUrl = a.slice("--proxy=".length).trim() || null;
    else positional.push(a);
  }
  const [rawBaseUrl, authArg, ...entries] = positional;
  const baseUrl = String(rawBaseUrl || "").replace(/\/dashboard\/.*$/, "").replace(/\/+$/, "");
  if (!baseUrl || !authArg || entries.length === 0) {
    process.stderr.write("Usage: node ag_runner.js <baseUrl> <auth_token=...|password> [--cookies-only] <email[|googlePass]> ...\n");
    process.exit(1);
  }

  log(`=== ${cookiesOnly ? "Sync cookie" : "Bulk add"} ${entries.length} account(s) ===`);

  let cookie;
  try {
    cookie = await resolveAuth(baseUrl, authArg);
  } catch (e) {
    logErr(`Login gagal: ${e.message}`);
    process.stdout.write(JSON.stringify({ added: 0, failed: entries.length, total: entries.length }) + "\n");
    process.exit(1);
  }

  const chromePath = findChrome();
  if (!chromePath) {
    logErr("Chrome tidak ditemukan.");
    process.exit(1);
  }
  log(`[browser] ${path.basename(path.dirname(chromePath))}`);

  // Use a persistent, per-run user-data-dir: Google trusts a profile that
  // keeps cookies/history across navigations far more than a fresh incognito
  // one. We keep it under the app data dir so it survives restarts.
  let userDataDir;
  try {
    const base = process.env.ROUTERMOD_DATA_DIR
      || (process.platform === "win32"
        ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "routermod")
        : path.join(os.homedir(), ".routermod"));
    userDataDir = path.join(base, "chrome-profile");
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch (_e) {
    userDataDir = undefined;
  }

  // Headless is the default, but Google's anti-bot is far more suspicious of
  // headless Chrome. Set AG_HEADLESS=0 to run headful (needs a display; on
  // Linux use xvfb-run). AG_HEADLESS=shell uses the old chrome-headless-shell.
  const headlessEnv = String(process.env.AG_HEADLESS ?? "true").toLowerCase();
  const headless = headlessEnv === "0" || headlessEnv === "false" ? false
    : headlessEnv === "shell" ? "shell"
    : true;
  log(`[browser] headless=${headless}`);

  // Build the launch arg list; route Chrome through the proxy when given.
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--window-size=1366,900",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--password-store=basic",
    "--use-mock-keychain",
    "--lang=id-ID,id",
    "--accept-lang=id-ID,id",
  ];
  if (proxyUrl) {
    // Chrome's --proxy-server does NOT accept inline credentials
    // (http://user:pass@host:port → ERR_NO_SUPPORTED_PROXIES). Pass host:port
    // only and answer the auth dialog via page.authenticate() below.
    const parsed = parseProxy(proxyUrl);
    launchArgs.push(`--proxy-server=${parsed.server}`);
    log(`[browser] proxy=${parsed.server}${parsed.username ? " (auth)" : ""}`);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless,
    userDataDir,
    args: launchArgs,
    ignoreDefaultArgs: ["--enable-automation", "--headless"],
  });

  // Supply proxy credentials to every page/target Chrome opens.
  if (proxyUrl) {
    const parsed = parseProxy(proxyUrl);
    if (parsed.username || parsed.password) {
      const applyAuth = async (page) => {
        try {
          await page.authenticate({ username: parsed.username, password: parsed.password });
        } catch (_e) {}
      };
      browser.on("targetcreated", async (target) => {
        try {
          const p = await target.page();
          if (p) await applyAuth(p);
        } catch (_e) {}
      });
      for (const p of await browser.pages()) await applyAuth(p);
    }
  }

  let added = 0, failed = 0;
  try {
    for (let i = 0; i < entries.length; i++) {
      const parts = entries[i].split("|");
      const email = parts[0].trim();
      const googlePass = (parts[1] || GOOGLE_PASSWORD).trim();
      log(`[${i + 1}/${entries.length}] ${email}`);
      let ok = await processAccount(browser, email, googlePass, baseUrl, cookie, cookiesOnly);
      if (!ok) {
        log(`[retry] ${email} in 30s...`);
        await new Promise(r => setTimeout(r, 30000));
        ok = await processAccount(browser, email, googlePass, baseUrl, cookie, cookiesOnly);
      }
      if (ok) added++; else failed++;
      if (i < entries.length - 1) {
        const waitMs = parseInt(process.env.AG_WAIT_MS || (cookiesOnly ? "4000" : "20000"), 10);
        log(`[wait] ${waitMs / 1000}s before next account...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  } finally {
    await browser.close();
  }

  log(`=== Done: ${added} success, ${failed} failed ===`);
  process.stdout.write(JSON.stringify({ added, failed, total: entries.length, cookiesOnly }) + "\n");
}

main().catch((e) => { logErr(`Fatal: ${e.message}`); process.exit(1); });
