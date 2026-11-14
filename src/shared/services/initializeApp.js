import os from "os";
import { loadState, writeGate } from "../../lib/tunnel/shared/state.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { cleanupProviderConnections, getSettings, updateSettings, getApiKeys } from "../../lib/localDb.js";
import {
  enableTunnel, enableTailscale,
  isTunnelManuallyDisabled, isTunnelReconnecting, isTailscaleReconnecting,
  getTunnelService, getTailscaleService, setTunnelUnexpectedExitCallback,
  killCloudflared, isCloudflaredRunning, ensureCloudflared,
  getTunnelStatus,
  registerTunnelUrl,
  isTailscaleRunning, isTailscaleRunningStrict, isDaemonAlive, startFunnel,
  checkInternet,
  RESTART_COOLDOWN_MS, NETWORK_SETTLE_MS,
  WATCHDOG_INTERVAL_MS, NETWORK_CHECK_INTERVAL_MS, VIRTUAL_IFACE_REGEX,
} from "../../lib/tunnel";
import { getMitmStatus, startMitm, loadEncryptedPassword, initDbHooks, restoreToolDNS, removeAllDNSEntriesSync } from "../../mitm/manager";
import { syncToJson as syncMitmAliasCache } from "../../lib/mitmAliasCache";
import { killAllBridges } from "../../lib/mcp/stdioSseBridge";

(function bootstrapMitm() {
  if (!process.env.MITM_SERVER_PATH) {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const appSrc = dirname(dirname(thisFile));
      const candidate = join(appSrc, "mitm", "server.js");
      if (existsSync(candidate)) process.env.MITM_SERVER_PATH = candidate;
    } catch { /* ignore */ }
  }
  try { initDbHooks(getSettings, updateSettings); } catch { /* ignore */ }
})();

process.setMaxListeners(20);

const STARTUP_DEFER_MS = 3000;

const g = global.__appSingleton ??= {
  signalHandlersRegistered: false,
  watchdogInterval: null,
  networkMonitorInterval: null,
  lastNetworkFingerprint: null,
  lastWatchdogTick: Date.now(),
  lastOnline: null,
  mitmStartInProgress: false,
  tunnelAutoResumed: false,
  tailscaleAutoResumed: false,
};

export async function initializeApp() {
  try {
    if (!g.signalHandlersRegistered) {
      const cleanup = () => {
        try { removeAllDNSEntriesSync(); } catch { /* best effort */ }
        try { killAllBridges(); } catch { /* best effort */ }
        killCloudflared();
        process.exit();
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
      process.on("exit", () => { try { removeAllDNSEntriesSync(); } catch { /* ignore */ } });
      g.signalHandlersRegistered = true;
    }

    setTunnelUnexpectedExitCallback(() => {
      safeRestartTunnel("unexpected-exit").catch(() => {});
    });

    setTimeout(() => {
      runHeavyStartup().catch((e) => console.error("[InitApp] deferred startup failed:", e.message));
    }, STARTUP_DEFER_MS);
  } catch (error) {
    console.error("[InitApp] Error:", error);
  }
}

async function runHeavyStartup() {
  await cleanupProviderConnections();
  const settings = await getSettings();

  if (settings.tunnelEnabled && !g.tunnelAutoResumed) {
    g.tunnelAutoResumed = true;
    console.log("[InitApp] Tunnel was enabled, auto-resuming...");
    writeGate({ tunnelActive: true });
    (async () => {
      for (let attempt = 1; attempt <= 6; attempt++) {
        try {
          await safeRestartTunnel("startup");
          const st = await getTunnelStatus();
          if (st.running || st.enabled) {
            console.log("[InitApp] Tunnel resumed successfully");
            writeGate({ tunnelActive: true });
            return;
          }
        } catch (e) {
          console.log(`[InitApp] Tunnel resume attempt ${attempt} failed:`, e?.message);
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      console.log("[InitApp] Tunnel resume exhausted retries");
    })().catch((e) => console.log("[InitApp] Tunnel resume failed:", e?.message));
  }

  if (settings.tailscaleEnabled && !g.tailscaleAutoResumed) {
    g.tailscaleAutoResumed = true;
    console.log("[InitApp] Tailscale was enabled, auto-resuming...");
    safeRestartTailscale("startup").catch((e) => console.log("[InitApp] Tailscale resume failed:", e.message));
  }

  if (settings.tunnelEnabled) ensureCloudflared().catch(() => {});

  if (settings.mitmEnabled) {
    syncMitmAliasCache().catch(() => {});
    autoStartMitm(settings);
  }

  configureTunnelMonitoring(settings);

  if (hasQuotaAutoPingEnabled(settings)) {
    import("@/shared/services/quotaAutoPing")
      .then(({ startQuotaAutoPing }) => startQuotaAutoPing())
      .catch((e) => console.log("[AutoPing] scheduler start failed:", e.message));
  }

  import("@/sse/services/backgroundTokenRefresh.js")
    .then(({ startBackgroundTokenRefresh }) => startBackgroundTokenRefresh())
    .catch((e) => console.log("[BackgroundTokenRefresh] scheduler start failed:", e.message));

  import("@/sse/services/backgroundConnectionHealth.js")
    .then(({ startBackgroundConnectionHealth }) => startBackgroundConnectionHealth())
    .catch((e) => console.log("[BackgroundConnectionHealth] scheduler start failed:", e.message));

  import("@/sse/services/tokenharborHealth.js")
    .then(({ startTokenharborHealth }) => startTokenharborHealth())
    .catch((e) => console.log("[TokenHarborHealth] scheduler start failed:", e.message));

  import("@/sse/services/backgroundCookieRefresh.js")
    .then(({ startBackgroundCookieRefresh }) => startBackgroundCookieRefresh())
    .catch((e) => console.log("[BackgroundCookieRefresh] scheduler start failed:", e.message));
}

// Cheap local check: keeps the scheduler module (and its provider graph) unloaded
// when nothing opted in. An enabled schedule counts on its own.
function hasQuotaAutoPingEnabled(settings) {
  return [settings?.claudeAutoPing, settings?.codexAutoPing].some((config) => (
    Object.values(config?.connections || {}).some(Boolean)
    || Object.values(config?.schedules || {}).some((schedule) => schedule?.enabled === true)
  ));
}

async function autoStartMitm(settings) {
  if (g.mitmStartInProgress) return;
  g.mitmStartInProgress = true;
  try {
    if (!settings.mitmEnabled) return;
    const mitmStatus = await getMitmStatus();
    if (mitmStatus.running) return;

    const password = await loadEncryptedPassword();
    if (!password && process.platform !== "win32") {
      console.log("[InitApp] MITM was enabled but no saved password found, skipping auto-start");
      return;
    }

    const keys = await getApiKeys();
    const activeKey = keys.find(k => k.isActive !== false);

    console.log("[InitApp] MITM was enabled, auto-starting...");
    await startMitm(activeKey?.key || "sk_routermod", password);
    console.log("[InitApp] MITM auto-started");
    try {
      await restoreToolDNS(password);
      console.log("[InitApp] DNS restored from saved state");
    } catch (e) {
      console.log("[InitApp] DNS restore failed:", e.message);
    }
  } catch (err) {
    console.log("[InitApp] MITM auto-start failed:", err.message);
  } finally {
    g.mitmStartInProgress = false;
  }
}

// A restart only has to happen when cloudflared is actually gone. Passing
// "startup" as a force reason made every app restart kill a healthy tunnel,
// rotate the quick-tunnel URL, and leave remote devices hitting a dead mapping
// (ERR_CONNECTION_REFUSED) until the worker caught up.
const FORCE_RESTART_REASONS = /^(netchange|sleep|sleep\+netchange|unexpected-exit)$/;


async function safeRestartTunnel(reason) {
  const svc = getTunnelService();
  const settings = await getSettings();
  if (!settings.tunnelEnabled) return;
  if (svc.cancelToken.cancelled) return;
  if (svc.spawnInProgress) return;

  // Never respawn while the running cloudflared is healthy: a respawn rotates
  // the quick-tunnel URL and breaks every already-open client.
  if (isCloudflaredRunning()) return;

  const force = FORCE_RESTART_REASONS.test(reason);

  if (!force && Date.now() - svc.lastRestartAt < RESTART_COOLDOWN_MS) {
    console.log(`[Tunnel] degraded but cooldown active, skip (${reason})`);
    return;
  }
  if (!await checkInternet()) return;

  console.log(`[Tunnel] safeRestart (${reason}) — tunnel unreachable${force ? " [force]" : ""}`);
  try {
    await enableTunnel();
    svc.lastRestartAt = Date.now();
    console.log("[Tunnel] restart success");
  } catch (err) {
    if (!/cloudflared killed|tunnel cancelled/.test(err.message)) {
      console.log("[Tunnel] restart failed:", err.message);
    }
  }
}

async function safeRestartTailscale(reason) {
  const svc = getTailscaleService();
  const settings = await getSettings();
  if (!settings.tailscaleEnabled) return;
  if (svc.cancelToken.cancelled) return;
  if (svc.spawnInProgress) return;

  const running = reason === "startup" ? await isTailscaleRunningStrict() : isTailscaleRunning();
  if (running) return;

  if (isDaemonAlive() && svc.activeLocalPort) {
    try {
      await startFunnel(svc.activeLocalPort);
      svc.lastRestartAt = Date.now();
      console.log("[Tailscale] funnel re-established (daemon alive)");
    } catch (err) {
      console.log("[Tailscale] funnel recovery failed:", err.message);
    }
    return;
  }

  const force = FORCE_RESTART_REASONS.test(reason);
  if (!force && Date.now() - svc.lastRestartAt < RESTART_COOLDOWN_MS) {
    console.log(`[Tailscale] degraded but cooldown active, skip (${reason})`);
    return;
  }
  if (!await checkInternet()) return;

  console.log(`[Tailscale] safeRestart (${reason}) — daemon not running${force ? " [force]" : ""}`);
  try {
    await enableTailscale();
    svc.lastRestartAt = Date.now();
    console.log("[Tailscale] restart success");
  } catch (err) {
    console.log("[Tailscale] restart failed:", err.message);
  }
}


function startWatchdog() {
  if (g.watchdogInterval) return;
  g.watchdogInterval = setInterval(() => {
    safeRestartTunnel("watchdog").catch(() => {});
    safeRepairPublicMapping().catch(() => {});
    safeRestartTailscale("watchdog").catch(() => {});
  }, WATCHDOG_INTERVAL_MS);
  if (g.watchdogInterval.unref) g.watchdogInterval.unref();
}

// cloudflared can be perfectly healthy while the worker mapping is missing or
// stale — the symptom is exactly what remote devices see: the public URL
// refuses connections while `localhost` works. Re-register in place instead of
// respawning (which would rotate the URL and break clients further).
async function safeRepairPublicMapping() {
  const settings = await getSettings();
  if (!settings.tunnelEnabled) return;
  // A spawn in progress owns registration; repairing concurrently would push a
  // stale URL over the one being registered.
  if (isTunnelReconnecting()) return;
  const state = loadState();
  if (!state?.shortId || !state?.tunnelUrl) return;
  if (!isCloudflaredRunning()) return;

  const publicUrl = state.publicUrl || `https://r${state.shortId}.abc-tunnel.us`;
  try {
    const res = await fetch(`${publicUrl}/api/tunnel/ping`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) return;
  } catch { /* fall through to repair */ }

  // The recorded url may be a previous tunnel that is long gone. Ask our own
  // ping endpoint which URL this process is actually serving, and only fall
  // back to the state file when the local app cannot answer.
  let tunnelUrl = state.tunnelUrl;
  try {
    const local = await fetch("http://127.0.0.1:1337/api/tunnel/ping", { signal: AbortSignal.timeout(8000) });
    if (local.ok) {
      const info = await local.json().catch(() => null);
      if (info?.tunnelUrl) tunnelUrl = info.tunnelUrl;
    }
  } catch { /* keep state value */ }

  // Direct tunnel must be alive; otherwise leave the respawn path to do its job.
  try {
    const direct = await fetch(`${tunnelUrl}/api/tunnel/ping`, { signal: AbortSignal.timeout(15000) });
    if (!direct.ok) return;
  } catch { return; }

  console.log(`[Tunnel] public mapping unhealthy, re-registering ${state.shortId} -> ${tunnelUrl}`);
  try {
    await registerTunnelUrl(state.shortId, tunnelUrl, 3);
    const after = await fetch(`${publicUrl}/api/tunnel/ping`, { signal: AbortSignal.timeout(15000) });
    if (after.ok) writeGate({ tunnelActive: true });
    console.log(`[Tunnel] re-register done (${after.status})`);
  } catch (e) {
    console.warn(`[Tunnel] re-register failed: ${e.message}`);
  }
}

function stopWatchdog() {
  if (!g.watchdogInterval) return;
  clearInterval(g.watchdogInterval);
  g.watchdogInterval = null;
}


function getNetworkFingerprint() {
  const interfaces = os.networkInterfaces();
  const active = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    if (VIRTUAL_IFACE_REGEX.test(name)) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4") {
        active.push(`${name}:${addr.address}`);
      }
    }
  }
  return active.sort().join("|");
}

function startNetworkMonitor() {
  if (g.networkMonitorInterval) return;

  g.lastNetworkFingerprint = getNetworkFingerprint();
  g.lastWatchdogTick = Date.now();
  g.lastOnline = null;

  g.networkMonitorInterval = setInterval(async () => {
    try {
      const now = Date.now();
      const elapsed = now - g.lastWatchdogTick;
      g.lastWatchdogTick = now;

      const currentFingerprint = getNetworkFingerprint();
      const networkChanged = currentFingerprint !== g.lastNetworkFingerprint;
      const wasSleep = elapsed > NETWORK_CHECK_INTERVAL_MS * 6;
      if (networkChanged) g.lastNetworkFingerprint = currentFingerprint;

      const online = await checkInternet();
      const wasOffline = g.lastOnline === false;
      g.lastOnline = online;

      if (!online) return; // no internet → idle, don't restart

      const onlineEdge = wasOffline; // offline → online transition
      if (!networkChanged && !wasSleep && !onlineEdge) return;

      await new Promise((r) => setTimeout(r, NETWORK_SETTLE_MS));

      const reason = onlineEdge ? "online"
        : wasSleep && networkChanged ? "sleep+netchange"
        : wasSleep ? "sleep" : "netchange";
      safeRestartTunnel(reason).catch(() => {});
      safeRestartTailscale(reason).catch(() => {});
    } catch (err) {
      console.log("[NetworkMonitor] error:", err.message);
    }
  }, NETWORK_CHECK_INTERVAL_MS);

  if (g.networkMonitorInterval.unref) g.networkMonitorInterval.unref();
}


function stopNetworkMonitor() {
  if (!g.networkMonitorInterval) return;
  clearInterval(g.networkMonitorInterval);
  g.networkMonitorInterval = null;
  g.lastNetworkFingerprint = null;
  g.lastOnline = null;
}

export function configureTunnelMonitoring(settings) {
  if (settings?.tunnelEnabled || settings?.tailscaleEnabled) {
    startWatchdog();
    startNetworkMonitor();
    return;
  }
  stopWatchdog();
  stopNetworkMonitor();
}

export default initializeApp;
