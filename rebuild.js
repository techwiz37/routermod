#!/usr/bin/env node
// rebuild.js — stop PM2, rebuild production, restart
// Usage: node rebuild.js
const { execSync } = require("child_process");
function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: __dirname });
}
run("pm2 stop routermod");
run("npm run build");
run("pm2 start routermod");
console.log("\nDone.");
