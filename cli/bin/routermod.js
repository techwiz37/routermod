#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

const PORT = process.env.PORT || 1337;
const APP_DIR = path.join(__dirname, "..", "..", ".next", "standalone");
const SERVER = path.join(APP_DIR, "custom-server.js");

console.log(`[routermod] Starting on http://localhost:${PORT}`);

const server = spawn("node", [SERVER], {
  cwd: APP_DIR,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "production", HOSTNAME: "0.0.0.0" },
  stdio: "inherit",
});

server.on("exit", (code) => process.exit(code ?? 0));
["SIGINT", "SIGTERM"].forEach(sig => process.on(sig, () => server.kill(sig)));
