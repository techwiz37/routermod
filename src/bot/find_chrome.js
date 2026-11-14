"use strict";

// Cross-platform Chrome/Chromium resolver shared by ag_runner.js and
// session_recovery.js. Works on Windows, Linux and macOS.

const fs = require("fs");
const path = require("path");
const os = require("os");

function candidatePaths() {
  const list = [];

  // Explicit overrides win on every OS.
  for (const env of [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ]) {
    if (env) list.push(env);
  }

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    if (pf) {
      list.push(path.join(pf, "Google", "Chrome", "Application", "chrome.exe"));
      list.push(path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    if (pf86) {
      list.push(path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"));
      list.push(path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
    if (local) list.push(path.join(local, "Google", "Chrome", "Application", "chrome.exe"));
  } else {
    list.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/opt/google/chrome/chrome",
      "/usr/local/bin/chromium"
    );
    const home = os.homedir();
    list.push(path.join(home, ".local", "bin", "chromium"));
    // macOS
    list.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome")
    );
  }

  return list;
}

function findChrome() {
  for (const p of candidatePaths()) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (_e) {}
  }

  // Last resort: resolve from PATH via `which`/`where`.
  try {
    const { execFileSync } = require("child_process");
    const finder = process.platform === "win32" ? "where" : "which";
    for (const bin of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
      try {
        const out = execFileSync(finder, [bin], {
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        })
          .toString()
          .split(/\r?\n/)[0]
          .trim();
        if (out && fs.existsSync(out)) return out;
      } catch (_e) {}
    }
  } catch (_e) {}

  return null;
}

module.exports = { findChrome, candidatePaths };
