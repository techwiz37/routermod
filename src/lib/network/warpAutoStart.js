import { findWarpCli, warpStatus, warpProxyReachable } from "./warpRotator";
import { getSettings, updateSettings } from "../db/repos/settingsRepo";
import { createProxyPool, getProxyPools } from "@/models";

/**
 * RouterMod "one process" WARP integration. Called once from app bootstrap.
 *
 * Mirrors openhop.cfd's keeper but lives inside RouterMod: no separate daemon,
 * no extra service, no host-routing changes. WARP only listens on 127.0.0.1.
 * It also wires the local proxy into the OpenCode Free provider automatically,
 * so starting RouterMod is enough — the proxy is already in the request path.
 */

const POOL_NAME = "RouterMod WARP (auto)";
let started = false;

async function ensureTunnel(bin, port) {
  const run = async (args) => {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      for (const argv of [["--accept-tos", ...args], args]) {
        try { await exec(bin, argv, { timeout: 15000, windowsHide: true }); return true; }
        catch { /* try next form */ }
      }
    } catch { /* ignore */ }
    return false;
  };
  const status = await warpStatus().catch(() => ({ connected: false, raw: "" }));
  if (status.connected && await warpProxyReachable()) return true;
  // "Connected" with a closed port 40000 is not usable — bounce the tunnel.
  if (status.connected) await run(["disconnect"]);
  if (/registration missing|not registered/i.test(status.raw || "")) await run(["registration", "new"]);
  await run(["mode", "proxy"]);
  await run(["proxy", "port", String(port)]);
  await run(["connect"]);
  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 2500));
    const s = await warpStatus().catch(() => ({ connected: false }));
    if (s.connected) return true;
  }
  return false;
}

async function ensureProviderWiring(port) {
  try {
    const pools = await getProxyPools({});
    let pool = (pools || []).find(
      (p) => p.name === POOL_NAME || p.proxyUrl === `http://127.0.0.1:${port}`,
    );
    if (!pool) {
      pool = await createProxyPool({
        name: POOL_NAME,
        type: "http",
        proxyUrl: `http://127.0.0.1:${port}`,
        isActive: true,
        strictProxy: true,
      });
    }
    const settings = await getSettings();
    const strategies = { ...(settings?.providerStrategies || {}) };
    const current = strategies.opencode || {};
    // Only auto-wire when nothing is configured. A manually chosen pool must
    // never be overwritten by the keeper on its next tick.
    if (!current.proxyPoolId) {
      strategies.opencode = { ...current, proxyPoolId: pool.id, rotateStrategy: "none" };
      await updateSettings({ providerStrategies: strategies });
    }
    return true;
  } catch (error) {
    console.error("[WarpAutoStart] wiring failed:", error?.message || error);
    return false;
  }
}

export function startWarpAutoStart() {
  if (started) return;
  started = true;
  const port = Number(process.env.ROUTERMOD_WARP_PORT || 40000);

  const tick = async () => {
    if (process.env.ROUTERMOD_WARP_DISABLE === "1") return;
    const bin = findWarpCli();
    if (!bin) return; // warp-cli absent: RouterMod simply runs without it.
    const ok = await ensureTunnel(bin, port);
    console.log(`[WarpAutoStart] tick ok=${ok} proxy=${await warpProxyReachable()}`);
    if (ok) await ensureProviderWiring(port);
  };

  // Do not block app startup; recover quickly if a hop left the tunnel down.
  const initial = setTimeout(tick, 6_000);
  initial.unref?.();
  const timer = setInterval(tick, 20_000);
  timer.unref?.();
}
