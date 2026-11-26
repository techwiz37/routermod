
import * as log from "../utils/logger.js";
import { isRefreshRejectedCooldown } from "./backgroundTokenRefresh.js";
import { resolveKiroModels } from "open-sse/services/kiroModels.js";
import { isKiroSuspension } from "open-sse/shared/kiroSuspension.js";
import { runKiroSuspensionHook } from "@/lib/kiroSuspensionHook";
import { maybeAdaptKiroFarmProxy } from "@/lib/automate/kiroFarmAdaptive";
import { updateProviderCredentials, recordKiroRefreshRejection, REFRESH_REJECTED_PREFIX } from "./tokenRefresh.js";
import { isKiroRefreshRejectionExpired } from "open-sse/shared/kiroRefreshState.js";
import { KIRO_LIMIT_REACTIVATION_FIELD } from "open-sse/config/errorConfig.js";
import { claimScheduler, releaseScheduler } from "@/lib/singletonScheduler";

const INTERVAL_MS = 60 * 1000; // Check every 1 minute
const INITIAL_DELAY_MS = 5 * 1000;
const MAX_CONCURRENT_CHECKS = 5;
// A Kiro grant rejected by the upstream (access_denied/invalid_grant) can never
// recover on its own. Retire it after a short grace period and let the krg.js
// hook register a replacement, instead of leaving a dead account with a
// "Refresh token ditolak" badge that the operator must clean up by hand.
const KIRO_DEAD_GRANT_GRACE_MS = Number(process.env.KIRO_DEAD_GRANT_GRACE_MS) || 15 * 60 * 1000;
// Kiro accounts die in two ways: AWS suspends the User ID (deleted) or the
// credential burns its quota (402, off for 24h). Both paths only fire the krg
// hook on an EVENT, so a batch that ends with 0/4 successes leaves the pool
// empty forever — no event means no trigger. This floor keeps a watchdog on
// every health tick so the pool is refilled without waiting for traffic.
// A running krg batch already gates the hook (live-PID check), so the watchdog
// can never stack a second batch on top of one in flight.
const KIRO_POOL_MIN_READY = Math.max(0, Number(process.env.ROUTERMOD_KIRO_MIN_READY ?? 1));
// One refill request per minute at most; krg batches take minutes, so this only
// absorbs the window where the previous batch just exited unsuccessfully.
const KIRO_POOL_TOPUP_GAP_MS = Number(process.env.ROUTERMOD_KIRO_POOL_TOPUP_GAP_MS) || 60 * 1000;

let started = false;
let intervalHandle = null;
let initialTimeoutHandle = null;
let tickRunning = false;
let lastKiroPoolTopUpAt = 0;

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

export function shouldRetireDeadKiroGrant(conn, nowMs = Date.now()) {
  if (conn?.provider !== "kiro") return false;
  const rejection = conn.providerSpecificData?.kiroRefreshError;
  if (!rejection || isKiroRefreshRejectionExpired(rejection, nowMs)) return false;
  const at = Date.parse(rejection.rejectedAt || "");
  return Number.isFinite(at) && nowMs - at >= KIRO_DEAD_GRANT_GRACE_MS;
}

/**
 * How many Kiro credentials can actually serve a request right now.
 * Suspended accounts are deleted elsewhere; this only has to reject the three
 * states that keep a row alive but useless: inactive, dead badge, quota lock.
 */
export function countKiroReady(connections) {
  if (!Array.isArray(connections)) return 0;
  let ready = 0;
  for (const conn of connections) {
    if (conn?.provider !== "kiro") continue;
    if (conn.isActive === false) continue;
    if (isConnectionDead(conn)) continue;
    if (isConnectionLimited(conn)) continue;
    if (isRefreshRejectedCooldown(conn)) continue;
    ready += 1;
  }
  return ready;
}

/**
 * Watchdog decision: is the ready pool below its floor (and therefore a krg
 * refill should be requested)? Rate-limited to one request per top-up gap; the
 * hook itself refuses to spawn while a krg process is already alive.
 */
export function shouldTopUpKiroPool(connections, {
  minReady = KIRO_POOL_MIN_READY,
  nowMs = Date.now(),
  lastTopUpAt = lastKiroPoolTopUpAt,
} = {}) {
  if (!(minReady > 0)) return false;
  if (nowMs - lastTopUpAt < KIRO_POOL_TOPUP_GAP_MS) return false;
  return countKiroReady(connections) < minReady;
}

export async function runDeadAccountsCheck() {
  if (tickRunning) return { skipped: true, reason: "Already running" };
  tickRunning = true;
  try {
    const { getProviderConnections, updateProviderConnection, deleteProviderConnectionById } = await import("../../lib/db/repos/connectionsRepo.js");
    const { testSingleConnection } = await import("../../app/api/providers/[id]/test/testUtils.js");

    const allRows = await getProviderConnections();
    const now = Date.now();

    // A refresh rejection is only valid for its TTL. Once it lapses, drop the
    // persisted marker AND the matching error badge so the dashboard stops
    // showing "Refresh token ditolak…" for an account that is eligible again.
    for (const conn of allRows) {
      if (conn.provider !== "kiro") continue;
      const rejection = conn.providerSpecificData?.kiroRefreshError;
      if (!rejection || !isKiroRefreshRejectionExpired(rejection)) continue;
      const { kiroRefreshError, ...providerSpecificData } = conn.providerSpecificData;
      const patch = { providerSpecificData };
      if (String(conn.lastError || "").startsWith(REFRESH_REJECTED_PREFIX)) {
        Object.assign(patch, {
          testStatus: "active", lastError: null, lastErrorAt: null, errorCode: null,
        });
      }
      await updateProviderConnection(conn.id, patch);
      log.info("BG_HEALTH", `Cleared expired Kiro refresh rejection: ${conn.name || conn.id}`);
    }

    // Retire still-valid but permanently rejected grants after the grace
    // period. The suspension hook replaces them with freshly registered ones.
    for (const conn of allRows) {
      if (!shouldRetireDeadKiroGrant(conn, now)) continue;
      const rejection = conn.providerSpecificData.kiroRefreshError;
      await deleteProviderConnectionById(conn.id);
      log.warn("BG_HEALTH", `Deleted Kiro account with dead grant (${rejection.code}) ${conn.id}`);
      runKiroSuspensionHook(conn.id);
    }

    // A suspended Kiro User ID can never be used again. Purge any credential
    // that was stamped with suspension on a previous run, even if it is off or
    // still carrying a cooldown — otherwise it stays in the DB forever.
    for (const conn of allRows) {
      if (conn.provider !== "kiro") continue;
      const storedError = [conn.lastError, conn.deactivatedReason].filter(Boolean).join(" ");
      if (!isKiroSuspension(storedError)) continue;
      await deleteProviderConnectionById(conn.id);
      log.warn("BG_HEALTH", `Deleted suspended Kiro connection ${conn.id}`);
      runKiroSuspensionHook(conn.id);
    }

    // Quota-limited Kiro accounts were switched off by markAccountUnavailable
    // / failureTracker. Bring them back after their 24h window elapses.
    const reactivateDue = allRows.filter((conn) =>
      conn.isActive === false
      && conn[KIRO_LIMIT_REACTIVATION_FIELD]
      && new Date(conn[KIRO_LIMIT_REACTIVATION_FIELD]).getTime() <= now
    );
    for (const conn of reactivateDue) {
      await updateProviderConnection(conn.id, {
        isActive: true,
        [KIRO_LIMIT_REACTIVATION_FIELD]: null,
        testStatus: "active",
        deactivatedReason: null,
      });
      log.info("BG_HEALTH", `Re-enabled ${conn.provider} account ${conn.name || conn.email || conn.id} after 24h limit cooldown`);
    }

    const allConnections = allRows.filter((conn) => conn.isActive !== false && !reactivateDue.some((c) => c.id === conn.id));

    // Catalog checks use the per-credential cache, so active Kiro sessions are
    // checked periodically even when no chat request selects them.
    const kiroConnections = allConnections.filter((conn) => conn.provider === "kiro" && !isConnectionLimited(conn) && !isRefreshRejectedCooldown(conn));
    for (let i = 0; i < kiroConnections.length; i += MAX_CONCURRENT_CHECKS) {
      await Promise.all(kiroConnections.slice(i, i + MAX_CONCURRENT_CHECKS).map(async (conn) => {
        try {
          await resolveKiroModels(conn, {
            log,
            onCredentialsRefreshed: (credentials) => updateProviderCredentials(conn.id, credentials),
            onRefreshRejected: (failure) => recordKiroRefreshRejection(conn.id, conn, failure),
          });
        } catch (error) {
          if (isKiroSuspension(error)) {
            await deleteProviderConnectionById(conn.id);
            log.warn("BG_HEALTH", `Deleted suspended Kiro connection ${conn.id}`);
            runKiroSuspensionHook(conn.id);
          } else {
            log.debug("BG_HEALTH", `Kiro session check failed: ${error.message}`);
          }
        }
      }));
    }

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
        // The lock that justified an unavailable/failed badge has lapsed: clear
        // the badge too, otherwise `isConnectionDead` keeps re-probing the
        // account on every tick and the UI shows a stale "unavailable".
        const badgeStale = ["failed", "error", "unavailable"].includes(conn.testStatus);
        if (badgeStale) {
          patch.testStatus = "active";
          patch.lastError = null;
          patch.lastErrorAt = null;
          patch.errorCode = null;
        }
        await updateProviderConnection(conn.id, patch);
        log.info("BG_HEALTH", `Expired cooldown cleared: ${conn.name || conn.email || conn.id}`);
      }
    }

    // 2. Check accounts that are unavailable/dead (no active lock = genuinely failed)
    const refreshedConnections = await getProviderConnections({ isActive: true });

    // 2a. Refill the Kiro pool. Runs before the dead-account early return on
    // purpose: an empty pool normally has no dead rows (quota-locked accounts
    // are not "dead"), which used to make this tick return without ever asking
    // krg for a replacement.
    //
    // Flip the krg proxy mode first when the current one keeps failing: the
    // spawn below inherits whatever env this writes.
    try {
      await maybeAdaptKiroFarmProxy();
    } catch (err) {
      log.debug("BG_HEALTH", `Kiro farm adaptation skipped: ${err?.message}`);
    }

    if (shouldTopUpKiroPool(refreshedConnections)) {
      lastKiroPoolTopUpAt = Date.now();
      log.warn(
        "BG_HEALTH",
        `Kiro ready pool ${countKiroReady(refreshedConnections)}/${KIRO_POOL_MIN_READY} — requesting a replacement registration batch`
      );
      runKiroSuspensionHook("kiro-pool-empty");
    }

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
  if (!claimScheduler("connection-health")) return false;

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
  if (started) {
    started = false;
    releaseScheduler("connection-health");
  }
}
