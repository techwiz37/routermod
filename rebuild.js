#!/usr/bin/env node
// rebuild.js — stop PM2, rebuild production, restart
// Usage: node rebuild.js
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const isWin = process.platform === "win32";

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: __dirname });
}

// Cross-platform recursive copy
function cpDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (isWin) {
    run(`xcopy /E /Y /I "${src}" "${dest}"`);
  } else {
    run(`cp -r "${src}/." "${dest}"`);
  }
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

run("pm2 stop routermod");
run("npm run build");

// postbuild script handles most of this, but ensure manually as fallback
const standalone = path.join(__dirname, ".next", "standalone");
if (fs.existsSync(standalone)) {
  ensureDir(path.join(standalone, ".next", "static"));
  ensureDir(path.join(standalone, "public"));
  ensureDir(path.join(standalone, "src"));
  cpDir(path.join(__dirname, ".next", "static"),  path.join(standalone, ".next", "static"));
  cpDir(path.join(__dirname, "public"),            path.join(standalone, "public"));
  cpDir(path.join(__dirname, "src"),               path.join(standalone, "src"));
}

run("pm2 start routermod");
console.log("\nDone.");
