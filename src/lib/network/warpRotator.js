import { execFile, spawnSync } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

/**
 * Cloudflare WARP rotator — RouterMod port of openhop.cfd's hop mechanism
 * (MIT, commit 681ed10). WARP runs as a LOCAL PROXY on 127.0.0.1:40000 so it
 * never touches the server's default route or SSH. When OpenCode's free tier
 * returns a usage-limit error, a "hop" forces Cloudflare to hand us a fresh
 * IPv6 /64 (new quota bucket) while RouterMod's wreq-js TLS impersonation
 * stays intact — the proxy is a real CONNECT tunnel, unlike a Worker relay.
 *
 * Works on Linux and Windows: only the warp-cli path and the optional sudo
 * prefix differ. Nothing here is OS-specific beyond binary discovery.
 */

const PROXY_PORT = Number(process.env.ROUTERMOD_WARP_PORT || 40000);
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;
const HOP_TIMEOUT_MS = 90_000;
let hopMutex = Promise.resolve();
let lastHopAt = 0;

/** ms remaining before another IP rotation is allowed. */
export function hopCooldownRemainingMs(cooldownMs = 45_000) {
  if (!cooldownMs) return 0;
  return Math.max(0, lastHopAt + cooldownMs - Date.now());
}

function candidates() {
  const fromEnv = process.env.ROUTERMOD_WARP_BIN || process.env.OUC_WARP_BIN;
  const list = [];
  if (fromEnv) list.push(fromEnv);
  if (process.platform === "win32") {
    list.push(
      path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Cloudflare", "Cloudflare WARP", "warp-cli.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Cloudflare", "Cloudflare WARP", "warp-cli.exe"),
      path.join(os.homedir(), "AppData", "Local", "Cloudflare", "Cloudflare WARP", "warp-cli.exe"),
      "warp-cli.exe",
    );
  } else {
    list.push(
      "/usr/bin/warp-cli",
      "/usr/local/bin/warp-cli",
      path.join(os.homedir(), ".local", "bin", "warp-cli"),
      "warp-cli",
    );
  }
  return [...new Set(list)];
}

let cachedBin = null;
export function findWarpCli() {
  if (cachedBin && fs.existsSync(cachedBin)) return cachedBin;
  for (const bin of candidates()) {
    try {
      execFileSyncSafe(bin, ["--version"]);
      cachedBin = bin;
      return bin;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function execFileSyncSafe(bin, args) {
  // Synchronous probe only; execution itself is async below. Kept tiny so the
  // discovery path does not need an extra dependency.
  const r = spawnSync(bin, args, { timeout: 5000, stdio: "ignore" });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`exit ${r.status}`);
  return true;
}

function runArgs(bin, args, { allowFail = true } = {}) {
  // Windows: call directly. Linux: warp-cli generally works without root; the
  // installer may add a passwordless sudo rule, so try sudo -n as a fallback.
  const attempts = process.platform === "win32"
    ? [[bin, args]]
    : [[bin, ["--accept-tos", ...args]], [bin, args], ["sudo", ["-n", bin, "--accept-tos", ...args]], ["sudo", ["-n", bin, ...args]]];
  return (async () => {
    let last = null;
    for (const [cmd, argv] of attempts) {
      try {
        const { stdout } = await execFileAsync(cmd, argv, { timeout: 15_000, windowsHide: true });
        return { ok: true, out: (stdout || "").trim() };
      } catch (e) {
        last = e;
      }
    }
    if (!allowFail) throw last || new Error(`warp-cli ${args.join(" ")} failed`);
    return { ok: false, out: "" };
  })();
}

export function warpStatus() {
  const bin = findWarpCli();
  if (!bin) return { available: false, connected: false, raw: "" };
  return runArgs(bin, ["status"]).then(({ ok, out }) => ({
    available: true,
    connected: ok && /connected/i.test(out.split("\n")[0] || ""),
    raw: out,
  }));
}

async function egressIp() {
  // Ask an IP echo service through the WARP local proxy. A fresh /64 is what
  // openhop checks; use api64 so we see the IPv6 the free tier actually bills.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const { ProxyAgent, fetch: undiciFetch } = await import("undici");
    const res = await undiciFetch("https://api64.ipify.org", {
      dispatcher: new ProxyAgent(PROXY_URL),
      signal: controller.signal,
    });
    return (await res.text()).trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function ensureProxyMode(bin) {
  await runArgs(bin, ["mode", "proxy"]);
  await runArgs(bin, ["proxy", "port", String(PROXY_PORT)]);
}

async function ensureConnected(bin, attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    const st = await warpStatus();
    if (st.connected) return true;
    await sleep(1500);
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** True only when the local WARP CONNECT proxy is actually accepting sockets. */
export function warpProxyReachable(timeoutMs = 900) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* already closed */ }
      resolve(ok);
    };
    const socket = net.connect({ host: "127.0.0.1", port: PROXY_PORT });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/** Poll until the local proxy port responds (used before replaying a request). */
export async function waitForWarpProxy(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await warpProxyReachable()) return true;
    await sleep(500);
  } while (Date.now() < deadline);
  return false;
}

/**
 * Bring the WARP tunnel back if it dropped ("Settings Changed" after a hop or
 * a restart). Serialised with warpHop so a reconnect cannot race a rotation.
 */
async function bringProxyUp(bin, timeoutMs) {
  if (await warpProxyReachable()) return true;
  await runArgs(bin, ["mode", "proxy"]);
  await runArgs(bin, ["proxy", "port", String(PROXY_PORT)]);
  await runArgs(bin, ["connect"]);
  return await waitForWarpProxy(timeoutMs);
}

export function ensureWarpProxyReady(timeoutMs = 15_000) {
  const run = async () => {
    const bin = findWarpCli();
    return bin ? await bringProxyUp(bin, timeoutMs) : false;
  };
  const result = hopMutex.then(run, run);
  hopMutex = result.catch(() => {});
  return result;
}

/**
 * Perform one WARP identity rotation. Returns { ok, oldIp, newIp, changed }.
 * Serialised through a mutex so concurrent 429s cannot race each other into
 * deleting the registration twice.
 */
export async function warpHop() {
  const run = async () => {
    const bin = findWarpCli();
    if (!bin) return { ok: false, error: "warp-cli not found" };

    // Never disconnect the tunnel while another request is still streaming
    // through it — that kills their sockets with "broken pipe" (HTTP 502).
    await waitForWarpIdle();
    // A disconnected tunnel leaves port 40000 closed; rotating keys on top of
    // that only makes things worse. Bring it back first.
    if (!(await bringProxyUp(bin, 15_000))) {
      return { ok: false, error: "WARP proxy unavailable", oldIp: null };
    }

    const oldIp = await egressIp();
    // Gentle rotation first — keep the device registration (openhop does the
    // same) so we do not burn through Cloudflare's registration rate limit.
    await runArgs(bin, ["tunnel", "rotate-keys"]);
    await runArgs(bin, ["tunnel", "endpoint", "reset"]);
    await runArgs(bin, ["disconnect"]);
    await sleep(1000);
    await ensureProxyMode(bin);
    await runArgs(bin, ["connect"]);
    let connected = await ensureConnected(bin);

    if (!connected) {
      // Registration is missing/broken: re-register, then reconnect.
      await runArgs(bin, ["registration", "delete"]);
      let registered = false;
      for (let i = 0; i < 5; i += 1) {
        const r = await runArgs(bin, ["registration", "new"]);
        if (r.ok) { registered = true; break; }
        await sleep(8000);
      }
      if (!registered) return { ok: false, error: "WARP registration failed", oldIp };
      await ensureProxyMode(bin);
      await runArgs(bin, ["connect"]);
      connected = await ensureConnected(bin, 20);
    }
    if (!connected) return { ok: false, error: "WARP did not reconnect", oldIp };

    // The proxy must be usable even if the IP echo service is unreachable —
    // never report a successful hop when requests would hit ECONNREFUSED.
    if (!(await warpProxyReachable())) {
      return { ok: false, error: "WARP proxy not listening after hop", oldIp };
    }
    let newIp = await egressIp();
    if (!newIp || newIp === oldIp) {
      // Fall back to the local WARP interface address (openhop's trick).
      const st = await runArgs(bin, ["status"]);
      const m = (st.out || "").match(/(2606:4700:[0-9a-f:]+)/i);
      newIp = m ? m[1] : newIp;
    }
    const changed = !!newIp && newIp !== oldIp;
    if (changed) lastHopAt = Date.now();
    return {
      ok: !!newIp,
      oldIp,
      newIp,
      changed,
      proxyUrl: PROXY_URL,
    };
  };
  const result = hopMutex.then(run, run);
  hopMutex = result.catch(() => {});
  return result;
}

/** Resolves when any in-flight WARP hop has finished (no-op when idle). */
export function whenWarpStable() {
  return hopMutex;
}

// Requests travelling through the WARP tunnel are counted here. A hop must
// wait for them to finish before disconnecting, otherwise their CONNECT
// tunnels die mid-stream with "broken pipe" (seen as a spurious 502).
let activeWarpRequests = 0;
let idleWaiters = [];

export function beginWarpRequest() {
  activeWarpRequests += 1;
}

export function releaseWarpRequest() {
  activeWarpRequests = Math.max(0, activeWarpRequests - 1);
  if (activeWarpRequests === 0) {
    const waiters = idleWaiters.splice(0);
    for (const resolve of waiters) resolve(true);
  }
}

/** Wait until no WARP-proxied request is still streaming, with a hard cap. */
export function waitForWarpIdle(timeoutMs = 25000) {
  if (activeWarpRequests === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      idleWaiters = idleWaiters.filter((fn) => fn !== finish);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    idleWaiters.push(finish);
  });
}

export function warpProxyUrl() {
  return warpStatus().then((s) => (s.available && s.connected ? PROXY_URL : ""));
}

export const WARP_PROXY_PORT = PROXY_PORT;
