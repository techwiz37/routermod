import { loadState, saveState, writeGate } from "../shared/state.js";
import { spawnQuickTunnel, killCloudflared, isCloudflaredRunning, setUnexpectedExitHandler } from "./cloudflared.js";
import { clearPid } from "./pid.js";
import { probeUrlAlive } from "./healthCheck.js";
import { getSettings, updateSettings } from "@/lib/localDb";
import { createSubdomain, deleteSubdomain, generateSubdomainSlug } from "./cfDns.js";
import { enableReverseProxy, disableReverseProxy, getPublicIpv4 } from "../reverseProxy/index.js";

const IS_WIN = process.platform === "win32";
const PUBLIC_DOMAIN = process.env.CF_PUBLIC_DOMAIN || "toolwiz.id";

const svc = {
  cancelToken: { cancelled: false },
  spawnInProgress: false,
  lastRestartAt: 0,
  activeLocalPort: null,
};

export function getTunnelService()          { return svc; }
export function isTunnelManuallyDisabled()  { return svc.cancelToken.cancelled; }
export function isTunnelReconnecting()      { return svc.spawnInProgress; }

let onUnexpectedExit = null;
export function setTunnelUnexpectedExitCallback(cb) { onUnexpectedExit = cb; }

function throwIfCancelled(token) {
  if (token.cancelled) throw new Error("tunnel cancelled");
}

export async function enableTunnel(localPort = parseInt(process.env.PORT || "1337", 10)) {
  console.log(`[Tunnel] enable start (port=${localPort}, platform=${process.platform})`);
  svc.cancelToken    = { cancelled: false };
  svc.activeLocalPort = localPort;
  svc.spawnInProgress = true;
  const token = svc.cancelToken;

  try {
    const existing = loadState();

    if (IS_WIN && isCloudflaredRunning() && existing?.tunnelUrl && existing?.publicUrl) {
      const [directOk, publicOk] = await Promise.all([
        probeUrlAlive(existing.tunnelUrl),
        probeUrlAlive(existing.publicUrl),
      ]);
      if (directOk && publicOk) {
        console.log(`[Tunnel] already running, reuse: ${existing.publicUrl}`);
        writeGate({ tunnelActive: true });
        return { success: true, tunnelUrl: existing.tunnelUrl, publicUrl: existing.publicUrl, slug: existing.slug, alreadyRunning: true };
      }
      console.log(`[Tunnel] stale tunnel (direct=${directOk} public=${publicOk}), respawn`);
    }

    const slug   = existing?.slug || generateSubdomainSlug();
    const domain = `${slug}.${PUBLIC_DOMAIN}`;
    console.log(`[Tunnel] slug=${slug} (${existing?.slug ? "reused" : "new"})`);

    let publicIp = null;
    if (!IS_WIN) {
      try {
        publicIp = await getPublicIpv4();
        console.log(`[Tunnel] VPS public IP: ${publicIp}`);
      } catch (e) {
        console.warn(`[Tunnel] Could not detect public IP: ${e.message}`);
      }
    }

    let tunnelUrl = existing?.tunnelUrl || `http://127.0.0.1:${localPort}`;

    if (IS_WIN) {
      if (IS_WIN) killCloudflared(localPort);
      throwIfCancelled(token);

      const onUrlUpdate = async (url) => {
        if (token.cancelled) return;
        console.log(`[Tunnel] cloudflared url: ${url}`);
        saveState({ slug, tunnelUrl: url, publicUrl: existing?.publicUrl || null, cfRecordId: existing?.cfRecordId || null });
        await updateSettings({ tunnelEnabled: true, tunnelUrl: url });
      };

      setUnexpectedExitHandler(() => {
        console.warn("[Tunnel] cloudflared exited unexpectedly, scheduling respawn");
        if (onUnexpectedExit) onUnexpectedExit();
      });

      const spawned = await spawnQuickTunnel(localPort, onUrlUpdate);
      tunnelUrl = spawned.tunnelUrl;
      console.log(`[Tunnel] cloudflared spawned: ${tunnelUrl}`);
      throwIfCancelled(token);
    } else {
      console.log(`[Tunnel] Linux mode — using Nginx directly (no cloudflared)`);
    }

    let revProxyIp = null;
    try {
      const result = await enableReverseProxy({ slug, domain });
      revProxyIp = result.publicIp;
      console.log(`[Tunnel] reverse proxy enabled (${IS_WIN ? "caddy" : "nginx"})`);
    } catch (e) {
      console.warn(`[Tunnel] reverse proxy setup failed: ${e.message}`);
    }

    let publicUrl   = `https://${domain}`;
    let cfRecordId  = existing?.cfRecordId || null;
    try {
      const cf = await createSubdomain(slug, tunnelUrl, revProxyIp || publicIp);
      publicUrl  = cf.publicUrl;
      cfRecordId = cf.recordId || cfRecordId;
      console.log(`[Tunnel] CF DNS upserted: ${publicUrl} (record ${cfRecordId})`);
    } catch (e) {
      console.warn(`[Tunnel] CF DNS failed: ${e.message}`);
      if (existing?.publicUrl) publicUrl = existing.publicUrl;
    }

    saveState({ slug, tunnelUrl, publicUrl, cfRecordId });
    writeGate({ tunnelActive: true });
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
  console.log("[Tunnel] disable — will clear slug so next enable generates new one");
  svc.cancelToken.cancelled = true;
  setUnexpectedExitHandler(null);

  if (IS_WIN) {
    try { killCloudflared(svc.activeLocalPort); } catch (e) { console.warn(`[Tunnel] kill warn: ${e.message}`); }
    clearPid();
  }

  const state = loadState();
  if (state?.slug) {
    await Promise.allSettled([
      deleteSubdomain(state.slug, state.cfRecordId),
      disableReverseProxy({ slug: state.slug }),
    ]);
  }

  saveState({ slug: null, tunnelUrl: null, publicUrl: null, cfRecordId: null });
  writeGate({ tunnelActive: false });

  await updateSettings({ tunnelEnabled: false, tunnelUrl: "" });
  svc.spawnInProgress  = false;
  svc.activeLocalPort  = null;
  return { success: true };
}

export async function getTunnelStatus() {
  const settings       = await getSettings();
  const settingsEnabled = settings.tunnelEnabled === true;
  const state          = loadState();
  const slug           = state?.slug || "";
  const publicUrl      = state?.publicUrl || "";
  const tunnelUrl      = state?.tunnelUrl || "";

  let running = false;
  if (settingsEnabled) {
    if (IS_WIN) {
      running = isCloudflaredRunning();
    } else {
      try {
        const { default: fs } = await import("fs");
        running = !!slug && fs.existsSync(`/etc/nginx/sites-enabled/routermod-${slug}.conf`);
      } catch {
        running = !!slug && !!publicUrl;
      }
    }
  }

  return { enabled: settingsEnabled && running, settingsEnabled, tunnelUrl, publicUrl, slug, running };
}
