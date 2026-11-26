#!/usr/bin/env node
/**
 * Install the freepi-bridge binary into routersmod's local bin directory.
 * Runs from package.json postinstall so `npm install routermod` is enough —
 * no manual curl / terminal command required.
 *
 * Overrides:
 *   FREEPI_BRIDGE_VERSION   pin a release tag (default: latest)
 *   FREEPI_BRIDGE_SKIP=1    skip download (e.g. offline / unsupported platform)
 */
import { mkdir, rename, chmod, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN_DIR = path.join(ROOT, ".bin");
const BIN = path.join(BIN_DIR, process.platform === "win32" ? "freepi-bridge.exe" : "freepi-bridge");
const REPO = "ihsan-ramadhan/freepi-bridge";

function assetName() {
  const osPart = process.platform === "darwin" ? "macos" : process.platform === "linux" ? "linux" : "windows";
  const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : "x86_64";
  if (osPart === "windows") return "freepi-bridge-windows-x86_64.zip";
  return `freepi-bridge-${osPart}-${arch}.tar.gz`;
}

async function main() {
  if (process.env.FREEPI_BRIDGE_SKIP === "1") return;
  try {
    if ((await stat(BIN)).isFile()) {
      console.log("[freepi-bridge] already installed:", BIN);
      return;
    }
  } catch {}

  let version = process.env.FREEPI_BRIDGE_VERSION;
  if (!version) {
    try {
      const { stdout } = await execFileAsync("curl", ["-fsSL", "--connect-timeout", "10", `https://api.github.com/repos/${REPO}/releases/latest`], { timeout: 30000 });
      version = JSON.parse(stdout).tag_name || "v0.2.3";
    } catch {
      version = "v0.2.3";
    }
  }
  const asset = assetName();
  const url = `https://github.com/${REPO}/releases/download/${version}/${asset}`;
  const tmp = path.join(os.tmpdir(), `freepi-bridge-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  await mkdir(BIN_DIR, { recursive: true });
  try {
    console.log(`[freepi-bridge] downloading ${asset} ...`);
    await execFileAsync("curl", ["-fsSL", "--retry", "2", "--connect-timeout", "15", url, "-o", path.join(tmp, asset)], { timeout: 120000 });
    if (asset.endsWith(".zip")) {
      await execFileAsync("unzip", ["-o", "-q", path.join(tmp, asset), "-d", tmp]);
    } else {
      await execFileAsync("tar", ["-xzf", path.join(tmp, asset), "-C", tmp]);
    }
    const extracted = path.join(tmp, process.platform === "win32" ? "freepi-bridge.exe" : "freepi-bridge");
    await rename(extracted, BIN);
    await chmod(BIN, 0o755);
    console.log("[freepi-bridge] installed:", BIN);
  } catch (error) {
    // Never break npm install because of an optional bridge download.
    console.warn("[freepi-bridge] install skipped:", error.message);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main();
