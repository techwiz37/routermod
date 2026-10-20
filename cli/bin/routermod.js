#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PORT = process.env.PORT || 1945;
const DATA_DIR = path.join(os.homedir(), ".routermod");
const INSTALL_DIR = path.join(DATA_DIR, "app");
const REPO = "https://github.com/techwiz37/routermod.git";

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", ...opts });
}

function isInstalled() {
  return fs.existsSync(path.join(INSTALL_DIR, "package.json"));
}

function install() {
  console.log("[routermod] Installing app...");
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  run(`git clone --depth 1 ${REPO} "${INSTALL_DIR}"`);
  // Full install (including devDependencies) is required: the production build
  // needs tailwindcss + @tailwindcss/postcss + postcss, which live in
  // devDependencies. A --production install would fail at `npm run build`.
  run("npm install --include=dev", { cwd: INSTALL_DIR });
  run("npm run build", { cwd: INSTALL_DIR });
}

function start() {
  console.log(`[routermod] Starting on http://localhost:${PORT}`);
  const server = spawn("node", ["custom-server.js", "--port", String(PORT)], {
    cwd: INSTALL_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: "inherit",
  });
  server.on("exit", (code) => process.exit(code ?? 0));
  ["SIGINT", "SIGTERM"].forEach(sig => process.on(sig, () => server.kill(sig)));
}

if (!isInstalled()) install();
start();
