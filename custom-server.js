const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

// Hardcoded listen address — no .env needed.
const APP_PORT = "1337";
const APP_HOSTNAME = "0.0.0.0";
process.env.PORT = APP_PORT;
process.env.HOSTNAME = APP_HOSTNAME;

const origCreate = http.createServer.bind(http);

// Per-process secret proving x-9r-real-ip was stamped below rather than sent by the client.
// A bare `next start` / `next dev` never loads this file, so it cannot produce a matching
// header even though the env var is inherited by child processes. Named like x-9r-cli-token
// so the request-detail header sanitizer redacts it too.
const PEER_TOKEN = crypto.randomBytes(24).toString("hex");
process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;

let backgroundRefreshStarted = false;
let backgroundHealthStarted = false;
let backgroundCookieRefreshStarted = false;
let backgroundBackupStarted = false;
let solanaBridgeChild = null;
let solanaBridgeRestartTimer = null;
let solanaBridgeStopping = false;
let freepiBridgeChild = null;
let freepiBridgeRestartTimer = null;
let freepiBridgePollTimer = null;
let freepiBridgeStopping = false;
let freepiBridgeLastLogAt = 0;

function startBackgroundConnectionHealthFromCustomServer() {
  if (backgroundHealthStarted) return;
  backgroundHealthStarted = true;
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundConnectionHealth.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundConnectionHealth();
      } catch (e) {
        console.error("[BackgroundConnectionHealth] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundConnectionHealth();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      if (process.env.DEBUG_BACKGROUND_CONNECTION_HEALTH) {
        console.error("[BackgroundConnectionHealth] import failed:", e && e.message ? e.message : e);
      }
    });
}

function startBackgroundTokenRefreshFromCustomServer() {
  if (backgroundRefreshStarted) return;
  backgroundRefreshStarted = true;
  // Prefer source path (repo / standalone that still has src). Fail-open if missing
  // — initializeApp also starts the same scheduler when the Next app boots.
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundTokenRefresh.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundTokenRefresh();
      } catch (e) {
        console.error("[BackgroundTokenRefresh] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundTokenRefresh();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      // Expected in published CLI standalone (src/ not on disk). App bootstrap covers it.
      if (process.env.DEBUG_BACKGROUND_TOKEN_REFRESH) {
        console.error("[BackgroundTokenRefresh] import failed:", e && e.message ? e.message : e);
      }
    });
}

function startBackgroundCookieRefreshFromCustomServer() {
  if (backgroundCookieRefreshStarted) return;
  backgroundCookieRefreshStarted = true;
  const modPath = path.join(__dirname, "src", "sse", "services", "backgroundCookieRefresh.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackgroundCookieRefresh();
      } catch (e) {
        console.error("[BackgroundCookieRefresh] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackgroundCookieRefresh();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      if (process.env.DEBUG_BG_COOKIE_REFRESH) {
        console.error("[BackgroundCookieRefresh] import failed:", e && e.message ? e.message : e);
      }
    });
}

function startBackupSchedulerFromCustomServer() {
  if (backgroundBackupStarted) return;
  backgroundBackupStarted = true;
  const modPath = path.join(__dirname, "src", "lib", "db", "backupScheduler.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        m.startBackupScheduler();
      } catch (e) {
        console.error("[BackupScheduler] start failed:", e && e.message ? e.message : e);
      }
      const stop = () => {
        try {
          m.stopBackupScheduler();
        } catch {
          /* ignore */
        }
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((e) => {
      if (process.env.DEBUG_BACKUP_SCHEDULER) {
        console.error("[BackupScheduler] import failed:", e && e.message ? e.message : e);
      }
    });
}

// ── solana.ai bridge supervisor ──────────────────────────────────────────────
// Running RouterMod is the single entrypoint: if the local solana2api bridge is
// not answering, start it here and keep it alive. A bridge already started by
// pm2/systemd is detected through /health and is left alone (no double spawn).
function solanaBridgeConfig() {
  const baseUrl = process.env.SOLANA2API_BASE_URL || "http://127.0.0.1:18620/v1/chat/completions";
  let healthUrl = baseUrl;
  try {
    const u = new URL(baseUrl);
    u.pathname = "/health";
    u.search = "";
    healthUrl = u.toString();
  } catch { /* fall back to the default health URL */ }
  const repoRoot = path.resolve(__dirname, "..", "..");
  const script = [path.join(__dirname, "scripts", "solana2api.py"), path.join(repoRoot, "scripts", "solana2api.py")]
    .find((p) => fs.existsSync(p)) || path.join(repoRoot, "scripts", "solana2api.py");
  // venv lives outside the repo: a symlink inside the project makes Turbopack
  // panic while scanning the source tree during `next build`.
  const python = [process.env.SOLANA2API_PYTHON, "/root/.solana2api-venv/bin/python", "/usr/bin/python3"]
    .find((p) => p && fs.existsSync(p));
  return { healthUrl, script, python, cwd: path.dirname(script) };
}

function isSolanaBridgeHealthy(healthUrl) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function spawnSolanaBridge() {
  const cfg = solanaBridgeConfig();
  if (!cfg.python || !fs.existsSync(cfg.script)) {
    console.error("[SolanaBridge] python or script missing — bridge not started");
    return;
  }
  const hasXvfb = process.env.SOLANA2API_HEADLESS !== "1"
    && (fs.existsSync("/usr/bin/xvfb-run") || fs.existsSync("/usr/local/bin/xvfb-run"));
  const child = hasXvfb
    ? spawn("xvfb-run", ["-a", cfg.python, cfg.script], { cwd: cfg.cwd, stdio: "ignore", detached: false })
    : spawn(cfg.python, [cfg.script], { cwd: cfg.cwd, stdio: "ignore", detached: false, env: { ...process.env, SOLANA2API_HEADLESS: "1" } });
  solanaBridgeChild = child;
  console.log(`[SolanaBridge] starting ${cfg.script} (pid ${child.pid || "?"})`);
  child.on("error", (err) => console.error("[SolanaBridge] spawn failed:", err.message));
  child.on("exit", (code) => {
    if (solanaBridgeChild !== child || solanaBridgeStopping) return;
    solanaBridgeChild = null;
    console.warn(`[SolanaBridge] exited (code ${code}) — restarting in 5s`);
    clearTimeout(solanaBridgeRestartTimer);
    solanaBridgeRestartTimer = setTimeout(() => {
      solanaBridgeRestartTimer = null;
      startSolanaBridgeSupervisor();
    }, 5000);
    if (solanaBridgeRestartTimer.unref) solanaBridgeRestartTimer.unref();
  });
}

async function startSolanaBridgeSupervisor() {
  if (solanaBridgeStopping || process.env.DISABLE_SOLANA_BRIDGE) return;
  const cfg = solanaBridgeConfig();
  if (await isSolanaBridgeHealthy(cfg.healthUrl)) {
    console.log("[SolanaBridge] already healthy — reusing existing bridge");
    return;
  }
  await spawnSolanaBridge();
}

function stopSolanaBridgeSupervisor() {
  solanaBridgeStopping = true;
  clearTimeout(solanaBridgeRestartTimer);
  const child = solanaBridgeChild;
  solanaBridgeChild = null;
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
  }
}

// ── freepi-bridge supervisor ─────────────────────────────────────────────────
// The Rust bridge is installed by npm's postinstall hook. It only needs the
// user's FreePi JWT (bridge-managed, never stored in RouterMod). Start it with
// RouterMod, reuse an already-running one, and restart if it dies.
function freepiBridgeConfig() {
  const baseUrl = process.env.FREEPI_BRIDGE_BASE_URL || "http://127.0.0.1:8787/v1/chat/completions";
  let healthUrl = baseUrl;
  try {
    const u = new URL(baseUrl);
    u.pathname = "/health";
    u.search = "";
    healthUrl = u.toString();
  } catch {}
  const repoRoot = path.resolve(__dirname, "..", "..");
  const binary = [process.env.FREEPI_BRIDGE_BIN, path.join(__dirname, ".bin", "freepi-bridge"), path.join(repoRoot, ".bin", "freepi-bridge")]
    .find((p) => p && fs.existsSync(p));
  return { healthUrl, binary };
}

function isBridgeHealthy(healthUrl) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function spawnFreepiBridge() {
  const cfg = freepiBridgeConfig();
  if (!cfg.binary) {
    console.error("[FreePiBridge] binary missing — run `node scripts/install-freepi-bridge.mjs`");
    return;
  }
  // Only start when a token exists; otherwise the bridge exits immediately.
  const hasToken = process.env.FREEPI_TOKEN
    || fs.existsSync(path.join(os.homedir(), ".free-pi", "agent", "credentials.json"));
  if (!hasToken) {
    console.log("[FreePiBridge] no FreePi token yet — connect FreePi from the Providers page first");
    return;
  }
  const child = spawn(cfg.binary, ["start", "--port", process.env.FREEPI_BRIDGE_PORT || "8787"], {
    cwd: path.dirname(cfg.binary),
    stdio: "ignore",
    detached: false,
  });
  freepiBridgeChild = child;
  console.log(`[FreePiBridge] starting ${cfg.binary} (pid ${child.pid || "?"})`);
  child.on("error", (err) => console.error("[FreePiBridge] spawn failed:", err.message));
  child.on("exit", (code) => {
    if (freepiBridgeChild !== child || freepiBridgeStopping) return;
    freepiBridgeChild = null;
    console.warn(`[FreePiBridge] exited (code ${code}) — restarting in 10s`);
    clearTimeout(freepiBridgeRestartTimer);
    freepiBridgeRestartTimer = setTimeout(() => {
      freepiBridgeRestartTimer = null;
      startFreepiBridgeSupervisor();
    }, 10000);
    if (freepiBridgeRestartTimer.unref) freepiBridgeRestartTimer.unref();
  });
}

function freepiHasToken() {
  return !!(process.env.FREEPI_TOKEN
    || fs.existsSync(path.join(os.homedir(), ".free-pi", "agent", "credentials.json")));
}

async function startFreepiBridgeSupervisor() {
  if (freepiBridgeStopping || process.env.DISABLE_FREEPI_BRIDGE) return;
  const cfg = freepiBridgeConfig();
  if (await isBridgeHealthy(cfg.healthUrl)) {
    if (Date.now() - freepiBridgeLastLogAt > 60000) {
      console.log("[FreePiBridge] healthy — bridge running");
      freepiBridgeLastLogAt = Date.now();
    }
    return;
  }
  // The user may sign in AFTER RouterMod has started. Keep polling so the
  // bridge comes up as soon as the token appears — no manual restart needed.
  if (!freepiHasToken()) {
    if (Date.now() - freepiBridgeLastLogAt > 60000) {
      console.log("[FreePiBridge] waiting for FreePi sign-in from the Providers page");
      freepiBridgeLastLogAt = Date.now();
    }
    return;
  }
  await spawnFreepiBridge();
}

function stopFreepiBridgeSupervisor() {
  freepiBridgeStopping = true;
  clearInterval(freepiBridgePollTimer);
  clearTimeout(freepiBridgeRestartTimer);
  const child = freepiBridgeChild;
  freepiBridgeChild = null;
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
  }
}

function startInitializeAppFromCustomServer() {
  if (global.__appBootstrapped) return;
  global.__appBootstrapped = true;
  const modPath = path.join(__dirname, "src", "shared", "services", "initializeApp.js");
  import(pathToFileURL(modPath).href)
    .then((m) => {
      try {
        (m.default || m.initializeApp || m)();
      } catch (e) {
        console.error("[InitApp] start failed:", e && e.message ? e.message : e);
      }
    })
    .catch((e) => {
      console.error("[InitApp] import failed:", e && e.message ? e.message : e);
    });
}

// Wrap Next standalone HTTP server...
// (unspoofable) and strip client-supplied forwarding headers so downstream
// rate-limiting keys on the real peer address instead of attacker-controlled XFF.
http.createServer = (...args) => {
  const handler = args.find((a) => typeof a === "function");
  const rest = args.filter((a) => typeof a !== "function");
  if (!handler) return origCreate(...args);
  const wrapped = (req, res) => {
    const socketIp = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
    const xff = req.headers["x-forwarded-for"];
    const xRealIp = req.headers["x-real-ip"];
    const viaProxy = !!(xff || xRealIp);
    const isLoopbackProxy = socketIp === "127.0.0.1" || socketIp === "::1" || socketIp === "::ffff:127.0.0.1";
    // Trust forwarding headers only when the TCP peer is a local reverse proxy.
    // Direct/public sockets remain keyed by the unspoofable peer address.
    // cloudflared connects from loopback and sets cf-connecting-ip. When the
    // request came through the public relay worker (cf-worker), that header is
    // the worker's address, so take the hop the worker appended before itself.
    const cfIp = req.headers["cf-connecting-ip"] ? String(req.headers["cf-connecting-ip"]).trim() : "";
    let tunnelIp = "";
    if (isLoopbackProxy && cfIp) {
      tunnelIp = cfIp;
      const hops = xff ? String(xff).split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (req.headers["cf-worker"] && hops.length >= 2 && hops[hops.length - 1] === cfIp) {
        tunnelIp = hops[hops.length - 2];
      }
    }
    const proxyIp = tunnelIp || xRealIp || (xff ? String(xff).split(",")[0].trim() : "");
    const ip = isLoopbackProxy && proxyIp ? proxyIp : socketIp;
    delete req.headers["x-9r-real-ip"];
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-9r-via-proxy"];
    delete req.headers["x-9r-peer-token"];
    req.headers["x-9r-real-ip"] = ip;
    req.headers["x-9r-peer-token"] = PEER_TOKEN;
    if (viaProxy) req.headers["x-9r-via-proxy"] = "1";
    return handler(req, res);
  };
  const server = origCreate(...rest, wrapped);
  server.once("listening", () => {
    startBackgroundTokenRefreshFromCustomServer();
    startBackgroundConnectionHealthFromCustomServer();
    startBackgroundCookieRefreshFromCustomServer();
    startBackupSchedulerFromCustomServer();
    startInitializeAppFromCustomServer();
    startSolanaBridgeSupervisor();
    startFreepiBridgeSupervisor();
    freepiBridgePollTimer = setInterval(() => { startFreepiBridgeSupervisor(); }, 10000);
    if (freepiBridgePollTimer.unref) freepiBridgePollTimer.unref();
    const stopBridges = () => { stopSolanaBridgeSupervisor(); stopFreepiBridgeSupervisor(); };
    process.once("SIGINT", stopBridges);
    process.once("SIGTERM", stopBridges);
    process.once("exit", stopBridges);
  });
  const origEmit = server.emit;
  // JBR 25 sends h2c upgrades that the HTTP/1.1 server would otherwise close.
  server.emit = function (event, ...eventArgs) {
    const [req, socket, head] = eventArgs;
    if (event !== "upgrade" || String(req.headers.upgrade || "").toLowerCase() !== "h2c") {
      return origEmit.call(this, event, ...eventArgs);
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      socket.destroy();
      return true;
    }
    const chunks = [head];
    let received = head.length;
    const serve = () => {
      // Replay the upgraded request through the existing HTTP/1.1 handler.
      const replay = new http.IncomingMessage(socket);
      Object.assign(replay, { method: req.method, url: req.url, headers: req.headers, complete: true });
      if (received) replay.push(Buffer.concat(chunks, received).subarray(0, contentLength));
      replay.push(null);
      const res = new http.ServerResponse(replay);
      res.shouldKeepAlive = false;
      res.assignSocket(socket);
      res.once("finish", () => socket.end());
      Promise.resolve().then(() => wrapped(replay, res)).catch((error) => {
        console.error("Failed to downgrade h2c request", error);
        socket.destroy();
      });
    };
    if (received >= contentLength) serve();
    else {
      socket.on("data", function readBody(chunk) {
        chunks.push(chunk);
        received += chunk.length;
        if (received < contentLength) return;
        socket.off("data", readBody);
        serve();
      });
      socket.resume();
    }
    delete req.headers.upgrade;
    delete req.headers["http2-settings"];
    req.headers.connection = "close";
    return true;
  };
  return server;
};

if (require.main === module) {
  const standaloneCustom = path.join(__dirname, ".next", "standalone", "custom-server.js");
  if (fs.existsSync(standaloneCustom)) {
    // Delegate to the standalone build's custom-server (alias-rewritten, supports
    // auto-resume tunnel on startup). Re-exec so it runs as the main module.
    const { spawn } = require("child_process");
    const child = spawn(process.execPath, [standaloneCustom, ...process.argv.slice(2)], {
      stdio: "inherit",
      env: { ...process.env, PORT: APP_PORT, HOSTNAME: APP_HOSTNAME },
      cwd: __dirname,
      windowsHide: true,
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }
  const nextBin = require.resolve("next/dist/bin/next");
  process.argv = [process.argv[0], nextBin, "start", ...process.argv.slice(2)];
  require(nextBin);
}
