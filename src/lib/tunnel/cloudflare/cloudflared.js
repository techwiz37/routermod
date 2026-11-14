import fs from "fs";
import path from "path";
import https from "https";
import os from "os";
import { execSync, spawn } from "child_process";
import { savePid, loadPid, clearPid } from "./pid.js";
import { DATA_DIR } from "@/lib/dataDir.js";

const BIN_DIR = path.join(DATA_DIR, "bin");
const BINARY_NAME = "cloudflared";
const IS_WINDOWS = os.platform() === "win32";
const BIN_NAME = IS_WINDOWS ? `${BINARY_NAME}.exe` : BINARY_NAME;
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);
const POWERSHELL_HIDDEN_COMMAND = "powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command";
const DEFAULT_QUICK_TUNNEL_PROTOCOL = "http2";
const QUICK_TUNNEL_PROTOCOLS = new Set(["http2", "quic", "auto"]);

const GITHUB_BASE_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download";

const PLATFORM_MAPPINGS = {
  darwin: {
    x64: "cloudflared-darwin-amd64.tgz",
    arm64: "cloudflared-darwin-arm64.tgz"
  },
  win32: {
    x64: "cloudflared-windows-amd64.exe",
    ia32: "cloudflared-windows-386.exe",
    arm64: "cloudflared-windows-386.exe"
  },
  linux: {
    x64: "cloudflared-linux-amd64",
    arm64: "cloudflared-linux-arm64"
  }
};

const PLATFORM_FALLBACK = {
  darwin: "cloudflared-darwin-amd64.tgz",
  win32: "cloudflared-windows-386.exe",
  linux: "cloudflared-linux-amd64"
};

function getDownloadUrl() {
  const platform = os.platform();
  const arch = os.arch();

  const platformMapping = PLATFORM_MAPPINGS[platform];
  if (!platformMapping) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryName = platformMapping[arch] || PLATFORM_FALLBACK[platform];
  return `${GITHUB_BASE_URL}/${binaryName}`;
}

const dlState = { downloading: false, progress: 0 };

export function getDownloadStatus() {
  return { downloading: dlState.downloading, progress: dlState.progress };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers["content-length"], 10) || 0;
      let receivedBytes = 0;
      dlState.downloading = true;
      dlState.progress = 0;

      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (totalBytes > 0) dlState.progress = Math.round((receivedBytes / totalBytes) * 100);
      });

      response.pipe(file);

      file.on("finish", () => {
        dlState.downloading = false;
        dlState.progress = 100;
        file.close(() => resolve(dest));
      });

      file.on("error", (err) => {
        dlState.downloading = false;
        dlState.progress = 0;
        file.close();
        fs.unlinkSync(dest);
        reject(err);
      });
    }).on("error", (err) => {
      dlState.downloading = false;
      dlState.progress = 0;
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

const MIN_BINARY_SIZE = 1024 * 1024; // 1MB - cloudflared is ~30MB+

function isValidBinary(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < MIN_BINARY_SIZE) return false;
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const magic = buf.toString("hex");
    if (IS_WINDOWS) return magic.startsWith("4d5a"); // PE (MZ)
    if (os.platform() === "darwin") return magic.startsWith("cffaedfe") || magic.startsWith("cefaedfe");
    return magic.startsWith("7f454c46"); // ELF (Linux)
  } catch {
    return false;
  }
}

let downloadPromise = null;

export async function ensureCloudflared() {
  if (downloadPromise) return downloadPromise;
  downloadPromise = _ensureCloudflared().finally(() => { downloadPromise = null; });
  return downloadPromise;
}

async function _ensureCloudflared() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const tmpPath = `${BIN_PATH}.tmp`;
  if (fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  if (fs.existsSync(BIN_PATH)) {
    if (!isValidBinary(BIN_PATH)) {
      console.log("[cloudflared] Invalid binary detected, re-downloading...");
      fs.unlinkSync(BIN_PATH);
    } else {
      if (!IS_WINDOWS) fs.chmodSync(BIN_PATH, "755");
      return BIN_PATH;
    }
  }

  const url = getDownloadUrl();
  const isArchive = url.endsWith(".tgz");
  const downloadDest = isArchive ? path.join(BIN_DIR, "cloudflared.tgz.tmp") : tmpPath;

  await downloadFile(url, downloadDest);

  if (isArchive) {
    execSync(`tar -xzf "${downloadDest}" -C "${BIN_DIR}"`, { stdio: "pipe", windowsHide: true });
    fs.unlinkSync(downloadDest);
  } else {
    fs.renameSync(downloadDest, BIN_PATH);
  }

  if (!IS_WINDOWS) {
    fs.chmodSync(BIN_PATH, "755");
  }

  return BIN_PATH;
}

let cloudflaredProcess = null;
let unexpectedExitHandler = null;
let intentionalKill = false; // suppress unexpected-exit callback during deliberate kill

export function setUnexpectedExitHandler(handler) {
  unexpectedExitHandler = handler;
}

export async function spawnCloudflared(tunnelToken) {
  const binaryPath = await ensureCloudflared();

  const child = spawn(binaryPath, ["tunnel", "run", "--dns-resolver-addrs", "1.1.1.1:53", "--token", tunnelToken], {
    detached: false,
    windowsHide: true,
    cwd: os.tmpdir(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  cloudflaredProcess = child;
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let connectionCount = 0;
    let resolved = false;
    const timeout = setTimeout(() => {
      resolved = true;
      resolve(child);
    }, 90000);

    const handleLog = (data) => {
      const msg = data.toString();
      const matches = msg.match(/Registered tunnel connection/g);
      if (matches) {
        connectionCount += matches.length;
        if (connectionCount >= 4 && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(child);
        }
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", handleLog);

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on("exit", (code, signal) => {
      if (cloudflaredProcess === child) cloudflaredProcess = null;
      clearPid(child.pid);
      const wasConnected = resolved; // true = already connected successfully
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        let stderrOutput = "";
        if (child.stderr && !child.stderr.destroyed) {
          stderrOutput = " Check cloudflared logs for details.";
        }
        if (code === 1) {
          reject(new Error(`cloudflared exited with code ${code}${stderrOutput} Ensure your tunnel token is valid and network is reachable.`));
        } else if (code === 2) {
          reject(new Error(`cloudflared exited with code ${code}${stderrOutput} Check if required arguments are correct.`));
        } else {
          reject(new Error(`cloudflared exited with code ${code}${stderrOutput}`));
        }
        return;
      }
      if (intentionalKill) { intentionalKill = false; return; }
      if (wasConnected && unexpectedExitHandler) unexpectedExitHandler();
    });
  });
}

export async function spawnQuickTunnel(localPort, onUrlUpdate) {
  const binaryPath = await ensureCloudflared();

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudflared-quick-"));
  const configPath = path.join(configDir, "config.yml");

  const requestedProtocol = String(process.env.TUNNEL_TRANSPORT_PROTOCOL || process.env.CLOUDFLARED_PROTOCOL || DEFAULT_QUICK_TUNNEL_PROTOCOL).trim().toLowerCase();
  const tunnelProtocol = QUICK_TUNNEL_PROTOCOLS.has(requestedProtocol) ? requestedProtocol : DEFAULT_QUICK_TUNNEL_PROTOCOL;

  // QUIC (UDP/7844) is blocked by many ISP/mobile networks, which made the
  // public URL refuse connections for remote devices while the machine that
  // spawned cloudflared (UDP allowed) still worked. HTTP/2 uses TCP/443.
  // The protocol must live in the config file: `--protocol` on the CLI is
  // only a hint for quick tunnels and the process still dials QUIC without it.
  const configBody = [
    "# managed by routermod — quick tunnel",
    `protocol: ${tunnelProtocol}`,
    "edge-ip-version: 4",
    "no-autoupdate: true",
    "",
  ].join("\n");
  fs.writeFileSync(configPath, configBody, "utf8");

  let isCleaned = false;
  const cleanup = () => {
    if (isCleaned) return;
    isCleaned = true;
    try {
      fs.rmSync(configDir, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
  };

  // `--dns-resolver-addrs` is not accepted in quick-tunnel mode (cloudflared
  // exits and prints help), so edge DNS is left to the system resolver.
  // `--no-prechecks` matters on networks that block outbound UDP/7844: the QUIC
  // precheck failure otherwise aborts the process even though the HTTP/2
  // connection (TCP/443) already registered successfully.
  const child = spawn(binaryPath, ["tunnel", "--url", `http://127.0.0.1:${localPort}`, "--config", configPath, "--no-autoupdate", "--retries", "99", "--protocol", tunnelProtocol, "--no-prechecks"], {
    detached: false,
    windowsHide: true,
    cwd: os.tmpdir(),
    env: {
      ...process.env,
      TUNNEL_TRANSPORT_PROTOCOL: tunnelProtocol,
      TUNNEL_EDGE_IP_VERSION: process.env.TUNNEL_EDGE_IP_VERSION || "4",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  cloudflaredProcess = child;
  savePid(child.pid);

  return new Promise((resolve, reject) => {
    let resolved = false;
    let logTail = "";

    function getQuickTunnelUrlFromLog(message) {
      const regex = /https:\/\/([a-z0-9-]+)\.trycloudflare\.com/gi;
      const candidates = [];

      for (const match of message.matchAll(regex)) {
        const host = match[1];
        if (host === "api") continue;
        candidates.push(`https://${host}.trycloudflare.com`);
      }

      if (!candidates.length) return null;
      return candidates[candidates.length - 1];
    }

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      clearInterval(settle);
      cleanup();
      reject(new Error(`Quick tunnel timed out. Last log: ${logTail.slice(-800) || "(empty)"}`));
    }, 90000);

    let lastUrl = null;
    let registeredUrl = null;
    let urlSeen = false;
    let connectionCount = 0;
    let connFirstAt = 0;

    // The 3s grace after the first registration must be evaluated on a timer:
    // cloudflared stops logging once connected, so a log-driven check would wait
    // forever and the whole enable would fail with a misleading timeout.
    const settle = setInterval(() => {
      if (resolved) { clearInterval(settle); return; }
      if (lastUrl && connectionCount >= 1 && Date.now() - connFirstAt >= 3000) {
        resolved = true;
        registeredUrl = lastUrl;
        clearInterval(settle);
        clearTimeout(timeout);
        cleanup();
        resolve({ child, tunnelUrl: lastUrl });
      }
    }, 500);

    const handleLog = (data) => {
      const msg = data.toString();
      logTail = (logTail + msg).slice(-4000);
      const tunnelUrl = getQuickTunnelUrlFromLog(msg);
      if (tunnelUrl) {
        lastUrl = tunnelUrl;
        if (!urlSeen) {
          urlSeen = true;
          console.log(`[Tunnel] cloudflared URL: ${tunnelUrl}`);
        }
      }

      const conns = msg.match(/Registered tunnel connection/g);
      if (conns) {
        if (!connFirstAt) connFirstAt = Date.now();
        connectionCount += conns.length;
      }

      if (!resolved) return;

      if (tunnelUrl && tunnelUrl !== registeredUrl) {
        console.log(`[Tunnel] cloudflared URL changed: ${tunnelUrl}`);
        registeredUrl = tunnelUrl;
        if (onUrlUpdate) onUrlUpdate(tunnelUrl);
      }
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", handleLog);

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearInterval(settle);
      clearTimeout(timeout);
      cleanup();
      reject(err);
    });

    child.on("exit", (code, signal) => {
      if (cloudflaredProcess === child) cloudflaredProcess = null;
      clearPid(child.pid);
      clearInterval(settle);
      if (intentionalKill) {
        intentionalKill = false;
        clearTimeout(timeout);
        cleanup();
        if (!resolved) { resolved = true; reject(new Error("cloudflared killed")); }
        return;
      }
      console.log(`[Tunnel] cloudflared exit code=${code} signal=${signal}`);
      if (!resolved) {
        resolved = true;
        clearInterval(settle);
        clearTimeout(timeout);
        cleanup();
        const tail = logTail.slice(-600).trim() || "(empty)";
        if (code === 1) {
          reject(new Error(`cloudflared quick tunnel exited (code 1). Common causes: (1) outbound port 7844 (TCP/UDP) blocked, (2) TryCloudflare service issue, (3) cannot reach 127.0.0.1:${localPort}, (4) protocol (http2/quic) blocked by network. Last log: ${tail}`));
        } else if (code === 2) {
          reject(new Error(`cloudflared exited (code 2). Bad arguments. Last log: ${tail}`));
        } else {
          reject(new Error(`cloudflared exited (code ${code}). Last log: ${tail}`));
        }
        return;
      }
      if (unexpectedExitHandler) unexpectedExitHandler();
      cleanup();
    });
  });
}

function killCloudflaredByPort(port) {
  if (!port) return;
  try {
    if (IS_WINDOWS) {
      const psCmd = `Get-CimInstance Win32_Process -Filter \\"Name='cloudflared.exe'\\" | Where-Object { $_.CommandLine -match ':${port}(\\D|$)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      execSync(`${POWERSHELL_HIDDEN_COMMAND} "${psCmd}"`, { stdio: "ignore", windowsHide: true });
    } else {
      execSync(`pkill -f "cloudflared.*:${port}([^0-9]|$)" 2>/dev/null || true`, { stdio: "ignore", windowsHide: true });
    }
  } catch (e) { /* ignore */ }
}

export function killCloudflared(localPort) {
  intentionalKill = true;
  if (cloudflaredProcess) {
    try {
      cloudflaredProcess.kill();
    } catch (e) { /* ignore */ }
    cloudflaredProcess = null;
  }

  const pid = loadPid();
  if (pid) {
    try {
      process.kill(pid);
    } catch (e) { /* ignore */ }
    clearPid();
  }

  killCloudflaredByPort(localPort);
}

export function isCloudflaredRunning() {
  const pid = loadPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}
