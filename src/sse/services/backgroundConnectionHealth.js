
import * as log from "../utils/logger.js";
import { isRefreshRejectedCooldown } from "./backgroundTokenRefresh.js";

const INTERVAL_MS = 60 * 1000; // Check every 1 minute
const INITIAL_DELAY_MS = 5 * 1000;
const MAX_CONCURRENT_CHECKS = 5;

let started = false;
let intervalHandle = null;
let initialTimeoutHandle = null;
let tickRunning = false;

function isNonServerRuntime() {
  if (typeof window !== "undefined") return true;
  const phase = process.env.NEXT_PHASE || "";
  if (["phase-production-build", "phase-export", "phase-static"].includes(phase)) return true;
  if (process.env.NEXT_RUNTIME === "edge") return true;
  return false;
}

export function isConnectionLimited(conn) {
  if (!conn) return false;
  const now = Date.now();
  if (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > now) return true;
  for (const [k, v] of Object.entries(conn)) {
    if (k.startsWith("modelLock_") && v && new Date(v).getTime() > now) return true;
  }
  const err = (conn.lastError || "").toLowerCase();
  const code = String(conn.errorCode || "");
  if (code === "429" || code === "402") return true;
  if (
    err.includes("quota") ||
    err.includes("rate") ||
    err.includes("429") ||
    err.includes("limit") ||
    err.includes("allowance") ||
    err.includes("402") ||
    err.includes("balance") ||
    err.includes("capacity") ||
    err.includes("exhausted") ||
    err.includes("too many requests")
  ) {
    return true;
  }
  return false;
}

export function isConnectionDead(conn) {
  if (!conn) return false;
  if (conn.isActive === false) return true;
  if (isConnectionLimited(conn)) return false;
  // A connection whose refresh token was permanently rejected can't be
  // resurrected by a health probe (only a fresh Cookie Sync can). Skip it so
  // the 60s health loop doesn't retrigger invalid_grant refreshes forever.
  if (isRefreshRejectedCooldown(conn)) return false;
  const status = conn.testStatus;
  return status === "failed" || status === "error" || status === "unavailable";
}

export async function runDeadAccountsCheck() {
  if (tickRunning) return { skipped: true, reason: "Already running" };
  tickRunning = true;
  try {
    const { getProviderConnections, updateProviderConnection } = await import("../../lib/db/repos/connectionsRepo.js");
    const { testSingleConnection } = await import("../../app/api/providers/[id]/test/testUtils.js");

    const allConnections = await getProviderConnections({ isActive: true });
    const now = Date.now();

    // 1. Clear any expired model locks / rateLimitedUntil
    for (const conn of allConnections) {
      let needsUpdate = false;
      const patch = {};
      if (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() <= now) {
        patch.rateLimitedUntil = null;
        patch.backoffLevel = 0;
        needsUpdate = true;
      }
      for (const [k, v] of Object.entries(conn)) {
        if (k.startsWith("modelLock_") && v && new Date(v).getTime() <= now) {
          patch[k] = null;
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        patch.testStatus = "active";
        patch.lastError = null;
        patch.lastErrorAt = null;
        patch.errorCode = null;
        await updateProviderConnection(conn.id, patch);
        log.info("BG_HEALTH", `Expired cooldown cleared: ${conn.name || conn.email || conn.id}`);
      }
    }

    // 2. Check accounts that are unavailable/dead (no active lock = genuinely failed)
    const refreshedConnections = await getProviderConnections({ isActive: true });
    const deadAccounts = refreshedConnections.filter((c) => isConnectionDead(c));

    if (deadAccounts.length === 0) {
      log.debug("BG_HEALTH", `Tick: No dead accounts (total: ${refreshedConnections.length})`);
      return { checked: 0, recovered: 0 };
    }

    log.info("BG_HEALTH", `Checking ${deadAccounts.length} dead accounts...`);
    let recovered = 0;
    for (let i = 0; i < deadAccounts.length; i += MAX_CONCURRENT_CHECKS) {
      const batch = deadAccounts.slice(i, i + MAX_CONCURRENT_CHECKS);
      await Promise.all(
        batch.map(async (conn) => {
          try {
            const res = await testSingleConnection(conn.id);
            if (res.valid) {
              recovered++;
              log.info("BG_HEALTH", `✓ Recovered: ${conn.provider} | ${conn.name || conn.email || conn.id}`);
            } else {
              log.debug("BG_HEALTH", `✗ Still dead: ${conn.provider} | ${conn.name || conn.email || conn.id} (${res.error})`);
            }
          } catch (err) {
            log.warn("BG_HEALTH", `Error checking ${conn.id}: ${err.message}`);
          }
        })
      );
    }

    log.info("BG_HEALTH", `Done: ${deadAccounts.length} checked, ${recovered} recovered`);
    return { checked: deadAccounts.length, recovered };
  } catch (err) {
    log.warn("BG_HEALTH", `Tick failed: ${err?.message}`);
    return { error: err.message };
  } finally {
    tickRunning = false;
  }
}

async function runTick() {
  await runDeadAccountsCheck();
}

export function startBackgroundConnectionHealth() {
  if (started) return false;
  if (isNonServerRuntime()) return false;
  if (process.env.DISABLE_BACKGROUND_CONNECTION_HEALTH === "1") return false;

  started = true;

  const safeTick = () => runTick().catch((err) => {
    log.warn("BG_HEALTH", `Unhandled tick error: ${err?.message}`);
  });

  initialTimeoutHandle = setTimeout(safeTick, INITIAL_DELAY_MS);
  if (initialTimeoutHandle.unref) initialTimeoutHandle.unref();

  intervalHandle = setInterval(safeTick, INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();

  log.info("BG_HEALTH", `Background connection health checker started (interval: ${INTERVAL_MS / 1000}s, initial delay: ${INITIAL_DELAY_MS / 1000}s)`);
  return true;
}

export function stopBackgroundConnectionHealth() {
  if (initialTimeoutHandle) { clearTimeout(initialTimeoutHandle); initialTimeoutHandle = null; }
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  started = false;
}
