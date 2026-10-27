const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const cwd = path.resolve(__dirname, "..");
const logsDir = path.join(cwd, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const outLog = path.join(logsDir, "pm2-dev-out.log");
const errLog = path.join(logsDir, "pm2-dev-err.log");

const outFd = fs.openSync(outLog, "a");
const errFd = fs.openSync(errLog, "a");

const child = spawn("node", ["node_modules/next/dist/bin/next", "dev", "--port", "1337"], {
  cwd,
  stdio: ["ignore", outFd, errFd],
  windowsHide: true,
  env: { ...process.env, PORT: "1337", NODE_ENV: "development" },
});

// Keep alive — don't unref, let PM2 manage lifecycle
child.on("exit", (code) => {
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  process.exit(code || 0);
});
child.on("error", (err) => {
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  console.error(err);
  process.exit(1);
});

console.log("Next dev started hidden, pid=" + child.pid);
