#!/usr/bin/env node
// rebuild.js — run after code changes to rebuild and restart production
// Usage: node rebuild.js

const { execSync } = require("child_process");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: __dirname });
}

run("npm run build");
run("pm2 restart routermod --update-env");
console.log("\nDone. routermod restarted in production mode.");
