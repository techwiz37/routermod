
import { execSync, exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import { DATA_DIR } from "@/lib/dataDir.js";

const IS_WIN = process.platform === "win32";
const APP_PORT = parseInt(process.env.PORT || "1945", 10);


const PROXY_DIR   = path.join(DATA_DIR, "proxy");
const CADDY_BIN   = IS_WIN ? path.join(PROXY_DIR, "caddy.exe") : "caddy";
const CADDYFILE   = path.join(PROXY_DIR, "Caddyfile");
const CADDY_PID   = path.join(PROXY_DIR, "caddy.pid");

const NGINX_SITES = "/etc/nginx/sites-enabled";
const NGINX_CONF  = (slug) => `/etc/nginx/sites-enabled/routermod-${slug}.conf`;

function ensureProxyDir() {
  if (!fs.existsSync(PROXY_DIR)) fs.mkdirSync(PROXY_DIR, { recursive: true });
}


function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", stdio: "pipe", ...opts }).trim();
}

function runAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: "utf-8" }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.destroy();
        fs.unlinkSync(dest);
        resolve(downloadFile(res.headers.location, dest));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}


export async function getPublicIpv4() {
  const services = [
    "https://api4.ipify.org",
    "https://ipv4.icanhazip.com",
    "https://checkip.amazonaws.com",
  ];
  const results = await Promise.allSettled(
    services.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(4000) })
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((t) => t.trim())
        .then((ip) => (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : Promise.reject()))
    )
  );
  const first = results.find((r) => r.status === "fulfilled");
  if (!first) throw new Error("Could not detect public IPv4");
  return first.value;
}


function isNginxInstalled() {
  try { run("nginx -v"); return true; } catch { return false; }
}

async function ensureNginx() {
  if (isNginxInstalled()) return;
  console.log("[reverseProxy] installing nginx...");
  await runAsync("apt-get update -qq && apt-get install -y nginx");
}

function nginxConfig(slug, domain) {
  return `# RouterMod — auto-generated — do not edit manually
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
`;
}

async function enableNginx(slug, domain) {
  await ensureNginx();
  const confPath = NGINX_CONF(slug);
  fs.writeFileSync(confPath, nginxConfig(slug, domain));
  console.log(`[reverseProxy] wrote nginx config ${confPath}`);
  try { run("nginx -t"); } catch (e) { throw new Error(`nginx config test failed: ${e.message}`); }
  await runAsync("systemctl reload nginx || service nginx reload");
  console.log("[reverseProxy] nginx reloaded");
}

async function disableNginx(slug) {
  const confPath = NGINX_CONF(slug);
  if (fs.existsSync(confPath)) {
    fs.unlinkSync(confPath);
    console.log(`[reverseProxy] removed nginx config ${confPath}`);
    await runAsync("systemctl reload nginx || service nginx reload").catch(() => {});
  }
}


function isCaddyInstalled() {
  try { run(`"${CADDY_BIN}" version`); return true; } catch { return false; }
}

async function ensureCaddy() {
  if (isCaddyInstalled()) return;
  ensureProxyDir();
  console.log("[reverseProxy] downloading caddy...");
  const arch = os.arch() === "arm64" ? "arm64" : "amd64";
  const url = `https://caddyserver.com/api/download?os=windows&arch=${arch}&p=github.com%2Fcaddy-dns%2Fcloudflare`;
  await downloadFile(url, CADDY_BIN);
  console.log("[reverseProxy] caddy downloaded to", CADDY_BIN);
}

function caddyfileContent(slug, domain) {
  return `# RouterMod — auto-generated
${domain} {
    reverse_proxy 127.0.0.1:${APP_PORT}
    tls internal
}
`;
}

function stopOldCaddy() {
  if (!fs.existsSync(CADDY_PID)) return;
  try {
    const pid = fs.readFileSync(CADDY_PID, "utf8").trim();
    if (pid) run(`taskkill /PID ${pid} /F`);
  } catch {}
  try { fs.unlinkSync(CADDY_PID); } catch {}
}

async function enableCaddy(slug, domain) {
  await ensureCaddy();
  ensureProxyDir();
  fs.writeFileSync(CADDYFILE, caddyfileContent(slug, domain));
  console.log("[reverseProxy] wrote Caddyfile", CADDYFILE);
  stopOldCaddy();
  const child = require("child_process").spawn(
    CADDY_BIN,
    ["run", "--config", CADDYFILE, "--adapter", "caddyfile"],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  fs.writeFileSync(CADDY_PID, String(child.pid));
  console.log(`[reverseProxy] caddy started (pid=${child.pid})`);
}

async function disableCaddy() {
  stopOldCaddy();
  if (fs.existsSync(CADDYFILE)) fs.unlinkSync(CADDYFILE);
  console.log("[reverseProxy] caddy stopped, Caddyfile removed");
}


export async function enableReverseProxy({ slug, domain }) {
  if (IS_WIN) {
    await enableCaddy(slug, domain);
    return { publicIp: null };
  } else {
    const publicIp = await getPublicIpv4();
    await enableNginx(slug, domain);
    return { publicIp };
  }
}

export async function disableReverseProxy({ slug }) {
  if (IS_WIN) {
    await disableCaddy();
  } else {
    await disableNginx(slug);
  }
}
