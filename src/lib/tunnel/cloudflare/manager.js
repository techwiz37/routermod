import { loadState, saveState, writeGate, generateShortId } from "../shared/state.js";
import { spawnQuickTunnel, killCloudflared, isCloudflaredRunning, setUnexpectedExitHandler } from "./cloudflared.js";
import { clearPid } from "./pid.js";
import { probeUrlAlive, waitForHealth } from "./healthCheck.js";
import { TUNNEL_WORKER_URL } from "./config.js";
import { publicUrlFor, findPublicRecord } from "./cfDns.js";
import { getSettings, updateSettings } from "@/lib/localDb";

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

async function postRegister(shortId, tunnelUrl) {
  const res = await fetch(`${TUNNEL_WORKER_URL}/api/tunnel/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shortId, tunnelUrl }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Tunnel registration failed (${res.status}): ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
}

// Register with the worker, retrying transient failures. A fresh shortId (the
// "regenerate" path) has no mapping at all, so a single network blip used to
// leave the public URL answering 502 "Tunnel not found" while cloudflared was
// perfectly healthy. Backoff keeps the first attempt instant for restarts.
export async function registerTunnelUrl(shortId, tunnelUrl, attempts = 5, cancelToken = svc.cancelToken) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    if (cancelToken.cancelled) throw new Error("tunnel cancelled");
    try {
      await postRegister(shortId, tunnelUrl);
      return;
    } catch (e) {
      lastError = e;
      // 4xx (bad body/shortId) will never succeed by retrying.
      if (e.status && e.status >= 400 && e.status < 500) break;
      console.warn(`[Tunnel] register attempt ${i + 1}/${attempts} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 8000)));
    }
  }
  throw lastError || new Error("Tunnel registration failed");
}

// After the worker reports the URL registered, wait until the public URL
// actually answers. The worker KV can lag a few seconds behind the write; a
// short grace probe avoids reporting success while the domain is still 502.
async function waitForPublicReady(publicUrl, cancelToken, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cancelToken.cancelled) throw new Error("tunnel cancelled");
    try {
      const res = await fetch(`${publicUrl}/api/tunnel/ping`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return true;
    } catch { /* worker/KV not ready yet */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

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
    const shortId = existing?.shortId || generateShortId();
    const publicUrl = publicUrlFor(shortId);

    if (isCloudflaredRunning() && existing?.tunnelUrl && existing?.shortId) {
      // Probe the tunnel directly first. The public URL goes through the worker
      // and can fail for reasons that are not the tunnel's fault: a stale KV
      // mapping after a restart, or a slow cold start of the worker. Killing a
      // perfectly healthy cloudflared in that case rotates the quick-tunnel URL
      // and leaves every remote device with ERR_CONNECTION_REFUSED for a while.
      const directOk = await probeUrlAlive(existing.tunnelUrl);
      if (directOk) {
        console.log(`[Tunnel] already running, reuse: ${publicUrl}`);
        // Make sure the worker points at this tunnel, then verify publicly.
        try { await registerTunnelUrl(shortId, existing.tunnelUrl, 3, token); } catch (e) {
          console.warn(`[Tunnel] reuse re-register failed: ${e.message}`);
        }
        const publicOk = await probeUrlAlive(publicUrl) ||
          await waitForPublicReady(publicUrl, token, 20000);
        if (!publicOk) {
          console.warn(`[Tunnel] reuse: public URL not ready yet (${publicUrl}), keeping healthy tunnel`);
        }
        writeGate({ tunnelActive: true });
        saveState({ shortId, tunnelUrl: existing.tunnelUrl, publicUrl });
        await updateSettings({ tunnelEnabled: true, tunnelUrl: existing.tunnelUrl });
        svc.spawnInProgress = false;
        return { success: true, tunnelUrl: existing.tunnelUrl, publicUrl, shortId, alreadyRunning: true };
      }
      console.log(`[Tunnel] stale tunnel (direct=${directOk}), respawn`);
    }

    killCloudflared(localPort);
    throwIfCancelled(token);

    const onUrlUpdate = async (url) => {
      if (token.cancelled) return;
      console.log(`[Tunnel] quick tunnel url: ${url}`);
      try {
        await registerTunnelUrl(shortId, url);
      } catch (e) {
        console.warn(`[Tunnel] re-register failed: ${e.message}`);
        return;
      }
      saveState({ shortId, tunnelUrl: url, publicUrl });
      await updateSettings({ tunnelEnabled: true, tunnelUrl: url });
    };

    setUnexpectedExitHandler(() => {
      console.warn("[Tunnel] cloudflared exited unexpectedly, scheduling respawn");
      if (onUnexpectedExit) onUnexpectedExit();
    });

    const spawned = await spawnQuickTunnel(localPort, onUrlUpdate);
    const tunnelUrl = spawned.tunnelUrl;
    console.log(`[Tunnel] cloudflared spawned: ${tunnelUrl}`);
    throwIfCancelled(token);

    // Register the NEW url before touching disk. Previously the state file kept
    // the previous (dead) tunnelUrl while this new one was being registered, so
    // any reader — the worker repair watchdog included — re-registered the old,
    // dead URL and the public domain stayed 530.
    try {
      await registerTunnelUrl(shortId, tunnelUrl);
    } catch (e) {
      saveState({ shortId, tunnelUrl, publicUrl });
      throw e;
    }
    // Persist immediately so a concurrent repair never resurrects a stale URL.
    saveState({ shortId, tunnelUrl, publicUrl });
    await updateSettings({ tunnelEnabled: true, tunnelUrl });

    await waitForHealth(publicUrl, token).catch((e) => {
      if (token.cancelled) throw e;
      // Cloudflare caches negative DNS for a few seconds — the endpoint is
      // registered and working, so keep it active instead of failing hard.
      console.warn(`[Tunnel] public URL not healthy yet: ${e.message}`);
    });

    // Confirm the worker actually serves the mapping before declaring success.
    const ready = await waitForPublicReady(publicUrl, token);
    if (!ready) {
      // Last resort: re-register once, KV may have been cleared by the worker.
      console.warn("[Tunnel] public URL still unreachable, re-registering once");
      await registerTunnelUrl(shortId, tunnelUrl, 2);
      await waitForPublicReady(publicUrl, token, 30000);
    }

    writeGate({ tunnelActive: true });
    await updateSettings({ tunnelEnabled: true, tunnelUrl });

    const record = await findPublicRecord(shortId);
    if (record.known && !record.present) {
      console.warn(`[Tunnel] worker route missing for ${publicUrl} (r${shortId}.${new URL(TUNNEL_WORKER_URL).hostname})`);
    }
    console.log(`[Tunnel] enable success — publicUrl=${publicUrl}`);

    return { success: true, tunnelUrl, publicUrl, shortId };
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
  console.log("[Tunnel] disable — clearing state so next enable creates a new shortId");
  svc.cancelToken.cancelled = true;
  setUnexpectedExitHandler(null);

  try { killCloudflared(svc.activeLocalPort); } catch (e) { console.warn(`[Tunnel] kill warn: ${e.message}`); }
  clearPid();

  saveState({ shortId: null, tunnelUrl: null, publicUrl: null });
  writeGate({ tunnelActive: false });

  await updateSettings({ tunnelEnabled: false, tunnelUrl: "" });
  svc.spawnInProgress  = false;
  svc.activeLocalPort  = null;
  return { success: true };
}

export async function getTunnelStatus() {
  const settings        = await getSettings();
  const settingsEnabled = settings.tunnelEnabled === true;
  const state           = loadState();
  const shortId         = state?.shortId || "";
  const publicUrl       = shortId ? publicUrlFor(shortId) : state?.publicUrl || "";
  const tunnelUrl       = state?.tunnelUrl || "";

  const running = settingsEnabled ? isCloudflaredRunning() : false;

  return { enabled: settingsEnabled && running, settingsEnabled, tunnelUrl, publicUrl, shortId, running };
}
