const { spawn } = require("node:child_process");
const fs = require("fs");
const dir = "C:\\Users\\Administrator\\Desktop\\run-routermod";
const args = ["custom-server.js", "--port", "1337"];
const out = fs.openSync("C:\\Users\\Administrator\\AppData\\Local\\Temp\\opencode\\rm-1337.out.log", "w");
const err = fs.openSync("C:\\Users\\Administrator\\AppData\\Local\\Temp\\opencode\\rm-1337.err.log", "w");
const child = spawn("node", args, {
  cwd: dir,
  env: Object.assign({}, process.env, { NODE_ENV: "development" }),
  stdio: ["ignore", out, err],
  detached: true,
});
child.unref();
fs.writeFileSync("C:\\Users\\Administrator\\AppData\\Local\\Temp\\opencode\\rm-1337.pid", String(child.pid), "utf8");
console.log("server dev 1337 started, pid", child.pid);
