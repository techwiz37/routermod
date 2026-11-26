import { spawn, execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * Side effect when Kiro accounts are suspended / quota-exhausted:
 * auto-register replacement accounts via krg.js.
 *
 * DESIRED FLOW (singleton by process lifecycle):
 *   1. Trigger fired → spawn krg.js, write its PID to a lockfile.
 *   2. While that PID is still alive → ignore ALL further triggers
 *      (more accounts getting suspended/limited mid-batch is expected).
 *   3. When krg.js finishes and closes (PID dies) → lock becomes stale.
 *   4. The NEXT trigger after that spawns a fresh batch.
 *
 * This prevents the previous failure mode: dozens of concurrent krg.js
 * processes each launching Chromium → hundreds of orphaned browsers, GBs RAM.
 * No time-based cooldown is used — liveness of the process IS the gate.
 *
 * Overridable through env:
 *   ROUTERMOD_KIRO_REG_DIR    (default: $HOME/reg)
 *   ROUTERMOD_KIRO_REG_SCRIPT (default: krg.js)
 *   ROUTERMOD_KIRO_REG_ARGS   (default: "4" — register 4 replacement accounts per batch)
 *   ROUTERMOD_KIRO_REG_LOCK   (default: $TMPDIR/routermod-kiro-reg.lock)
 *   KRG_HUMAN                 (default: "1" — slow human-like typing, better
 *                              captcha pass rate; set "0" to use fast setter)
 *   KRG_PROXY                 (default: "auto" — proxies.txt -> WARP -> direct;
 *                              set "off" to force a direct connection)
 *
 * The trigger above only fires on EVENTS (suspended/deleted/limited account or a
 * request that found no credentials), so a batch that ends with 0 successes used
 * to leave the pool empty with nothing left to trigger it. The health tick
 * therefore also calls this hook as a watchdog when the pool drops below a floor
 * (see backgroundConnectionHealth.js):
 *   ROUTERMOD_KIRO_MIN_READY          (default: 1 — ready accounts the pool must
 *                                      keep; set 0 to disable the watchdog)
 *   ROUTERMOD_KIRO_POOL_TOPUP_GAP_MS  (default: 60000 — minimum delay between
 *                                      two watchdog requests; the live-PID gate
 *                                      above is what actually prevents stacking
 *                                      batches, this only spaces out retries)
 */

const LOCK_FILE = process.env.ROUTERMOD_KIRO_REG_LOCK
  || path.join(os.tmpdir(), "routermod-kiro-reg.lock");
// Minimum gap between two spawns. The live-process check below is the primary
// singleton gate; this cooldown also covers the window where a batch has just
// exited and a burst of triggers would otherwise respawn it instantly.
const MIN_TRIGGER_GAP_MS = 30_000;
// "krg already running" is expected on every failed Kiro request while a batch
// is active. Logging it each time floods the console, so throttle the message.
const SUPPRESS_LOG_GAP_MS = 60_000;
let lastTriggeredAt = 0;
let lastSuppressedLogAt = 0;

function registrationConfig() {
  return {
    cwd: process.env.ROUTERMOD_KIRO_REG_DIR || path.join(os.homedir(), "reg"),
    script: process.env.ROUTERMOD_KIRO_REG_SCRIPT || "krg.js",
    args: (process.env.ROUTERMOD_KIRO_REG_ARGS || "4").split(/\s+/).filter(Boolean),
  };
}

/** PIDs of currently running krg.js processes (real OS check, not just lockfile). */
export function findRunningKrgPids() {
  try {
    const out = execFileSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf8",
      timeout: 3000,
    });
    return out
      .split("\n")
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.*)$/);
        if (!match) return null;
        const pid = Number(match[1]);
        if (pid === process.pid) return null;
        // Match "node krg.js 4" / "/path/node krg.js 4". Require a node
        // executable in the same command line so a `grep krg.js` or an
        // unrelated shell mention cannot gate the hook.
        const args = match[2];
        const isNode = /(?:^|[\s/\\])node(?:js)?(?:\s|$)/.test(args);
        return isNode && /(?:^|[\s/\\])krg\.js(?:\s|$)/.test(args) ? pid : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid() {
  try {
    return parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10) || null;
  } catch {
    return null;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

function defaultRunner({ cwd, script, args }) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    // krg.js switches to real keyboard typing + randomized delays when this
    // is set. AWS flags the fast native-setter path with captcha/ERR-837, so
    // human-like is the default. Override with KRG_HUMAN=0 if ever needed.
    env: { ...process.env, KRG_HUMAN: process.env.KRG_HUMAN ?? "1" },
  });
  child.on("error", (error) => {
    console.warn(`[KIRO_HOOK] auto-registration failed to start: ${error?.message || error}`);
    releaseLock();
  });
  // When the batch exits, drop the lock so the next trigger can spawn fresh.
  child.on("exit", (code) => {
    releaseLock();
    console.log(`[KIRO_HOOK] registration batch exited (code ${code}) — lock released`);
  });
  child.unref();
  return child;
}

/**
 * @param {string} connectionId - the account that triggered it (log only)
 * @param {(config) => unknown} runner - injectable for tests
 * @param {{ findRunningKrgPids?: () => number[] }} deps - injectable process probe for tests
 * @returns {boolean} true when a new batch was started
 */
export function runKiroSuspensionHook(connectionId = "unknown", runner = defaultRunner, deps = {}) {
  const label = String(connectionId || "unknown");
  const now = Date.now();

  // Root gate: is ANY krg.js actually running right now? This covers the case
  // where the lockfile was removed/crashed but a batch is still alive, and the
  // case where the lockfile PID got recycled by an unrelated process.
  const liveKrgPids = (deps.findRunningKrgPids || findRunningKrgPids)();
  if (liveKrgPids.length > 0) {
    const runningPid = liveKrgPids[0];
    // Re-sync the lockfile to the real process so later triggers stay gated.
    if (readLockPid() !== runningPid) {
      try { fs.writeFileSync(LOCK_FILE, String(runningPid)); } catch { /* best effort */ }
    }
    if (now - lastSuppressedLogAt >= SUPPRESS_LOG_GAP_MS) {
      lastSuppressedLogAt = now;
      console.log(`[KIRO_HOOK] krg already running (pid ${runningPid}), ignoring further triggers`);
    }
    return false;
  }

  // No live krg process. Clear any stale lock file before spawning fresh.
  const runningPid = readLockPid();
  if (runningPid) {
    releaseLock();
    console.log(`[KIRO_HOOK] stale lock (pid ${runningPid} dead), cleared`);
  }

  // Dedup only simultaneous triggers in the same tick.
  if (now - lastTriggeredAt < MIN_TRIGGER_GAP_MS) return false;

  lastTriggeredAt = now;
  const config = registrationConfig();
  try {
    const child = runner(config);
    if (child && typeof child === "object" && "pid" in child && child.pid) {
      fs.writeFileSync(LOCK_FILE, String(child.pid));
    }
    console.log(`[KIRO_HOOK] ${label.slice(0, 8)} → spawn ${config.script} ${config.args.join(" ")}`);
    return true;
  } catch (error) {
    console.warn(`[KIRO_HOOK] could not launch auto-registration: ${error?.message || error}`);
    releaseLock();
    return false;
  }
}
