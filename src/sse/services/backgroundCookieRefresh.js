
import * as log from "../utils/logger.js";
import { createRequire } from "module";

const requireCjs = createRequire(import.meta.url);
function sessionStoreCjs() {
  return requireCjs("../../bot/session_store.js");
}

// Background Antigravity cookie refresher.
//
// Every tick it re-opens a headless browser per connection that has a saved
// cookie jar, rides the Antigravity web session, and persists the rotated
// cookies. This keeps Google's short-lived PSIDTS cookies fresh so the session
// fallback (src/bot/session_recovery.js) can still mint access tokens after the
// OAuth refresh token dies.
//
// Default interval is 1 minute (override with BG_COOKIE_REFRESH_INTERVAL_MS).
// Only antigravity connections with a persisted cookie jar are touched.

export const DEFAULT_COOKIE_REFRESH_INTERVAL_MS = 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

let started = false;
let intervalHandle = null;
let initialTimeoutHandle = null;
let tickRunning = false;

function isTruthyEnv(value) {
  if (value == null || value === "") return false;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isNonServerRuntime() {
  if (typeof window !== "undefined") return true;
  const phase = process.env.NEXT_PHASE || "";
  if (
    phase === "phase-production-build" ||
    phase === "phase-export" ||
    phase === "phase-static"
  ) {
    return true;
  }
  if (process.env.NEXT_RUNTIME === "edge") return true;
  return false;
}

async function loadAntigravityConnections() {
  const { getProviderConnections } = await import("../../lib/db/repos/connectionsRepo.js");
  const all = await getProviderConnections({});
  return (all || []).filter((c) => c && c.provider === "antigravity");
}

async function refreshOne(connection) {
  const { refreshCookieForConnection } = await import("../../bot/cookie_refresher.js");
  return refreshCookieForConnection(connection);
}

// A connection is worth refreshing only if a cookie jar exists on disk.
function hasCookieJar(connection) {
  try {
    const store = sessionStoreCjs();
    const session = store.loadSession(connection.id, connection.email);
    return !!session?.cookies?.length;
  } catch (_e) {
    return false;
  }
}

export async function runBackgroundCookieRefreshTick(deps = {}) {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const load = deps.loadConnections || loadAntigravityConnections;
    const refresh = deps.refreshConnection || refreshOne;

    const connections = await load();
    const targets = connections.filter((c) => hasCookieJar(c));
    if (targets.length === 0) return;

    for (const conn of targets) {
      try {
        const result = await refresh(conn);
        if (result) {
          log.info("BG_COOKIE_REFRESH", "Connection cookies refreshed", {
            id: conn.id,
            email: conn.email || conn.name || conn.id,
            cookies: result.cookies,
          });
        }
      } catch (err) {
        log.warn("BG_COOKIE_REFRESH", "Connection cookie refresh failed (swallowed)", {
          id: conn?.id,
          email: conn?.email || conn?.name || conn?.id,
          error: err?.message ?? String(err),
        });
      }
    }
  } catch (err) {
    log.warn("BG_COOKIE_REFRESH", "Tick failed (swallowed)", {
      error: err?.message ?? String(err),
    });
  } finally {
    tickRunning = false;
  }
}

export function startBackgroundCookieRefresh({ intervalMs } = {}) {
  if (started) return false;
  if (isTruthyEnv(process.env.DISABLE_BG_COOKIE_REFRESH)) return false;
  if (isNonServerRuntime()) return false;

  started = true;
  const envInterval = Number(process.env.BG_COOKIE_REFRESH_INTERVAL_MS);
  const period = Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : (Number.isFinite(envInterval) && envInterval > 0 ? envInterval : DEFAULT_COOKIE_REFRESH_INTERVAL_MS);

  const safeTick = () => {
    runBackgroundCookieRefreshTick().catch((err) => {
      log.warn("BG_COOKIE_REFRESH", "Unhandled tick rejection (swallowed)", {
        error: err?.message ?? String(err),
      });
    });
  };

  initialTimeoutHandle = setTimeout(safeTick, INITIAL_DELAY_MS);
  if (initialTimeoutHandle.unref) initialTimeoutHandle.unref();

  intervalHandle = setInterval(safeTick, period);
  if (intervalHandle.unref) intervalHandle.unref();

  log.info("BG_COOKIE_REFRESH", "Background cookie refresher started", { intervalMs: period });
  return true;
}

export function stopBackgroundCookieRefresh() {
  if (initialTimeoutHandle) {
    clearTimeout(initialTimeoutHandle);
    initialTimeoutHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (started) started = false;
}
