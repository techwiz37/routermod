import { loadState, saveState, generateShortId } from "../shared/state.js";
import { spawnQuickTunnel, killCloudflared, isCloudflaredRunning, setUnexpectedExitHandler } from "./cloudflared.js";
import { clearPid } from "./pid.js";
import { probeUrlAlive } from "./healthCheck.js";
import { getSettings, updateSettings } from "@/lib/localDb";
import { createSubdomain, deleteSubdomain, generateSubdomainSlug } from "./cfDns.js";

const svc = {
  cancelToken: { cancelled: false },
  spawnInProgress: false,
  lastRestartAt: 0,
  activeLocalPort: null,
};

export function getTunnelService() { return svc; }
export function isTunnelManuallyDisabled() { return svc.cancelToken.cancelled; }
export function isTunnelReconnecting() { return svc.spawnInProgress; }

let onUnexpectedExit = null;
export function setTunnelUnexpectedExitCallback(cb) { onUnexpectedExit = cb; }

function throwIfCancelled(token) {
  if (token.cancelled) throw new Error("tunnel cancelled");
}

export async function enableTunnel(localPort = parseInt(process.env.PORT || "1945", 10)) {
  console.log(`[Tunnel] enable start (port=${localPort})`);
  svc.cancelToken = { cancelled: false };
  svc.activeLocalPort = localPort;
  svc.spawnInProgress = true;
  const token = svc.cancelToken;

  try {
    // Reuse if still alive
    if (isCloudflaredRunning()) {
      const existing = loadState();
      if (existing?.tunnelUrl && existing?.publicUrl) {
        const [directOk, publicOk] = await Promise.all([
          probeUrlAlive(existing.tunnelUrl),
          probeUrlAlive(existing.publicUrl),
        ]);
        if (directOk && publicOk) {
          console.log(`[Tunnel] already running, reuse: ${existing.publicUrl}`);
          return {
            success: true,
            tunnelUrl: existing.tunnelUrl,
            publicUrl: existing.publicUrl,
            slug: existing.slug,
            alreadyRunning: true,
          };
        }
        // Stale — unregister old slug before respawn
        if (existing.slug) {
          await deleteSubdomain(existing.slug).catch(() => {});
        }
        console.log(`[Tunnel] stale (direct=${directOk} public=${publicOk}), respawn`);
      }
    }

    killCloudflared(localPort);
    console.log("[Tunnel] killed existing cloudflared");
    throwIfCancelled(token);

    // Generate new slug each enable (fresh subdomain)
    const slug = generateSubdomainSlug();

    const onUrlUpdate = async (url) => {
      if (token.cancelled) return;
      console.log(`[Tunnel] url updated: ${url}`);
      // Save direct URL immediately; publicUrl provisioned after spawn completes
      saveState({ slug, tunnelUrl: url, publicUrl: null });
      await updateSettings({ tunnelEnabled: true, tunnelUrl: url });
    };

    setUnexpectedExitHandler(() => {
      console.warn("[Tunnel] cloudflared exited unexpectedly, scheduling respawn");
      if (onUnexpectedExit) onUnexpectedExit();
    });

    const { tunnelUrl } = await spawnQuickTunnel(localPort, onUrlUpdate);
    console.log(`[Tunnel] spawned: ${tunnelUrl}`);
    throwIfCancelled(token);

    // Extract hostname from cloudflared URL for CNAME target
    // Provision CF Worker KV: slug -> tunnelUrl (full URL)
    let publicUrl = tunnelUrl; // fallback to direct URL if CF fails
    try {
      const cf = await createSubdomain(slug, tunnelUrl);
      publicUrl = cf.publicUrl;
      console.log(`[Tunnel] CF domain created: ${publicUrl}`);
    } catch (e) {
      console.warn(`[Tunnel] CF subdomain failed, using direct URL: ${e.message}`);
    }

    saveState({ slug, tunnelUrl, publicUrl });
    await updateSettings({ tunnelEnabled: true, tunnelUrl });
    console.log(`[Tunnel] enable success — publicUrl=${publicUrl}`);

    return { success: true, tunnelUrl, publicUrl, slug };
  } catch (e) {
    if (!/cloudflared killed|tunnel cancelled/.test(e.message)) {
      console.error(`[Tunnel] enable error: ${e.message}`);
    }
    throw e;
  } finally {
    svc.spawnInProgress = false;
  }
}

export async function disableTunnel() {
  console.log("[Tunnel] disable");
  svc.cancelToken.cancelled = true;
  setUnexpectedExitHandler(null);

  try { killCloudflared(svc.activeLocalPort); } catch (e) { console.warn(`[Tunnel] kill warn: ${e.message}`); }
  clearPid();

  // Unregister from CF Worker KV
  const state = loadState();
  if (state?.slug) {
    await deleteSubdomain(state.slug).catch((e) => console.warn("[Tunnel] CF unregister warn:", e.message));
  }
  if (state) saveState({ slug: state.slug, tunnelUrl: null, publicUrl: null });

  await updateSettings({ tunnelEnabled: false, tunnelUrl: "" });
  svc.spawnInProgress = false;
  svc.activeLocalPort = null;
  return { success: true };
}

export async function getTunnelStatus() {
  const settings = await getSettings();
  const settingsEnabled = settings.tunnelEnabled === true;
  const state = loadState();
  const slug = state?.slug || "";
  const publicUrl = state?.publicUrl || "";
  const tunnelUrl = state?.tunnelUrl || "";

  const running = settingsEnabled ? isCloudflaredRunning() : false;

  return {
    enabled: settingsEnabled && running,
    settingsEnabled,
    tunnelUrl,
    publicUrl,
    slug,
    running,
  };
}
